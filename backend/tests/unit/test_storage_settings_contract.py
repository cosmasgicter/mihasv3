"""R1 exploration: the new storage settings parse and are bounded.

Spec: student-journey-repair task 1.1, clause 1.1 (design R1-a).
The two settings are exercised by importing ``config.settings.base`` in a subprocess
with controlled variables, because they are read at import time. The assertions that
parsed ``backend/docker-compose.local-test.yml`` went with that file (platform-
simplification task 11.2): the documented local stack is the harness, whose storage
the journey gate checks with ``storage_roundtrip_check --expect-private``.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _settings_probe(**overrides: str) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if not k.startswith("S3_")}
    env.update(
        DJANGO_SETTINGS_MODULE="config.settings.dev",
        PYTHONPATH=str(BACKEND_DIR),
        S3_ENDPOINT_URL="http://minio:9000",
        S3_BUCKET="probe-bucket",
        S3_ACCESS_KEY="probe-access",
        S3_SECRET_KEY="probe-secret",
    )
    env.update(overrides)
    code = (
        "from django.conf import settings;"
        "print(settings.AWS_QUERYSTRING_EXPIRE);"
        "print(settings.AWS_S3_PUBLIC_ENDPOINT_URL)"
    )
    return subprocess.run(
        [sys.executable, "-c", f"import django; django.setup(); {code}"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_public_endpoint_defaults_to_the_internal_endpoint_and_ttl_to_900():
    result = _settings_probe()
    assert result.returncode == 0, result.stderr[-600:]
    ttl, public = result.stdout.split()
    assert ttl == "900"
    assert public == "http://minio:9000"


def test_public_endpoint_and_ttl_are_read_from_the_environment():
    result = _settings_probe(
        S3_PUBLIC_ENDPOINT_URL="http://localhost:9000", S3_SIGNED_URL_TTL_SECONDS="60"
    )
    assert result.returncode == 0, result.stderr[-600:]
    ttl, public = result.stdout.split()
    assert (ttl, public) == ("60", "http://localhost:9000")


@pytest.mark.parametrize("ttl", ["9", "3601", "abc", "-5", ""])
def test_out_of_range_ttl_is_fatal_and_names_the_variable(ttl):
    # An empty value falls back to the default, so it is the one acceptable case.
    result = _settings_probe(S3_SIGNED_URL_TTL_SECONDS=ttl)
    if ttl == "":
        assert result.returncode == 0
        return
    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr
    assert "S3_SIGNED_URL_TTL_SECONDS" in result.stderr


def test_public_endpoint_must_be_http_or_https():
    result = _settings_probe(S3_PUBLIC_ENDPOINT_URL="ftp://nope")
    assert result.returncode != 0
    # Not merely an AttributeError that happens to mention the setting's name.
    assert "ImproperlyConfigured" in result.stderr
    assert "S3_PUBLIC_ENDPOINT_URL" in result.stderr
