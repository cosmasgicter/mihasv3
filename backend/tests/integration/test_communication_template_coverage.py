"""Integration test: every template_key used in production code has an active
CommunicationTemplate row after the seed SQL is applied.

The test runner does NOT auto-apply backend/scripts/ SQL files. This test
reads and executes the seed SQL manually via connection.cursor().
"""
import re
from pathlib import Path

import pytest
from django.db import connection

from apps.common.models import CommunicationTemplate

# Paths
BACKEND_APPS_DIR = Path(__file__).resolve().parent.parent.parent / "apps"
SEED_SQL_PATH = Path(__file__).resolve().parent.parent.parent / "scripts" / "2026_05_19_seed_communication_templates.sql"

# Regex patterns to extract template_keys from production code
_SEND_CALL_RE = re.compile(r"""CommunicationService\.send\(\s*['"](\w+)['"]""")
# Match ternary: template = 'x' if ... else 'y' (captures both x and y)
_TEMPLATE_TERNARY_RE = re.compile(
    r"""template\s*=\s*['"](\w+)['"]\s+if\s+.+?\s+else\s+['"](\w+)['"]"""
)


def _discover_template_keys() -> set[str]:
    """Parse all backend/apps/**/*.py for template_key references."""
    keys: set[str] = set()
    for py_file in BACKEND_APPS_DIR.rglob("*.py"):
        # Skip test files and migrations
        rel = str(py_file.relative_to(BACKEND_APPS_DIR))
        if "test" in rel or "migration" in rel:
            continue
        try:
            source = py_file.read_text(encoding="utf-8")
        except Exception:
            continue
        keys.update(_SEND_CALL_RE.findall(source))
        for m in _TEMPLATE_TERNARY_RE.finditer(source):
            keys.add(m.group(1))
            keys.add(m.group(2))
    return keys


@pytest.mark.django_db(transaction=True)
class TestCommunicationTemplateCoverage:
    """Every template_key used in production code must have an active row."""

    def test_all_keys_seeded(self):
        # Apply the seed SQL
        assert SEED_SQL_PATH.exists(), f"Seed SQL not found at {SEED_SQL_PATH}"
        sql = SEED_SQL_PATH.read_text(encoding="utf-8")

        # ------------------------------------------------------------------
        # The seed's `ON CONFLICT (template_key)` no longer resolves — on ANY
        # vendor (13.6 remediation M3)
        # ------------------------------------------------------------------
        # The clause targets the legacy global `UNIQUE(template_key)` that the
        # single-tenant schema created. Admissions-v2 task 3.3 **dropped** it
        # (`backend/scripts/2026_07_17_02_communication_template_unique_switch.sql`,
        # R5.6/R15.5, TEN-08) and replaced it with the tenant-aware
        # `uq_comm_templates_key_inst_version` + `uq_comm_templates_one_active`,
        # because one row per `template_key` forbids the tenant model outright.
        #
        # So on Postgres the upsert now raises
        # `InvalidColumnReference: there is no unique or exclusion constraint
        # matching the ON CONFLICT specification`. The SQLite branch below has
        # recognised the same fact since it was written ("`template_key` is
        # intentionally not unique in the Django model"); it is simply true of
        # both vendors now.
        #
        # The seed script itself is NOT edited: it is an applied, checksummed
        # migration, it is only replayable on the pre-3.3 schema, and a fresh
        # bootstrap still runs it *before* 3.3 in filename order. The drift is
        # recorded by `test_the_seed_upsert_target_no_longer_exists` below rather
        # than papered over here.
        sql = re.sub(
            r"\s*ON CONFLICT \(template_key\) DO UPDATE SET.*?(?=;)",
            "",
            sql,
            flags=re.DOTALL,
        )

        # `version` is NOT NULL on `communication_templates` with only a
        # Python-level default (the tenant migration added the column; Django
        # keeps such defaults in Python, not in the column). The seed predates it
        # and does not name it, so a raw INSERT that bypasses the ORM violates the
        # constraint on every vendor. The SQLite branch has patched the column
        # list since it was written; it is the same requirement on Postgres
        # (13.6 remediation M3).
        sql = sql.replace(
            "INSERT INTO communication_templates (id, template_key, "
            "subject_template, body_template, channel, is_active, created_at, "
            "updated_at)",
            "INSERT INTO communication_templates (id, template_key, version, "
            "subject_template, body_template, channel, is_active, created_at, "
            "updated_at)",
        )
        # Insert the value in the same position: every VALUES row opens
        # `(<id expression>, '<template_key>',` so `version` goes straight after
        # the key.
        sql = re.sub(
            r"(\(\s*(?:gen_random_uuid\(\)|'[^']*')\s*,\s*'[^']+'\s*,)",
            r"\1 1,",
            sql,
        )

        # Adapt Postgres-specific SQL for SQLite test DB
        if connection.vendor == "sqlite":
            import uuid as _uuid
            # Replace gen_random_uuid() with literal UUIDs for SQLite
            while "gen_random_uuid()" in sql:
                sql = sql.replace("gen_random_uuid()", f"'{_uuid.uuid4()}'", 1)
            # The `version` column list and value are handled above for every
            # vendor now, so they are not repeated here.
            # ``template_key`` is intentionally not unique in the Django model,
            # so SQLite cannot apply the Postgres upsert clause. The test DB is
            # empty here; plain INSERTs are enough to verify template coverage.
            sql = re.sub(
                r"\s*ON CONFLICT \(template_key\) DO UPDATE SET.*?(?=;)",
                "",
                sql,
                flags=re.DOTALL,
            )
            sql = sql.replace("NOW()", "datetime('now')")

        with connection.cursor() as cursor:
            # SQLite requires executing one statement at a time
            for statement in sql.split(";"):
                # Strip comment lines from the statement
                lines = [ln for ln in statement.splitlines() if not ln.strip().startswith("--")]
                cleaned = "\n".join(lines).strip()
                if cleaned:
                    cursor.execute(cleaned)

        # Discover all template_keys from production code
        expected_keys = _discover_template_keys()
        assert expected_keys, "No template_keys discovered — regex may be broken"

        # Check each key has an active row
        active_keys = set(
            CommunicationTemplate.objects.filter(is_active=True)
            .values_list("template_key", flat=True)
        )

        missing = expected_keys - active_keys
        assert not missing, (
            f"The following template_keys are used in production code but have no "
            f"active CommunicationTemplate row: {sorted(missing)}"
        )

    def test_the_seed_upsert_target_no_longer_exists(self):
        """Record *why* the seed's `ON CONFLICT (template_key)` is stripped.

        Task 3.3 replaced the legacy global `UNIQUE(template_key)` with two
        tenant-aware indexes, so a conflict target of `(template_key)` alone
        resolves to nothing. If a future change re-adds a single-column unique on
        `template_key`, this fails and tells the reader the tenant model has been
        broken — which is more useful than the strip above silently continuing to
        work (13.6 remediation M3, R5.6/R15.5, TEN-08).
        """
        if connection.vendor != "postgresql":
            pytest.skip("index introspection is Postgres-specific")

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT indexname, indexdef
                  FROM pg_indexes
                 WHERE tablename = 'communication_templates'
                """
            )
            indexes = {name: definition for name, definition in cursor.fetchall()}

        single_column_unique = [
            name
            for name, definition in indexes.items()
            if "UNIQUE" in definition.upper()
            and definition.split("(")[-1].strip(") ").strip() == "template_key"
        ]
        assert single_column_unique == [], (
            "a single-column UNIQUE on communication_templates.template_key is "
            "back; task 3.3 dropped it because one row per template_key forbids "
            f"the tenant model: {single_column_unique}"
        )
