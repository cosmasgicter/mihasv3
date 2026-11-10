"""R1 exploration: prod and staging must refuse to start with an empty ``S3_*``.

Spec: student-journey-repair task 1.1, clause 1.2 (design R1-b).

``validate_required_env_vars()`` is called while ``base.py`` is still being
imported, so it reads ``django.conf.settings`` before the final settings module
exists and never sees ``REQUIRED_ENV_VARS``. The check is therefore a no-op, and
the process starts with an empty storage endpoint. Each case below starts a real
subprocess (the only honest way to observe a startup refusal) with every other
required variable set to a placeholder.

Counterexample recorded from ``pytest --runxfail`` in g1-tests-evidence.md; the strict markers came off at checkpoint 3.4.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]

S3_VARS = ("S3_ENDPOINT_URL", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY")

# Placeholders only; none of these is a real credential. Each value is unique so
# a leak into stderr is detectable by substring.
PLACEHOLDERS = {
    "SECRET_KEY": "ph-secret-key-0123456789-0123456789-0123456789",
    "DATABASE_URL": "postgresql://ph_user:ph-db-pass-77@127.0.0.1:5432/ph_db",
    "REDIS_URL": "redis://127.0.0.1:6379/0",
    "JWT_SIGNING_KEY": "ph-jwt-signing-key-0123456789-0123456789-0123456789",
    "ALLOWED_HOSTS": "ph-host.example.test",
    "CORS_ALLOWED_ORIGINS": "https://ph-origin.example.test",
    "RESEND_API_KEY": "ph-resend-key-4242",
    "S3_ENDPOINT_URL": "https://ph-storage.example.test",
    "S3_BUCKET": "ph-bucket-name",
    "S3_ACCESS_KEY": "ph-access-key-1111",
    "S3_SECRET_KEY": "ph-secret-key-2222",
    # Other settings the prod and staging modules demand at import time.
    "LENCO_API_SECRET_KEY": "ph-lenco-secret-3333",
    "LENCO_PUBLIC_KEY": "ph-lenco-public-4444",
    "AUDIT_LOG_ENCRYPTION_KEY": "ph-audit-key-5555",
    # Task 4.1: staging now requires both (R9.5); production reads them with its own defaults.
    "FRONTEND_URL": "https://ph-frontend.example.test",
    "HEALTH_CHECK_URL": "https://ph-health.example.test/health/ready/",
    "COOKIE_DOMAIN": ".example.test",
    "AUTH_COOKIE_DOMAIN": ".example.test",
}

# Names stripped from the child environment so the test-process shortcuts in
# base.py (``_is_testing``) cannot hide the behaviour under test.
STRIPPED = ("PYTEST_CURRENT_TEST", "TESTING")


def _child_env(settings_module: str, *, empty: str | None) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k not in STRIPPED and not k.startswith("S3_")}
    env.update(PLACEHOLDERS)
    env["DJANGO_SETTINGS_MODULE"] = settings_module
    env["PYTHONPATH"] = str(BACKEND_DIR)
    # ``"pytest" in sys.modules`` is also a shortcut, but the child is a fresh
    # interpreter, so it is not imported there.
    if empty:
        env[empty] = ""
    return env


def _start(settings_module: str, *, empty: str | None) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", "import django; django.setup()"],
        cwd=BACKEND_DIR,
        env=_child_env(settings_module, empty=empty),
        capture_output=True,
        text=True,
        timeout=120,
    )


@pytest.mark.parametrize("settings_module", ["config.settings.prod", "config.settings.staging"])
def test_control_with_every_variable_set_starts(settings_module):
    """Not an exploration case: proves the harness itself can start the process."""
    result = _start(settings_module, empty=None)
    assert result.returncode == 0, result.stderr[-800:]


@pytest.mark.parametrize("variable", S3_VARS)
@pytest.mark.parametrize("settings_module", ["config.settings.prod", "config.settings.staging"])
def test_empty_storage_variable_refuses_to_start(settings_module, variable):
    result = _start(settings_module, empty=variable)

    assert result.returncode != 0, (
        f"{settings_module} started with {variable} empty; startup validation never ran"
    )
    assert variable in result.stderr
    # Names only: no placeholder value may appear in the refusal.
    for name, value in PLACEHOLDERS.items():
        if name != variable and value:
            assert value not in result.stderr, f"{name} value leaked into stderr"
