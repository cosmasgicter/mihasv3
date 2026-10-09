"""Task 3.5 — reconcile canonical payments and document versions.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.5
Requirements: R11.7-R11.8, R15.5-R15.6, R15.9
Findings: DATA-11 (payment truth split / nullable Payment.application),
          STU-19 (no immutable document versions / one-current enforcement)
Evidence: docs/v2-evidence/3.5/

Two layers, matching the repo convention (test_tenant_fk_validation_3_4.py /
test_integrity_constraints_3_3.py):

* Always-on, DB-free: the three forward scripts exist with paired rollbacks, are
  additive-only-lint clean, idempotent/guarded, and — critically for R15.6/R15.9 —
  never drop or rewrite a deprecated application payment column (those stay as
  read-only snapshots through the observation window; contraction is task 12.3).
* ``@pg_only`` (Postgres): reproduce the pre-3.5 state and prove, via the task-3.1
  schema-manifest verifier and direct constraint behaviour, that (a) the payments
  mandatory-application CHECK flips from unvalidated -> validated, (b) orphan
  payments are quarantined in place (preserved, never deleted) and recoverable
  orphans are re-linked, (c) VALIDATE fails closed on an un-quarantined orphan,
  (d) document versions are assigned deterministically and the one-current partial
  unique index rejects a second current row, and (e) the payments FK ON DELETE is
  reconciled SET NULL -> CASCADE. Plus idempotence and deprecated-value preservation.

The real-data expand/backfill/validate + rollback rehearsal is on the reused Neon
branch — see docs/v2-evidence/3.5/.
"""

from __future__ import annotations

import re
import uuid
from decimal import Decimal
from pathlib import Path

import pytest
from django.db import IntegrityError, ProgrammingError, connection, transaction

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"

EXPAND = SCRIPTS_DIR / "2026_07_19_01_payments_documents_expand.sql"
BACKFILL = SCRIPTS_DIR / "2026_07_19_02_payments_documents_backfill.sql"
VALIDATE = SCRIPTS_DIR / "2026_07_19_03_payments_documents_validate.sql"
EXPAND_RB = SCRIPTS_DIR / "2026_07_19_01_payments_documents_expand_rollback.sql"
BACKFILL_RB = SCRIPTS_DIR / "2026_07_19_02_payments_documents_backfill_rollback.sql"
VALIDATE_RB = SCRIPTS_DIR / "2026_07_19_03_payments_documents_validate_rollback.sql"

FORWARD_SCRIPTS = [EXPAND, BACKFILL, VALIDATE]
ROLLBACK_SCRIPTS = [EXPAND_RB, BACKFILL_RB, VALIDATE_RB]

# Deprecated APPLICATION payment columns that task 3.5 must PRESERVE untouched
# (R15.6/R15.9 — contraction is owned by task 12.3 after mismatch/telemetry are
# zero). Restricted to columns that live ONLY on ``applications`` (or are the
# derived summary), so the grep cannot false-positive on identically named
# ``payments`` columns (payments also has amount / payment_method).
APPLICATIONS_ONLY_DEPRECATED_COLS = [
    "payer_name",
    "payer_phone",
    "momo_ref",
    "pop_url",
    "paid_at",
    "payment_verified_at",
    "payment_verified_by",
    "payment_status",
]


# ---------------------------------------------------------------------------
# Layer 1 — always-on coverage + hygiene (DB-free, runs in every CI profile)
# ---------------------------------------------------------------------------


class TestScriptsExist:
    def test_all_three_forward_scripts_and_rollbacks_exist(self):
        for p in FORWARD_SCRIPTS + ROLLBACK_SCRIPTS:
            assert p.exists(), f"task 3.5 deliverable missing: {p.name}"

    def test_forward_scripts_are_top_level_and_rollbacks_suffixed(self):
        """Forward scripts sit at the top level so apply_sql_migrations sweeps
        them in filename order; rollbacks end with _rollback.sql so the sweep
        excludes them (operator-only)."""
        from apps.common.management.commands.apply_sql_migrations import (
            EXCLUDED_TOP_LEVEL_FILES,
        )

        for p in FORWARD_SCRIPTS:
            assert p.parent == SCRIPTS_DIR
            assert not p.name.endswith("_rollback.sql")
            assert p.name not in EXCLUDED_TOP_LEVEL_FILES
        for p in ROLLBACK_SCRIPTS:
            assert p.name.endswith("_rollback.sql")

    def test_forward_scripts_run_in_expand_backfill_validate_order(self):
        """Lexical filename order == expand (01) -> backfill (02) -> validate (03)."""
        assert sorted(p.name for p in FORWARD_SCRIPTS) == [
            EXPAND.name,
            BACKFILL.name,
            VALIDATE.name,
        ]


class TestScriptHygiene:
    def test_forward_scripts_pass_additive_only_lint(self):
        """The container-boot runner rejects DROP COLUMN/TABLE, TRUNCATE,
        unqualified DELETE, and narrowing ALTER TYPE. Every forward script must
        lint clean (no --allow-non-additive needed): the FK ON DELETE swap uses
        DROP CONSTRAINT (permitted), the backfill uses bounded UPDATE/INSERT."""
        from apps.common.management.commands.apply_sql_migrations import (
            _find_non_additive_violations,
        )

        for p in FORWARD_SCRIPTS:
            assert _find_non_additive_violations(p.read_text()) == [], p.name

    def test_backfill_has_no_unbounded_delete(self):
        """The backfill only recovers/quarantines — it never deletes a payment or
        a document (task instruction: preserve values; quarantine over deletion).
        Comments are stripped first so documentation prose does not false-match."""
        from apps.common.management.commands.apply_sql_migrations import _strip_sql_comments

        code = _strip_sql_comments(BACKFILL.read_text())
        assert not re.search(r"\bDELETE\s+FROM\b", code, re.IGNORECASE)
        assert not re.search(r"\bTRUNCATE\b", code, re.IGNORECASE)

    def test_forward_scripts_are_idempotent_guarded(self):
        """Objects are created behind IF NOT EXISTS / pg_constraint guards and
        VALIDATE only fires while convalidated=false, so a re-run — or a
        Django-built DB — converges to a no-op."""
        expand = EXPAND.read_text().lower()
        assert "if not exists" in expand and "pg_constraint" in expand
        validate = VALIDATE.read_text().lower()
        assert "convalidated = false" in validate
        assert "if not exists" in validate  # one-current index guard

    def test_validate_creates_one_current_index_and_validates_check(self):
        text = VALIDATE.read_text()
        assert "uq_application_documents_one_current" in text
        assert re.search(r"VALIDATE\s+CONSTRAINT\s+payments_application_id_not_null", text, re.IGNORECASE)

    def test_task_3_5_rollbacks_are_inverse_additive_safe(self):
        """Each task-3.5 rollback satisfies the production-schema-reconciliation
        Requirement 9.2 inverse-additive rule (DROP/scoped-DELETE/DROP-CONSTRAINT
        only — no UPDATE/INSERT/CREATE/ADD). Reuses the governance auditor so this
        stays honest even though the suite-wide gate is red on pre-existing sibling
        task-3.2/3.3/3.4 rollbacks."""
        from tests.property.test_rollback_safe_operations import _audit_rollback_file

        for rb in ROLLBACK_SCRIPTS:
            failures = _audit_rollback_file(rb)
            assert failures == [], f"{rb.name} is not inverse-additive-safe: {failures}"

    def test_expand_adds_notvalid_mandatory_check(self):
        text = EXPAND.read_text()
        assert "payments_application_id_not_null" in text
        assert re.search(r"NOT\s+VALID", text, re.IGNORECASE)
        # The immutable version + provenance columns are all present.
        for col in ("version", "is_current", "supersedes_id", "superseded_at",
                    "content_hash", "uploaded_by", "provenance"):
            assert col in text, col


class TestPreservesDeprecatedPaymentColumns:
    """R15.6/R15.9: the deprecated application payment columns are preserved as
    read-only snapshots during observation; task 3.5 must not drop or write them."""

    def test_forward_scripts_never_reference_applications_deprecated_columns(self):
        """Comments are stripped first: the expand header legitimately *names* the
        preserved columns in prose; what matters is that no executable statement
        touches them."""
        from apps.common.management.commands.apply_sql_migrations import _strip_sql_comments

        for p in FORWARD_SCRIPTS:
            code = _strip_sql_comments(p.read_text())
            for col in APPLICATIONS_ONLY_DEPRECATED_COLS:
                assert not re.search(rf"\b{re.escape(col)}\b", code), (
                    f"{p.name} references deprecated application payment column "
                    f"{col!r} in executable SQL; task 3.5 must leave it untouched "
                    f"(contraction is task 12.3)"
                )

    def test_no_forward_script_alters_applications_payment_columns(self):
        """No ``ALTER TABLE applications`` that drops/modifies a payment column."""
        for p in FORWARD_SCRIPTS:
            text = p.read_text()
            # The only permitted read of ``applications`` is the uploaded_by
            # backfill join (SELECT ... user_id); no ALTER/DROP against it.
            assert not re.search(r"ALTER\s+TABLE\s+applications", text, re.IGNORECASE), p.name


# ---------------------------------------------------------------------------
# Layer 2 — Postgres: reproduce pre-3.5 state -> apply -> verify
# ---------------------------------------------------------------------------

pg_only = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason=(
        "task 3.5 uses NOT VALID / VALIDATE CONSTRAINT / partial unique indexes / "
        "pg_constraint introspection; active backend is "
        f"{connection.vendor!r}. The always-on hygiene tests carry the non-gated proof."
    ),
)


def _u() -> str:
    return str(uuid.uuid4())


def _split(path: Path):
    from apps.common.management.commands.apply_sql_migrations import _split_sql_statements

    return _split_sql_statements(path.read_text())


def _apply_sql_file(path: Path) -> None:
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        for statement in _split(path):
            cursor.execute(statement)


def _apply_all() -> None:
    _apply_sql_file(EXPAND)
    _apply_sql_file(BACKFILL)
    _apply_sql_file(VALIDATE)


def _reproduce_production_payments_fk() -> None:
    """Recreate the genuine production FK: ``payments_application_id_fkey`` with
    ON DELETE SET NULL. The Django-built test DB carries an ORM-named CASCADE FK,
    so drop whatever FK covers application_id and add the production-shaped one."""
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cursor.execute(
            """
            SELECT con.conname FROM pg_constraint con
            WHERE con.conrelid = 'payments'::regclass AND con.contype = 'f'
              AND con.conkey = ARRAY[(
                  SELECT attnum FROM pg_attribute
                  WHERE attrelid = 'payments'::regclass AND attname = 'application_id'
              )]::smallint[]
            """
        )
        for (name,) in cursor.fetchall():
            cursor.execute(f'ALTER TABLE payments DROP CONSTRAINT "{name}"')
        cursor.execute(
            "ALTER TABLE payments ADD CONSTRAINT payments_application_id_fkey "
            "FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL"
        )


def _reproduce_pre_3_5_documents() -> None:
    """Recreate the genuine pre-3.5 ``application_documents`` shape by dropping
    ``uq_application_documents_one_current``.

    Same purpose as :func:`_reproduce_production_payments_fk`: these tests prove
    what the *migration* does to a database that has not run it yet, so the test
    DB has to actually be in that state. ``tests/conftest.py`` creates the index
    up front for every test (the model is ``managed=False``, so ``create_model``
    omits the partial index, and admissions-v2 task 7.3's replace/delete commands
    are only genuinely exercised when the database enforces the invariant). That
    is right for every other test and wrong for these two: the legacy duplicate
    rows this script exists to version cannot be inserted while the index the
    script *creates* already exists, so the seed failed with a UniqueViolation
    before the migration under test ever ran.

    Dropping it here restores the pre-migration baseline. ``2026_07_19_03``
    re-creates it, and the assertions that follow prove it then enforces
    one-current — which is the behaviour being tested, now reached through the
    migration rather than assumed from the fixture.
    """
    with connection.cursor() as cursor:
        cursor.execute("DROP INDEX IF EXISTS uq_application_documents_one_current")


def _payments_fk_def() -> str:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE conname = 'payments_application_id_fkey' "
            "AND conrelid = 'payments'::regclass"
        )
        row = cursor.fetchone()
        return row[0] if row else ""


def _mandatory_check_unvalidated() -> bool:
    """True while the manifest verifier flags the payments mandatory-application
    CHECK as an unvalidated_check_constraint failure (task-3.1 gate, R15.3)."""
    from apps.common.schema_manifest import build_manifest_from_connection, verify_manifest

    report = verify_manifest(build_manifest_from_connection(connection, label="3.5"))
    return any(
        d.category == "unvalidated_check_constraint"
        and d.object.endswith("payments_application_id_not_null")
        for d in report.failures
    )


@pg_only
@pytest.mark.django_db
def test_payments_mandatory_check_gate_fails_then_passes():
    """Failing-first via the task-3.1 verifier: after expand the mandatory
    CHECK is NOT VALID (verifier FAILS); after validate it is validated (PASSES).
    Then the CHECK rejects a new orphan payment (R15.9 enforced)."""
    from tests.tenant_fixtures import build_tenant_world

    world = build_tenant_world()

    _apply_sql_file(EXPAND)
    assert _mandatory_check_unvalidated(), "expand should leave the CHECK NOT VALID"

    _apply_sql_file(BACKFILL)
    _apply_sql_file(VALIDATE)
    assert not _mandatory_check_unvalidated(), "validate should clear the CHECK"

    # A new canonical payment without an application is now rejected at the DB.
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            from apps.documents.models import Payment

            Payment.objects.create(
                user_id=world.student.id, amount=Decimal("153.00"),
                status="pending", application_id=None,
            )


@pg_only
@pytest.mark.django_db
def test_payments_fk_reconciled_set_null_to_cascade():
    """The FK ON DELETE action is reconciled SET NULL -> CASCADE (matches the
    Payment.on_delete=CASCADE model + removes the raw-delete orphan vector)."""
    _reproduce_production_payments_fk()
    assert "SET NULL" in _payments_fk_def()

    _apply_all()
    assert "CASCADE" in _payments_fk_def()
    assert "SET NULL" not in _payments_fk_def()


@pg_only
@pytest.mark.django_db
def test_orphan_payments_recovered_or_quarantined_never_deleted():
    """Recoverable orphan (metadata has a valid application_id) is re-linked;
    unrecoverable orphan is quarantined IN PLACE (row preserved + ledgered), never
    deleted. Then VALIDATE succeeds because the quarantined row is exempt."""
    from apps.documents.models import Payment
    from tests.tenant_fixtures import build_tenant_world

    world = build_tenant_world()
    app_id = world.application.id
    user_id = world.student.id

    # Insert two orphans BEFORE the constraint exists (legacy state).
    recoverable = Payment.objects.create(
        user_id=user_id, amount=Decimal("153.00"), status="failed",
        application_id=None, metadata={"application_id": str(app_id)},
    )
    unrecoverable = Payment.objects.create(
        user_id=user_id, amount=Decimal("153.00"), status="failed",
        application_id=None, metadata={},
    )

    _apply_sql_file(EXPAND)
    _apply_sql_file(BACKFILL)

    recoverable.refresh_from_db()
    unrecoverable.refresh_from_db()

    # Recoverable: re-linked, not quarantined, no ledger row.
    assert str(recoverable.application_id) == str(app_id)
    assert recoverable.application_quarantined is False

    # Unrecoverable: preserved in place, flagged, ledgered.
    assert Payment.objects.filter(id=unrecoverable.id).exists(), "orphan must NOT be deleted"
    assert unrecoverable.application_id is None
    assert unrecoverable.application_quarantined is True
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM payment_orphan_exceptions "
            "WHERE payment_id = %s AND reason_code = 'null_application'",
            [str(unrecoverable.id)],
        )
        assert cursor.fetchone()[0] == 1

    # VALIDATE now succeeds (canonical rows all linked; orphan is exempt).
    _apply_sql_file(VALIDATE)
    assert not _mandatory_check_unvalidated()


@pg_only
@pytest.mark.django_db
def test_mandatory_check_fails_closed_on_unquarantined_orphan():
    """R15.3 fail-closed: an un-quarantined NULL-application payment makes
    VALIDATE CONSTRAINT abort rather than mark a broken invariant valid."""
    from apps.documents.models import Payment
    from tests.tenant_fixtures import build_tenant_world

    world = build_tenant_world()
    Payment.objects.create(
        user_id=world.student.id, amount=Decimal("153.00"), status="failed",
        application_id=None, metadata={},
    )

    _apply_sql_file(EXPAND)  # adds the CHECK NOT VALID; existing orphan not scanned
    # Skip the backfill (leave the orphan un-quarantined) -> VALIDATE must fail.
    with pytest.raises((IntegrityError, ProgrammingError)):
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(
                    "ALTER TABLE payments VALIDATE CONSTRAINT payments_application_id_not_null"
                )


@pg_only
@pytest.mark.django_db
def test_document_versions_assigned_and_one_current_enforced():
    """Duplicate (application, document_type) rows are versioned deterministically
    (newest = current, older = preserved superseded history), and the one-current
    partial unique index then rejects a second current row (R11.7-R11.8)."""
    from django.utils import timezone
    from apps.documents.models import ApplicationDocument
    from tests.tenant_fixtures import build_tenant_world

    world = build_tenant_world()
    app_id = world.application.id
    base = timezone.now()

    # The database must not already carry the index this migration creates,
    # otherwise the legacy duplicates below cannot be seeded at all.
    _reproduce_pre_3_5_documents()

    # Three versions of the same requirement/type + one single-version control.
    ids = []
    for i in range(3):
        doc = ApplicationDocument.objects.create(
            application_id=app_id, document_type="result_slip",
            document_name=f"slip-{i}.pdf",
            uploaded_at=base.replace(microsecond=i * 1000),
        )
        ids.append(doc.id)
    nrc = ApplicationDocument.objects.create(
        application_id=app_id, document_type="nrc", document_name="nrc.pdf",
        uploaded_at=base,
    )

    _apply_sql_file(EXPAND)
    _apply_sql_file(BACKFILL)

    slips = list(
        ApplicationDocument.objects.filter(
            application_id=app_id, document_type="result_slip"
        ).order_by("version")
    )
    assert [s.version for s in slips] == [1, 2, 3]
    assert [s.is_current for s in slips] == [False, False, True]
    # Prior evidence preserved (nothing deleted) + supersedes chain wired.
    assert ApplicationDocument.objects.filter(
        application_id=app_id, document_type="result_slip"
    ).count() == 3
    assert slips[2].supersedes_id == slips[1].id
    nrc.refresh_from_db()
    assert nrc.version == 1 and nrc.is_current is True

    _apply_sql_file(VALIDATE)

    # Exactly one current per (application, document_type) is now enforced.
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            ApplicationDocument.objects.create(
                application_id=app_id, document_type="result_slip",
                document_name="dupe-current.pdf", is_current=True,
            )


@pg_only
@pytest.mark.django_db
def test_full_sequence_is_idempotent():
    """Applying expand+backfill+validate twice is a no-op the second time."""
    from apps.documents.models import ApplicationDocument
    from tests.tenant_fixtures import build_tenant_world

    world = build_tenant_world()
    # Pre-migration baseline: the two duplicate rows below are exactly what the
    # backfill has to collapse, and they cannot exist while the index does.
    _reproduce_pre_3_5_documents()
    for i in range(2):
        ApplicationDocument.objects.create(
            application_id=world.application.id, document_type="extra_kyc",
            document_name=f"k-{i}.pdf",
        )

    _apply_all()
    _apply_all()  # second run must not raise

    currents = ApplicationDocument.objects.filter(
        application_id=world.application.id, document_type="extra_kyc", is_current=True
    ).count()
    assert currents == 1


@pg_only
@pytest.mark.django_db
def test_deprecated_application_payment_values_preserved():
    """Applying the whole sequence does not disturb the mapped deprecated
    application payment columns (R15.6/R15.9 observation-window preservation)."""
    from tests.tenant_fixtures import build_tenant_world

    world = build_tenant_world()
    with connection.cursor() as cursor:
        cursor.execute(
            "UPDATE applications SET payment_status = 'verified', "
            "payment_verified_at = now() WHERE id = %s",
            [str(world.application.id)],
        )

    _apply_all()

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT payment_status, payment_verified_at FROM applications WHERE id = %s",
            [str(world.application.id)],
        )
        status, verified_at = cursor.fetchone()
    assert status == "verified"
    assert verified_at is not None
