"""Property-based tests for unique constraints after Migration 4.

# Feature: audit-remediation, Property 6: Unique constraints reject duplicates

For any column with a UNIQUE constraint (applications.public_tracking_code,
subjects.code, notifications.idempotency_key), inserting two records with the
same non-null value should result in the second insert being rejected by the
database.

**Validates: Requirements 8.4**
"""

import os
import uuid

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import psycopg2  # noqa: E402
import psycopg2.errors  # noqa: E402
import pytest  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402


# ---------------------------------------------------------------------------
# DB connection helpers (same pattern as test_ip_address_column.py)
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

# APP-XXXXXXXX format tracking codes
tracking_code_strings = st.text(
    alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    min_size=4,
    max_size=12,
).map(lambda s: f"APP-{s}")

# Subject codes: short alphanumeric strings
subject_code_strings = st.text(
    alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    min_size=2,
    max_size=20,
).map(lambda s: f"SUBJ-{s}")

# UUID-like idempotency keys
idempotency_key_strings = st.uuids().map(str)


# ---------------------------------------------------------------------------
# Property 6: Unique constraints reject duplicates
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _DB_OK, reason="Database not available")
class TestUniqueConstraintsRejectDuplicates(SimpleTestCase):
    """# Feature: audit-remediation, Property 6: Unique constraints reject duplicates

    For any column with a UNIQUE constraint
    (applications.public_tracking_code, subjects.code,
    notifications.idempotency_key), inserting two records with the same
    non-null value should result in the second insert being rejected.

    **Validates: Requirements 8.4**
    """

    _conn = None
    _profile_id = None

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._conn = psycopg2.connect(_get_dsn())
        cls._conn.autocommit = False
        # Create a shared profile for FK references
        cls._profile_id = uuid.uuid4()
        with cls._conn.cursor() as cur:
            cur.execute(
                "INSERT INTO profiles (id, email, role) VALUES (%s, %s, %s)",
                (str(cls._profile_id), f"p6-{uuid.uuid4().hex[:6]}@test.local", "student"),
            )
        cls._conn.commit()

    @classmethod
    def tearDownClass(cls):
        if cls._conn and not cls._conn.closed:
            with cls._conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM profiles WHERE id = %s",
                    (str(cls._profile_id),),
                )
            cls._conn.commit()
            cls._conn.close()
        super().tearDownClass()

    # --- applications.public_tracking_code ---

    @given(tracking_code=tracking_code_strings)
    @settings(max_examples=5, deadline=None)
    def test_applications_public_tracking_code_rejects_duplicates(self, tracking_code):
        """Inserting two applications with the same public_tracking_code
        should raise UniqueViolation on the second insert."""
        app_id_1 = uuid.uuid4()
        app_id_2 = uuid.uuid4()
        app_num_1 = f"UC1-{uuid.uuid4().hex[:8].upper()}"
        app_num_2 = f"UC2-{uuid.uuid4().hex[:8].upper()}"

        try:
            with self._conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO applications
                        (id, application_number, user_id, full_name,
                          date_of_birth, sex, phone, email, residence_town,
                          program, intake, institution, public_tracking_code,
                          status, version, is_late_submission)
                    VALUES (%s, %s, %s, 'Test', '2000-01-01',
                            'M', '0000000000', 't@t.local', 'Test',
                            'test-prog', 'test-int', 'MIH', %s,
                            'draft', 1, false)
                    """,
                    (str(app_id_1), app_num_1, str(self._profile_id), tracking_code),
                )
                self._conn.commit()

                with self.assertRaises(psycopg2.errors.UniqueViolation):
                    cur.execute(
                        """
                        INSERT INTO applications
                            (id, application_number, user_id, full_name,
                              date_of_birth, sex, phone, email, residence_town,
                              program, intake, institution, public_tracking_code,
                              status, version, is_late_submission)
                        VALUES (%s, %s, %s, 'Test', '2000-01-01',
                                'M', '0000000000', 't@t.local', 'Test',
                                'test-prog', 'test-int', 'MIH', %s,
                                'draft', 1, false)
                        """,
                        (str(app_id_2), app_num_2, str(self._profile_id), tracking_code),
                    )
        finally:
            # Rollback any failed transaction state, then clean up
            self._conn.rollback()
            with self._conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM applications WHERE id IN (%s, %s)",
                    (str(app_id_1), str(app_id_2)),
                )
            self._conn.commit()

    # --- subjects.code ---

    @given(code=subject_code_strings)
    @settings(max_examples=5, deadline=None)
    def test_subjects_code_rejects_duplicates(self, code):
        """Inserting two subjects with the same code should raise
        UniqueViolation on the second insert."""
        subj_id_1 = uuid.uuid4()
        subj_id_2 = uuid.uuid4()

        try:
            with self._conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO subjects (id, name, code) VALUES (%s, %s, %s)",
                    (str(subj_id_1), "Test Subject 1", code),
                )
                self._conn.commit()

                with self.assertRaises(psycopg2.errors.UniqueViolation):
                    cur.execute(
                        "INSERT INTO subjects (id, name, code) VALUES (%s, %s, %s)",
                        (str(subj_id_2), "Test Subject 2", code),
                    )
        finally:
            self._conn.rollback()
            with self._conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM subjects WHERE id IN (%s, %s)",
                    (str(subj_id_1), str(subj_id_2)),
                )
            self._conn.commit()

    # --- notifications.idempotency_key ---

    @given(idem_key=idempotency_key_strings)
    @settings(max_examples=5, deadline=None)
    def test_notifications_idempotency_key_rejects_duplicates(self, idem_key):
        """Inserting two notifications with the same idempotency_key
        should raise UniqueViolation on the second insert."""
        notif_id_1 = uuid.uuid4()
        notif_id_2 = uuid.uuid4()

        try:
            with self._conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO notifications
                        (id, user_id, title, message, idempotency_key)
                    VALUES (%s, %s, 'Test', 'Test message', %s)
                    """,
                    (str(notif_id_1), str(self._profile_id), idem_key),
                )
                self._conn.commit()

                with self.assertRaises(psycopg2.errors.UniqueViolation):
                    cur.execute(
                        """
                        INSERT INTO notifications
                            (id, user_id, title, message, idempotency_key)
                        VALUES (%s, %s, 'Test', 'Test message', %s)
                        """,
                        (str(notif_id_2), str(self._profile_id), idem_key),
                    )
        finally:
            self._conn.rollback()
            with self._conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM notifications WHERE id IN (%s, %s)",
                    (str(notif_id_1), str(notif_id_2)),
                )
            self._conn.commit()
