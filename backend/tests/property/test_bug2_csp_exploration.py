"""
Bug 2 (P1) — CSP unsafe-inline for Scripts: Exploration Test

This test encodes the fixed behavior after script CSP hardening:
script-src must not allow `unsafe-inline`, and the note should document why the
remaining Wasm allowance exists.

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
    Preserve the hardened script CSP and the accompanying operational note.
    """

    def test_script_src_does_not_contain_unsafe_inline(self):
        """
        script-src must not permit inline scripts.

        **Validates: Requirements 2.4**
        """
        data = _load_vercel_json()
        headers_blocks = data.get("headers", [])

        csp_found = False
        for block in headers_blocks:
            csp_value = _find_csp_header(block)
            if csp_value:
                csp_found = True
                script_src = next(
                    part.strip() for part in csp_value.split(";")
                    if part.strip().startswith("script-src")
                )
                assert "'unsafe-inline'" not in script_src

        assert csp_found, (
            "Expected a CSP header in vercel.json"
        )

    def test_script_csp_has_operational_note(self):
        """
        The CSP block should document the remaining Wasm exception.

        **Validates: Requirements 2.4**
        """
        data = _load_vercel_json()
        headers_blocks = data.get("headers", [])

        for block in headers_blocks:
            csp_value = _find_csp_header(block)
            if csp_value:
                note = _find_header_by_key(block, "X-CSP-Note")
                assert note is not None, (
                    "CSP exists but no X-CSP-Note header documents the remaining exception. "
                    f"CSP value: {csp_value}"
                )

    def test_operational_note_mentions_wasm_exception(self):
        """
        The X-CSP-Note header must explain the Wasm exception.

        **Validates: Requirements 2.4**
        """
        data = _load_vercel_json()
        headers_blocks = data.get("headers", [])

        for block in headers_blocks:
            csp_value = _find_csp_header(block)
            if csp_value:
                note = _find_header_by_key(block, "X-CSP-Note")
                assert note is not None, (
                    "X-CSP-Note header not found — cannot verify CSP documentation"
                )
                assert "wasm-unsafe-eval" in note, (
                    f"X-CSP-Note header exists but does not mention the Wasm exception. "
                    f"Value: {note}"
                )

    def test_operational_note_records_inline_script_removal(self):
        """
        The note must explicitly record that script-src no longer allows inline scripts.

        **Validates: Requirements 2.4**
        """
        data = _load_vercel_json()
        headers_blocks = data.get("headers", [])

        for block in headers_blocks:
            csp_value = _find_csp_header(block)
            if csp_value:
                note = _find_header_by_key(block, "X-CSP-Note")
                assert note is not None, (
                    "X-CSP-Note header not found — cannot verify script-src note"
                )
                assert "script-src does NOT allow unsafe-inline" in note, (
                    f"X-CSP-Note header does not record inline-script removal. "
                    f"Value: {note}"
                )
