"""Unit tests for :mod:`apps.documents.payment_metrics`.

Covers Task 13.2 and 13.3 of the payment-hardening spec.

Two layers of coverage:

1. **Counter-registry completeness (Task 13.2).** An ``ast`` walker over
   ``payment_service.py``, ``webhook_processor.py``, and ``views.py``
   finds every ``increment("payment.…", ...)`` call site and asserts
   the counter name is declared in ``payment_metrics.PAYMENT_COUNTERS``.
   If the emitters do not yet reference the registry (wiring lives in
   Task 14), the walker keeps running so it becomes enforcement as
   soon as counters are emitted.

2. **PII guardrails (Task 13.3).** The fail-safe label validation is
   exercised end-to-end with ``sentry_sdk`` patched out:
   forbidden PII keys are dropped, invalid counter names drop silently,
   invalid tag values for known tag names are dropped, and the
   remaining valid tags make it through to
   ``sentry_sdk.metrics.incr``.

Requirements: R17.2, R17.3, R17.4, R22.4.
"""

from __future__ import annotations

import ast
import logging
import os
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"


from apps.documents import payment_metrics  # noqa: E402
from apps.documents.payment_metrics import (  # noqa: E402
    ALLOWED_LABEL_VALUES,
    PAYMENT_COUNTERS,
    increment,
    observe_latency,
)


# ---------------------------------------------------------------------------
# AST walker — find every `increment("payment.…", …)` call site
# ---------------------------------------------------------------------------


_REPO_ROOT = Path(__file__).resolve().parents[2]
_DOCUMENTS_DIR = _REPO_ROOT / "apps" / "documents"

EMITTER_FILES: tuple[Path, ...] = (
    _DOCUMENTS_DIR / "payment_service.py",
    _DOCUMENTS_DIR / "webhook_processor.py",
    _DOCUMENTS_DIR / "views.py",
)


def _first_arg_string_literal(call: ast.Call) -> str | None:
    """Return the first positional arg of ``call`` if it is a string literal.

    Handles ``ast.Constant`` (Python 3.8+) and legacy ``ast.Str``.
    Returns ``None`` if the first arg is not a literal string.
    """
    if not call.args:
        return None
    first = call.args[0]
    if isinstance(first, ast.Constant) and isinstance(first.value, str):
        return first.value
    if isinstance(first, ast.Str):  # pragma: no cover — legacy <3.12 shim
        return first.s
    return None


def _collect_payment_increment_calls(
    source_path: Path,
) -> list[tuple[str, int]]:
    """Parse ``source_path`` and return every ``increment("payment.…", ...)``.

    Returns a list of ``(counter_name, lineno)`` tuples. Matches any
    call whose callable is spelt ``increment`` — that covers both
    ``increment("...")`` (after ``from apps.documents.payment_metrics
    import increment``) and ``payment_metrics.increment("...")``. We
    intentionally keep the match loose so the walker stays useful even
    if callers adopt a different import style.
    """
    if not source_path.exists():
        return []

    source = source_path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source, filename=str(source_path))
    except SyntaxError:  # pragma: no cover — defensive
        return []

    hits: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue

        func = node.func
        called_name: str | None = None
        if isinstance(func, ast.Name):
            called_name = func.id
        elif isinstance(func, ast.Attribute):
            called_name = func.attr

        if called_name != "increment":
            continue

        literal = _first_arg_string_literal(node)
        if literal is None:
            continue
        if not literal.startswith("payment."):
            continue

        hits.append((literal, node.lineno))

    return hits


class TestPaymentCounterRegistryCompleteness(unittest.TestCase):
    """Every ``increment("payment.…", …)`` site must use a registered name."""

    def test_every_emitted_counter_is_registered(self) -> None:
        offenders: list[str] = []
        any_hits = False

        for source_path in EMITTER_FILES:
            hits = _collect_payment_increment_calls(source_path)
            if hits:
                any_hits = True
            for counter_name, lineno in hits:
                if counter_name not in PAYMENT_COUNTERS:
                    offenders.append(
                        f"  {source_path.relative_to(_REPO_ROOT)}:{lineno} "
                        f"emits {counter_name!r} which is not in "
                        f"PAYMENT_COUNTERS"
                    )

        if offenders:
            self.fail(
                "Unregistered payment counter(s) found:\n"
                + "\n".join(offenders)
                + "\n\nAdd the missing name(s) to "
                "apps.documents.payment_metrics.PAYMENT_COUNTERS or fix "
                "the emitting call site."
            )

        # If the emitters don't reference ``increment`` yet (view wiring
        # is Task 14), the walker is inert. That is the documented
        # behaviour — this assertion just keeps the test green.
        self.assertTrue(True, f"walker ran (any_hits={any_hits})")

    def test_registry_has_no_duplicate_counter_names(self) -> None:
        # Defensive: a tuple allows duplicates, so guard the registry
        # against accidental copy-paste drift.
        self.assertEqual(
            len(PAYMENT_COUNTERS),
            len(set(PAYMENT_COUNTERS)),
            "PAYMENT_COUNTERS contains duplicate names",
        )


# ---------------------------------------------------------------------------
# PII / label guardrails (Task 13.3)
# ---------------------------------------------------------------------------


_SENTRY_PATCH_TARGET = "apps.documents.payment_metrics.sentry_sdk"


class TestPaymentMetricsPIIGuardrails(unittest.TestCase):
    """Label-value validation drops PII keys and invalid values silently."""

    def _fake_sentry(self) -> MagicMock:
        """Build a fake ``sentry_sdk`` whose ``.metrics`` attr records calls."""
        fake_metrics = MagicMock()
        fake_sentry = MagicMock()
        fake_sentry.metrics = fake_metrics
        return fake_sentry

    # -- forbidden PII label name -------------------------------------

    def test_forbidden_pii_tag_key_is_dropped(self) -> None:
        fake_sentry = self._fake_sentry()
        with patch(_SENTRY_PATCH_TARGET, fake_sentry), self.assertLogs(
            payment_metrics.logger, level=logging.WARNING
        ) as log_cm:
            increment(
                "payment.risk.amount_mismatch",
                tags={"user_id": "abc-123"},
            )

        # sentry_sdk.metrics.incr must still be called (counter itself
        # is valid), but the user_id tag must not appear.
        self.assertTrue(fake_sentry.metrics.incr.called)
        call_kwargs = fake_sentry.metrics.incr.call_args.kwargs
        tags_passed = call_kwargs.get("tags", {})
        self.assertNotIn("user_id", tags_passed)
        # And a warning must have been emitted.
        self.assertTrue(
            any("forbidden PII tag" in msg for msg in log_cm.output),
            f"expected PII-dropped warning, got: {log_cm.output}",
        )

    def test_all_forbidden_names_are_dropped(self) -> None:
        """Smoke check the full PII name set, one call per name."""
        fake_sentry = self._fake_sentry()
        forbidden_samples = {
            "user_id": "u-1",
            "application_id": "a-1",
            "payment_id": "p-1",
            "phone": "+260971234567",
            "msisdn": "260971234567",
            "mobile": "0971234567",
            "nrc": "123456/78/9",
            "passport": "ZN1234567",
            "pan": "4111111111111111",
            "cvv": "123",
            "card_number": "4111111111111111",
            "email": "student@example.com",
        }
        with patch(_SENTRY_PATCH_TARGET, fake_sentry):
            # Silence logging chatter for this sweep.
            payment_metrics.logger.setLevel(logging.ERROR)
            try:
                increment(
                    "payment.risk.amount_mismatch",
                    tags=forbidden_samples,
                )
            finally:
                payment_metrics.logger.setLevel(logging.NOTSET)

        self.assertTrue(fake_sentry.metrics.incr.called)
        tags_passed = fake_sentry.metrics.incr.call_args.kwargs.get("tags", {})
        for forbidden_key in forbidden_samples:
            self.assertNotIn(
                forbidden_key,
                tags_passed,
                f"forbidden PII key {forbidden_key!r} leaked into sentry tags",
            )

    # -- valid tag ----------------------------------------------------

    def test_valid_tag_reaches_sentry(self) -> None:
        fake_sentry = self._fake_sentry()
        with patch(_SENTRY_PATCH_TARGET, fake_sentry):
            increment(
                "payment.risk.amount_mismatch",
                tags={"risk_type": "amount_mismatch"},
            )

        self.assertEqual(fake_sentry.metrics.incr.call_count, 1)
        args, kwargs = fake_sentry.metrics.incr.call_args
        # First positional arg is the counter name.
        self.assertEqual(args[0], "payment.risk.amount_mismatch")
        # Amount defaults to 1.
        self.assertEqual(args[1], 1)
        self.assertEqual(kwargs.get("tags"), {"risk_type": "amount_mismatch"})

    # -- unknown counter name -----------------------------------------

    def test_unknown_counter_is_dropped_silently(self) -> None:
        fake_sentry = self._fake_sentry()
        with patch(_SENTRY_PATCH_TARGET, fake_sentry), self.assertLogs(
            payment_metrics.logger, level=logging.WARNING
        ) as log_cm:
            increment("payment.unknown", tags={"source": "webhook"})

        self.assertFalse(
            fake_sentry.metrics.incr.called,
            "unknown counter must not reach sentry_sdk",
        )
        self.assertTrue(
            any("unknown counter" in msg for msg in log_cm.output),
            f"expected unknown-counter warning, got: {log_cm.output}",
        )

    # -- invalid value for known tag name -----------------------------

    def test_invalid_value_for_known_tag_is_dropped(self) -> None:
        fake_sentry = self._fake_sentry()
        with patch(_SENTRY_PATCH_TARGET, fake_sentry), self.assertLogs(
            payment_metrics.logger, level=logging.WARNING
        ) as log_cm:
            increment(
                "payment.risk.amount_mismatch",
                tags={"risk_type": "invalid_value"},
            )

        self.assertTrue(fake_sentry.metrics.incr.called)
        tags_passed = fake_sentry.metrics.incr.call_args.kwargs.get("tags", {})
        self.assertNotIn(
            "risk_type",
            tags_passed,
            "invalid enum value for risk_type must be dropped before sentry",
        )
        self.assertTrue(
            any("disallowed value" in msg for msg in log_cm.output),
            f"expected disallowed-value warning, got: {log_cm.output}",
        )

    # -- observe_latency mirrors the same rules ------------------------

    def test_observe_latency_drops_pii_tag(self) -> None:
        fake_sentry = self._fake_sentry()
        with patch(_SENTRY_PATCH_TARGET, fake_sentry):
            observe_latency(
                "payment.verify.latency_ms",
                value_ms=42.5,
                tags={"endpoint": "verify", "user_id": "abc"},
            )

        self.assertTrue(fake_sentry.metrics.distribution.called)
        kwargs = fake_sentry.metrics.distribution.call_args.kwargs
        self.assertEqual(kwargs.get("unit"), "millisecond")
        tags_passed = kwargs.get("tags", {})
        self.assertEqual(tags_passed, {"endpoint": "verify"})

    # -- sentry.metrics missing -> no delegation, no raise ------------

    def test_no_sentry_metrics_module_does_not_raise(self) -> None:
        """If ``sentry_sdk.metrics`` is unavailable, increment still returns."""
        fake_sentry = MagicMock(spec=[])  # no `metrics` attr
        with patch(_SENTRY_PATCH_TARGET, fake_sentry):
            # Must not raise, even without a delegation target.
            increment(
                "payment.risk.amount_mismatch",
                tags={"risk_type": "amount_mismatch"},
            )


# ---------------------------------------------------------------------------
# Sanity — label schema is self-consistent
# ---------------------------------------------------------------------------


class TestAllowedLabelSchema(unittest.TestCase):
    """``ALLOWED_LABEL_VALUES`` is well-formed and covers the design table."""

    def test_label_names_and_values_are_non_empty(self) -> None:
        self.assertTrue(ALLOWED_LABEL_VALUES, "label schema must not be empty")
        for name, values in ALLOWED_LABEL_VALUES.items():
            self.assertIsInstance(name, str)
            self.assertIsInstance(values, frozenset)
            self.assertGreater(
                len(values),
                0,
                f"allow-list for tag {name!r} is empty",
            )

    def test_label_names_do_not_overlap_with_forbidden_names(self) -> None:
        forbidden = payment_metrics._FORBIDDEN_LABEL_NAMES
        overlap = set(ALLOWED_LABEL_VALUES) & forbidden
        self.assertFalse(
            overlap,
            f"ALLOWED_LABEL_VALUES must never include forbidden names: {overlap}",
        )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
