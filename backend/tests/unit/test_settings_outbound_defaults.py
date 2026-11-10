"""Task 4.3: no non-production settings module defaults to a production host.

Settings are imported in subprocesses with ``TESTING`` and ``PYTEST_CURRENT_TEST``
removed from the child environment, because the parent test run sets both and
``base.py`` skips startup validation when either is present. Requirements 9.1,
9.2, 9.5, 9.7.
"""
import os
import re
import subprocess
import sys
from pathlib import Path
from unittest import mock

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
SETTINGS_DIR = BACKEND_DIR / "config" / "settings"

# Placeholder values only; they are never real credentials.
_PLACEHOLDER = {
    "SECRET_KEY": "placeholder-secret-key-" + "a" * 32,
    "JWT_SIGNING_KEY": "placeholder-jwt-signing-key-" + "a" * 32,
    "DATABASE_URL": "postgresql://placeholder-user:placeholder-pw@127.0.0.1:1/placeholder",
    "REDIS_URL": "redis://127.0.0.1:1/0",
    "ALLOWED_HOSTS": "placeholder.test",
    "CORS_ALLOWED_ORIGINS": "http://placeholder.test",
    "S3_ENDPOINT_URL": "http://s3.placeholder.test",
    "S3_BUCKET": "placeholder-bucket",
    "S3_ACCESS_KEY": "placeholder-access",
    "S3_SECRET_KEY": "placeholder-secret",
}
_OUTBOUND = ("FRONTEND_URL", "HEALTH_CHECK_URL", "KEEP_ALIVE_URL", "ZOHO_SMTP_HOST")

_PROBE = (
    "import os, sys\n"
    "os.environ['DJANGO_SETTINGS_MODULE'] = sys.argv[1]\n"
    "import django\n"
    "django.setup()\n"
    "from django.conf import settings as s\n"
    "print('|'.join([s.FRONTEND_URL, s.HEALTH_CHECK_URL, s.KEEP_ALIVE_URL, s.EMAIL_HOST]))\n"
)


def _run(module: str, extra_env: dict | None = None):
    env = {
        k: v
        for k, v in os.environ.items()
        if k not in {"TESTING", "PYTEST_CURRENT_TEST", *_OUTBOUND, "DJANGO_SETTINGS_MODULE"}
    }
    env.update(_PLACEHOLDER)
    env.update(extra_env or {})
    return subprocess.run(
        [sys.executable, "-c", _PROBE, module],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_staging_refuses_to_start_without_frontend_and_health_urls():
    result = _run("config.settings.staging")
    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr
    assert "FRONTEND_URL" in result.stderr
    assert "HEALTH_CHECK_URL" in result.stderr
    for value in _PLACEHOLDER.values():
        assert value not in result.stderr


@pytest.mark.parametrize("module", ["config.settings.local_real", "config.settings.harness"])
def test_local_modules_start_with_both_variables_unset(module):
    result = _run(module)
    assert result.returncode == 0, result.stderr[-500:]
    frontend, health, keep_alive, _host = result.stdout.strip().splitlines()[-1].split("|")
    assert frontend.startswith("http://")
    assert "beanola.com" not in (frontend + health + keep_alive)


@pytest.mark.parametrize("module", ["base", "dev", "staging", "local_real", "harness", "test"])
def test_no_non_production_module_defaults_to_a_production_host(module):
    path = SETTINGS_DIR / f"{module}.py"
    if not path.exists():
        pytest.skip(f"{module}.py does not exist")
    source = path.read_text()
    pattern = re.compile(
        r"""(?:HEALTH_CHECK_URL|KEEP_ALIVE_URL|FRONTEND_URL|ZOHO_SMTP_HOST)["']?\s*,\s*["']([^"']*)["']"""
    )
    for default in pattern.findall(source):
        assert "beanola.com" not in default, f"{module}.py defaults to {default!r}"
        assert "zoho.com" not in default, f"{module}.py defaults to {default!r}"
    assert "smtp.zoho.com" not in re.sub(r"#.*", "", source)


def test_base_defaults_are_local_or_empty():
    source = (SETTINGS_DIR / "base.py").read_text()
    assert 'os.environ.get("HEALTH_CHECK_URL", "")' in source
    assert 'os.environ.get("KEEP_ALIVE_URL", "")' in source
    assert 'os.environ.get("FRONTEND_URL", "http://localhost:5173")' in source
    assert "os.environ.get('ZOHO_SMTP_HOST', 'localhost')" in source


def test_prod_keeps_todays_values():
    source = (SETTINGS_DIR / "prod.py").read_text()
    assert '"HEALTH_CHECK_URL", "https://api.beanola.com/health/ready/"' in source
    assert '"KEEP_ALIVE_URL", "https://api.beanola.com/health/live/"' in source
    assert 'os.environ.get("FRONTEND_URL", "https://apply.beanola.com")' in source
    assert 'os.environ.get("ZOHO_SMTP_HOST", "smtp.zoho.com")' in source


def test_prod_module_resolves_todays_values():
    result = _run(
        "config.settings.prod",
        {
            "LENCO_API_SECRET_KEY": "placeholder-lenco-secret",
            "LENCO_PUBLIC_KEY": "placeholder-lenco-public",
            "AUDIT_LOG_ENCRYPTION_KEY": "placeholder-audit-key-" + "a" * 32,
        },
    )
    assert result.returncode == 0, result.stderr[-500:]
    frontend, health, keep_alive, host = result.stdout.strip().splitlines()[-1].split("|")
    assert frontend == "https://apply.beanola.com"
    assert health == "https://api.beanola.com/health/ready/"
    assert keep_alive == "https://api.beanola.com/health/live/"
    assert host == "smtp.zoho.com"


def test_scheduled_tasks_return_early_without_a_request(settings):
    from apps.common import tasks

    settings.KEEP_ALIVE_URL = ""
    settings.HEALTH_CHECK_URL = ""
    with mock.patch("requests.get", side_effect=AssertionError("must not be called")) as get:
        assert tasks.keep_alive_task() is None
        assert tasks.check_uptime_task() is None
    get.assert_not_called()
