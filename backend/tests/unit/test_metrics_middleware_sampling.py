"""``MetricsMiddleware`` sampling — precedence, behaviour, and the pollution guard.

Task 13.6 remediation **M2**
(``docs/v2-evidence/13.6/remediation/M1-M2/README.md`` §3).

Two ``test_production_readiness_metrics.py`` properties failed with
``AssertionError: 0 != 1`` and no lane's code in either traceback. The cause was
neither the middleware's sampling (which is designed and documented) nor the
test's log capture (which works), but a **process-wide side effect**:
``config/settings/prod.py`` used to call

    os.environ.setdefault("REQUEST_METRIC_SAMPLE_RATE", "0.1")

at import time, and ``MetricsMiddleware`` read that variable from
``os.environ``. So *inspecting* the production settings module — which one test
in ``tests/property/`` does, behind an environment-conditional skip — silently
re-sampled every middleware constructed later in the same process, from 1.0 to
0.1. Measured: 200 of 200 healthy 200-responses emitted a log before the import,
26 of 200 after
(``docs/v2-evidence/13.6/remediation/M1-M2/raw/11-m2-mechanism.txt``).

These cases pin the three things that keep it fixed:

1. the resolution **precedence** (env → setting → 1.0), which reproduces exactly
   what an operator got from ``setdefault``;
2. the **behaviour** each end of the range produces, so "0.1 means 10%" is a
   measured statement and the always-log rules for slow and error responses are
   shown to survive a 0.0 rate;
3. that **no settings module mutates ``os.environ`` at import time** — the class
   of defect, not just the instance. This one would have caught the original
   bug.

**Validates: Requirements 2.1, 2.2, 2.5** (the observability contract the
properties state) — asserted here for the sampling control that gates them.
"""

from __future__ import annotations

import ast
import logging
import os
import re
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from django.test import override_settings

from apps.common.middleware import MetricsMiddleware

SETTINGS_DIR = Path(__file__).resolve().parents[2] / "config" / "settings"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
class _Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def _emissions(rate: str | None, *, status_code: int = 200, duration_hint: float = 0.0, trials: int = 400) -> int:
    """How many of ``trials`` identical requests emit a ``request_metric`` log.

    ``rate`` is put in the environment for construction only. ``duration_hint``
    lets a caller make the request look slow without actually sleeping, by
    monkeypatching ``time.monotonic`` through the middleware's own module.
    """
    env = {} if rate is None else {"REQUEST_METRIC_SAMPLE_RATE": rate}
    response = MagicMock()
    response.status_code = status_code

    with patch.dict(os.environ, env, clear=False):
        if rate is None:
            os.environ.pop("REQUEST_METRIC_SAMPLE_RATE", None)
        middleware = MetricsMiddleware(lambda req: response)

    handler = _Capture()
    mw_logger = logging.getLogger("apps.common.middleware")
    mw_logger.addHandler(handler)
    previous_level, previous_propagate = mw_logger.level, mw_logger.propagate
    mw_logger.setLevel(logging.DEBUG)
    mw_logger.propagate = False
    try:
        for _ in range(trials):
            request = MagicMock()
            request.method = "GET"
            request.path = "/0/"
            request.request_id = "unit"
            if duration_hint:
                ticks = iter([0.0, duration_hint / 1000.0])
                with patch("apps.common.middleware.time.monotonic", lambda: next(ticks)):
                    middleware(request)
            else:
                middleware(request)
    finally:
        mw_logger.removeHandler(handler)
        mw_logger.setLevel(previous_level)
        mw_logger.propagate = previous_propagate

    return len([r for r in handler.records if getattr(r, "type", None) == "request_metric"])


# ---------------------------------------------------------------------------
# 1. precedence
# ---------------------------------------------------------------------------
class TestSampleRatePrecedence:
    """env wins over settings, settings wins over the default."""

    def test_env_var_wins_over_the_setting(self):
        """An operator override behaves exactly as it did under ``setdefault``."""
        with override_settings(REQUEST_METRIC_SAMPLE_RATE=0.1):
            with patch.dict(os.environ, {"REQUEST_METRIC_SAMPLE_RATE": "1.0"}):
                assert MetricsMiddleware.resolve_sample_rate() == 1.0

    def test_setting_is_used_when_the_env_var_is_absent(self):
        """This is the path production now takes: a setting, not an env mutation."""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("REQUEST_METRIC_SAMPLE_RATE", None)
            with override_settings(REQUEST_METRIC_SAMPLE_RATE=0.1):
                assert MetricsMiddleware.resolve_sample_rate() == 0.1

    def test_default_is_log_everything(self):
        """Absent both, dev and test log every request — so a property that
        asserts one log per request is true by default."""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("REQUEST_METRIC_SAMPLE_RATE", None)
            with override_settings():
                from django.conf import settings as _settings

                # override_settings() with no kwargs does not remove an existing
                # attribute, so delete it explicitly for this assertion.
                had = hasattr(_settings, "REQUEST_METRIC_SAMPLE_RATE")
                previous = getattr(_settings, "REQUEST_METRIC_SAMPLE_RATE", None)
                if had:
                    delattr(_settings._wrapped, "REQUEST_METRIC_SAMPLE_RATE")
                try:
                    assert MetricsMiddleware.resolve_sample_rate() == 1.0
                    assert MetricsMiddleware.DEFAULT_SAMPLE_RATE == 1.0
                finally:
                    if had:
                        setattr(_settings._wrapped, "REQUEST_METRIC_SAMPLE_RATE", previous)

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("0", 0.0),
            ("0.5", 0.5),
            ("1", 1.0),
            ("-3", 0.0),  # clamped
            ("7", 1.0),  # clamped
            ("not-a-number", 1.0),  # unparseable falls back, never raises
            ("", 1.0),
        ],
    )
    def test_values_are_parsed_clamped_or_defaulted_never_raised(self, raw, expected):
        """Metrics emission must never be able to break request handling."""
        with patch.dict(os.environ, {"REQUEST_METRIC_SAMPLE_RATE": raw}):
            assert MetricsMiddleware.resolve_sample_rate() == expected


# ---------------------------------------------------------------------------
# 2. behaviour — what a rate actually does to emission
# ---------------------------------------------------------------------------
class TestSamplingBehaviour:
    """The rate is a volume control on *healthy fast* requests only."""

    def test_rate_one_emits_for_every_request(self):
        assert _emissions("1.0", trials=200) == 200

    def test_rate_zero_emits_for_no_healthy_fast_request(self):
        assert _emissions("0.0", trials=200) == 0

    def test_rate_one_tenth_emits_for_roughly_a_tenth(self):
        """400 trials at 0.1: a generous band, because this asserts an order of
        magnitude rather than a seed."""
        hits = _emissions("0.1", trials=400)
        assert 10 <= hits <= 110, f"expected ~40 of 400 at rate 0.1, got {hits}"

    def test_error_responses_are_logged_even_at_rate_zero(self):
        """A sampled-out 4xx/5xx would be an observability hole. It is not one."""
        assert _emissions("0.0", status_code=500, trials=50) == 50
        assert _emissions("0.0", status_code=400, trials=50) == 50

    def test_slow_requests_are_logged_even_at_rate_zero(self):
        assert (
            _emissions("0.0", duration_hint=MetricsMiddleware.SLOW_REQUEST_THRESHOLD_MS + 1, trials=50)
            == 50
        )

    def test_health_paths_are_skipped_regardless_of_rate(self):
        """Sampling does not decide this; SKIP_PATHS does, before the timer starts."""
        response = MagicMock()
        response.status_code = 200
        with patch.dict(os.environ, {"REQUEST_METRIC_SAMPLE_RATE": "1.0"}):
            middleware = MetricsMiddleware(lambda req: response)

        handler = _Capture()
        mw_logger = logging.getLogger("apps.common.middleware")
        mw_logger.addHandler(handler)
        mw_logger.propagate = False
        try:
            for path in sorted(MetricsMiddleware.SKIP_PATHS):
                request = MagicMock()
                request.method = "GET"
                request.path = path
                request.request_id = "unit"
                middleware(request)
        finally:
            mw_logger.removeHandler(handler)
            mw_logger.propagate = True

        assert [r for r in handler.records if getattr(r, "type", None) == "request_metric"] == []


# ---------------------------------------------------------------------------
# 3. the class of defect — a settings module must not mutate the environment
# ---------------------------------------------------------------------------
class TestSettingsModulesDoNotMutateTheEnvironment:
    """The guard that would have caught M2 the day it was introduced.

    A settings module is *inspected* by tests, tooling, and documentation
    generators. Writing to ``os.environ`` at import time makes that inspection
    change the behaviour of unrelated code in the same process, in an order
    dependent way, with nothing in the resulting traceback pointing at the cause.
    """

    SETTINGS_MODULES = ["base.py", "dev.py", "test.py", "staging.py", "prod.py"]

    @pytest.mark.parametrize("filename", SETTINGS_MODULES)
    def test_no_environ_write_at_import_time(self, filename):
        path = SETTINGS_DIR / filename
        if not path.exists():  # pragma: no cover - the set is stable
            pytest.skip(f"{filename} does not exist")

        tree = ast.parse(path.read_text(), filename=str(path))
        offenders: list[str] = []

        for node in ast.walk(tree):
            # os.environ["X"] = ... / os.environ.setdefault(...) / .update(...) / .pop(...)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr in {"setdefault", "update", "pop", "clear", "__setitem__"}:
                    target = ast.unparse(node.func.value)
                    if target.endswith("environ"):
                        offenders.append(f"{filename}:{node.lineno} {ast.unparse(node)[:100]}")
            if isinstance(node, ast.Assign):
                for tgt in node.targets:
                    if isinstance(tgt, ast.Subscript) and ast.unparse(tgt.value).endswith("environ"):
                        offenders.append(f"{filename}:{node.lineno} {ast.unparse(node)[:100]}")

        assert offenders == [], (
            "a settings module writes to os.environ at import time, which makes "
            "importing it for inspection change unrelated runtime behaviour "
            "(task 13.6 remediation M2):\n  " + "\n  ".join(offenders)
        )

    def test_prod_still_declares_the_sample_rate_as_a_setting(self):
        """Removing the mutation must not have removed the production intent:
        healthy 200s are still sampled at 10% in production."""
        source = (SETTINGS_DIR / "prod.py").read_text()
        assert re.search(
            r"^REQUEST_METRIC_SAMPLE_RATE\s*=\s*0\.1\b", source, re.MULTILINE
        ), "prod.py must still sample healthy 200s at 10%"

    def test_importing_prod_settings_leaves_the_sample_rate_alone(self):
        """The end-to-end statement, run the way the failing suite ran it."""
        import importlib

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
            ("AUDIT_LOG_ENCRYPTION_KEY", "test-audit-key"),
        ):
            os.environ.setdefault(key, value)

        before = os.environ.get("REQUEST_METRIC_SAMPLE_RATE")
        try:
            importlib.import_module("config.settings.prod")
        except Exception as exc:  # pragma: no cover - environment-conditional
            pytest.skip(f"cannot import prod settings here: {type(exc).__name__}: {exc}")
        after = os.environ.get("REQUEST_METRIC_SAMPLE_RATE")

        assert after == before, (
            "importing config.settings.prod changed REQUEST_METRIC_SAMPLE_RATE in "
            f"os.environ ({before!r} -> {after!r}); that is the M2 defect"
        )
