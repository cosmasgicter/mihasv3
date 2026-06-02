"""Unit tests — ``payment_snapshot_backfill.py --verify`` mode.

These tests cover Task 3.3 of the production-schema-reconciliation spec:

* ``--verify`` against a DB where every Payment carries
  ``metadata.snapshot`` exits ``0`` and prints
  ``verify: count_without_snapshot=0``.
* ``--verify`` against a DB with N payments missing the snapshot exits
  ``1`` and prints ``verify: count_without_snapshot=N``.
* The ``verify: count_without_snapshot=<n>`` line is printed regardless
  of exit code (i.e., even when the count is non-zero and the script
  exits non-zero, the line still appears on stdout).

The verify path uses Django's ``JSONField.has_key`` lookup, which
translates to the Postgres ``jsonb ?`` operator. When the test database
is not PostgreSQL (for example, the SQLite contract-test fallback) the
lookup is unsupported, so the test is skipped with a clear reason — the
same pattern used by ``test_payment_snapshot_backfill.py``.

Validates: Requirements 3.3
"""

from __future__ import annotations

import importlib.util
import uuid
from decimal import Decimal
from pathlib import Path

import pytest
from django.db import connection
from django.utils import timezone


# ---------------------------------------------------------------------------
# Dynamic import of the backfill script (same approach as the sibling test)
# ---------------------------------------------------------------------------

# backend/tests/unit/test_payment_snapshot_backfill_verify.py
#   .parents[0] -> backend/tests/unit
#   .parents[1] -> backend/tests
#   .parents[2] -> backend/
SCRIPT_PATH = (
    Path(__file__).resolve().parents[2] / "scripts" / "payment_snapshot_backfill.py"
)


@pytest.fixture(scope="module")
def backfill_module():
    """Load the backfill script as a regular module.

    ``django.setup()`` is idempotent, so re-import after conftest's setup is safe.
    A unique module name keeps the script's ``if __name__ == '__main__'`` block
    from firing.
    """
    assert SCRIPT_PATH.is_file(), f"backfill script missing at {SCRIPT_PATH}"
    spec = importlib.util.spec_from_file_location(
        "payment_snapshot_backfill_verify_module_under_test", SCRIPT_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert hasattr(module, "main"), "payment_snapshot_backfill.main is the CLI entry"
    assert hasattr(module, "run_verify"), (
        "payment_snapshot_backfill.run_verify is the documented verify-mode entry"
    )
    return module


def _require_postgres() -> None:
    """Skip when the Postgres-only ``jsonb ?`` (has_key) lookup is unavailable."""
    if connection.vendor != "postgresql":
        pytest.skip(
            f"metadata__has_key requires Postgres; current backend is "
            f"{connection.vendor!r}. Skipping verify integration test."
        )


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _new_code(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"


def _seed_payment(*, with_snapshot: bool, user, application):
    """Create a single Payment row with or without ``metadata.snapshot``.

    Each payment gets a unique ``transaction_reference`` and a non-active
    status so multiple rows can share one application without tripping the
    ``uq_payments_one_active_per_application`` partial unique index (which
    permits only one ``pending``/``deferred`` payment per application).
    """
    from apps.documents.models import Payment

    metadata: dict | None
    if with_snapshot:
        metadata = {
            "snapshot": {
                "expected_amount": "153.00",
                "currency": "ZMW",
                "fee_source": "test-seed",
            }
        }
    else:
        metadata = None

    now = timezone.now()
    return Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=user,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="failed",
        transaction_reference=_new_code("TXN"),
        metadata=metadata,
        created_at=now,
        updated_at=now,
    )


def _seed_catalog():
    """Create the minimal catalog/user fixtures shared by every test case."""
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.catalog.models import Institution, Program

    now = timezone.now()
    institution = Institution.objects.create(
        id=uuid.uuid4(),
        name="MIHAS Verify-Mode Test Institute",
        code=_new_code("INST"),
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    program_code = _new_code("RES")
    Program.objects.create(
        id=uuid.uuid4(),
        name="Verify-Mode Test Program",
        code=program_code,
        institution=institution,
        duration_months=36,
        application_fee=Decimal("153.00"),
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    user = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"verify-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Verify",
        last_name="Tester",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=user,
        full_name="Verify Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=user.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program=program_code,
        intake="January 2025",
        institution=institution.name,
        status="submitted",
        version=1,
        created_at=now,
        updated_at=now,
    )
    return user, application


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_verify_exits_zero_when_all_payments_have_snapshot(backfill_module, capsys):
    """``--verify`` returns 0 and prints count=0 when every Payment carries a snapshot.

    Validates: Requirements 3.3
    """
    _require_postgres()

    user, application = _seed_catalog()
    # Three payments, all carrying a snapshot already.
    for _ in range(3):
        _seed_payment(with_snapshot=True, user=user, application=application)

    exit_code = backfill_module.main(["--verify"])

    captured = capsys.readouterr()
    assert exit_code == 0, (
        f"verify must exit 0 when no Payments lack a snapshot; got {exit_code} "
        f"with stdout={captured.out!r} stderr={captured.err!r}"
    )
    # The line is always printed.
    assert "verify: count_without_snapshot=0" in captured.out, (
        f"expected 'verify: count_without_snapshot=0' in stdout; got {captured.out!r}"
    )


@pytest.mark.django_db
def test_verify_exits_one_when_payments_missing_snapshot(backfill_module, capsys):
    """``--verify`` returns 1 and prints the exact missing count.

    Validates: Requirements 3.3
    """
    _require_postgres()

    user, application = _seed_catalog()
    # Two payments missing the snapshot, one already carrying one — the
    # eligibility filter must report exactly the missing-count of 2.
    _seed_payment(with_snapshot=False, user=user, application=application)
    _seed_payment(with_snapshot=False, user=user, application=application)
    _seed_payment(with_snapshot=True, user=user, application=application)

    exit_code = backfill_module.main(["--verify"])

    captured = capsys.readouterr()
    assert exit_code == 1, (
        f"verify must exit 1 when Payments lack a snapshot; got {exit_code} "
        f"with stdout={captured.out!r} stderr={captured.err!r}"
    )
    # The same line shape regardless of exit code; only <n> changes.
    assert "verify: count_without_snapshot=2" in captured.out, (
        f"expected 'verify: count_without_snapshot=2' in stdout; got {captured.out!r}"
    )


@pytest.mark.django_db
def test_verify_prints_line_regardless_of_exit_code(backfill_module, capsys):
    """The ``verify: count_without_snapshot=<n>`` line is always printed.

    Asserted explicitly across both the success and failure branches by
    pattern-matching on the literal prefix — the spec requires the line
    to appear regardless of exit code so operators can grep one shape.

    Validates: Requirements 3.3
    """
    _require_postgres()

    user, application = _seed_catalog()
    _seed_payment(with_snapshot=False, user=user, application=application)

    exit_code = backfill_module.main(["--verify"])
    captured = capsys.readouterr()

    # Failure branch (count > 0): line is printed.
    assert "verify: count_without_snapshot=" in captured.out
    assert exit_code == 1

    # Now flip every row to "has snapshot" and re-run; the line is still printed.
    from apps.documents.models import Payment

    for payment in Payment.objects.all():
        payment.metadata = {"snapshot": {"fee_source": "test-flip"}}
        payment.save(update_fields=["metadata"])

    exit_code = backfill_module.main(["--verify"])
    captured = capsys.readouterr()

    # Success branch (count == 0): line is still printed.
    assert "verify: count_without_snapshot=0" in captured.out
    assert exit_code == 0
