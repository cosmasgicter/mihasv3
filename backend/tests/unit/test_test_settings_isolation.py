"""Task 6.3 (R7.4): test settings isolate the broker, result backend and JTI database.

Settings are imported in subprocesses because the values depend on environment
variables read at import time. The child sets ``TESTING=1`` so the ``_is_testing``
block of ``config/settings/base.py`` applies.
"""
import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]

_PROBE = (
    "import os\n"
    "os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings.dev'\n"
    "import django\n"
    "django.setup()\n"
    "from django.conf import settings as s\n"
    "print(s.CELERY_BROKER_URL, s.CELERY_RESULT_BACKEND, s.JTI_REDIS_URL)\n"
)


def _run(extra_env):
    env = {
        k: v
        for k, v in os.environ.items()
        if k
        not in {
            "PYTEST_CURRENT_TEST",
            "PYTEST_XDIST_WORKER",
            "PYTEST_XDIST_WORKER_COUNT",
            "JTI_REDIS_URL",
            "CELERY_BROKER_URL",
        }
    }
    env.update({"TESTING": "1", "REDIS_URL": "redis://127.0.0.1:6390/0"})
    env.update(extra_env)
    return subprocess.run(
        [sys.executable, "-c", _PROBE], cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=120
    )


def _values(result):
    assert result.returncode == 0, result.stderr[-400:]
    return result.stdout.strip().splitlines()[-1].split(" ")


def test_worker_gw3_uses_memory_broker_cache_backend_and_database_12():
    broker, backend, jti = _values(_run({"PYTEST_XDIST_WORKER": "gw3", "PYTEST_XDIST_WORKER_COUNT": "4"}))
    assert (broker, backend) == ("memory://", "cache+memory://")
    assert jti == "redis://127.0.0.1:6390/12"


def test_run_without_xdist_uses_database_8():
    broker, backend, jti = _values(_run({}))
    assert (broker, backend) == ("memory://", "cache+memory://")
    assert jti == "redis://127.0.0.1:6390/8"


def test_worker_count_of_seven_is_the_largest_allowed():
    _, _, jti = _values(_run({"PYTEST_XDIST_WORKER": "gw6", "PYTEST_XDIST_WORKER_COUNT": "7"}))
    assert jti.endswith("/15")


def test_worker_count_of_eight_is_refused_naming_the_limit():
    result = _run({"PYTEST_XDIST_WORKER": "gw0", "PYTEST_XDIST_WORKER_COUNT": "8"})
    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr
    assert "PYTEST_XDIST_WORKER_COUNT" in result.stderr
    assert "7" in result.stderr
    assert "127.0.0.1:6390" not in result.stderr


def test_production_default_keeps_the_broker_database():
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import os\nos.environ['DJANGO_SETTINGS_MODULE']='config.settings.base'\n"
            "from config.settings import base\nprint(base.JTI_REDIS_URL == base.CELERY_BROKER_URL)\n",
        ],
        cwd=BACKEND_DIR,
        env={
            **{k: v for k, v in os.environ.items() if k not in {"TESTING", "PYTEST_CURRENT_TEST", "JTI_REDIS_URL"}},
            "SECRET_KEY": "placeholder-secret-key-" + "a" * 32,
            "REDIS_URL": "redis://127.0.0.1:6390/0",
        },
        capture_output=True,
        text=True,
        timeout=120,
    )
    # Importing base directly pulls in pytest-free sys.modules, so the testing block is skipped.
    assert result.returncode == 0, result.stderr[-400:]
    assert result.stdout.strip().splitlines()[-1] == "True"
