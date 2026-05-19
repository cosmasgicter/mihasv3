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

        # Adapt Postgres-specific SQL for SQLite test DB
        if connection.vendor == "sqlite":
            import uuid as _uuid
            # Replace gen_random_uuid() with literal UUIDs for SQLite
            while "gen_random_uuid()" in sql:
                sql = sql.replace("gen_random_uuid()", f"'{_uuid.uuid4()}'", 1)
            # SQLite doesn't support ON CONFLICT ... DO UPDATE with the same syntax
            # but does support INSERT OR REPLACE with UNIQUE constraint.
            # Simpler: just INSERT directly since the table is empty in tests.
            sql = re.sub(
                r"ON CONFLICT \(template_key\) DO UPDATE SET[^;]+;",
                "ON CONFLICT (template_key) DO UPDATE SET "
                "subject_template = excluded.subject_template, "
                "body_template = excluded.body_template, "
                "channel = excluded.channel, "
                "is_active = excluded.is_active, "
                "updated_at = datetime('now');",
                sql,
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
