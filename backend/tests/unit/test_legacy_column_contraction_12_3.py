"""Task 12.3 — the legacy-column contraction gates, as tests.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task **12.3**
Requirements: **R15.6** (legacy fields are output-only snapshots or named
Legacy_Exceptions; contract migrations run only after the runtime-reference,
legacy-row, mismatch and telemetry gates are zero), **R15.7** (production is
never the first apply), **R15.9** (application payment summaries derive from
Payment; deprecated payment columns contract only after mismatch and use
telemetry are zero), **R18.7**.
Findings: **DATA-01**, **DATA-10**, **DATA-11**.
Evidence: ``docs/v2-evidence/12.3/README.md``

What these tests are for
------------------------
Task 12.3's outcome is a **non-contraction**: five gates were measured, three
failed, and no column was dropped. A decision like that rots. Six months from now
someone reads "contract the legacy columns" in the runbook, sees the sunset date
has long passed, and runs the drop script.

So the decision is encoded rather than narrated. These tests fail if:

* the ORM-mapping fact that makes 7 of the 9 columns safe stops being true;
* the two published columns lose their registered window;
* the invariant SQL and the contract migration drift apart, or either drifts from
  ``APP_PAYMENT_STATUS_PRECEDENCE``;
* the contract migration becomes reachable by the boot sweep;
* the superseded drop script comes back.

They are pure source/AST checks — no database, no network — so they run in any
environment the rest of the unit suite runs in.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

from apps.common.compatibility_register import COMPATIBILITY_SURFACES
from apps.common.legacy_columns import LEGACY_DEPRECATED_COLUMNS, SUNSET_DATE
from apps.documents.payment_constants import APP_PAYMENT_STATUS_PRECEDENCE

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND = REPO_ROOT / "backend"

CONTRACT_SQL = (
    BACKEND / "scripts" / "future" / "legacy_columns_contract_2026_08_15.sql"
)
CONTRACT_ROLLBACK_SQL = (
    BACKEND / "scripts" / "future" / "legacy_columns_contract_2026_08_15_rollback.sql"
)
INVARIANTS_SQL = REPO_ROOT / "docs" / "v2-evidence" / "12.3" / "invariants.sql"
SUPERSEDED_DROP_SQL = BACKEND / "scripts" / "legacy_columns_drop_2026_08_15.sql"

#: The 7 columns task 12.3 found source-clean and ORM-unmapped. These are the
#: only ones the contract migration touches.
CONTRACTED_COLUMNS = (
    "payment_method",
    "payer_name",
    "payer_phone",
    "amount",
    "paid_at",
    "momo_ref",
    "pop_url",
)

#: The 2 columns task 12.3 refused to contract: live model fields, live
#: serializer output, live published contract, live production consumer.
REGISTERED_EXCEPTION_COLUMNS = ("payment_verified_at", "payment_verified_by")


def _declared_model_fields(rel_source: str, class_name: str) -> set[str]:
    """Field names a model class declares, by AST (no Django model introspection).

    Deliberately textual: the point is what the class body *declares*, which is
    what Django turns into the default SELECT column list. Asking Django for
    ``_meta.fields`` would answer the same question less legibly and would not
    catch a field that exists but is renamed by ``db_column``.
    """
    tree = ast.parse((BACKEND / rel_source).read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            return {
                t.id
                for stmt in node.body
                if isinstance(stmt, ast.Assign)
                for t in stmt.targets
                if isinstance(t, ast.Name)
            }
    raise AssertionError(f"{class_name} not found in {rel_source}")


class TestOrmMappingIsWhatMakesTheContractionSafe:
    """The 7 columns are safe to drop *because* Django never names them."""

    def test_seven_contracted_columns_are_not_declared_on_application(self):
        declared = _declared_model_fields("apps/applications/models.py", "Application")
        mapped = sorted(c for c in CONTRACTED_COLUMNS if c in declared)
        assert mapped == [], (
            f"{mapped} became declared field(s) on Application. Django includes every "
            "declared field in its default SELECT and INSERT column list, so these "
            "columns are no longer droppable without breaking every Application "
            "query. Either revert the field declaration or move the column into the "
            "compatibility register with an owner and an end date."
        )

    def test_two_registered_columns_are_still_declared_on_application(self):
        # The inverse assertion, and the reason the contract migration must not
        # touch them. If this ever fails because the fields were deliberately
        # removed, that is progress — update the register's exit criteria and this
        # test together.
        declared = _declared_model_fields("apps/applications/models.py", "Application")
        for column in REGISTERED_EXCEPTION_COLUMNS:
            assert column in declared, (
                f"Application no longer declares {column}. If the field was removed "
                "on purpose, work through that column's exit_criteria in "
                "apps/common/compatibility_register.py and promote the contract "
                "migration; do not leave the register claiming a window that is done."
            )

    def test_profiles_legacy_columns_are_fully_retired(self):
        # Contracted 2026-07-12 by schema_cleanup_drop_stale_columns.sql. The
        # registry records that by holding an empty dict for the table; the model
        # must agree, or a query would reference a dropped column.
        assert LEGACY_DEPRECATED_COLUMNS["profiles"] == {}, (
            "profiles re-acquired a deprecated-column entry. Its three columns were "
            "dropped on 2026-07-12; a new entry needs a new sunset date and a "
            "runbook section, not a reuse of the 2026-05-17 cycle."
        )
        declared = _declared_model_fields("apps/accounts/models.py", "Profile")
        for column in ("refresh_token_hash", "failed_login_attempts", "locked_until"):
            assert column not in declared, (
                f"Profile declares {column}, but that column was DROPPED from the "
                "database on 2026-07-12. Every Profile query would fail."
            )


class TestRegisteredLegacyExceptions:
    """R15.6: a legacy field is an output-only snapshot or a NAMED exception."""

    @pytest.mark.parametrize(
        "surface_id",
        [
            "applications.payment_verified_at",
            "applications.payment_verified_by",
            "applications.prelenco_payment_columns",
        ],
    )
    def test_column_exception_is_registered_with_owner_and_end_date(self, surface_id):
        surface = COMPATIBILITY_SURFACES.get(surface_id)
        assert surface is not None, (
            f"{surface_id} is not in the compatibility register. Task 12.5 audits "
            "that register; an unregistered legacy column is an open-ended exemption."
        )
        assert surface.kind == "column"
        assert surface.owner, "a Legacy_Exception with no owner is nobody's job"
        assert surface.end_date, "a deprecation without an end date is an exemption"
        assert surface.successor, "an exception must name where the truth lives now"
        assert len(surface.exit_criteria) > 80, (
            "exit criteria must be specific enough to evaluate mechanically, not a "
            "restatement of the surface name"
        )
        # RFC 8594 rendering must not raise — the same property task 12.2 pinned
        # for its route entries.
        assert surface.sunset_http_date.endswith("GMT")

    def test_registered_end_date_is_later_than_the_original_sunset(self):
        # The revision is the point. SUNSET_DATE stays as the historical record of
        # what the 2026-05-17 cycle announced; the register carries the revised
        # date. If someone silently moves SUNSET_DATE forward instead, this fails.
        original = SUNSET_DATE
        for surface_id in (
            "applications.payment_verified_at",
            "applications.payment_verified_by",
            "applications.prelenco_payment_columns",
        ):
            assert COMPATIBILITY_SURFACES[surface_id].end_date > original, (
                f"{surface_id}'s announced end date is not later than the original "
                f"{original}. Task 12.3 measured that {original} could not be met; a "
                "revised window has to actually be a revision."
            )
        assert original == "2026-08-15", (
            "legacy_columns.SUNSET_DATE moved. It is the historical record of what "
            "the 2026-05-17 deprecation cycle announced, and task 12.3's evidence "
            "reads against it. Revise the date in the compatibility register "
            "instead, where a revision is recorded as one."
        )


class TestContractMigrationIsGuardedAndUnreachable:
    """The migration must refuse by default and must not be swept."""

    def test_contract_and_rollback_both_exist(self):
        assert CONTRACT_SQL.exists()
        assert CONTRACT_ROLLBACK_SQL.exists(), (
            "a contraction ships with its rollback — R9.2, and the future/ README's "
            "promotion procedure step 2"
        )

    def test_contract_lives_in_future_so_the_boot_sweep_cannot_reach_it(self):
        # apply_sql_migrations and check_schema_drift scan only the TOP level of
        # backend/scripts/. A pending non-additive file at the top level raises
        # CommandError, which fails the whole sweep — and the Dockerfile CMD
        # &&-chains uvicorn behind it.
        assert CONTRACT_SQL.parent.name == "future", (
            "the contract migration moved out of backend/scripts/future/. At the top "
            "level it becomes a pending non-additive migration, the additive lint "
            "rejects it, apply_sql_migrations exits non-zero, and the container's "
            "CMD chain never starts uvicorn. Promote it only when its gates pass, "
            "and apply it with --allow-non-additive."
        )

    def test_contract_guards_every_gate_and_names_the_count(self):
        sql = CONTRACT_SQL.read_text(encoding="utf-8")
        for gate in ("GATE 1 (date)", "GATE 2 (legacy rows)",
                     "GATE 3 (unbacked money rows)", "GATE 4a", "GATE 5", "GATE 6"):
            assert gate in sql, f"{gate} guard is missing from the contract migration"
        # Each guard has to report the offending number. A guard that says only
        # "refused" sends the operator back to the invariant queries to find out why.
        assert sql.count("RAISE EXCEPTION") >= 7
        assert "Nothing was changed." in sql

    def test_contract_touches_only_the_seven_source_clean_columns(self):
        sql = CONTRACT_SQL.read_text(encoding="utf-8")
        dropped = set(re.findall(r"DROP COLUMN IF EXISTS (\w+)", sql))
        assert dropped == set(CONTRACTED_COLUMNS), (
            f"the contract migration drops {sorted(dropped)}; task 12.3 proved exactly "
            f"{sorted(CONTRACTED_COLUMNS)} source-clean and ORM-unmapped"
        )
        for column in REGISTERED_EXCEPTION_COLUMNS:
            assert f"DROP COLUMN IF EXISTS {column}" not in sql, (
                f"{column} is a registered Legacy_Exception with a live published "
                "contract; dropping it here breaks every Application query"
            )
        assert "DROP TABLE" not in sql, (
            "error_logs is out of scope: 186 historical rows and still an "
            "EXPECTED_TABLE in verify_schema_static.py and verify_migration.py"
        )

    def test_rollback_does_not_pretend_to_restore_data(self):
        raw = CONTRACT_ROLLBACK_SQL.read_text(encoding="utf-8")
        # Strip comments first. The file *explains* that R9.2 forbids ADD COLUMN,
        # so a naive substring check flags its own documentation — the same
        # comment-is-not-code bug task 12.2 §1.2 hit twice in the telemetry tool.
        # `apply_sql_migrations._find_non_additive_violations` strips for the same
        # reason.
        sql = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
        sql = "\n".join(line.split("--", 1)[0] for line in sql.splitlines())
        assert "ADD COLUMN" not in sql.upper(), (
            "R9.2 forbids ADD COLUMN in a rollback script. Restoring the columns is a "
            "new forward migration, and it cannot restore their values."
        )
        assert "DELETE FROM migration_history" in sql
        assert "backup" in raw.lower(), (
            "the rollback of record for a contraction is a restore; the script has to "
            "say so rather than implying the DELETE is sufficient"
        )

    def test_superseded_drop_script_is_neutralised(self):
        # backend/scripts/legacy_columns_drop_2026_08_15.sql drops all 12 registry
        # entries with a DATE guard and no evidence gate. From 2026-08-15 its only
        # guard stops firing. It is excluded from the sweep, so the danger is a
        # human running it by hand — which is exactly what the runbook told them to
        # do. It must no longer be runnable.
        if not SUPERSEDED_DROP_SQL.exists():
            return  # removed outright — also fine
        sql = SUPERSEDED_DROP_SQL.read_text(encoding="utf-8")
        assert "SUPERSEDED" in sql.upper(), (
            "the 2026-05-17 drop script is neither superseded-marked nor removed. As "
            "written it drops 7 unmapped columns, 2 mapped ones and a 186-row table "
            "behind a date guard that expires on 2026-08-15."
        )
        assert not re.search(r"^\s*ALTER TABLE .* DROP COLUMN", sql, re.M | re.I), (
            "the superseded drop script still contains an executable DROP COLUMN"
        )
        assert not re.search(r"^\s*DROP TABLE", sql, re.M | re.I), (
            "the superseded drop script still contains an executable DROP TABLE"
        )


class TestInvariantSqlMatchesTheProjectionItClaimsToCheck:
    """The SQL projection and APP_PAYMENT_STATUS_PRECEDENCE must not drift.

    Gate 3 of the invariant queries reimplements the precedence in SQL because it
    has to run inside the database — including on production, where no Python
    runs. A reimplementation is a second source of truth unless something compares
    them, so this does.
    """

    @pytest.mark.parametrize("path", [INVARIANTS_SQL, CONTRACT_SQL])
    def test_sql_encodes_the_precedence_in_declared_order(self, path):
        sql = path.read_text(encoding="utf-8")
        for app_status, ledger_statuses in APP_PAYMENT_STATUS_PRECEDENCE:
            assert f"'{app_status}'" in sql, (
                f"{path.name} does not mention the derived value '{app_status}' from "
                "APP_PAYMENT_STATUS_PRECEDENCE"
            )
            for ledger in ledger_statuses:
                assert f"'{ledger}'" in sql, (
                    f"{path.name} does not test for ledger status '{ledger}', so its "
                    f"projection would silently disagree with the platform's for any "
                    f"payment in that state"
                )
        # Order matters as much as membership: the precedence is what makes the
        # projection converge when an application holds several payment rows.
        positions = [
            sql.index(f"THEN '{app_status}'")
            for app_status, _ in APP_PAYMENT_STATUS_PRECEDENCE
        ]
        assert positions == sorted(positions), (
            f"{path.name} encodes the precedence branches out of order. "
            "APP_PAYMENT_STATUS_PRECEDENCE is highest-precedence-first and the CASE "
            "must follow it, or an application with both an expired and a successful "
            "payment projects differently in SQL than in Python."
        )

    def test_invariants_are_read_only(self):
        sql = INVARIANTS_SQL.read_text(encoding="utf-8")
        # Stripped of comments, because the file discusses DROP COLUMN at length.
        body = re.sub(r"/\*.*?\*/", "", sql, flags=re.S)
        body = "\n".join(line.split("--", 1)[0] for line in body.splitlines())
        for forbidden in ("DROP ", "DELETE ", "UPDATE ", "INSERT ", "ALTER ", "TRUNCATE"):
            assert forbidden not in body.upper(), (
                f"{INVARIANTS_SQL.name} contains {forbidden.strip()}. It is the file an "
                "operator runs against PRODUCTION to decide whether contraction is "
                "safe; it must not be able to change anything."
            )

    def test_invariants_cover_all_four_database_gates(self):
        sql = INVARIANTS_SQL.read_text(encoding="utf-8")
        for marker in (
            "Gate 1: legacy-row count",
            "Gate 1b: is that legacy data represented in the canonical ledger",
            "Gate 2: canonical / snapshot consistency",
            "Gate 3: payment projection mismatch",
            "Gate 4: deprecated-table row count",
        ):
            assert marker in sql, f"invariants.sql is missing '{marker}'"
