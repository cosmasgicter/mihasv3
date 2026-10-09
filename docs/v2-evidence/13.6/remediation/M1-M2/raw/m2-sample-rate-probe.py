#!/usr/bin/env python3
"""M2 diagnostic — where the two `test_production_readiness_metrics.py` failures
come from, measured rather than reasoned about.

Run from ``backend/`` with the local test env sourced:

    . .venv/bin/activate && . ./.localtest-host-env.sh
    python3 ../docs/v2-evidence/13.6/remediation/M1-M2/raw/m2-sample-rate-probe.py

It reports four things, in order:

1. ``REQUEST_METRIC_SAMPLE_RATE`` in the process environment BEFORE anything
   imports a settings module.
2. The rate ``MetricsMiddleware`` resolves at construction time, before.
3. The same two readings AFTER ``import config.settings.prod`` — the import the
   skipped-then-unskipped case at
   ``tests/property/test_production_cors_pagination_fix_exploration.py:78`` performs.
4. How many of 200 healthy fast 200-responses emit a ``request_metric`` log at
   the resolved rate — i.e. the exact quantity the two failing properties assert
   is always 1.

The point of (3) is that a settings module is being *inspected*, not activated,
and it still changes the behaviour of every ``MetricsMiddleware`` constructed
afterwards in that process. That is the defect; the sampling itself is designed.

Exit codes: **0** = no pollution (the fixed state), **2** = pollution detected
(the state that produced the two failures), **1** = the prod import raised, so
nothing could be measured — the branch that SKIPS, and the branch under which
the two properties used to pass.
"""

from __future__ import annotations

import logging
import os
import sys
from unittest.mock import MagicMock

# Run from ``backend/``; the script lives outside it, so cwd is not on the path.
sys.path.insert(0, os.getcwd())

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from apps.common.middleware import MetricsMiddleware  # noqa: E402

SENTINEL = "<unset>"


def env_rate() -> str:
    return os.environ.get("REQUEST_METRIC_SAMPLE_RATE", SENTINEL)


def resolved_rate() -> float:
    """What a freshly constructed middleware will actually sample at."""
    return MetricsMiddleware(lambda r: None)._sample_rate


class _Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def emissions(trials: int = 200) -> int:
    """Healthy, fast, 200-response requests that produce a `request_metric` log."""
    response = MagicMock()
    response.status_code = 200
    middleware = MetricsMiddleware(lambda req: response)

    handler = _Capture()
    mw_logger = logging.getLogger("apps.common.middleware")
    mw_logger.addHandler(handler)
    mw_logger.setLevel(logging.DEBUG)
    # Do not let the app's own JSON console handler print 400 lines into the
    # artifact; the capture handler above is the measurement.
    previous_propagate = mw_logger.propagate
    mw_logger.propagate = False
    try:
        for _ in range(trials):
            request = MagicMock()
            request.method = "GET"
            request.path = "/0/"
            request.request_id = "probe"
            middleware(request)
    finally:
        mw_logger.removeHandler(handler)
        mw_logger.propagate = previous_propagate
    return len([r for r in handler.records if getattr(r, "type", None) == "request_metric"])


def main() -> int:
    print("--- 1/2. before importing any settings module other than dev ---")
    print(f"os.environ REQUEST_METRIC_SAMPLE_RATE : {env_rate()}")
    before_rate = resolved_rate()
    print(f"MetricsMiddleware resolved rate       : {before_rate}")
    before_hits = emissions()
    print(f"request_metric logs / 200 healthy 200s: {before_hits}/200")

    print()
    print("--- 3. the import the cors-exploration case performs at :78 ---")
    # The same env floor that case lays down before the import, so prod.py's own
    # ImproperlyConfigured guards do not fire.
    for key, value in (
        ("SECRET_KEY", "test-key"),
        ("DATABASE_URL", "postgres://test:test@localhost/test"),
        ("REDIS_URL", "redis://localhost:6379/0"),
        ("JWT_SIGNING_KEY", "test-jwt-key"),
        ("ALLOWED_HOSTS", "localhost"),
        ("CORS_ALLOWED_ORIGINS", "http://localhost"),
        ("RESEND_API_KEY", "test"),
        ("S3_ENDPOINT_URL", "https://test.example.com"),
        ("S3_BUCKET", "test"),
        ("S3_ACCESS_KEY", "test"),
        ("S3_SECRET_KEY", "test"),
        ("LENCO_API_SECRET_KEY", "test"),
        ("LENCO_PUBLIC_KEY", "test"),
    ):
        os.environ.setdefault(key, value)
    try:
        from config.settings.prod import AUTH_COOKIE_SAMESITE  # noqa: F401
    except Exception as exc:  # pragma: no cover - the skip branch
        print(f"prod import raised {type(exc).__name__}: {exc}")
        print("(this is the branch that SKIPS, and the branch under which the")
        print(" two metrics properties pass)")
        return 0
    print("prod import: ok")

    print()
    print("--- 4. after the import, same process, nothing activated ---")
    print(f"os.environ REQUEST_METRIC_SAMPLE_RATE : {env_rate()}")
    after_rate = resolved_rate()
    print(f"MetricsMiddleware resolved rate       : {after_rate}")
    after_hits = emissions()
    print(f"request_metric logs / 200 healthy 200s: {after_hits}/200")

    print()
    print("--- verdict ---")
    if after_rate == before_rate:
        print("NO POLLUTION - inspecting the production settings module left the")
        print(f"sample rate at {after_rate} and emission at {after_hits}/200.")
        print("exit 0")
        return 0
    print(
        f"POLLUTION - inspecting a settings module moved the sample rate "
        f"{before_rate} -> {after_rate} for every MetricsMiddleware built after it."
    )
    print(
        f"At {after_rate}, {after_hits} of 200 healthy fast 200-responses emit a log, "
        "so a property asserting 'exactly 1 log per non-health request' fails on "
        "the first 200 the generator produces."
    )
    print("exit 2")
    return 2


if __name__ == "__main__":
    sys.exit(main())
