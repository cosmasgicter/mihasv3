"""Application-number prefix validation is institution-code-agnostic (R9.9).

The platform was de-branded from a single-tenant MIHAS/KATC app into a
Beanola-owned multi-school platform. Application numbers now begin with the
*assigned* institution's code (e.g. ``BNL`` for the Beanola platform, or any
school code), not a fixed ``MIHAS``/``KATC`` allowlist. These tests assert the
backend tracking/application-number validator (``ApplicationTrackView``) accepts
any institution-code prefix while preserving the existing structural format
checks and backward compatibility with legacy MIHAS/KATC-prefixed numbers.

Validates: Requirements 9.9
"""

from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory

from apps.applications.models import Application
from apps.applications.public_views import ApplicationTrackView


class TestApplicationNumberPrefixIsInstitutionAgnostic:
    """ApplicationTrackView accepts any institution-code prefix (R9.9)."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationTrackView.as_view()
        self.pattern = ApplicationTrackView.TRACKING_CODE_PATTERN

    # -- Pattern-level checks (no DB) ------------------------------------

    def test_pattern_accepts_non_mihas_katc_application_numbers(self):
        """A non-MIHAS/KATC institution code prefix must match the format."""
        for code in (
            "BNL202500001",        # Beanola platform code
            "UNZA202500042",       # arbitrary school code
            "EHT202612345",        # short school code
            "BNL20250000001234",   # max-length seq segment (14 digits)
        ):
            assert self.pattern.match(code), (
                f"Generic institution prefix should validate, rejected: {code!r}"
            )

    def test_pattern_accepts_non_brand_tracking_codes(self):
        """TRK-{CODE}{YEAR}{HEX} accepts any institution code, not only MIHAS."""
        for code in ("TRK-BNL2025ABCDEF", "TRK-UNZA2026A1B2C3"):
            assert self.pattern.match(code), (
                f"Generic institution tracking code should validate, rejected: {code!r}"
            )

    def test_pattern_preserves_legacy_mihas_katc_numbers(self):
        """Backward compat: legacy MIHAS/KATC-prefixed numbers still validate."""
        for code in ("MIHAS202500001", "KATC202500002", "TRK-MIHAS2025ABCDEF"):
            assert self.pattern.match(code), (
                f"Legacy brand-prefixed code must still validate, rejected: {code!r}"
            )

    def test_pattern_preserves_legacy_tracking_formats(self):
        """Backward compat: APP-YYYYMMDD-XXXXXXXX and legacy TRK formats validate."""
        for code in ("APP-20260416-ABCD1234", "TRK-ABCDEF123456", "TRK370990"):
            assert self.pattern.match(code), (
                f"Legacy tracking format must still validate, rejected: {code!r}"
            )

    def test_pattern_still_rejects_structurally_invalid_codes(self):
        """Relaxing the prefix must not relax the structural format checks."""
        for code in (
            "INVALID123",          # too few digits for the seq segment
            "BNL2025",             # not enough digits
            "bnl202500001",        # lowercase (input is upper-cased before match)
            "BNL-2025-0001",       # wrong separators
            "TOOLONGCODE202500001",  # prefix > 10 letters
        ):
            assert not self.pattern.match(code), (
                f"Structurally invalid code must be rejected, matched: {code!r}"
            )

    # -- End-to-end through the view ------------------------------------

    @patch("apps.applications.public_views.Application.objects")
    def test_non_brand_prefix_passes_format_gate(self, mock_qs):
        """A BNL-prefixed number is a valid *format* (reaches DB lookup, not 400)."""
        mock_qs.get.side_effect = Application.DoesNotExist

        request = self.factory.get("/api/v1/applications/track/?code=BNL202500001")
        response = self.view(request)

        # Valid format but no row -> descriptive 404, never a 400 INVALID_FORMAT.
        assert response.status_code == 404, (
            f"Expected 404 for valid-format unknown code, got {response.status_code}: {response.data}"
        )
        assert response.data.get("code") == "NOT_FOUND"

    @patch("apps.applications.public_views.Application.objects")
    def test_legacy_brand_prefix_still_passes_format_gate(self, mock_qs):
        """Backward compat through the view: MIHAS-prefixed number still valid format."""
        mock_qs.get.side_effect = Application.DoesNotExist

        request = self.factory.get("/api/v1/applications/track/?code=MIHAS202500001")
        response = self.view(request)

        assert response.status_code == 404, (
            f"Expected 404 for valid-format unknown legacy code, got {response.status_code}: {response.data}"
        )
        assert response.data.get("code") == "NOT_FOUND"

    def test_truly_invalid_format_returns_400(self):
        """A clearly malformed code still returns 400 INVALID_FORMAT."""
        request = self.factory.get("/api/v1/applications/track/?code=NOTACODE")
        response = self.view(request)

        assert response.status_code == 400
        assert response.data.get("code") == "INVALID_FORMAT"
