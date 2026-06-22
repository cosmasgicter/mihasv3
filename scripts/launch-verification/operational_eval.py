"""Pure-logic core for Gate 9 — Operational_Readiness_Gate (Requirement 9).

This module is the **pure, deterministic** decision layer behind the
Operational_Readiness_Gate. Like the other launch-verification evaluators
(``smoke_eval``, ``performance_eval``, ``migration_eval``, ``scope_eval``), it
performs *no* I/O: it imports *no* Django, reads *no* environment variables,
opens *no* files, and makes *no* network calls. It only evaluates predicates
over already-collected **configuration facts** passed in as plain data. That
keeps it trivially importable from the operator-gated
``check-operational-readiness.py`` recorder (task 15.3), from CI, and from the
hypothesis property test (task 15.2), and lets the gate's logic be
property-tested independent of any live production configuration.

The single most important property of this module is its **secret-handling
guarantee**: it is *structurally incapable* of recording a credential value.
Every check row it emits records only a setting **name** plus a boolean /
non-secret derived indicator (a present/absent flag, a length, a max-age in
seconds, a rate-limit count, a day count) and a closed-enum ``result``. The raw
``SECRET_KEY``, cookies, tokens, connection strings, and any other credential
value never enter this module — callers pass *derived* facts (a length and an
``is_example`` boolean for the secret key, a present/absent boolean for every
credential-bearing setting) rather than the values themselves (R9.4, R9.9). On
failure the gate records the failing setting **by name without its value**
(R9.9). As a defensive belt-and-suspenders measure the module will, *if the
shared redaction helper is importable*, scrub every string it is about to emit;
but the primary design does not rely on redaction because no value is ever
accepted in the first place.

The rules it encodes come straight from Requirement 9:

* **R9.1 — ``DEBUG`` off; strong, non-example ``SECRET_KEY``.**
  :func:`debug_off` passes **iff** ``DEBUG`` is the boolean ``False`` (a strict,
  conservative check — any ambiguous/truthy value fails).
  :func:`secret_key_ok` passes **iff** the secret-key length is at least
  :data:`SECRET_KEY_MIN_LEN` (50) **and** the key is not equal to any tracked
  example/template value (``is_example`` is false). It accepts only a *length*
  and an *is_example* boolean — never the key.

* **R9.2 — secure transport/origin settings present.** Secure cookies, trusted
  origins, CORS allowed hosts, CSRF allowed hosts, HTTPS redirect, HSTS, and a
  Content-Security-Policy must each be present and non-empty; HSTS ``max-age``
  must be at least :data:`HSTS_MIN_SECONDS` (31536000). Each emits a
  present/non-empty boolean only.

* **R9.3 — per-user rate limits.** Every payment/auth/AI endpoint must have a
  configured per-user rate limit greater than zero requests per window.
  :func:`rate_limits_ok` passes **iff** the supplied endpoint→limit map is
  non-empty **and** every limit is a number greater than zero; failing endpoint
  *names* (not values) are recorded.

* **R9.5 — backup/restore drill.** The recorded drill must show a restore that
  completed within :data:`RTO_MAX_MINUTES` (60) minutes (RTO) and a 0-row RPO
  variance on audited tables. :func:`backup_drill_ok` passes **iff both** hold.

* **R9.6 — tenant asset upload validation.** Upload validation must reject any
  upload whose declared content-type is not allow-listed or whose file shape
  fails the size/structure checks; the recorded rejection outcome must be true.

* **R9.7 — audit retention.** Standard records must be retained
  :data:`AUDIT_STANDARD_DAYS` (90) days and security records
  :data:`AUDIT_SECURITY_DAYS` (365) days.

* **R9.8 — super-admin break-glass doc.** A super-admin account-recovery /
  break-glass procedure document must exist and be non-empty.

:func:`evaluate_operational` combines the above into a single result object
following the **common envelope** idiom used across the harness
(``gate_id`` ``"operational-readiness"``, ``requirement`` ``"R9"``) with a
**conservative** overall verdict: the gate is ``passed`` **iff every** included
check passed. Any failing setting forces ``passed = False`` and is recorded by
name in ``failed_settings`` **without its value** (R9.9).

Check rows produced here use the same closed ``result`` vocabulary
(``"pass" | "fail"``) and the same gate status vocabulary
(``"passed" | "failed"``) as the shared ``Evidence_Artifact`` envelope, so the
recorder (task 15.3) can drop them straight into a gate artifact.

**Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.6, 9.7, 9.8**
"""

from __future__ import annotations

from numbers import Real
from typing import Any, List, Mapping, Sequence, Tuple

__all__ = [
    # Threshold constants
    "HSTS_MIN_SECONDS",
    "SECRET_KEY_MIN_LEN",
    "AUDIT_STANDARD_DAYS",
    "AUDIT_SECURITY_DAYS",
    "RTO_MAX_MINUTES",
    "RPO_MAX_ROW_VARIANCE",
    # Gate identity + vocabularies
    "GATE_ID",
    "REQUIREMENT",
    "PASS",
    "FAIL",
    "STATUS_PASSED",
    "STATUS_FAILED",
    # Setting-name groups
    "PRESENCE_SETTINGS",
    # Predicates
    "is_present",
    "debug_off",
    "secret_key_ok",
    "hsts_ok",
    "rate_limits_ok",
    "audit_retention_ok",
    "backup_drill_ok",
    # Rollup
    "evaluate_operational",
]

# --- Threshold constants ---------------------------------------------------

#: Minimum HSTS ``max-age`` in seconds (one year) required in production (R9.2).
HSTS_MIN_SECONDS: int = 31536000

#: Minimum acceptable ``SECRET_KEY`` length in characters (R9.1).
SECRET_KEY_MIN_LEN: int = 50

#: Required audit retention for standard records, in days (R9.7).
AUDIT_STANDARD_DAYS: int = 90

#: Required audit retention for security records, in days (R9.7).
AUDIT_SECURITY_DAYS: int = 365

#: Maximum acceptable restore time (RTO) for the backup/restore drill, in
#: minutes (R9.5).
RTO_MAX_MINUTES: int = 60

#: Maximum acceptable restored-row variance (RPO) on audited tables (R9.5).
#: A 0-row variance is required — the restored row count must match source.
RPO_MAX_ROW_VARIANCE: int = 0

# --- Gate identity + closed vocabularies -----------------------------------

#: Stable gate identity (mirrors the rollup ``GATE_SPECS`` entry for Gate 9).
GATE_ID: str = "operational-readiness"
REQUIREMENT: str = "R9"

#: Per-check result vocabulary (mirrors the shared Evidence_Artifact envelope).
PASS: str = "pass"
FAIL: str = "fail"

#: Gate status vocabulary (mirrors the shared Evidence_Artifact envelope).
STATUS_PASSED: str = "passed"
STATUS_FAILED: str = "failed"

#: The R9.2 settings checked for present-and-non-empty. Maps the fact key the
#: caller supplies to the human-readable setting *name* recorded in evidence.
#: HSTS is handled separately because it has a numeric threshold (R9.2/HSTS).
PRESENCE_SETTINGS: Tuple[Tuple[str, str], ...] = (
    ("secure_cookies", "SECURE_COOKIES"),
    ("trusted_origins", "CSRF_TRUSTED_ORIGINS"),
    ("cors_allowed_hosts", "CORS_ALLOWED_ORIGINS"),
    ("csrf_allowed_hosts", "CSRF_ALLOWED_HOSTS"),
    ("https_redirect", "SECURE_SSL_REDIRECT"),
    ("csp", "CONTENT_SECURITY_POLICY"),
)


# --- Defensive redaction shim ----------------------------------------------
#
# The primary design records only names + booleans + non-secret derived
# numbers, so redaction is never *needed*. But per the task we import the shared
# helper defensively: if it is importable we scrub every emitted string; if it
# is not (e.g. the evaluator is used in isolation without ``backend/`` on the
# path) we fall back to an identity function. The import is lazy and guarded so
# the module stays a pure stdlib import with no hard dependency.

def _load_redactor():
    try:  # pragma: no cover - exercised indirectly; trivial guard
        import os
        import sys

        repo_backend = os.path.normpath(
            os.path.join(os.path.dirname(__file__), "..", "..", "backend")
        )
        if os.path.isdir(repo_backend) and repo_backend not in sys.path:
            sys.path.insert(0, repo_backend)
        from apps.common.launch_verification.redaction import redact_text

        return redact_text
    except Exception:  # noqa: BLE001 - any failure falls back to identity
        return lambda value: value


_REDACT = _load_redactor()


def _safe_name(name: Any) -> str:
    """Return a setting *name* string, defensively scrubbed of any secret shape.

    Setting names are never secret, but scrubbing is free insurance against a
    caller accidentally passing a value-bearing label.
    """
    return _REDACT(str(name))


# --- Presence predicate ----------------------------------------------------


def is_present(value: Any) -> bool:
    """Return ``True`` iff ``value`` is present and non-empty.

    Treats ``None``, the booleans' falsy meaning, empty / whitespace-only
    strings, and empty collections as *absent*. A plain boolean is interpreted
    directly (a caller may pass an already-computed present/absent flag). Any
    non-empty string or non-empty collection, and any non-zero number, counts as
    present.

    Note: this inspects *non-secret* configuration values only (cookies flag,
    trusted origins, CORS/CSRF host lists, CSP). The function returns a boolean
    and the callers emit only that boolean — the inspected value itself is never
    placed into an evidence row.
    """
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, dict, frozenset)):
        return len(value) > 0
    if isinstance(value, Real):
        return value != 0
    # Any other object that exists is treated as present.
    return True


# --- R9.1: DEBUG off + strong, non-example SECRET_KEY -----------------------


def debug_off(debug: Any) -> bool:
    """Return ``True`` iff ``DEBUG`` is the boolean ``False`` (R9.1).

    The check is intentionally **strict and conservative**: only the boolean
    ``False`` singleton passes. Any other value — every truthy value and every
    ambiguous falsy value (``0``, ``""``, ``None``) — fails, because production
    must *positively* disable debug rather than merely leave it falsy/unset.
    """
    return debug is False


def secret_key_ok(length: Any, is_example: Any) -> bool:
    """Return ``True`` iff the secret key is long enough and not an example (R9.1).

    Accepts only a *length* (an integer character count) and an ``is_example``
    boolean indicating whether the key equals a tracked example/template value.
    The raw key is never accepted, so it can never be recorded. Passes **iff**
    ``length >= SECRET_KEY_MIN_LEN`` **and** ``is_example`` is not truthy.
    """
    if isinstance(length, bool) or not isinstance(length, Real):
        return False
    return int(length) >= SECRET_KEY_MIN_LEN and not bool(is_example)


# --- R9.2: HSTS max-age threshold ------------------------------------------


def hsts_ok(max_age: Any) -> bool:
    """Return ``True`` iff HSTS ``max-age`` is at least :data:`HSTS_MIN_SECONDS` (R9.2)."""
    if isinstance(max_age, bool) or not isinstance(max_age, Real):
        return False
    return max_age >= HSTS_MIN_SECONDS


# --- R9.3: per-user rate limits --------------------------------------------


def rate_limits_ok(rate_limits: Any) -> Tuple[bool, List[str]]:
    """Evaluate per-user rate limits on payment/auth/AI endpoints (R9.3).

    Args:
        rate_limits: a mapping of endpoint *name* → configured per-user limit
            (requests per window). Endpoint names are not secret.

    Returns:
        A ``(passed, failing_endpoints)`` tuple. ``passed`` is ``True`` **iff**
        the map is non-empty **and every** limit is a real number strictly
        greater than zero. ``failing_endpoints`` lists, by name, every endpoint
        whose limit is missing, non-numeric, or not greater than zero — and is
        empty when ``passed`` is ``True``. An empty / non-mapping input fails
        (nothing configured) with no per-endpoint names to report.
    """
    if not isinstance(rate_limits, Mapping) or len(rate_limits) == 0:
        return False, []

    failing: List[str] = []
    for endpoint, limit in rate_limits.items():
        if isinstance(limit, bool) or not isinstance(limit, Real) or limit <= 0:
            failing.append(_safe_name(endpoint))
    return (len(failing) == 0), failing


# --- R9.7: audit retention -------------------------------------------------


def audit_retention_ok(standard_days: Any, security_days: Any) -> bool:
    """Return ``True`` iff audit retention is 90/365 days (R9.7).

    Passes **iff** the standard retention equals :data:`AUDIT_STANDARD_DAYS`
    (90) **and** the security retention equals :data:`AUDIT_SECURITY_DAYS`
    (365). Non-numeric inputs fail.
    """
    if isinstance(standard_days, bool) or not isinstance(standard_days, Real):
        return False
    if isinstance(security_days, bool) or not isinstance(security_days, Real):
        return False
    return standard_days == AUDIT_STANDARD_DAYS and security_days == AUDIT_SECURITY_DAYS


# --- R9.5: backup/restore drill --------------------------------------------


def backup_drill_ok(rto_minutes: Any, rpo_row_variance: Any) -> bool:
    """Return ``True`` iff the backup/restore drill meets RTO and RPO (R9.5).

    Passes **iff** the restore time (``rto_minutes``) is at most
    :data:`RTO_MAX_MINUTES` (60) **and** the restored-row variance
    (``rpo_row_variance``) is exactly :data:`RPO_MAX_ROW_VARIANCE` (0). A
    negative RTO, non-numeric input, or any non-zero variance fails.
    """
    if isinstance(rto_minutes, bool) or not isinstance(rto_minutes, Real):
        return False
    if isinstance(rpo_row_variance, bool) or not isinstance(rpo_row_variance, Real):
        return False
    if rto_minutes < 0:
        return False
    return rto_minutes <= RTO_MAX_MINUTES and rpo_row_variance == RPO_MAX_ROW_VARIANCE


# --- Check-row builders ----------------------------------------------------


def _check(check_id: str, setting: str, passed: bool, **indicators: Any) -> dict:
    """Build a single check row recording the setting *name* + a derived indicator.

    The row never carries a credential value: ``indicators`` are restricted by
    every caller to booleans, integer lengths/counts/day-counts, and non-secret
    endpoint names, and any string indicator is defensively scrubbed.
    """
    row: dict = {
        "id": _safe_name(check_id),
        "setting": _safe_name(setting),
        "result": PASS if passed else FAIL,
    }
    for key, value in indicators.items():
        row[key] = _REDACT(value) if isinstance(value, str) else value
    return row


# --- Conservative rollup (R9.1-R9.3, R9.5-R9.8 / R9.9) ----------------------


def evaluate_operational(facts: Mapping[str, Any]) -> dict:
    """Roll every operational-readiness check up to a single conservative verdict.

    Args:
        facts: a mapping of **already-derived** configuration facts. Recognised
            keys (all optional; an absent fact fails its check conservatively):

            * ``debug`` — the evaluated ``DEBUG`` value (R9.1).
            * ``secret_key_len`` / ``secret_key_is_example`` — the secret-key
              length and whether it matches a tracked example value (R9.1). The
              raw key is never passed.
            * ``secure_cookies``, ``trusted_origins``, ``cors_allowed_hosts``,
              ``csrf_allowed_hosts``, ``https_redirect``, ``csp`` — present/
              non-empty facts for the R9.2 transport/origin settings (each may
              be an already-computed boolean or the value to test for presence;
              only the boolean is recorded).
            * ``hsts_max_age`` — HSTS ``max-age`` in seconds (R9.2).
            * ``rate_limits`` — mapping endpoint name → per-user limit (R9.3).
            * ``audit_standard_days`` / ``audit_security_days`` — audit
              retention day counts (R9.7).
            * ``backup_rto_minutes`` / ``backup_rpo_row_variance`` — the
              backup/restore drill RTO and RPO facts (R9.5).
            * ``asset_upload_rejects_disallowed`` — recorded rejection outcome
              of tenant asset upload validation (R9.6).
            * ``break_glass_doc_present`` — whether the super-admin break-glass
              doc exists and is non-empty (R9.8).

    Returns:
        A result object combining the Gate 9 check rows and a conservative
        verdict::

            {
                "gate_id": "operational-readiness",
                "requirement": "R9",
                "status": "passed" | "failed",
                "passed": bool,
                "checks": [<check row>, ...],
                "failed": [<check id>, ...],
                "failed_settings": [<setting name>, ...],  # R9.9: name, no value
            }

        ``passed`` is ``True`` **iff every** included check passed. Each check
        row records only a setting *name* and a non-secret derived indicator
        (present/absent flag, length, max-age, limit count, day count) plus a
        closed-enum ``result`` — never a credential value. On failure the
        failing setting is named in ``failed_settings`` without its value
        (R9.9).
    """
    facts = facts or {}
    checks: List[dict] = []

    # R9.1 — DEBUG off.
    checks.append(
        _check(
            "operational:debug",
            "DEBUG",
            debug_off(facts.get("debug")),
            debug_disabled=debug_off(facts.get("debug")),
        )
    )

    # R9.1 — SECRET_KEY strength (length + non-example only; never the value).
    sk_len = facts.get("secret_key_len")
    sk_is_example = facts.get("secret_key_is_example", True)
    sk_ok = secret_key_ok(sk_len, sk_is_example)
    checks.append(
        _check(
            "operational:secret_key",
            "SECRET_KEY",
            sk_ok,
            min_length=SECRET_KEY_MIN_LEN,
            length_ok=(
                bool(
                    isinstance(sk_len, Real)
                    and not isinstance(sk_len, bool)
                    and int(sk_len) >= SECRET_KEY_MIN_LEN
                )
            ),
            is_example=bool(sk_is_example),
        )
    )

    # R9.2 — present/non-empty transport & origin settings.
    for fact_key, setting_name in PRESENCE_SETTINGS:
        present = is_present(facts.get(fact_key))
        checks.append(
            _check(
                f"operational:{fact_key}",
                setting_name,
                present,
                present=present,
            )
        )

    # R9.2 — HSTS max-age threshold.
    hsts_max_age = facts.get("hsts_max_age")
    checks.append(
        _check(
            "operational:hsts",
            "SECURE_HSTS_SECONDS",
            hsts_ok(hsts_max_age),
            min_seconds=HSTS_MIN_SECONDS,
            present=is_present(hsts_max_age),
        )
    )

    # R9.3 — per-user rate limits on every payment/auth/AI endpoint.
    rl_ok, rl_failing = rate_limits_ok(facts.get("rate_limits"))
    rate_limits = facts.get("rate_limits")
    endpoint_count = len(rate_limits) if isinstance(rate_limits, Mapping) else 0
    checks.append(
        _check(
            "operational:rate_limits",
            "PER_USER_RATE_LIMITS",
            rl_ok,
            endpoint_count=endpoint_count,
            failing_endpoints=rl_failing,
        )
    )

    # R9.7 — audit retention 90 / 365 days.
    checks.append(
        _check(
            "operational:audit_retention",
            "AUDIT_RETENTION_DAYS",
            audit_retention_ok(
                facts.get("audit_standard_days"), facts.get("audit_security_days")
            ),
            standard_required=AUDIT_STANDARD_DAYS,
            security_required=AUDIT_SECURITY_DAYS,
        )
    )

    # R9.5 — backup/restore drill RTO <= 60 min and 0-row RPO variance.
    checks.append(
        _check(
            "operational:backup_drill",
            "BACKUP_RESTORE_DRILL",
            backup_drill_ok(
                facts.get("backup_rto_minutes"), facts.get("backup_rpo_row_variance")
            ),
            rto_max_minutes=RTO_MAX_MINUTES,
            rpo_max_row_variance=RPO_MAX_ROW_VARIANCE,
        )
    )

    # R9.6 — tenant asset upload validation rejects disallowed content/shape.
    checks.append(
        _check(
            "operational:asset_upload_validation",
            "TENANT_ASSET_UPLOAD_VALIDATION",
            bool(facts.get("asset_upload_rejects_disallowed")),
            rejects_disallowed=bool(facts.get("asset_upload_rejects_disallowed")),
        )
    )

    # R9.8 — super-admin break-glass doc exists and is non-empty.
    checks.append(
        _check(
            "operational:break_glass_doc",
            "SUPER_ADMIN_BREAK_GLASS_DOC",
            is_present(facts.get("break_glass_doc_present")),
            present=is_present(facts.get("break_glass_doc_present")),
        )
    )

    failed: List[str] = [c["id"] for c in checks if c["result"] != PASS]
    failed_settings: List[str] = [c["setting"] for c in checks if c["result"] != PASS]
    passed = len(failed) == 0

    return {
        "gate_id": GATE_ID,
        "requirement": REQUIREMENT,
        "status": STATUS_PASSED if passed else STATUS_FAILED,
        "passed": passed,
        "checks": checks,
        "failed": failed,
        "failed_settings": failed_settings,
    }
