"""Unit test — ``payment_snapshot_backfill`` ambiguous-row skip path.

Covers Task 3.5 of the production-schema-reconciliation spec. Seeds a single
Application with ``program=''`` (which the backfill classifies as ambiguous
because the first check in ``_is_ambiguous`` is "missing program") plus a
matching Payment with ``metadata=None``, then executes
``run_backfill(dry_run=False)`` and asserts:

* The script does NOT raise.
* The captured log contains a WARNING that references the Payment's id and
  the literal substring ``ambiguous`` (the actual format string in the
  script is ``"Payment %s: ambiguous program/residency (%s); skipping"``).
* The returned counters dict reports ``skipped_ambiguous == 1`` and
  ``updated == 0``.
* The Payment row's ``metadata`` is unchanged after a fresh ``refresh_from_db``
  — still ``None``, with no synthesized ``snapshot`` key.

The script's eligibility filter relies on the Postgres-only ``jsonb ?``
(has_key) operator via Django's ``metadata__has_key`` lookup. When the
test database is not PostgreSQL (for example, the default SQLite contract
fallback) the lookup is unsupported and the test is skipped with a clear
reason.

Validates: Requirements 3.4
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

# backend/tests/unit/test_payment_snapshot_backfill_ambiguous.py
#   .parents[0] -> backend/tests/unit
#   .parents[1] -> backend/tests
#   .parents[2] -> backend/
SCRIPT_PATH = (
    Path(__file__).resolve().parents[2] / "scripts" / "payment_snapshot_backfill.py"
)


@pytest.fixture(scope="module")
def backfill_module():
    """Load the backfill script as a module without triggering its CLI block.

    ``conftest.py`` has already called ``django.setup()``; the script's own
    ``django.setup()`` invocation at import time is idempotent. We use a
    unique non-``__main__`` module name so the ``if __name__ == '__main__':``
    guard inside the script does not run ``main()``.
    """
    assert SCRIPT_PATH.is_file(), f"backfill script missing at {SCRIPT_PATH}"
    spec = importlib.util.spec_from_file_location(
        "payment_snapshot_backfill_ambiguous_under_test", SCRIPT_PATH
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
            f"{connection.vendor!r}. Skipping ambiguous-row backfill test."
        )


def _new_code(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"


@pytest.mark.django_db
def test_backfill_skips_ambiguous_application_with_empty_program(
    backfill_module, caplog
):
    """A Payment whose Application has ``program=''`` is skipped, logged, untouched.

    Validates: Requirements 3.4
    """
    _require_postgres()

    # Imports are deferred so that module-level collection on a
    # non-Postgres backend does not require an open DB connection.
    from apps.accounts.models import Profile
    from apps.applications.models import Application
    from apps.documents.models import Payment

    now = timezone.now()

    # ------------------------------------------------------------------
    # Profile — single user owning the ambiguous Application.
    # ------------------------------------------------------------------
    user = Profile.objects.create(
        id=uuid.uuid4(),
        email=f"ambiguous-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Ambiguous",
        last_name="Tester",
        role="student",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    # ------------------------------------------------------------------
    # Application — empty `program` string is the ambiguity trigger.
    # The model declares ``program = CharField(max_length=255)`` (NOT NULL),
    # so we cannot use ``program=None``; an empty string is the
    # equivalent legacy shape that ``_is_ambiguous`` flags as
    # "missing program" before any catalog lookups happen.
    # ------------------------------------------------------------------
    application = Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        user=user,
        full_name="Ambiguous Student",
        date_of_birth=now.date().replace(year=2000),
        sex="Male",
        phone="+260977000000",
        email=user.email,
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        program="",  # ← the ambiguity trigger
        intake="January 2025",
        institution="MIHAS",
        status="submitted",
        version=1,
        created_at=now,
        updated_at=now,
    )

    # ------------------------------------------------------------------
    # Payment — metadata is NULL so it satisfies the eligibility filter
    # (``metadata IS NULL OR NOT metadata ? 'snapshot'``) and will be
    # picked up by ``run_backfill``.
    # ------------------------------------------------------------------
    payment = Payment.objects.create(
        id=uuid.uuid4(),
        application=application,
        user=user,
        amount=Decimal("153.00"),
        currency="ZMW",
        status="pending",
        metadata=None,
        created_at=now,
        updated_at=now,
    )

    # ------------------------------------------------------------------
    # Run the backfill — capture WARNING-level records from the script's
    # named logger.
    # ------------------------------------------------------------------
    caplog.set_level(logging.WARNING, logger="payment_snapshot_backfill")
    caplog.clear()

    counters = backfill_module.run_backfill(dry_run=False)

    # ------------------------------------------------------------------
    # Counters: exactly one row was classified as ambiguous and skipped;
    # nothing was updated; nothing errored.
    # ------------------------------------------------------------------
    assert counters["skipped_ambiguous"] == 1, counters
    assert counters["updated"] == 0, counters
    assert counters["errored"] == 0, counters
    assert counters["already_had_snapshot"] == 0, counters

    # ------------------------------------------------------------------
    # WARNING was emitted referencing the Payment id and the substring
    # "ambiguous". The script's actual format string is
    #   "Payment %s: ambiguous program/residency (%s); skipping"
    # so we match on stable substrings rather than the exact rendered
    # message.
    # ------------------------------------------------------------------
    matching_warnings = [
        rec.getMessage()
        for rec in caplog.records
        if rec.levelno >= logging.WARNING
        and rec.name == "payment_snapshot_backfill"
        and str(payment.id) in rec.getMessage()
        and "ambiguous" in rec.getMessage()
    ]
    assert matching_warnings, (
        "expected a WARNING that mentions the Payment id and 'ambiguous'; "
        f"captured records: "
        f"{[(r.levelname, r.name, r.getMessage()) for r in caplog.records]!r}"
    )

    # ------------------------------------------------------------------
    # The Payment's metadata is unchanged — still NULL, with no
    # synthesized ``snapshot`` key. Confirm via a fresh refresh_from_db
    # to avoid relying on the in-memory copy.
    # ------------------------------------------------------------------
    payment.refresh_from_db()
    assert payment.metadata is None, (
        f"ambiguous Payment must keep its original metadata=None; "
        f"got {payment.metadata!r}"
    )
