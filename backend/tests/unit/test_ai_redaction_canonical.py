"""Drift-guard: pins the ADMIN and STUDENT redacted key sets.

Fails if anyone adds or removes a key from the redaction sets without
updating this snapshot, forcing explicit review of PII boundary changes.
"""
from apps.common.ai_prompt_redactor import (
    _ADMIN_DROP_KEYS,
    _STUDENT_DROP_KEYS,
)


# Pinned snapshots - update these deliberately when redaction scope changes.
_EXPECTED_ADMIN_DROP_KEYS = frozenset(
    {
        "full_name",
        "nrc_number",
        "passport_number",
        "date_of_birth",
        "date_of_birth_iso",
        "phone",
        "mobile",
        "email",
    }
)

_EXPECTED_STUDENT_DROP_KEYS = frozenset(
    {
        "full_name",
        "nrc_number",
        "passport_number",
        "date_of_birth",
        "date_of_birth_iso",
        "phone",
        "mobile",
        "email",
    }
)


class TestAiRedactionCanonical:
    """Snapshot pin for AI prompt redaction key sets."""

    def test_admin_drop_keys_match_snapshot(self):
        added = _ADMIN_DROP_KEYS - _EXPECTED_ADMIN_DROP_KEYS
        removed = _EXPECTED_ADMIN_DROP_KEYS - _ADMIN_DROP_KEYS
        assert not added and not removed, (
            f"_ADMIN_DROP_KEYS changed. "
            f"Added: {sorted(added)}. Removed: {sorted(removed)}. "
            f"Update the snapshot in this test after reviewing PII impact."
        )

    def test_student_drop_keys_match_snapshot(self):
        added = _STUDENT_DROP_KEYS - _EXPECTED_STUDENT_DROP_KEYS
        removed = _EXPECTED_STUDENT_DROP_KEYS - _STUDENT_DROP_KEYS
        assert not added and not removed, (
            f"_STUDENT_DROP_KEYS changed. "
            f"Added: {sorted(added)}. Removed: {sorted(removed)}. "
            f"Update the snapshot in this test after reviewing PII impact."
        )

    def test_admin_keys_are_frozenset(self):
        assert isinstance(_ADMIN_DROP_KEYS, frozenset)

    def test_student_keys_are_frozenset(self):
        assert isinstance(_STUDENT_DROP_KEYS, frozenset)

    def test_both_sets_non_empty(self):
        assert len(_ADMIN_DROP_KEYS) >= 5
        assert len(_STUDENT_DROP_KEYS) >= 5

    def test_student_set_includes_contact_fields(self):
        """Explicit check that phone/mobile/email are in student redaction."""
        assert "phone" in _STUDENT_DROP_KEYS
        assert "mobile" in _STUDENT_DROP_KEYS
        assert "email" in _STUDENT_DROP_KEYS
