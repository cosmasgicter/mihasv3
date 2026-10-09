"""Assert every surviving hardening flag is hardcoded True in prod.py and staging.py.

admissions-v2 task 8.2 deleted three payment flags
(``PAYMENT_HARDENING_FORWARD_ONLY``, ``PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT``,
``PAYMENT_HARDENING_FORCE_APPROVED``) together with the alternative
implementations they selected. A flag that cannot be turned off cannot be
misconfigured, so the deploy-time assertion moves from "is it True?" to "does it
still exist?" — enforced by
``tests/unit/test_payment_single_path_8_2.py::test_no_payment_flag_selects_between_two_implementations``.
"""

import importlib
import re
from pathlib import Path

import pytest

SETTINGS_DIR = Path(__file__).resolve().parents[2] / "config" / "settings"

REQUIRED_FLAGS = [
    "PAYMENT_HARDENING_RATE_LIMITS",
    "DOCUMENT_EXTRACT_RATE_LIMITS",
]

RETIRED_FLAGS = [
    "PAYMENT_HARDENING_FORWARD_ONLY",
    "PAYMENT_HARDENING_WEBHOOK_DEDUP_STRICT",
    "PAYMENT_HARDENING_FORCE_APPROVED",
]


@pytest.mark.parametrize("module_name", ["prod", "staging", "base"])
@pytest.mark.parametrize("flag", RETIRED_FLAGS)
def test_retired_flag_is_not_reintroduced(module_name, flag):
    """A retired flag must not reappear as a settings assignment.

    Re-adding one would resurrect the question "which payment implementation is
    this environment running?", which task 8.2 answered permanently.
    """
    source = (SETTINGS_DIR / f"{module_name}.py").read_text()
    pattern = rf"^{re.escape(flag)}\s*="
    assert not re.search(pattern, source, re.MULTILINE), (
        f"{flag} was reintroduced in config/settings/{module_name}.py"
    )


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
