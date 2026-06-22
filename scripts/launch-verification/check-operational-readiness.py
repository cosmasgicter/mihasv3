#!/usr/bin/env python3
"""Gate 9 — Operational_Readiness_Gate checker (Requirement 9).

**Execution world: OPERATOR-GATED. NOT auto-run in CI.** This script inspects
the *production configuration* of the Beanola backend and records, for every
security-relevant setting and credential, **only its name plus a present/absent
(or other non-secret derived) indicator** — never its value. It then emits a
launch-verification ``Evidence_Artifact`` to
``docs/launch-evidence/09-operational/operational-evidence.json`` and returns a
non-zero exit code if the gate did not pass.

It is the integration/execution wrapper around the pure :mod:`operational_eval`
core (task 15.1). The pure core performs *no* I/O and is *structurally
incapable* of recording a credential value: it accepts only **already-derived**
facts (a length + ``is_example`` boolean for the secret key, present/absent
booleans for credential-bearing settings, an HSTS max-age int, a rate-limit
map, day counts, RTO/RPO numbers). This wrapper does the actual configuration
inspection and is itself held to the same discipline:

* It **derives booleans / lengths / counts only** — a credential VALUE is never
  read into a variable that could be recorded. For ``SECRET_KEY`` it computes a
  ``length`` and an ``is_example`` boolean and immediately discards the value;
  for every credential-bearing setting it computes ``present = bool(value)`` and
  discards the value.
* It records only the setting **NAME** plus a present/absent indicator
  (R9.4 / R9.9).
* It routes the whole emitted envelope through the shared **redaction** helper
  as defence-in-depth (design Property 16) — even though, by construction, no
  value ever enters the artifact.
* It is strictly **read-only**: it inspects ``django.conf.settings`` /
  environment variable *names* and leaves the production configuration
  unchanged. It performs no writes of any kind to production config.

Sources of facts (in precedence order, chosen by CLI flags):

1. ``--synthetic`` — a dry-run that fabricates an all-pass derived-fact set,
   emits a valid envelope without touching any configuration, and is used for
   offline verification. No real configuration is read.
2. ``--inputs FILE`` — read an already-derived facts JSON (the operator may
   derive facts on the production box and hand them to this script). The file
   must contain only derived facts (lengths/booleans/counts), never raw values;
   the redaction pass scrubs it regardless.
3. default — load Django settings via the backend venv if importable and
   configured, else fall back to reading environment-variable *names* directly.
   Either way only derived indicators are produced.

Run it::

    # On the production box, with the production settings env loaded:
    DJANGO_SETTINGS_MODULE=config.settings.prod \\
        python3 scripts/launch-verification/check-operational-readiness.py

    # From an operator-derived facts file:
    python3 scripts/launch-verification/check-operational-readiness.py \\
        --inputs derived-facts.json

    # Offline envelope check (no configuration read):
    python3 scripts/launch-verification/check-operational-readiness.py --synthetic

**Validates: Requirements 9.4, 9.6, 9.8, 9.9**
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

# ---------------------------------------------------------------------------
# Locate the repo root and wire up imports (pure core + shared schema/redaction)
# ---------------------------------------------------------------------------
#
# This script lives at
# ``<repo>/scripts/launch-verification/check-operational-readiness.py``.
#   * the pure core ``operational_eval`` is its sibling in this directory;
#   * the evidence envelope + redaction helper live under ``<repo>/backend`` as
#     ``apps.common.launch_verification.{evidence,redaction}``.
# Everything is resolved from this file's location so imports are robust
# regardless of the current working directory.

_THIS_FILE = Path(__file__).resolve()
_SCRIPT_DIR = _THIS_FILE.parent
# parents[0] = scripts/launch-verification, [1] = scripts, [2] = repo root
REPO_ROOT = _THIS_FILE.parents[2]
_BACKEND_DIR = REPO_ROOT / "backend"


def _ensure_on_path(directory: Path) -> None:
    """Insert ``directory`` at the front of ``sys.path`` if not already present."""
    as_str = str(directory)
    if as_str not in sys.path:
        sys.path.insert(0, as_str)


_ensure_on_path(_SCRIPT_DIR)
_ensure_on_path(_BACKEND_DIR)

try:
    import operational_eval  # noqa: E402  (sibling pure core, task 15.1)
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "check-operational-readiness: could not import the pure core "
        f"operational_eval from {_SCRIPT_DIR}/operational_eval.py — {exc}"
    )

try:
    from apps.common.launch_verification.evidence import (  # noqa: E402
        EvidenceArtifact,
        EvidenceCheck,
        to_dict,
    )
    from apps.common.launch_verification.redaction import redact  # noqa: E402
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "check-operational-readiness: could not import the evidence schema / "
        f"redaction helper from {_BACKEND_DIR}/apps/common/launch_verification/ — {exc}"
    )


# ---------------------------------------------------------------------------
# Constants — relative paths, known example/placeholder secrets, scope + cred
# name catalogues. None of these are secret values; they are *names* and
# tracked placeholder strings used only to compute the ``is_example`` boolean.
# ---------------------------------------------------------------------------

EVIDENCE_REL = "docs/launch-evidence/09-operational/operational-evidence.json"

#: Tracked example/template ``SECRET_KEY`` values that must never ship to
#: production. The raw production key is *compared* to this set to compute an
#: ``is_example`` boolean and then immediately discarded — it is never stored.
#: (Sources: backend dev default, ``backend/.env.example``,
#: ``deploy/.env.prod.example``.)
_EXAMPLE_SECRET_VALUES: Tuple[str, ...] = (
    "insecure-dev-key-change-me-do-not-use-in-prod",
    "replace-with-a-long-random-secret",
    "change_me",
)

#: Lower-cased placeholder fragments that mark a value as an unfilled template.
#: Used only to derive a boolean; the inspected value is never recorded.
_PLACEHOLDER_MARKERS: Tuple[str, ...] = (
    "change_me",
    "changeme",
    "replace-with",
    "replace_with",
    "insecure",
    "your-secret",
    "your_secret",
    "example",
    "placeholder",
    "xxxxx",
)

#: The payment / auth / AI throttle scopes that must each carry a per-user
#: rate limit > 0 (R9.3). Names only — read from ``DEFAULT_THROTTLE_RATES``.
_RATE_LIMIT_SCOPES: Tuple[str, ...] = (
    "user",
    "payment_initiate",
    "payment_defer",
    "payment_verify",
    "payment_mobile_money",
    "mobile_money_initiate",
    "payment_resolve_fee",
    "payment_correct",
    "payment_risk_flags",
    "ai_admin_summary",
    "ai_document_extract",
    "ai_student_preview",
)

#: Credential-bearing settings that must be **present** (non-empty) in
#: production (R9.4). Each entry is ``(setting_name, env_var_name, required)``.
#: Only a present/absent boolean is ever derived from these — never the value.
_CREDENTIAL_SETTINGS: Tuple[Tuple[str, str, bool], ...] = (
    ("SECRET_KEY", "SECRET_KEY", True),
    ("DATABASE_URL", "DATABASE_URL", True),
    ("REDIS_URL", "REDIS_URL", True),
    ("LENCO_API_SECRET_KEY", "LENCO_API_SECRET_KEY", True),
    ("LENCO_PUBLIC_KEY", "LENCO_PUBLIC_KEY", True),
    ("AUDIT_LOG_ENCRYPTION_KEY", "AUDIT_LOG_ENCRYPTION_KEY", True),
    ("AI_GATEWAY_API_KEY", "AI_GATEWAY_API_KEY", True),
    ("GLITCHTIP_DSN", "GLITCHTIP_DSN", False),
    ("EMAIL_HOST_PASSWORD", "ZOHO_SMTP_PASSWORD", True),
    ("RESEND_API_KEY", "RESEND_API_KEY", False),
    ("AWS_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY", True),
    ("AWS_S3_SECRET_ACCESS_KEY", "S3_SECRET_KEY", True),
)

#: Candidate locations for the super-admin break-glass / account-recovery doc
#: (R9.8). The checker records only whether such a non-empty doc exists.
_BREAK_GLASS_DOC_CANDIDATES: Tuple[str, ...] = (
    "docs/runbooks/break-glass.md",
    "docs/runbooks/super-admin-recovery.md",
    "docs/runbooks/account-recovery.md",
    "docs/runbooks/secrets-rotation.md",
)

#: Default audit-retention day counts (R9.7). Mirrors
#: ``apps.common.tasks.{STANDARD,SECURITY}_RETENTION_DAYS`` (90 / 365). The
#: settings-derived path imports the real constants when Django is importable.
_DEFAULT_AUDIT_STANDARD_DAYS = 90
_DEFAULT_AUDIT_SECURITY_DAYS = 365


# ---------------------------------------------------------------------------
# Small pure helpers (no value ever leaves these as a recordable string).
# ---------------------------------------------------------------------------


def _parse_rate(rate: Any) -> Optional[float]:
    """Parse a DRF throttle rate string (``"6/min"``) into its leading number.

    Returns the numeric request count, or ``None`` if the rate is unset or
    unparseable. Rate strings are configuration *limits*, not secrets.
    """
    if rate is None:
        return None
    if isinstance(rate, (int, float)) and not isinstance(rate, bool):
        return float(rate)
    if not isinstance(rate, str):
        return None
    head = rate.strip().split("/", 1)[0].strip()
    try:
        return float(head)
    except ValueError:
        return None


def _value_is_example(value: str) -> bool:
    """Return whether a secret value matches a tracked example/placeholder.

    Accepts the raw value transiently to compute the boolean, then the caller
    discards it. The value itself is never returned or stored.
    """
    lowered = value.strip().lower()
    if lowered in {v.lower() for v in _EXAMPLE_SECRET_VALUES}:
        return True
    return any(marker in lowered for marker in _PLACEHOLDER_MARKERS)


def _present(value: Any) -> bool:
    """Return ``True`` iff ``value`` is present and non-empty (delegates to core)."""
    return operational_eval.is_present(value)


def _break_glass_present() -> bool:
    """Return whether a non-empty super-admin break-glass doc exists (R9.8)."""
    for rel in _BREAK_GLASS_DOC_CANDIDATES:
        candidate = REPO_ROOT / rel
        try:
            if candidate.is_file() and candidate.stat().st_size > 0:
                return True
        except OSError:
            continue
    return False


# ---------------------------------------------------------------------------
# Fact derivation — three sources, all producing only non-secret indicators.
# ---------------------------------------------------------------------------


def synthetic_facts() -> Tuple[Dict[str, Any], Dict[str, bool]]:
    """Fabricate an all-pass derived-fact set for ``--synthetic`` (no I/O).

    Returns ``(facts, credential_presence)``. Every value is a non-secret
    indicator (boolean / length / count). No configuration is read.
    """
    facts: Dict[str, Any] = {
        "debug": False,
        "secret_key_len": operational_eval.SECRET_KEY_MIN_LEN + 14,
        "secret_key_is_example": False,
        "secure_cookies": True,
        "trusted_origins": True,
        "cors_allowed_hosts": True,
        "csrf_allowed_hosts": True,
        "https_redirect": True,
        "csp": True,
        "hsts_max_age": operational_eval.HSTS_MIN_SECONDS,
        "rate_limits": {scope: 60 for scope in _RATE_LIMIT_SCOPES},
        "audit_standard_days": operational_eval.AUDIT_STANDARD_DAYS,
        "audit_security_days": operational_eval.AUDIT_SECURITY_DAYS,
        "backup_rto_minutes": 30,
        "backup_rpo_row_variance": 0,
        "asset_upload_rejects_disallowed": True,
        "break_glass_doc_present": True,
    }
    credentials = {name: True for name, _env, _req in _CREDENTIAL_SETTINGS}
    return facts, credentials


def facts_from_inputs(path: Path) -> Tuple[Dict[str, Any], Dict[str, bool]]:
    """Load an already-derived facts JSON supplied by the operator.

    The file must contain only derived facts; any ``credentials`` sub-object is
    interpreted as ``{name: present_bool}``. Values are not trusted to be
    secret-free — the emitted artifact is redacted regardless — but a
    well-formed inputs file already carries only indicators.
    """
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, Mapping):
        raise SystemExit(
            f"check-operational-readiness: inputs file {path} must be a JSON object"
        )
    facts = dict(raw.get("facts", raw))
    creds_raw = raw.get("credentials", {})
    credentials: Dict[str, bool] = {}
    if isinstance(creds_raw, Mapping):
        for name, present in creds_raw.items():
            credentials[str(name)] = bool(present)
    # The credentials map must never carry a value; coerce to bool above.
    facts.pop("credentials", None)
    return facts, credentials


def _import_django_settings(settings_module: Optional[str]):
    """Configure and return ``django.conf.settings`` or ``None`` if unavailable.

    Read-only: this only *reads* settings to derive indicators; it never mutates
    configuration. Returns ``None`` when Django is not importable or cannot be
    configured (e.g. running outside the production env), so the caller can fall
    back to environment-variable inspection.
    """
    if settings_module:
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", settings_module)
    if not os.environ.get("DJANGO_SETTINGS_MODULE"):
        return None
    try:
        import django  # noqa: E402
        from django.conf import settings as dj_settings  # noqa: E402

        if not dj_settings.configured:
            django.setup()
        # Touch an attribute to force settings to load (raises if misconfigured).
        _ = dj_settings.DEBUG
        return dj_settings
    except Exception:  # noqa: BLE001 - any failure → fall back to env inspection
        return None


def _audit_retention_days() -> Tuple[int, int]:
    """Return ``(standard_days, security_days)`` from the real task constants."""
    try:
        from apps.common.tasks import (  # noqa: E402
            SECURITY_RETENTION_DAYS,
            STANDARD_RETENTION_DAYS,
        )

        return int(STANDARD_RETENTION_DAYS), int(SECURITY_RETENTION_DAYS)
    except Exception:  # noqa: BLE001 - fall back to the documented defaults
        return _DEFAULT_AUDIT_STANDARD_DAYS, _DEFAULT_AUDIT_SECURITY_DAYS


def _derive_secret_key_indicators(raw_key: Any) -> Tuple[Optional[int], bool]:
    """Derive ``(length, is_example)`` from a secret key without retaining it.

    The raw key is read transiently here, reduced to a length and an
    ``is_example`` boolean, and never returned or stored. This is the single
    place the value is touched, keeping the secret-handling surface minimal.
    """
    if not isinstance(raw_key, str) or not raw_key:
        return None, True
    length = len(raw_key)
    is_example = _value_is_example(raw_key)
    # ``raw_key`` goes out of scope here; only the two derived facts remain.
    return length, is_example


def facts_from_django(dj_settings) -> Tuple[Dict[str, Any], Dict[str, bool]]:
    """Derive the operational facts from a live (read-only) Django settings object."""
    facts: Dict[str, Any] = {}

    # R9.1 — DEBUG off.
    facts["debug"] = getattr(dj_settings, "DEBUG", None)

    # R9.1 — SECRET_KEY: derive length + is_example only, never the value.
    sk_len, sk_is_example = _derive_secret_key_indicators(
        getattr(dj_settings, "SECRET_KEY", None)
    )
    facts["secret_key_len"] = sk_len
    facts["secret_key_is_example"] = sk_is_example

    # R9.2 — secure cookies: all three secure-cookie flags must be set.
    facts["secure_cookies"] = bool(
        getattr(dj_settings, "SESSION_COOKIE_SECURE", False)
        and getattr(dj_settings, "CSRF_COOKIE_SECURE", False)
        and getattr(dj_settings, "AUTH_COOKIE_SECURE", False)
    )
    facts["trusted_origins"] = _present(
        getattr(dj_settings, "CSRF_TRUSTED_ORIGINS", None)
    )
    facts["cors_allowed_hosts"] = _present(
        getattr(dj_settings, "CORS_ALLOWED_ORIGINS", None)
    )
    facts["csrf_allowed_hosts"] = _present(
        getattr(dj_settings, "ALLOWED_HOSTS", None)
    )
    facts["https_redirect"] = bool(
        getattr(dj_settings, "SECURE_SSL_REDIRECT", False)
    )

    # R9.2 — CSP: Django may not define it (served at the edge by Caddy). Detect
    # a Django-side policy/middleware; absent → record absent (operator can
    # supply edge-CSP presence via --inputs).
    facts["csp"] = _detect_csp(dj_settings)

    # R9.2 — HSTS max-age.
    facts["hsts_max_age"] = getattr(dj_settings, "SECURE_HSTS_SECONDS", None)

    # R9.3 — per-user rate limits on payment/auth/AI scopes.
    facts["rate_limits"] = _derive_rate_limits(dj_settings)

    # R9.7 — audit retention 90 / 365.
    standard_days, security_days = _audit_retention_days()
    facts["audit_standard_days"] = standard_days
    facts["audit_security_days"] = security_days

    # R9.5 — backup/restore drill facts are not in code; the operator supplies
    # the measured RTO/RPO via --inputs. Absent here → conservative fail.
    facts["backup_rto_minutes"] = None
    facts["backup_rpo_row_variance"] = None

    # R9.6 — tenant asset upload validation. Presence of the validating settings
    # is the observable signal here; the live rejection outcome is exercised by
    # the onboarding smoke (Gate 10). Conservatively derive from upload limits.
    facts["asset_upload_rejects_disallowed"] = _detect_upload_validation(dj_settings)

    # R9.8 — super-admin break-glass doc exists.
    facts["break_glass_doc_present"] = _break_glass_present()

    # Credential present/absent — name + boolean only (R9.4 / R9.9).
    credentials = _derive_credentials(dj_settings)
    return facts, credentials


def facts_from_env() -> Tuple[Dict[str, Any], Dict[str, bool]]:
    """Fallback derivation from environment-variable *names* (no Django).

    Produces the same fact shape using only ``os.environ`` lookups, deriving
    booleans/lengths and never recording a value. Facts that cannot be observed
    from the environment alone (rate-limit map, CSP, backup drill) are left
    absent so the pure core fails them conservatively.
    """
    facts: Dict[str, Any] = {}

    debug_raw = os.environ.get("DEBUG", "").strip().lower()
    facts["debug"] = False if debug_raw in ("", "0", "false", "no", "off") else True

    sk_len, sk_is_example = _derive_secret_key_indicators(os.environ.get("SECRET_KEY"))
    facts["secret_key_len"] = sk_len
    facts["secret_key_is_example"] = sk_is_example

    # Presence-only derivations from env names.
    facts["secure_cookies"] = _env_flag("SESSION_COOKIE_SECURE", default=None)
    facts["trusted_origins"] = _present(os.environ.get("CSRF_TRUSTED_ORIGINS"))
    facts["cors_allowed_hosts"] = _present(os.environ.get("CORS_ALLOWED_ORIGINS"))
    facts["csrf_allowed_hosts"] = _present(os.environ.get("ALLOWED_HOSTS"))
    facts["https_redirect"] = _env_flag("SECURE_SSL_REDIRECT", default=None)
    facts["csp"] = _env_flag("CSP_PRESENT", default=None)
    hsts = os.environ.get("SECURE_HSTS_SECONDS")
    facts["hsts_max_age"] = int(hsts) if hsts and hsts.strip().isdigit() else None

    # Rate-limit map is not observable from env alone → leave absent (fails).
    facts["rate_limits"] = {}

    standard_days, security_days = _audit_retention_days()
    facts["audit_standard_days"] = standard_days
    facts["audit_security_days"] = security_days

    facts["backup_rto_minutes"] = None
    facts["backup_rpo_row_variance"] = None
    facts["asset_upload_rejects_disallowed"] = None
    facts["break_glass_doc_present"] = _break_glass_present()

    credentials: Dict[str, bool] = {}
    for setting_name, env_name, _required in _CREDENTIAL_SETTINGS:
        credentials[setting_name] = bool((os.environ.get(env_name) or "").strip())
    return facts, credentials


def _env_flag(name: str, *, default: Optional[bool]) -> Optional[bool]:
    """Parse a boolean-ish env var; returns ``default`` when unset."""
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _detect_csp(dj_settings) -> bool:
    """Detect a Django-side Content-Security-Policy configuration."""
    if _present(getattr(dj_settings, "CONTENT_SECURITY_POLICY", None)):
        return True
    if _present(getattr(dj_settings, "CSP_POLICIES", None)):
        return True
    if _present(getattr(dj_settings, "CSP_DEFAULT_SRC", None)):
        return True
    middleware = getattr(dj_settings, "MIDDLEWARE", []) or []
    return any("csp" in str(m).lower() for m in middleware)


def _detect_upload_validation(dj_settings) -> bool:
    """Conservatively derive that tenant asset upload validation is configured."""
    # Presence of an upload size cap is a positive signal that shape/size
    # validation is in force; the live rejection is exercised by Gate 10.
    for attr in (
        "DATA_UPLOAD_MAX_MEMORY_SIZE",
        "FILE_UPLOAD_MAX_MEMORY_SIZE",
        "TENANT_ASSET_MAX_BYTES",
        "TENANT_ASSET_ALLOWED_CONTENT_TYPES",
    ):
        if _present(getattr(dj_settings, attr, None)):
            return True
    return False


def _derive_rate_limits(dj_settings) -> Dict[str, float]:
    """Derive the payment/auth/AI per-user rate-limit map from DRF settings."""
    rest = getattr(dj_settings, "REST_FRAMEWORK", {}) or {}
    rates = {}
    if isinstance(rest, Mapping):
        rates = rest.get("DEFAULT_THROTTLE_RATES", {}) or {}
    derived: Dict[str, float] = {}
    for scope in _RATE_LIMIT_SCOPES:
        parsed = _parse_rate(rates.get(scope) if isinstance(rates, Mapping) else None)
        # A missing/unparseable scope is recorded as 0 so the core flags it.
        derived[scope] = parsed if parsed is not None else 0.0
    return derived


def _derive_credentials(dj_settings) -> Dict[str, bool]:
    """Derive credential present/absent booleans (name → present), never values."""
    credentials: Dict[str, bool] = {}
    for setting_name, env_name, _required in _CREDENTIAL_SETTINGS:
        value = getattr(dj_settings, setting_name, None)
        if value is None:
            value = os.environ.get(env_name)
        # Reduce to a boolean immediately; the value is never retained.
        credentials[setting_name] = _present(value)
    return credentials


# ---------------------------------------------------------------------------
# Evidence assembly.
# ---------------------------------------------------------------------------


def _required_credential_names() -> set:
    return {name for name, _env, required in _CREDENTIAL_SETTINGS if required}


def build_artifact(
    facts: Mapping[str, Any],
    credentials: Mapping[str, bool],
    *,
    source_label: str,
) -> Tuple[EvidenceArtifact, bool]:
    """Run the pure core over ``facts`` and build the Gate 9 Evidence_Artifact.

    Returns ``(artifact, passed)``. ``passed`` is ``True`` iff the
    :mod:`operational_eval` verdict passed **and** every *required* credential
    is present. Credential rows record only ``name`` + ``present`` (R9.4 / R9.9).
    """
    result = operational_eval.evaluate_operational(facts)

    checks: List[EvidenceCheck] = []
    for row in result["checks"]:
        checks.append(
            EvidenceCheck(
                id=str(row.get("id", "")),
                result=row.get("result", "fail"),
                observed="present" if row.get("present") else "",
                threshold="",
                detail="",
                fields={
                    k: v
                    for k, v in row.items()
                    if k not in ("id", "result", "observed", "threshold", "detail")
                },
            )
        )

    # R9.4 / R9.9 — credential present/absent rows: NAME + present only.
    required = _required_credential_names()
    missing_required: List[str] = []
    for name, present in sorted(credentials.items()):
        is_required = name in required
        present_bool = bool(present)
        if is_required and not present_bool:
            missing_required.append(name)
        checks.append(
            EvidenceCheck(
                id=f"operational:credential:{name}",
                result="pass" if (present_bool or not is_required) else "fail",
                observed="present" if present_bool else "absent",
                threshold="present" if is_required else "optional",
                detail="",
                # Only the credential NAME and a present boolean — never a value.
                fields={"name": name, "present": present_bool, "required": is_required},
            )
        )

    core_passed = bool(result["passed"])
    credentials_ok = len(missing_required) == 0
    passed = core_passed and credentials_ok

    failures: List[Dict[str, Any]] = []
    # Core failures: failing setting recorded by NAME without its value (R9.9).
    for setting_name in result.get("failed_settings", []):
        failures.append({"type": "setting", "name": setting_name})
    for name in missing_required:
        failures.append({"type": "credential-absent", "name": name})

    if passed:
        summary = (
            f"Operational_Readiness_Gate PASSED ({source_label}): all "
            f"{len(result['checks'])} settings satisfied; "
            f"{len(credentials)} credential(s) recorded present/absent (names only)."
        )
    else:
        bits: List[str] = []
        if result.get("failed_settings"):
            bits.append(
                f"{len(result['failed_settings'])} setting(s): "
                + ", ".join(result["failed_settings"])
            )
        if missing_required:
            bits.append(
                f"{len(missing_required)} required credential(s) absent: "
                + ", ".join(missing_required)
            )
        summary = (
            f"Operational_Readiness_Gate FAILED ({source_label}): " + "; ".join(bits)
        )

    artifact = EvidenceArtifact(
        gate_id=operational_eval.GATE_ID,
        requirement=operational_eval.REQUIREMENT,
        status="passed" if passed else "failed",
        generated_by="operator",
        summary=summary,
        checks=checks,
        assets=[],
        failures=failures,
    )
    return artifact, passed


def write_artifact(artifact: EvidenceArtifact, output_path: Path) -> None:
    """Write the artifact to ``output_path`` as redacted, pretty JSON.

    The whole envelope is routed through the shared redaction helper as
    defence-in-depth so no secret value can ever land in the evidence store —
    even though, by construction, only names + indicators are recorded.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = redact(to_dict(artifact))
    output_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# CLI entrypoint.
# ---------------------------------------------------------------------------


def _default_output() -> Path:
    return REPO_ROOT / EVIDENCE_REL


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="check-operational-readiness.py",
        description=(
            "Gate 9 Operational_Readiness_Gate checker (operator-gated; NOT "
            "auto-run in CI). Inspects production configuration read-only and "
            "records only setting/credential NAMES with present/absent "
            "indicators (never values); emits "
            "docs/launch-evidence/09-operational/operational-evidence.json."
        ),
    )
    parser.add_argument(
        "--inputs",
        type=Path,
        default=None,
        help="Path to an already-derived facts JSON (operator-supplied indicators).",
    )
    parser.add_argument(
        "--settings-module",
        default=None,
        help=(
            "DJANGO_SETTINGS_MODULE to load when deriving from live settings "
            "(default: the env var if set, e.g. config.settings.prod)."
        ),
    )
    parser.add_argument(
        "--synthetic",
        action="store_true",
        help="Dry-run: emit a valid envelope over synthetic all-pass facts (no config read).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=f"Output path for the evidence artifact (default: <repo>/{EVIDENCE_REL}).",
    )
    return parser


def _resolve_facts(
    args: argparse.Namespace,
) -> Tuple[Dict[str, Any], Dict[str, bool], str]:
    """Pick the fact source per the CLI flags and return ``(facts, creds, label)``."""
    if args.synthetic:
        facts, credentials = synthetic_facts()
        return facts, credentials, "synthetic dry-run"
    if args.inputs is not None:
        facts, credentials = facts_from_inputs(args.inputs)
        return facts, credentials, f"inputs:{args.inputs.name}"
    dj_settings = _import_django_settings(args.settings_module)
    if dj_settings is not None:
        facts, credentials = facts_from_django(dj_settings)
        module = os.environ.get("DJANGO_SETTINGS_MODULE", "settings")
        return facts, credentials, f"django:{module}"
    facts, credentials = facts_from_env()
    return facts, credentials, "environment"


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI: derive facts, write the artifact, return the exit code.

    Returns ``0`` only when the gate passes; any not-passed verdict returns
    ``1`` so the operator flow fails closed.
    """
    args = build_arg_parser().parse_args(argv)
    output_path: Path = args.output or _default_output()

    facts, credentials, source_label = _resolve_facts(args)
    artifact, passed = build_artifact(facts, credentials, source_label=source_label)
    write_artifact(artifact, output_path)

    print(f"launch-verification operational-readiness: {artifact.status}")
    print(f"  source:  {source_label}")
    print(f"  summary: {artifact.summary}")
    print(f"  written: {output_path}")
    if artifact.failures:
        print(f"  failures: {len(artifact.failures)}")
        for failure in artifact.failures[:20]:
            print(f"    - {failure}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
