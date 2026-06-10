"""Assert all 8 hardening flags are hardcoded True in prod.py and staging.py."""

import importlib
import re
from pathlib import Path

import pytest

SETTINGS_DIR = Path(__file__).resolve().parents[2] / "config" / "settings"

REQUIRED_FLAGS = [
    "PAYMENT_HARDENING_FORWARD_ONLY",
    "PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT",
    "PAYMENT_HARDENING_RATE_LIMITS",
    "PAYMENT_HARDENING_FORCE_APPROVED",
    "AI_HARDENING_CIRCUIT_BREAKER",
    "AI_HARDENING_RATE_LIMITS",
    "AI_HARDENING_CACHE",
    "AI_HARDENING_REDACTION",
]


@pytest.mark.parametrize("module_name", ["prod", "staging"])
@pytest.mark.parametrize("flag", REQUIRED_FLAGS)
def test_hardening_flag_is_true(module_name, flag):
    """Each hardening flag must be explicitly set to True in the settings file."""
    source = (SETTINGS_DIR / f"{module_name}.py").read_text()
    # Match `FLAG = True` as a standalone assignment (not commented out)
    pattern = rf"^{re.escape(flag)}\s*=\s*True\b"
    assert re.search(pattern, source, re.MULTILINE), (
        f"{flag} is not set to True in config/settings/{module_name}.py"
    )


def test_prod_cors_defaults_are_exact_origin_without_regex_wildcards():
    """Production CORS defaults must stay narrow unless regexes are env-supplied."""
    source = (SETTINGS_DIR / "prod.py").read_text()

    assert "https://apply.beanola.com" in source
    assert "CORS_ALLOWED_ORIGIN_REGEXES = []" in source
    assert "beanola\\.com" not in source
    assert "katc\\.edu\\.zm" not in source
    assert r"([A-Za-z0-9-]+\.)*mihas\.edu\.zm" not in source
