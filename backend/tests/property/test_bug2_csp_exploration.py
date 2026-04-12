"""
Bug 2 (P1) — CSP unsafe-inline for Scripts: Exploration Test

This test encodes the EXPECTED (fixed) behavior. It MUST FAIL on unfixed code,
confirming that `unsafe-inline` is present in the CSP without risk documentation.

**Validates: Requirements 2.4**
"""

import json
import os

import pytest

# Resolve paths relative to the repo root (tests live at backend/tests/property/)
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
VERCEL_JSON = os.path.join(REPO_ROOT, "apps", "admissions", "vercel.json")


def _load_vercel_json() -> dict:
    """Load and parse apps/admissions/vercel.json."""
    assert os.path.exists(VERCEL_JSON), f"{VERCEL_JSON} does not exist"
    with open(VERCEL_JSON) as f:
        return json.load(f)


def _find_csp_header(headers_config: dict) -> str | None:
    """
    Find the Content-Security-Policy header value from a vercel.json
    headers block entry.
    """
    header_entries = headers_config.get("headers", [])
    for entry in header_entries:
        if entry.get("key") == "Content-Security-Policy":
            return entry.get("value", "")
    return None


def _find_header_by_key(headers_config: dict, key: str) -> str | None:
    """
    Find a header value by key name from a vercel.json headers block entry.
    """
    header_entries = headers_config.get("headers", [])
    for entry in header_entries:
        if entry.get("key") == key:
            return entry.get("value", "")
    return None


class TestBug2CSPExploration:
    """
    Bug condition exploration: if the CSP contains 'unsafe-inline', there must
    be a risk documentation header (X-CSP-Note) in the same headers array that
    mentions the unsafe-inline risk and contains a TODO for nonce-based CSP.
    """

    def test_csp_contains_unsafe_inline(self):
        """
        Precondition check: verify that the CSP header actually contains
        'unsafe-inline' so the bug condition is relevant.

        **Validates: Requirements 2.4**
        """
        data = _load_vercel_json()
        headers_blocks = data.get("headers", [])

        csp_found = False
        for block in headers_blocks:
            csp_value = _find_csp_header(block)
            if csp_value and "unsafe-inline" in csp_value:
                csp_found = True
                break

        assert csp_found, (
            "Expected CSP header with 'unsafe-inline' in vercel.json — "
            "bug condition precondition not met"
        )

    def test_unsafe_inline_has_risk_documentation_header(self):
        """
        If 'unsafe-inline' is present in the CSP, there must be an X-CSP-Note
        header in the same headers array documenting the risk.

        **Validates: Requirements 2.4**
        """
        data = _load_vercel_json()
        headers_blocks = data.get("headers", [])

        for block in headers_blocks:
            csp_value = _find_csp_header(block)
            if csp_value and "unsafe-inline" in csp_value:
                # This block has CSP with unsafe-inline — check for documentation
                note = _find_header_by_key(block, "X-CSP-Note")
                assert note is not None, (
                    "CSP contains 'unsafe-inline' but no X-CSP-Note header exists "
                    "in the same headers block to document the risk. "
                    f"CSP value: {csp_value}"
                )

    def test_risk_documentation_mentions_unsafe_inline(self):
        """
        The X-CSP-Note header must explicitly mention 'unsafe-inline' to
        document the specific risk.

        **Validates: Requirements 2.4**
        """
        data = _load_vercel_json()
        headers_blocks = data.get("headers", [])

        for block in headers_blocks:
            csp_value = _find_csp_header(block)
            if csp_value and "unsafe-inline" in csp_value:
                note = _find_header_by_key(block, "X-CSP-Note")
                assert note is not None, (
                    "X-CSP-Note header not found — cannot verify risk documentation"
                )
                assert "unsafe-inline" in note, (
                    f"X-CSP-Note header exists but does not mention 'unsafe-inline'. "
                    f"Value: {note}"
                )

    def test_risk_documentation_contains_nonce_todo(self):
        """
        The X-CSP-Note header must contain a TODO for nonce-based CSP migration.

        **Validates: Requirements 2.4**
        """
        data = _load_vercel_json()
        headers_blocks = data.get("headers", [])

        for block in headers_blocks:
            csp_value = _find_csp_header(block)
            if csp_value and "unsafe-inline" in csp_value:
                note = _find_header_by_key(block, "X-CSP-Note")
                assert note is not None, (
                    "X-CSP-Note header not found — cannot verify nonce TODO"
                )
                assert "nonce" in note.lower(), (
                    f"X-CSP-Note header does not mention nonce-based CSP migration. "
                    f"Value: {note}"
                )
                assert "TODO" in note or "todo" in note.lower(), (
                    f"X-CSP-Note header does not contain a TODO marker. "
                    f"Value: {note}"
                )
