"""
Bug 1 (P0) — MCP Config Structure Preservation Tests

These tests assert that the JSON structure of both MCP config files is intact.
They check server entry names, config keys (command, args, env key names, disabled),
and valid JSON parsing — but do NOT check secret values.

These tests MUST PASS on unfixed code to confirm the baseline structure to preserve.

**Validates: Requirements 3.1, 3.2**
"""

import json
import os

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MCP_JSON = os.path.join(REPO_ROOT, ".kiro", "mcp.json")
SETTINGS_MCP_JSON = os.path.join(REPO_ROOT, ".kiro", "settings", "mcp.json")

# Expected server entry names in .kiro/mcp.json (mcpServers section)
MCP_JSON_SERVER_NAMES = {
    "filesystem", "fetch", "memory", "chrome-devtools", "playwright",
    "sqlite", "shadcn", "context7", "github", "brave-search", "neon",
}

# Expected server entry names in .kiro/settings/mcp.json (mcpServers section)
SETTINGS_MCP_JSON_SERVER_NAMES = {
    "filesystem", "fetch", "memory", "shadcn-ui", "canva", "chrome-devtools",
    "playwright", "sqlite", "github", "brave-search", "neon", "context7",
}

# Expected env key names per server in .kiro/mcp.json
MCP_JSON_ENV_KEYS = {
    "chrome-devtools": {"CHROME_REMOTE_DEBUGGING_PORT"},
    "github": {"GITHUB_PERSONAL_ACCESS_TOKEN"},
    "brave-search": {"BRAVE_API_KEY"},
}

# Expected header key names per server in .kiro/mcp.json
MCP_JSON_HEADER_KEYS = {
    "context7": {"CONTEXT7_API_KEY"},
}

# Expected env key names per server in .kiro/settings/mcp.json
SETTINGS_MCP_JSON_ENV_KEYS = {
    "chrome-devtools": {"CHROME_REMOTE_DEBUGGING_PORT"},
    "github": {"GITHUB_PERSONAL_ACCESS_TOKEN"},
    "brave-search": {"BRAVE_API_KEY"},
}

# Expected header key names per server in .kiro/settings/mcp.json
SETTINGS_MCP_JSON_HEADER_KEYS = {
    "context7": {"CONTEXT7_API_KEY"},
}


class TestMcpJsonStructurePreservation:
    """
    Preservation tests for .kiro/mcp.json — structure only, no secret value checks.

    **Validates: Requirements 3.1**
    """

    def test_valid_json(self):
        """File must parse as valid JSON."""
        assert os.path.exists(MCP_JSON), f"{MCP_JSON} does not exist"
        with open(MCP_JSON) as f:
            data = json.load(f)
        assert isinstance(data, dict)

    def test_all_server_entries_present(self):
        """All expected server entry names must exist in mcpServers."""
        with open(MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        actual_names = set(servers.keys())
        missing = MCP_JSON_SERVER_NAMES - actual_names
        assert missing == set(), (
            f".kiro/mcp.json is missing server entries: {missing}"
        )

    def test_each_server_has_disabled_flag(self):
        """Every server entry must have a 'disabled' key."""
        with open(MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        for name in MCP_JSON_SERVER_NAMES:
            assert name in servers, f"Server '{name}' missing"
            assert "disabled" in servers[name], (
                f"Server '{name}' missing 'disabled' key"
            )

    def test_command_based_servers_have_command_and_args(self):
        """Servers with 'command' must also have 'args'."""
        with open(MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        for name, cfg in servers.items():
            if "command" in cfg:
                assert "args" in cfg, (
                    f"Server '{name}' has 'command' but missing 'args'"
                )
                assert isinstance(cfg["args"], list), (
                    f"Server '{name}' 'args' must be a list"
                )

    def test_url_based_servers_have_url(self):
        """Servers using URL-based transport must have 'url' key."""
        with open(MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        url_servers = {"context7", "supabase"}
        for name in url_servers:
            if name in servers:
                assert "url" in servers[name], (
                    f"Server '{name}' missing 'url' key"
                )

    def test_env_key_names_preserved(self):
        """Expected env key names must be present in each server's env dict."""
        with open(MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        for server_name, expected_keys in MCP_JSON_ENV_KEYS.items():
            assert server_name in servers, f"Server '{server_name}' missing"
            env = servers[server_name].get("env", {})
            actual_keys = set(env.keys())
            missing = expected_keys - actual_keys
            assert missing == set(), (
                f"Server '{server_name}' env missing keys: {missing}"
            )

    def test_header_key_names_preserved(self):
        """Expected header key names must be present in each server's headers dict."""
        with open(MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        for server_name, expected_keys in MCP_JSON_HEADER_KEYS.items():
            assert server_name in servers, f"Server '{server_name}' missing"
            headers = servers[server_name].get("headers", {})
            actual_keys = set(headers.keys())
            missing = expected_keys - actual_keys
            assert missing == set(), (
                f"Server '{server_name}' headers missing keys: {missing}"
            )

    def test_powers_section_exists(self):
        """The 'powers' section must exist with mcpServers sub-key."""
        with open(MCP_JSON) as f:
            data = json.load(f)
        assert "powers" in data, "Missing 'powers' section"
        assert "mcpServers" in data["powers"], (
            "Missing 'powers.mcpServers' section"
        )


class TestSettingsMcpJsonStructurePreservation:
    """
    Preservation tests for .kiro/settings/mcp.json — structure only, no secret value checks.

    **Validates: Requirements 3.2**
    """

    def test_valid_json(self):
        """File must parse as valid JSON."""
        assert os.path.exists(SETTINGS_MCP_JSON), (
            f"{SETTINGS_MCP_JSON} does not exist"
        )
        with open(SETTINGS_MCP_JSON) as f:
            data = json.load(f)
        assert isinstance(data, dict)

    def test_all_server_entries_present(self):
        """All expected server entry names must exist in mcpServers."""
        with open(SETTINGS_MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        actual_names = set(servers.keys())
        missing = SETTINGS_MCP_JSON_SERVER_NAMES - actual_names
        assert missing == set(), (
            f".kiro/settings/mcp.json is missing server entries: {missing}"
        )

    def test_each_server_has_disabled_flag(self):
        """Every server entry must have a 'disabled' key."""
        with open(SETTINGS_MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        for name in SETTINGS_MCP_JSON_SERVER_NAMES:
            assert name in servers, f"Server '{name}' missing"
            assert "disabled" in servers[name], (
                f"Server '{name}' missing 'disabled' key"
            )

    def test_command_based_servers_have_command_and_args(self):
        """Servers with 'command' must also have 'args'."""
        with open(SETTINGS_MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        for name, cfg in servers.items():
            if "command" in cfg:
                assert "args" in cfg, (
                    f"Server '{name}' has 'command' but missing 'args'"
                )
                assert isinstance(cfg["args"], list), (
                    f"Server '{name}' 'args' must be a list"
                )

    def test_url_based_servers_have_url(self):
        """Servers using URL-based transport must have 'url' key."""
        with open(SETTINGS_MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        url_servers = {"canva", "context7"}
        for name in url_servers:
            if name in servers:
                assert "url" in servers[name], (
                    f"Server '{name}' missing 'url' key"
                )

    def test_env_key_names_preserved(self):
        """Expected env key names must be present in each server's env dict."""
        with open(SETTINGS_MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        for server_name, expected_keys in SETTINGS_MCP_JSON_ENV_KEYS.items():
            assert server_name in servers, f"Server '{server_name}' missing"
            env = servers[server_name].get("env", {})
            actual_keys = set(env.keys())
            missing = expected_keys - actual_keys
            assert missing == set(), (
                f"Server '{server_name}' env missing keys: {missing}"
            )

    def test_header_key_names_preserved(self):
        """Expected header key names must be present in each server's headers dict."""
        with open(SETTINGS_MCP_JSON) as f:
            data = json.load(f)
        servers = data.get("mcpServers", {})
        for server_name, expected_keys in SETTINGS_MCP_JSON_HEADER_KEYS.items():
            assert server_name in servers, f"Server '{server_name}' missing"
            headers = servers[server_name].get("headers", {})
            actual_keys = set(headers.keys())
            missing = expected_keys - actual_keys
            assert missing == set(), (
                f"Server '{server_name}' headers missing keys: {missing}"
            )

    def test_powers_section_exists(self):
        """The 'powers' section must exist with mcpServers sub-key."""
        with open(SETTINGS_MCP_JSON) as f:
            data = json.load(f)
        assert "powers" in data, "Missing 'powers' section"
        assert "mcpServers" in data["powers"], (
            "Missing 'powers.mcpServers' section"
        )
