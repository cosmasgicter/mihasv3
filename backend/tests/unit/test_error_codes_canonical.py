"""Assert every error code raised in backend apps is in the canonical ERROR_CODES catalog.

Scans backend/apps/applications/, backend/apps/documents/, and
backend/apps/accounts/ for string literals that look like error codes
(ALL_CAPS_WITH_UNDERSCORES used in response dicts as 'code' values) and
verifies they exist in the canonical catalog.
"""

import os
import re
from pathlib import Path

import pytest

from apps.common.error_codes import ERROR_CODES


# Directories to scan for error code usage
SCAN_DIRS = [
    Path("apps/applications"),
    Path("apps/documents"),
    Path("apps/accounts"),
]

# Pattern: "code": "SOME_ERROR_CODE" or 'code': 'SOME_ERROR_CODE'
# Also matches: code="SOME_ERROR_CODE" (keyword arg style)
CODE_PATTERNS = [
    re.compile(r"""["']code["']\s*:\s*["']([A-Z][A-Z0-9_]+)["']"""),
    re.compile(r"""\bcode\s*=\s*["']([A-Z][A-Z0-9_]+)["']"""),
]

# Codes that are known to be used in tests or non-response contexts
IGNORE_CODES = {
    # HTTP method names, status names, etc. that match the pattern but aren't error codes
    "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
    "OK", "TRUE", "FALSE", "NONE",
    # Django/DRF constants
    "HTTP_200_OK", "HTTP_400_BAD_REQUEST", "HTTP_401_UNAUTHORIZED",
    "HTTP_403_FORBIDDEN", "HTTP_404_NOT_FOUND", "HTTP_409_CONFLICT",
    "HTTP_429_TOO_MANY_REQUESTS", "HTTP_500_INTERNAL_SERVER_ERROR",
    "HTTP_503_SERVICE_UNAVAILABLE", "HTTP_402_PAYMENT_REQUIRED",
    # Model field choices / non-error constants
    "DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED",
    "WITHDRAWN", "ENROLLED", "EXPIRED", "WAITLISTED",
    "CONDITIONALLY_APPROVED", "ENROLLMENT_EXPIRED",
    "PENDING", "SUCCESSFUL", "FAILED", "VERIFIED", "PAID",
    "FORCE_APPROVED", "DEFERRED",
    "LOCAL", "INTERNATIONAL",
    "FULL", "PARTIAL",
    "MET", "WAIVED", "UNMET",
    "ACADEMIC", "DOCUMENT", "FINANCIAL", "OTHER",
    "IN_PERSON", "ONLINE", "PHONE",
    "SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW",
    "SINGLE_ACTIVE", "UNRESTRICTED", "WAITLIST_CASCADE",
    "MOBILE_MONEY", "CARD",
    "SHA512", "HMAC",
    "ZMW", "USD",
    # Task/action names
    "WAITLIST_ORDER_OVERRIDE",
}


def _find_error_codes_in_file(filepath: Path) -> set[str]:
    """Extract error code literals from a Python file."""
    codes = set()
    try:
        content = filepath.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return codes

    for pattern in CODE_PATTERNS:
        for match in pattern.finditer(content):
            code = match.group(1)
            if code not in IGNORE_CODES:
                codes.add(code)
    return codes


def _collect_all_codes() -> dict[str, set[str]]:
    """Scan all target directories and collect error codes per file."""
    backend_root = Path(__file__).resolve().parent.parent.parent
    results: dict[str, set[str]] = {}

    for scan_dir in SCAN_DIRS:
        full_dir = backend_root / scan_dir
        if not full_dir.exists():
            continue
        for py_file in full_dir.rglob("*.py"):
            # Skip test files and migrations
            rel = py_file.relative_to(backend_root)
            if "test" in str(rel) or "migration" in str(rel):
                continue
            codes = _find_error_codes_in_file(py_file)
            if codes:
                results[str(rel)] = codes

    return results


# Collect once at module level
_ALL_CODES_BY_FILE = _collect_all_codes()
_ALL_CODES = set()
for codes in _ALL_CODES_BY_FILE.values():
    _ALL_CODES.update(codes)


class TestErrorCodesCanonical:
    """Every error code used in views/services must be in ERROR_CODES."""

    def test_catalog_is_non_empty(self):
        assert len(ERROR_CODES) > 30

    def test_all_emitted_codes_are_in_catalog(self):
        """Every code found in scanned files must exist in ERROR_CODES."""
        missing = _ALL_CODES - set(ERROR_CODES.keys())
        if missing:
            # Build a helpful message showing where each missing code is used
            details = []
            for code in sorted(missing):
                files = [f for f, codes in _ALL_CODES_BY_FILE.items() if code in codes]
                details.append(f"  {code} (used in: {', '.join(files)})")
            pytest.fail(
                f"Error codes used in views but missing from ERROR_CODES catalog:\n"
                + "\n".join(details)
            )

    def test_catalog_keys_are_uppercase(self):
        for key in ERROR_CODES:
            assert key == key.upper(), f"Code {key!r} must be UPPER_CASE"

    def test_catalog_entries_have_required_fields(self):
        for code, entry in ERROR_CODES.items():
            assert "http_status" in entry, f"{code} missing http_status"
            assert "message" in entry, f"{code} missing message"
            assert "category" in entry, f"{code} missing category"

    def test_catalog_categories_are_valid(self):
        valid = {"payment", "application", "auth", "document", "validation", "common"}
        for code, entry in ERROR_CODES.items():
            assert entry["category"] in valid, (
                f"{code} has invalid category {entry['category']!r}"
            )
