"""Required-document contract invariants (admissions-v2 task 7.2).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **7.2**.
Requirements: R11.6-R11.7
Findings:     STU-13
Design:       §9.3 (Required Documents).

These are the invariants the *whole* contract rests on, tested without a
database or a request so a regression is unambiguous:

* every MIME type the contract advertises must survive the magic-byte
  validator — otherwise the client renders a control whose accepted type the
  upload command then refuses;
* the platform size ceiling and MIME allowlist can only be **narrowed** by a
  tenant rule, never widened;
* the platform baseline requirement set matches the gates
  ``submit_application`` enforces unconditionally, so the rendered controls and
  the submission gate cannot disagree.

**Validates: Requirements R11.6, R11.7**
"""

from __future__ import annotations

import pytest

from apps.applications import required_documents as contract
from apps.applications.readiness_service import IDENTITY_DOCUMENT_TYPES
from apps.documents.validators import ALLOWED_MIME_TYPES


class TestPlatformPolicyIsSelfConsistent:
    def test_every_advertised_mime_type_passes_the_magic_byte_validator(self):
        """A control we render must be uploadable — no advertised-but-refused type."""
        assert set(contract.PLATFORM_ACCEPTED_MIME_TYPES) <= set(ALLOWED_MIME_TYPES)

    def test_every_advertised_mime_type_has_at_least_one_extension(self):
        for mime in contract.PLATFORM_ACCEPTED_MIME_TYPES:
            assert contract.MIME_EXTENSIONS.get(mime), mime

    def test_the_platform_ceiling_matches_the_upload_commands_hard_limit(self):
        assert contract.PLATFORM_MAX_UPLOAD_BYTES == 10 * 1024 * 1024

    def test_the_identity_baseline_accepts_exactly_the_submission_gate_types(self):
        baseline = {
            row["document_type"]: row for row in contract.PLATFORM_BASELINE_REQUIREMENTS
        }
        assert tuple(baseline["extra_kyc"]["accepts_document_types"]) == IDENTITY_DOCUMENT_TYPES

    def test_every_baseline_type_is_a_platform_document_type(self):
        for baseline in contract.PLATFORM_BASELINE_REQUIREMENTS:
            assert baseline["document_type"] in contract.LEGACY_PLATFORM_DOCUMENT_TYPES


class TestResolveConstraints:
    def test_no_rules_resolves_to_the_platform_default(self):
        resolved = contract.resolve_constraints(None)
        assert resolved["accepted_mime_types"] == list(contract.PLATFORM_ACCEPTED_MIME_TYPES)
        assert resolved["max_size_bytes"] == contract.PLATFORM_MAX_UPLOAD_BYTES
        assert resolved["constraints_source"] == contract.CONSTRAINTS_DEFAULT
        assert resolved["constraints_narrowed"] is False

    def test_a_tenant_may_narrow_the_mime_set(self):
        resolved = contract.resolve_constraints({"accepted_mime_types": ["application/pdf"]})
        assert resolved["accepted_mime_types"] == ["application/pdf"]
        assert resolved["accepted_extensions"] == [".pdf"]
        assert resolved["constraints_source"] == contract.CONSTRAINTS_TENANT
        assert resolved["constraints_narrowed"] is True

    def test_a_tenant_cannot_widen_the_mime_set(self):
        resolved = contract.resolve_constraints(
            {"accepted_mime_types": ["application/zip", "image/png"]}
        )
        assert resolved["accepted_mime_types"] == ["image/png"]
        assert resolved["constraints_source"] == contract.CONSTRAINTS_TENANT_NARROWED

    def test_an_entirely_unsupported_mime_set_falls_back_to_the_default(self):
        resolved = contract.resolve_constraints({"accepted_mime_types": ["application/zip"]})
        assert resolved["accepted_mime_types"] == list(contract.PLATFORM_ACCEPTED_MIME_TYPES)
        assert resolved["constraints_source"] == contract.CONSTRAINTS_TENANT_NARROWED

    @pytest.mark.parametrize(
        "rules,expected",
        [
            ({"max_size_bytes": 2048}, 2048),
            ({"max_bytes": 4096}, 4096),
            ({"max_size_mb": 2}, 2 * 1024 * 1024),
            ({"max_size_bytes": 999_999_999}, contract.PLATFORM_MAX_UPLOAD_BYTES),
            ({"max_size_bytes": 0}, contract.PLATFORM_MAX_UPLOAD_BYTES),
            ({"max_size_bytes": -5}, contract.PLATFORM_MAX_UPLOAD_BYTES),
            ({"max_size_bytes": "nonsense"}, contract.PLATFORM_MAX_UPLOAD_BYTES),
            ({"max_size_bytes": 10}, contract.MIN_CONFIGURABLE_MAX_BYTES),
        ],
    )
    def test_size_limits_are_clamped_into_the_usable_range(self, rules, expected):
        assert contract.resolve_constraints(rules)["max_size_bytes"] == expected

    def test_mime_ordering_is_deterministic_regardless_of_rule_order(self):
        first = contract.resolve_constraints(
            {"accepted_mime_types": ["image/png", "application/pdf"]}
        )
        second = contract.resolve_constraints(
            {"accepted_mime_types": ["application/pdf", "image/png"]}
        )
        assert first["accepted_mime_types"] == second["accepted_mime_types"]


class TestValidateUpload:
    def _requirement(self, **overrides):
        row = {
            "label": "Result slip",
            "accepted_mime_types": ["application/pdf", "image/png"],
            "accepted_extensions": [".pdf", ".png"],
            "max_size_bytes": 1024,
        }
        row.update(overrides)
        return row

    def test_a_file_within_the_constraints_is_accepted(self):
        contract.validate_upload(self._requirement(), size=512, mime_type="image/png")

    def test_an_oversized_file_is_rejected_with_the_stable_code(self):
        with pytest.raises(contract.UploadRejected) as excinfo:
            contract.validate_upload(self._requirement(), size=2048, mime_type="image/png")
        assert excinfo.value.code == contract.FILE_TOO_LARGE
        assert excinfo.value.status_code == 400

    def test_an_unaccepted_type_is_rejected_with_the_stable_code(self):
        with pytest.raises(contract.UploadRejected) as excinfo:
            contract.validate_upload(self._requirement(), size=10, mime_type="image/jpeg")
        assert excinfo.value.code == contract.INVALID_FILE_TYPE

    def test_a_missing_mime_type_is_rejected_rather_than_assumed(self):
        with pytest.raises(contract.UploadRejected) as excinfo:
            contract.validate_upload(self._requirement(), size=10, mime_type=None)
        assert excinfo.value.code == contract.INVALID_FILE_TYPE

    def test_mime_comparison_is_case_insensitive(self):
        contract.validate_upload(self._requirement(), size=10, mime_type="IMAGE/PNG")

    def test_an_unknown_size_never_bypasses_the_type_check(self):
        with pytest.raises(contract.UploadRejected) as excinfo:
            contract.validate_upload(self._requirement(), size=None, mime_type="image/gif")
        assert excinfo.value.code == contract.INVALID_FILE_TYPE

    def test_the_error_message_never_leaks_internal_configuration(self):
        with pytest.raises(contract.UploadRejected) as excinfo:
            contract.validate_upload(
                self._requirement(label="Council letter"), size=99999, mime_type="image/png"
            )
        message = excinfo.value.message
        assert "1KB" in message
        assert "institution" not in message.lower()


class TestActiveContentScreen:
    """The deterministic content screen behind ``upload -> malware/type/size``.

    Design §9.2. Its two obligations are symmetric: refuse a file that carries
    something executable, and never refuse a legitimate scan. The second matters
    more — a false rejection costs a real applicant their application, while a
    missed exotic payload is still caught downstream by task 7.3's scanning
    lifecycle. Every pattern is therefore long enough that it cannot plausibly
    occur inside the compressed streams of a large legitimate PDF.
    """

    @staticmethod
    def _file(payload: bytes):
        from io import BytesIO

        return BytesIO(payload)

    @pytest.mark.parametrize(
        "payload",
        [
            b"%PDF-1.7\n<</S/JavaScript/JS(app.alert\\(1\\))>>",
            b"%PDF-1.7\n<</S/Launch/F(calc.exe)>>",
            b"%PDF-1.7\n<</Subtype/RichMedia>>",
            b"\x89PNG\r\n\x1a\n<script>alert(1)</script>",
            b"\xff\xd8\xff\xe0<?php system($_GET[0]); ?>",
        ],
        ids=["javascript", "launch", "richmedia", "script-tag", "php"],
    )
    def test_active_content_is_refused(self, payload):
        from rest_framework.exceptions import ValidationError

        from apps.documents.validators import scan_document_for_active_content

        with pytest.raises(ValidationError):
            scan_document_for_active_content(self._file(payload))

    @pytest.mark.parametrize(
        "payload",
        [
            b"%PDF-1.7\n<</Type/Catalog/OpenAction[3 0 R /Fit]>>",
            b"%PDF-1.7\n" + bytes(range(256)) * 512,
            b"\x89PNG\r\n\x1a\n" + b"\x00\xff\x7f" * 4096,
            b"\xff\xd8\xff\xe0" + b"scanned by a phone" * 128,
        ],
        ids=["page-open-action", "binary-pdf-streams", "png-noise", "jpeg-comment"],
    )
    def test_a_legitimate_document_is_never_refused(self, payload):
        from apps.documents.validators import scan_document_for_active_content

        scan_document_for_active_content(self._file(payload))

    def test_a_pattern_split_across_a_read_boundary_is_still_found(self):
        from rest_framework.exceptions import ValidationError

        from apps.documents.validators import scan_document_for_active_content

        # 256 KiB chunk size: place the marker so it straddles the boundary.
        marker = b"<script>"
        payload = b"%PDF-1.7\n" + b"\x00" * (256 * 1024 - 13) + marker + b"\x00" * 32
        with pytest.raises(ValidationError):
            scan_document_for_active_content(self._file(payload))

    def test_the_file_position_is_reset_for_downstream_consumers(self):
        from apps.documents.validators import scan_document_for_active_content

        handle = self._file(b"%PDF-1.7\nplain scan")
        scan_document_for_active_content(handle)
        assert handle.tell() == 0

    def test_the_screen_refusal_message_names_no_internal_detail(self):
        from rest_framework.exceptions import ValidationError

        from apps.documents.validators import scan_document_for_active_content

        with pytest.raises(ValidationError) as excinfo:
            scan_document_for_active_content(self._file(b"%PDF-1.7\n<</S/Launch/F(x)>>"))
        message = str(excinfo.value)
        assert "/Launch" not in message
        assert "regex" not in message.lower()


class TestStableCodeVocabulary:
    def test_the_published_vocabulary_is_exactly_the_codes_the_module_defines(self):
        assert contract.UPLOAD_REJECTION_CODES == (
            contract.DOCUMENT_TYPE_NOT_REQUIRED,
            contract.EMPTY_FILE,
            contract.FILE_TOO_LARGE,
            contract.INVALID_FILE_TYPE,
            contract.UNSAFE_FILE_CONTENT,
        )

    def test_an_empty_file_is_refused_with_its_own_code(self):
        with pytest.raises(contract.UploadRejected) as excinfo:
            contract.validate_upload(
                {
                    "label": "Result slip",
                    "accepted_mime_types": ["application/pdf"],
                    "accepted_extensions": [".pdf"],
                    "max_size_bytes": 1024,
                },
                size=0,
                mime_type="application/pdf",
            )
        assert excinfo.value.code == contract.EMPTY_FILE
