"""Application-number generator tests.

Verifies the canonical Postgres-sequence path AND the legacy fallback
preserve the format invariant ``{CODE}{YEAR}{5-digit-zero-padded}``.

These tests do not touch the DB — they patch the connection cursor and
the institution resolver.
"""

from __future__ import annotations

import os
import re

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

django.setup()

from unittest.mock import patch  # noqa: E402


_FORMAT_RE = re.compile(r"^[A-Z]{2,8}\d{4}\d{5}$")


class _FakeCursor:
    def __init__(self, return_value):
        self._return_value = return_value
        self.captured_args: list = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, args=None):
        self.captured_args.append(args)

    def fetchone(self):
        if callable(self._return_value):
            return self._return_value(self.captured_args[-1])
        return self._return_value


class _FakeConnection:
    def __init__(self, cursor: _FakeCursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor


class TestApplicationNumberGenerator:
    def test_format_invariant_via_sql_function(self):
        """SQL helper returns a properly formatted number."""
        cursor = _FakeCursor(("MIHAS202600042",))
        with patch(
            "apps.applications._view_helpers._resolve_institution_code",
            return_value="MIHAS",
        ), patch(
            "django.db.connection", _FakeConnection(cursor)
        ):
            from apps.applications._view_helpers import _generate_application_number
            result = _generate_application_number("MIHAS Original Name")

        assert result == "MIHAS202600042"
        assert _FORMAT_RE.match(result), f"format invariant violated: {result}"
        assert cursor.captured_args[-1] == ["MIHAS", 2026]  # noqa: E501  # plus year integration test below

    def test_format_invariant_for_KATC(self):
        """SQL helper handles a different institution code correctly."""
        from datetime import datetime
        year = datetime.now().year
        cursor = _FakeCursor(lambda args: (f"{args[0]}{args[1]}00007",))
        with patch(
            "apps.applications._view_helpers._resolve_institution_code",
            return_value="KATC",
        ), patch(
            "django.db.connection", _FakeConnection(cursor)
        ):
            from apps.applications._view_helpers import _generate_application_number
            result = _generate_application_number("Kalulushi Trade College")

        expected = f"KATC{year}00007"
        assert result == expected
        assert _FORMAT_RE.match(result), result

    def test_legacy_fallback_path_preserves_format(self):
        """If the SQL function call raises, fallback path still returns the format."""
        from datetime import datetime
        year = datetime.now().year

        # Simulate the cursor.execute raising — the helper falls back.
        class _RaisingCursor:
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
            def execute(self, *_args, **_kwargs):
                raise Exception("function next_application_number does not exist")
            def fetchone(self):
                return None

        class _RaisingConn:
            def cursor(self):
                return _RaisingCursor()

        with patch(
            "apps.applications._view_helpers._resolve_institution_code",
            return_value="MIHAS",
        ), patch(
            "django.db.connection", _RaisingConn()
        ), patch(
            "apps.applications._view_helpers.Application"
        ) as model_mock:
            qs_mock = model_mock.objects.filter.return_value
            qs_mock.count.return_value = 0
            qs_mock.exists.return_value = False

            from apps.applications._view_helpers import _generate_application_number
            result = _generate_application_number("MIHAS")

        assert _FORMAT_RE.match(result), f"fallback format invariant: {result}"
        assert result.startswith(f"MIHAS{year}"), result
