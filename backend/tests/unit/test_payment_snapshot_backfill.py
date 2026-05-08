"""Unit tests — ``payment_snapshot_backfill`` idempotence and ambiguous-row skip.

These tests cover Task 4.2 of the payment-hardening spec. They seed three
Payment rows directly in the database and execute
``backend/scripts/payment_snapshot_backfill.py``'s ``run_backfill`` function
twice, asserting:

* **R6.3 — snapshot immutability**: a Payment that already carries a
  ``metadata.snapshot`` must NOT be overwritten across either run.
* **R6.2 — snapshot population**: a Payment missing ``metadata.snapshot``
  whose Application resolves to an active Program (and has resolvable
  residency) must end up with a populated snapshot after the first run.
* **Ambiguous-row skip**: a Payment whose Application points at a
  ``program`` string that does not match any active ``Program`` row must be
  skipped with a ``WARNING`` and must not receive a snapshot.
* **Idempotence**: running the script a second time leaves the populated
  snapshot byte-for-byte identical, does not touch the preexisting
  snapshot, and still skips the ambiguous row. The ``updated`` counter
  returned by ``run_backfill`` is ``0`` on the second run.

The script's eligibility filter uses Django's ``JSONField.has_key`` lookup,
which translates to the Postgres ``jsonb ?`` operator. When the test
database is not PostgreSQL (for example, the SQLite contract-test fallback)
the lookup is unsupported, so the test is skipped with a clear reason.

Validates: Requirements R6.2, R6.3
"""

from __future__ import annotations

import importlib.util
import logging
import uuid
from decimal import Decimal
from pathlib import Path

import pytest
from django.db import connection
from django.utils import timezone


# ---------------------------------------------------------------------------
# Dynamic import of the backfill script
# ---------------------------------------------------------------------------

# backend/tests/unit/test_payment_snapshot_backfill.py
#   .parents[0] -> backend/tests/unit
#   .parents[1] -> backend/tests
#   .parents[2] -> backend/
SCRIPT_PATH = (
    Path(__file__).resolve().parents[2] / "scripts" / "payment_snapshot_backfill.py"
)


@pytest.fixture(scope="module")
def backfill_module():
    """Load the backfill script as a regular module.

    The script calls ``django.setup()`` at import time. ``conftest.py`` has
    already performed that, and ``django.setup()`` is idempotent, so the
    second call is a no-op.

    We load the file via ``spec_from_file_location`` so the script's
    ``if __name__ == '__main__':`` block is NOT executed — the module is
    given a unique non-``__main__`` name.
    """
    assert SCRIPT_PATH.is_file(), f"backfill script missing at {SCRIPT_PATH}"
    spec = importlib.util.spec_from_file_location(
        "payment_snapshot_backfill_module_under_test", SCRIPT_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert hasattr(module, "run_backfill"), (
        "payment_snapshot_backfill.run_backfill is the documented entry point"
    )
    return module


def _require_postgres() -> None:
    """Skip when the Postgres-only ``jsonb ?`` (has_key) lookup is unavailable."""
    if connection.vendor != "postgresql":
        pytest.skip(
            f"metadata__has_key requires Postgres; current backend is "
            f"{connection.vendor!r}. Skipping backfill integration test."
        )


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _new_code(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"


@pytest.mark.django_db
def test_backfill_populates_skips_and_is_idempotent(backfill_module, caplog):
    """Three-row fixture: preserved, populated, skipped. Two runs produce the same state.

    Validates: Requirements R6.2, R6.3
    """
    _require_postgres()

    # Imports are local so the module-level collection pass does not touch
    # the DB on non-Postgres runs.
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.catalog.models import Institution, Program
    from apps.documents.models import Payment, ProgramFee

    now = timezone.now()

    # ------------------------------------------------------------------
    # Catalog seed — one active Program + matching local ProgramFee.
    # ------------------------------------------------------------------
    institution = Institution.objects.create(
        id=uuid.uuid4(),
        name="MIHAS Backfill Test Institute",
        code=_new_code("INST"),
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    resolvable_code = _new_code("RES")
    program = Program.objects.create(
        id=uuid.uuid4(),
        name="Backfill Test Program",
        code=resolvable_code,
        institution=institution,
        duration_months=36,
        application_fee=Decimal("153.00"),
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    ProgramFee.objects.create(
        id=uuid.uuid4(),
        program=program,
        fee_type="application",
        residency_category="local",
        amount=Decimal("153.00"),
        currency="ZMW",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    # ------------------------------------------------------------------
    # User seed — shared across all three applications.
    # ------------------------------------------------------------------
    user = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"backfill-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Backfill",
        last_name="Tester",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    def _make_application(program_value: str) -> Application:
        return Application.objects.create(
            id=uuid.uuid4(),
            application_number=(
                f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"
            ),
            user=user,
            full_name="Backfill Student",
            date_of_birth=now.date().replace(year=2000),
            sex="Male",
            phone="+260977000000",
            email=user.email,
            residence_town="Lusaka",
            nationality="Zambian",
            country="Zambia",
            program=program_value,
            intake="January 2025",
            institution=institution.name,
            status="submitted",
            version=1,
            created_at=now,
            updated_at=now,
        )

    # ------------------------------------------------------------------
    # Payment A — snapshot already present. Must NOT be overwritten (R6.3).
    # ------------------------------------------------------------------
    app_a = _make_application(resolvable_code)
    preexisting_snapshot = {
        "expected_amount": "153.00",
        "currency": "ZMW",
        "fee_source": "pre-existing",
    }
    payment_a = Payment.objects.create(
        id=uuid.uuid4(),
        application=app_a,
        user=user,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        metadata={"snapshot": dict(preexisting_snapshot)},
        created_at=now,
        updated_at=now,
    )

    # ------------------------------------------------------------------
    # Payment B — missing snapshot, resolvable program/residency (R6.2).
    # ------------------------------------------------------------------
    app_b = _make_application(resolvable_code)
    payment_b = Payment.objects.create(
        id=uuid.uuid4(),
        application=app_b,
        user=user,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        metadata=None,
        created_at=now,
        updated_at=now,
    )

    # ------------------------------------------------------------------
    # Payment C — missing snapshot, ambiguous program_code. Must be SKIPPED
    # with a WARNING and must not receive a snapshot.
    # ------------------------------------------------------------------
    ambiguous_code = _new_code("UNKNOWN")
    app_c = _make_application(ambiguous_code)
    payment_c = Payment.objects.create(
        id=uuid.uuid4(),
        application=app_c,
        user=user,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        metadata=None,
        created_at=now,
        updated_at=now,
    )

    # ------------------------------------------------------------------
    # First run.
    # ------------------------------------------------------------------
    caplog.set_level(logging.WARNING, logger="payment_snapshot_backfill")
    caplog.clear()
    first = backfill_module.run_backfill(dry_run=False)

    # --- Payment A: unchanged (R6.3) -----------------------------------
    payment_a.refresh_from_db()
    assert isinstance(payment_a.metadata, dict)
    snapshot_a_after_first = payment_a.metadata.get("snapshot")
    assert isinstance(snapshot_a_after_first, dict)
    assert snapshot_a_after_first == preexisting_snapshot, (
        "Payment A's preexisting snapshot must be immutable (R6.3); "
        f"got {snapshot_a_after_first!r}"
    )
    # Fee_source sanity re-assertion in case of dict-comparison drift.
    assert snapshot_a_after_first["fee_source"] == "pre-existing"

    # --- Payment B: populated (R6.2) -----------------------------------
    payment_b.refresh_from_db()
    assert isinstance(payment_b.metadata, dict), (
        "Payment B's metadata must be a dict after backfill"
    )
    snapshot_b_after_first = payment_b.metadata.get("snapshot")
    assert isinstance(snapshot_b_after_first, dict), (
        f"expected snapshot dict, got {snapshot_b_after_first!r}"
    )
    expected_keys = {
        "expected_amount",
        "currency",
        "residency_category",
        "program_code",
        "intake_id",
        "waiver_applied",
        "original_amount",
        "fee_source",
    }
    missing = expected_keys - snapshot_b_after_first.keys()
    assert not missing, f"snapshot missing required keys: {missing!r}"
    assert Decimal(snapshot_b_after_first["expected_amount"]) == Decimal("153.00")
    assert snapshot_b_after_first["currency"] == "ZMW"
    assert snapshot_b_after_first["residency_category"] == "local"
    assert snapshot_b_after_first["program_code"] == resolvable_code
    assert snapshot_b_after_first["waiver_applied"] is False
    # The script's fallback path writes fee_source='backfill'; the
    # design-spec method (when added) would write 'program_fee'. Accept either.
    assert snapshot_b_after_first["fee_source"] in {"backfill", "program_fee"}

    # --- Payment C: skipped, no snapshot -------------------------------
    payment_c.refresh_from_db()
    if payment_c.metadata is None:
        pass
    else:
        assert isinstance(payment_c.metadata, dict)
        assert "snapshot" not in payment_c.metadata, (
            "ambiguous Payment C must not receive a snapshot"
        )

    # --- WARNING about Payment C was logged ----------------------------
    warning_messages = [
        rec.getMessage()
        for rec in caplog.records
        if rec.levelno >= logging.WARNING
        and rec.name == "payment_snapshot_backfill"
    ]
    assert any(str(payment_c.id) in msg for msg in warning_messages), (
        f"expected a WARNING referencing Payment C ({payment_c.id}); "
        f"captured warnings: {warning_messages!r}"
    )

    # --- First-run counters --------------------------------------------
    assert first["updated"] == 1, first
    assert first["skipped_ambiguous"] == 1, first
    assert first["errored"] == 0, first

    # Snapshot state after first run — used to assert idempotence below.
    metadata_a_after_first = dict(payment_a.metadata)
    metadata_b_after_first = dict(payment_b.metadata)
    metadata_c_after_first = (
        dict(payment_c.metadata) if isinstance(payment_c.metadata, dict) else None
    )

    # ------------------------------------------------------------------
    # Second run — must be a no-op on A and B, must still skip C.
    # ------------------------------------------------------------------
    caplog.clear()
    second = backfill_module.run_backfill(dry_run=False)

    payment_a.refresh_from_db()
    payment_b.refresh_from_db()
    payment_c.refresh_from_db()

    # No writes on A or B; C is still ambiguous and skipped.
    assert second["updated"] == 0, second
    assert second["skipped_ambiguous"] == 1, second
    assert second["errored"] == 0, second

    # R6.3 — A's preexisting snapshot is still exactly what we seeded.
    assert payment_a.metadata == metadata_a_after_first
    assert payment_a.metadata["snapshot"] == preexisting_snapshot

    # R6.2 idempotence — B's snapshot is byte-for-byte the first-run value.
    assert payment_b.metadata == metadata_b_after_first
    assert payment_b.metadata["snapshot"] == snapshot_b_after_first

    # C remains snapshot-less.
    if metadata_c_after_first is None:
        assert payment_c.metadata is None
    else:
        assert payment_c.metadata == metadata_c_after_first
    if isinstance(payment_c.metadata, dict):
        assert "snapshot" not in payment_c.metadata
