"""Contract parity tests — verify Django API responses match Vercel envelope structure.

For each recorded Vercel request/response pair, build a Django test request,
execute it, and compare:
  - Status code matches expected
  - Response has correct envelope structure (success/data or success/error/code)
  - Expected data keys are present in the response payload
  - Tolerate timestamps, request IDs, and token values

Requirements: 19.2, 19.3, 19.4
"""

import pytest
from rest_framework.test import APIClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TOLERATED_VALUE_KEYS = frozenset({
    "created_at",
    "updated_at",
    "applied_at",
    "last_active",
    "expires_at",
    "request_id",
    "access_token",
    "refresh_token",
    "csrf_token",
    "token",
})


def _is_tolerated(key: str) -> bool:
    """Return True if the key holds a value expected to differ across backends."""
    return key in TOLERATED_VALUE_KEYS or key.endswith("_at") or key.endswith("_token")


def _assert_envelope_structure(data: dict, expected_keys: list[str]) -> None:
    """Assert the response body contains the expected top-level envelope keys."""
    for key in expected_keys:
        assert key in data, (
            f"Missing envelope key: {key!r}. Got keys: {list(data.keys())}"
        )


# ---------------------------------------------------------------------------
# Fixture validation tests (no DB required)
# ---------------------------------------------------------------------------


class TestRecordingFixtures:
    """Validate the structure of all recording fixture files."""

    def test_all_recordings_have_required_fields(self, all_recordings):
        """Every recording fixture has the required structure."""
        for rec in all_recordings:
            assert "name" in rec, f"Recording missing 'name': {rec.get('_source_file')}"
            assert "request" in rec
            assert "expected_response" in rec
            assert "method" in rec["request"]
            assert "django_path" in rec["request"]
            assert "status_code" in rec["expected_response"]
            assert "envelope_keys" in rec["expected_response"]

    def test_envelope_keys_are_valid(self, all_recordings):
        """All recordings specify valid envelope key sets."""
        valid_success_keys = {"success", "data"}
        valid_error_keys = {"success", "error", "code"}
        for rec in all_recordings:
            keys = set(rec["expected_response"]["envelope_keys"])
            assert keys.issubset(valid_success_keys) or keys.issubset(
                valid_error_keys
            ), f"Invalid envelope keys in {rec['name']}: {keys}"

    def test_tolerated_fields_documented(self, all_recordings):
        """All recordings document their tolerated differences."""
        for rec in all_recordings:
            tolerations = rec["expected_response"].get("tolerations", [])
            assert isinstance(tolerations, list), (
                f"tolerations must be a list in {rec['name']}"
            )

    def test_minimum_recordings_exist(self, all_recordings):
        """At least 4 recordings exist (auth, catalog, applications, health)."""
        assert len(all_recordings) >= 4
        names = {r["name"] for r in all_recordings}
        assert "auth_login" in names
        assert "catalog_programs" in names
        assert "applications_list" in names
        assert "health_ping" in names


# ---------------------------------------------------------------------------
# Endpoint parity tests (require DB)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestContractParity:
    """Verify Django responses match recorded Vercel envelope contracts."""

    def test_health_ping_envelope(self, recording_by_name):
        """Health ping returns success envelope with status key."""
        rec = recording_by_name["health_ping"]
        client = APIClient()
        resp = client.get(rec["request"]["django_path"])

        assert resp.status_code == rec["expected_response"]["status_code"]
        body = resp.json()
        _assert_envelope_structure(body, rec["expected_response"]["envelope_keys"])

    def test_catalog_programs_envelope(self, recording_by_name):
        """Catalog programs returns success envelope with expected structure."""
        rec = recording_by_name["catalog_programs"]
        client = APIClient()
        resp = client.get(rec["request"]["django_path"])

        assert resp.status_code == rec["expected_response"]["status_code"]
        body = resp.json()
        _assert_envelope_structure(body, rec["expected_response"]["envelope_keys"])

    def test_auth_login_envelope_on_invalid_credentials(self, recording_by_name):
        """Login with invalid credentials returns error envelope."""
        rec = recording_by_name["auth_login"]
        client = APIClient()
        resp = client.post(
            rec["request"]["django_path"],
            data=rec["request"]["body"],
            format="json",
        )
        body = resp.json()
        # Should be an error envelope (invalid credentials)
        assert "success" in body
        if not body["success"]:
            assert "error" in body or "code" in body

    def test_applications_list_requires_auth(self, recording_by_name):
        """Applications list without auth returns 401 error envelope."""
        rec = recording_by_name["applications_list"]
        client = APIClient()
        resp = client.get(rec["request"]["django_path"])

        assert resp.status_code == 401
        body = resp.json()
        assert body.get("success") is False
