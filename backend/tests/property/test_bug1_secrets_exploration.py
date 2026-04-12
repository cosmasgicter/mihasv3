"""
Bug 1 (P0) — Hardcoded Secrets in MCP Config Files: Exploration Test

This test encodes the EXPECTED (fixed) behavior. It MUST FAIL on unfixed code,
confirming that real secrets are present in committed config files.

**Validates: Requirements 2.1, 2.2, 2.3**
"""

import json
import os
import re

import pytest

# Resolve paths relative to the repo root (tests live at backend/tests/property/)
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MCP_JSON = os.path.join(REPO_ROOT, ".kiro", "mcp.json")
SETTINGS_MCP_JSON = os.path.join(REPO_ROOT, ".kiro", "settings", "mcp.json")
GITIGNORE = os.path.join(REPO_ROOT, ".gitignore")

# Known secret prefixes that should never appear in committed config
SECRET_PATTERNS = [
    re.compile(r"^ctx7sk-"),       # Context7 API key
    re.compile(r"^eyJhbG"),        # JWT / Supabase tokens
    re.compile(r"^sbp_"),          # Supabase access tokens
]

SAFE_VALUES = {"", "<YOUR_KEY_HERE>"}

# Key names that are known to hold secrets/tokens (case-insensitive substring match)
SECRET_KEY_NAMES = {
    "API_KEY", "SECRET_KEY", "ACCESS_TOKEN", "ANON_KEY",
    "SERVICE_ROLE_KEY", "PERSONAL_ACCESS_TOKEN",
}


def _is_secret_key_name(key: str) -> bool:
    """Return True if the key name indicates it holds a secret value."""
    upper = key.upper()
    return any(name in upper for name in SECRET_KEY_NAMES)


def _extract_secret_values(data: dict) -> list[tuple[str, str]]:
    """
    Extract (key, value) pairs from 'env' and 'headers' dicts inside
    mcpServers entries, filtering to only keys that are known to hold secrets
    or whose values match secret patterns.
    """
    results = []

    for section_name in ("mcpServers", ):
        servers = data.get(section_name, {})
        for _server_name, server_cfg in servers.items():
            if not isinstance(server_cfg, dict):
                continue
            for section_key in ("env", "headers"):
                section = server_cfg.get(section_key, {})
                if isinstance(section, dict):
                    for k, v in section.items():
                        if isinstance(v, str) and (
                            _is_secret_key_name(k) or _has_secret_pattern(v)
                        ):
                            results.append((k, v))

    # Also check powers.mcpServers if present
    powers = data.get("powers", {})
    power_servers = powers.get("mcpServers", {})
    for _server_name, server_cfg in power_servers.items():
        if not isinstance(server_cfg, dict):
            continue
        for section_key in ("env", "headers"):
            section = server_cfg.get(section_key, {})
            if isinstance(section, dict):
                for k, v in section.items():
                    if isinstance(v, str) and (
                        _is_secret_key_name(k) or _has_secret_pattern(v)
                    ):
                        results.append((k, v))

    return results


def _has_secret_pattern(value: str) -> bool:
    """Return True if the value matches any known secret prefix."""
    return any(pat.match(value) for pat in SECRET_PATTERNS)


def _is_safe_value(value: str) -> bool:
    """Return True if the value is a safe placeholder."""
    return value in SAFE_VALUES


class TestBug1SecretsExploration:
    """
    Bug condition exploration: all secret values in MCP config files must be
    safe placeholders, and .kiro/settings/mcp.json must be in .gitignore.
    """

    def test_mcp_json_no_real_secrets(self):
        """
        .kiro/mcp.json must not contain real API keys or tokens.
        All secret-bearing env/header values must be '' or '<YOUR_KEY_HERE>'.

        **Validates: Requirements 2.1**
        """
        assert os.path.exists(MCP_JSON), f"{MCP_JSON} does not exist"

        with open(MCP_JSON) as f:
            data = json.load(f)

        secret_values = _extract_secret_values(data)
        violations = []
        for key, value in secret_values:
            if not _is_safe_value(value):
                violations.append(f"{key}={value!r}")

        assert violations == [], (
            f".kiro/mcp.json contains real secrets in env/header values: "
            f"{', '.join(violations)}"
        )

    def test_mcp_json_no_secret_patterns(self):
        """
        .kiro/mcp.json must not contain values matching known secret prefixes
        (ctx7sk-, eyJhbG, sbp_).

        **Validates: Requirements 2.1**
        """
        assert os.path.exists(MCP_JSON), f"{MCP_JSON} does not exist"

        with open(MCP_JSON) as f:
            data = json.load(f)

        secret_values = _extract_secret_values(data)
        pattern_matches = []
        for key, value in secret_values:
            if _has_secret_pattern(value):
                pattern_matches.append(f"{key}={value[:20]}...")

        assert pattern_matches == [], (
            f".kiro/mcp.json contains values matching secret patterns: "
            f"{', '.join(pattern_matches)}"
        )

    def test_settings_mcp_json_no_real_secrets(self):
        """
        .kiro/settings/mcp.json must not contain real API keys or tokens.
        All secret-bearing env/header values must be '' or '<YOUR_KEY_HERE>'.

        **Validates: Requirements 2.2**
        """
        assert os.path.exists(SETTINGS_MCP_JSON), (
            f"{SETTINGS_MCP_JSON} does not exist"
        )

        with open(SETTINGS_MCP_JSON) as f:
            data = json.load(f)

        secret_values = _extract_secret_values(data)
        violations = []
        for key, value in secret_values:
            if not _is_safe_value(value):
                violations.append(f"{key}={value!r}")

        assert violations == [], (
            f".kiro/settings/mcp.json contains real secrets in env/header values: "
            f"{', '.join(violations)}"
        )

    def test_settings_mcp_json_no_secret_patterns(self):
        """
        .kiro/settings/mcp.json must not contain values matching known secret
        prefixes (ctx7sk-, eyJhbG, sbp_).

        **Validates: Requirements 2.2**
        """
        assert os.path.exists(SETTINGS_MCP_JSON), (
            f"{SETTINGS_MCP_JSON} does not exist"
        )

        with open(SETTINGS_MCP_JSON) as f:
            data = json.load(f)

        secret_values = _extract_secret_values(data)
        pattern_matches = []
        for key, value in secret_values:
            if _has_secret_pattern(value):
                pattern_matches.append(f"{key}={value[:20]}...")

        assert pattern_matches == [], (
            f".kiro/settings/mcp.json contains values matching secret patterns: "
            f"{', '.join(pattern_matches)}"
        )

    def test_gitignore_contains_settings_mcp_json(self):
        """
        .gitignore must contain an entry for .kiro/settings/mcp.json to prevent
        future secret commits.

        **Validates: Requirements 2.3**
        """
        assert os.path.exists(GITIGNORE), f"{GITIGNORE} does not exist"

        with open(GITIGNORE) as f:
            lines = [line.strip() for line in f.readlines()]

        assert ".kiro/settings/mcp.json" in lines, (
            ".gitignore does not contain '.kiro/settings/mcp.json' — "
            "future edits to this file will continue to be tracked by git"
        )
