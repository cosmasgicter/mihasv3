"""Property-based tests for IP address column width after migration.

# Feature: audit-remediation, Property 5: IP address column accepts SHA-256 hashes

For any string of length up to 64 characters, the
application_status_history.ip_address column should accept the value
without truncation or error.

**Validates: Requirements 7.2**
"""

import os
import uuid

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import psycopg2  # noqa: E402
import pytest  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402


# ---------------------------------------------------------------------------
# DB connection helpers
# ---------------------------------------------------------------------------

def _get_dsn():
    """Build a psycopg2 DSN from Django settings."""
    from django.conf import settings as django_settings

    db = django_settings.DATABASES.get("default", {})
    if not db.get("HOST"):
        return None
    opts = db.get("OPTIONS", {})
    return (
        f"host={db['HOST']} "
        f"port={db.get('PORT') or 5432} "
        f"dbname={db['NAME']} "
        f"user={db.get('USER', '')} "
        f"password={db.get('PASSWORD', '')} "
        f"sslmode={opts.get('sslmode', 'prefer')}"
    )


def _db_available():
    """Check whether the configured Neon database is reachable."""
    dsn = _get_dsn()
    if not dsn:
        return False
    try:
        conn = psycopg2.connect(dsn)
        conn.close()
        return True
    except Exception:
        return False


_DB_OK = _db_available()


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Hex characters to simulate SHA-256 hashes (0-9, a-f)
hex_ip_strings = st.text(
    alphabet="0123456789abcdef",
    min_size=1,
    max_size=64,
)


# ---------------------------------------------------------------------------
# Property 5: IP address column accepts SHA-256 hashes
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _DB_OK, reason="Database not available")
class TestIPAddressColumnWidth(SimpleTestCase):
    """# Feature: audit-remediation, Property 5: IP address column accepts SHA-256 hashes

    For any string of length up to 64 characters, the
    application_status_history.ip_address column should accept the value
    without truncation or error.

    **Validates: Requirements 7.2**
    """

    # Shared connection and fixture IDs — reused across all hypothesis examples
    _conn = None
    _profile_id = None
    _app_id = None

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._conn = psycopg2.connect(_get_dsn())
        cls._conn.autocommit = True
        cls._profile_id = uuid.uuid4()
        cls._app_id = uuid.uuid4()
        app_number = f"TP5-{uuid.uuid4().hex[:8].upper()}"

        with cls._conn.cursor() as cur:
            cur.execute(
                "INSERT INTO profiles (id, email) VALUES (%s, %s)",
                (str(cls._profile_id), f"p5-{uuid.uuid4().hex[:6]}@test.local"),
            )
            cur.execute(
                """
                INSERT INTO applications
                    (id, application_number, user_id, full_name, date_of_birth,
                     sex, phone, email, residence_town, program, intake, institution)
                VALUES (%s, %s, %s, 'Test', '2000-01-01',
                        'M', '0000000000', 't@t.local', 'Test',
                        'test-prog', 'test-int', 'MIH')
                """,
                (str(cls._app_id), app_number, str(cls._profile_id)),
            )

    @classmethod
    def tearDownClass(cls):
        if cls._conn and not cls._conn.closed:
            with cls._conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM application_status_history WHERE application_id = %s",
                    (str(cls._app_id),),
                )
                cur.execute(
                    "DELETE FROM applications WHERE id = %s",
                    (str(cls._app_id),),
                )
                cur.execute(
                    "DELETE FROM profiles WHERE id = %s",
                    (str(cls._profile_id),),
                )
            cls._conn.close()
        super().tearDownClass()

    @given(ip_value=hex_ip_strings)
    @settings(max_examples=5, deadline=None)
    def test_ip_address_accepts_up_to_64_chars_without_truncation(self, ip_value):
        """Writing a hex string (1-64 chars) to ip_address succeeds and
        reads back without truncation."""
        row_id = uuid.uuid4()
        with self._conn.cursor() as cur:
            # Insert a status history row with the generated ip_address
            cur.execute(
                """
                INSERT INTO application_status_history
                    (id, application_id, status, ip_address)
                VALUES (%s, %s, 'draft', %s)
                """,
                (str(row_id), str(self._app_id), ip_value),
            )

            # Read back the ip_address value
            cur.execute(
                "SELECT ip_address FROM application_status_history WHERE id = %s",
                (str(row_id),),
            )
            stored_value = cur.fetchone()[0]

            # Verify no truncation occurred
            self.assertEqual(
                stored_value,
                ip_value,
                f"Truncation detected: wrote {len(ip_value)} chars, "
                f"read back {len(stored_value)} chars. "
                f"Expected {ip_value!r}, got {stored_value!r}",
            )

            # Clean up the test row immediately
            cur.execute(
                "DELETE FROM application_status_history WHERE id = %s",
                (str(row_id),),
            )
