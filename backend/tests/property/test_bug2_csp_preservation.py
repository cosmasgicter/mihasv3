"""
Bug 2 (P1) — CSP Allowed Sources Preservation Tests

These tests assert that the CSP directive values and all other headers in
apps/admissions/vercel.json are preserved exactly. They check:
- CSP script-src includes all required allowed sources
- All non-CSP headers are present and unchanged
- The vercel.json structure is valid JSON

These tests MUST PASS on unfixed code to confirm the baseline behavior to preserve.

**Validates: Requirements 3.6**
"""

import json
import os

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
VERCEL_JSON = os.path.join(REPO_ROOT, "apps", "admissions", "vercel.json")

# Expected script-src allowed sources (order-independent)
EXPECTED_SCRIPT_SRC_SOURCES = {
    "'self'",
    "'unsafe-inline'",
    "https://va.vercel-scripts.com",
    "https://pay.lenco.co",
    "https://pay.sandbox.lenco.co",
}

# Expected non-CSP headers in the main "/(.*)" headers block
EXPECTED_NON_CSP_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Permitted-Cross-Domain-Policies": "none",
}

# Expected CSP directives and their values (order-independent per directive)
EXPECTED_CSP_DIRECTIVES = {
    "default-src": {"'self'"},
    "script-src": {"'self'", "'unsafe-inline'", "https://va.vercel-scripts.com", "https://pay.lenco.co", "https://pay.sandbox.lenco.co"},
    "style-src": {"'self'", "'unsafe-inline'"},
    "style-src-elem": {"'self'", "'unsafe-inline'"},
    "img-src": {"'self'", "data:", "blob:"},
    "font-src": {"'self'"},
    "connect-src": {"'self'", "***REMOVED***", "https://pay.lenco.co", "https://pay.sandbox.lenco.co", "https://api.lenco.co", "https://api.sandbox.lenco.co", "https://app.glitchtip.com", "https://*.r2.cloudflarestorage.com"},
    "frame-src": {"'self'", "https://pay.lenco.co", "https://pay.sandbox.lenco.co"},
    "child-src": {"'self'", "blob:"},
    "frame-ancestors": {"'none'"},
    "base-uri": {"'self'"},
    "form-action": {"'self'"},
}


def _load_vercel_json() -> dict:
    """Load and parse apps/admissions/vercel.json."""
    assert os.path.exists(VERCEL_JSON), f"{VERCEL_JSON} does not exist"
    with open(VERCEL_JSON) as f:
        return json.load(f)


def _get_main_headers_block(data: dict) -> dict | None:
    """Find the main headers block with source '/(.*)'."""
    for block in data.get("headers", []):
        if block.get("source") == "/(.*)":
            return block
    return None


def _find_header_value(headers_list: list, key: str) -> str | None:
    """Find a header value by key from a list of {key, value} dicts."""
    for entry in headers_list:
        if entry.get("key") == key:
            return entry.get("value", "")
    return None


def _parse_csp_directives(csp_value: str) -> dict[str, set[str]]:
    """Parse a CSP header value into a dict of directive -> set of sources."""
    directives = {}
    for part in csp_value.split(";"):
        part = part.strip()
        if not part:
            continue
        tokens = part.split()
        directive_name = tokens[0]
        sources = set(tokens[1:])
        directives[directive_name] = sources
    return directives


class TestVercelJsonValid:
    """
    Verify vercel.json is valid JSON with expected top-level structure.

    **Validates: Requirements 3.6**
    """

    def test_valid_json(self):
        """vercel.json must parse as valid JSON."""
        data = _load_vercel_json()
        assert isinstance(data, dict)

    def test_has_headers_section(self):
        """vercel.json must have a 'headers' array."""
        data = _load_vercel_json()
        assert "headers" in data
        assert isinstance(data["headers"], list)

    def test_main_headers_block_exists(self):
        """The main '/(.*) ' headers block must exist."""
        data = _load_vercel_json()
        block = _get_main_headers_block(data)
        assert block is not None, "Main headers block with source '/(.*) ' not found"


class TestCSPScriptSrcPreservation:
    """
    Verify CSP script-src includes all required allowed sources.

    **Validates: Requirements 3.6**
    """

    def test_csp_header_exists(self):
        """CSP header must exist in the main headers block."""
        data = _load_vercel_json()
        block = _get_main_headers_block(data)
        assert block is not None
        csp = _find_header_value(block["headers"], "Content-Security-Policy")
        assert csp is not None, "Content-Security-Policy header not found"

    def test_script_src_contains_self(self):
        """script-src must include 'self'."""
        data = _load_vercel_json()
        block = _get_main_headers_block(data)
        csp = _find_header_value(block["headers"], "Content-Security-Policy")
        directives = _parse_csp_directives(csp)
        assert "script-src" in directives, "script-src directive not found in CSP"
        assert "'self'" in directives["script-src"]

    def test_script_src_contains_vercel_scripts(self):
        """script-src must include https://va.vercel-scripts.com."""
        data = _load_vercel_json()
        block = _get_main_headers_block(data)
        csp = _find_header_value(block["headers"], "Content-Security-Policy")
        directives = _parse_csp_directives(csp)
        assert "https://va.vercel-scripts.com" in directives["script-src"]

    def test_script_src_contains_lenco_pay(self):
        """script-src must include https://pay.lenco.co."""
        data = _load_vercel_json()
        block = _get_main_headers_block(data)
        csp = _find_header_value(block["headers"], "Content-Security-Policy")
        directives = _parse_csp_directives(csp)
        assert "https://pay.lenco.co" in directives["script-src"]

    def test_script_src_contains_lenco_sandbox(self):
        """script-src must include https://pay.sandbox.lenco.co."""
        data = _load_vercel_json()
        block = _get_main_headers_block(data)
        csp = _find_header_value(block["headers"], "Content-Security-Policy")
        directives = _parse_csp_directives(csp)
        assert "https://pay.sandbox.lenco.co" in directives["script-src"]

    def test_script_src_all_sources_preserved(self):
        """script-src must contain exactly the expected set of sources."""
        data = _load_vercel_json()
        block = _get_main_headers_block(data)
        csp = _find_header_value(block["headers"], "Content-Security-Policy")
        directives = _parse_csp_directives(csp)
        assert directives["script-src"] == EXPECTED_SCRIPT_SRC_SOURCES, (
            f"script-src sources mismatch.\n"
            f"Expected: {EXPECTED_SCRIPT_SRC_SOURCES}\n"
            f"Actual:   {directives['script-src']}"
        )


class TestCSPAllDirectivesPreservation:
    """
    Verify all CSP directives and their values are preserved exactly.

    **Validates: Requirements 3.6**
    """

    def test_all_csp_directives_present(self):
        """All expected CSP directives must be present."""
        data = _load_vercel_json()
        block = _get_main_headers_block(data)
        csp = _find_header_value(block["headers"], "Content-Security-Policy")
        directives = _parse_csp_directives(csp)
        missing = set(EXPECTED_CSP_DIRECTIVES.keys()) - set(directives.keys())
        assert missing == set(), f"Missing CSP directives: {missing}"

    def test_each_csp_directive_values_match(self):
        """Each CSP directive must have exactly the expected sources."""
        data = _load_vercel_json()
        block = _get_main_headers_block(data)
        csp = _find_header_value(block["headers"], "Content-Security-Policy")
        directives = _parse_csp_directives(csp)
        for directive, expected_sources in EXPECTED_CSP_DIRECTIVES.items():
            assert directive in directives, f"Directive '{directive}' missing"
            assert directives[directive] == expected_sources, (
                f"Directive '{directive}' sources mismatch.\n"
                f"Expected: {expected_sources}\n"
                f"Actual:   {directives[directive]}"
            )


class TestNonCSPHeadersPreservation:
    """
    Verify all non-CSP headers in vercel.json are present and unchanged.

    **Validates: Requirements 3.6**
    """

    def test_all_non_csp_headers_present(self):
        """All expected non-CSP headers must exist in the main block."""
        data = _load_vercel_json()
        block = _get_main_headers_block(data)
        assert block is not None
        for key in EXPECTED_NON_CSP_HEADERS:
            value = _find_header_value(block["headers"], key)
            assert value is not None, f"Header '{key}' not found in main headers block"

    def test_each_non_csp_header_value_unchanged(self):
        """Each non-CSP header must have exactly the expected value."""
        data = _load_vercel_json()
        block = _get_main_headers_block(data)
        for key, expected_value in EXPECTED_NON_CSP_HEADERS.items():
            actual_value = _find_header_value(block["headers"], key)
            assert actual_value == expected_value, (
                f"Header '{key}' value mismatch.\n"
                f"Expected: {expected_value}\n"
                f"Actual:   {actual_value}"
            )

    def test_service_worker_cache_control_removed(self):
        """The /service-worker.js headers block must NOT exist after PWA removal."""
        data = _load_vercel_json()
        sw_block = None
        for block in data.get("headers", []):
            if block.get("source") == "/service-worker.js":
                sw_block = block
                break
        assert sw_block is None, (
            "service-worker.js headers block should have been removed during PWA cleanup"
        )

    def test_assets_cache_control_preserved(self):
        """The /assets/(.*)  headers block must be preserved."""
        data = _load_vercel_json()
        assets_block = None
        for block in data.get("headers", []):
            if block.get("source") == "/assets/(.*)":
                assets_block = block
                break
        assert assets_block is not None, "assets headers block not found"
        cc = _find_header_value(assets_block["headers"], "Cache-Control")
        assert cc == "public, max-age=31536000, immutable", (
            f"assets Cache-Control mismatch: {cc}"
        )
