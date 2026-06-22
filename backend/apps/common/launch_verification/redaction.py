"""Shared secret/PII redaction helper for launch-verification evidence.

Every launch-verification gate writes its Evidence_Artifact **through this
module** so that no secret value, credential, raw phone number, NRC/passport
value, or document body is ever persisted to ``docs/launch-evidence/``.

Requirements:

* **R1.9** - the Migration_Evidence_Gate excludes connection strings,
  database passwords, and any secret values from every recorded
  Evidence_Artifact.
* **R9.4 / R9.9** - the Operational_Readiness_Gate records only a credential
  *name* plus a present/absent indicator, never the credential value, and on
  failure records the failing setting by name without revealing its value.
* Steering hard rule - "Never log PII, secrets, resume contents, or document
  bodies"; payment metadata must not persist raw phone numbers; strip
  NRC/passport/DOB/contact.

Design notes (see ``.kiro/specs/beanola-launch-verification/design.md``,
Property 16):

* The helper operates at two levels. ``redact_text`` scrubs secret-shaped
  *substrings* out of any string. ``redact_obj`` walks dicts/lists
  recursively: values under a *sensitive key* are replaced wholesale with the
  redaction marker, and every other string value is still passed through
  ``redact_text`` so a secret hidden in a non-obvious field is caught too.
* The module is standard-library only (no Django imports) so it can be reused
  from the CLI gate scripts under ``scripts/launch-verification/`` as well as
  from Django-side code.
* Redaction is intentionally **conservative**: over-redaction is acceptable
  (an evidence artifact never needs the real secret), under-redaction is not.
"""

from __future__ import annotations

import re
from typing import Any

#: The stable marker substituted for any redacted secret/PII value. Tests and
#: artifact readers can rely on this exact string.
REDACTION_MARKER = "[REDACTED]"

#: Below this recursion depth we stop descending into nested structures and
#: redact the whole subtree, guarding against pathological/cyclic-looking input.
_MAX_DEPTH = 25

# ---------------------------------------------------------------------------
# Sensitive dict-key markers (case-insensitive substring match)
# ---------------------------------------------------------------------------

#: Keys whose *entire value* is replaced with the redaction marker. These cover
#: credentials, API keys, tokens, connection strings, and private keys.
_SECRET_KEY_MARKERS: tuple[str, ...] = (
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "api-key",
    "access_key",
    "accesskey",
    "secret_key",
    "private_key",
    "privatekey",
    "credential",
    "authorization",
    "auth_token",
    "session_key",
    "signing_key",
    "encryption_key",
    "dsn",
    "connection_string",
    "connectionstring",
    "conn_str",
    "database_url",
    "db_url",
    "redis_url",
    "celery_broker",
    "broker_url",
    # Project-specific credential prefixes.
    "lenco",
    "ai_gateway",
    "glitchtip",
    "resend",
    "zoho",
    "sentry",
)

#: Keys whose value is PII (phone / national-id / payment-instrument shaped).
_PII_KEY_MARKERS: tuple[str, ...] = (
    "phone",
    "msisdn",
    "mobile",
    "nrc",
    "passport",
    "pan",
    "cvv",
    "card_number",
    "cardnumber",
    "date_of_birth",
    "dob",
)

#: Keys whose value is a document/body blob - stripped entirely.
_BODY_KEY_MARKERS: tuple[str, ...] = (
    "document_body",
    "document_text",
    "file_content",
    "file_bytes",
    "raw_payload",
    "raw_body",
    "extracted_text",
    "resume_content",
    "resume_body",
)


def _key_is_sensitive(key: str) -> bool:
    lowered = str(key).lower()
    markers = _SECRET_KEY_MARKERS + _PII_KEY_MARKERS + _BODY_KEY_MARKERS
    return any(marker in lowered for marker in markers)


# ---------------------------------------------------------------------------
# Secret-shaped substring patterns (ordered: most specific first)
# ---------------------------------------------------------------------------

#: ``data:...;base64,<blob>`` data URIs.
_DATA_URI_RE = re.compile(r"data:[^;,\s]+;base64,[A-Za-z0-9+/=]+", re.IGNORECASE)

#: Connection strings / URIs that carry inline credentials or a known
#: secret-bearing scheme (postgres/redis/amqp/mongodb/mysql/...).
_CONN_SCHEME_RE = re.compile(
    r"\b(?:postgres(?:ql)?|redis(?:s)?|amqp(?:s)?|mongodb(?:\+srv)?|mysql|"
    r"mariadb|mssql|sqlserver|rediss|smtp(?:s)?)://[^\s'\"<>]+",
    re.IGNORECASE,
)

#: Any URI carrying ``user:pass@host`` inline credentials, regardless of scheme.
_CREDENTIALED_URI_RE = re.compile(r"\b[a-z][a-z0-9+.\-]*://[^\s:/'\"]+:[^\s@'\"]+@[^\s'\"<>]+", re.IGNORECASE)

#: ``Bearer <token>`` / ``Basic <token>`` authorization headers.
_BEARER_RE = re.compile(r"\b(Bearer|Basic|Token)\s+[A-Za-z0-9._\-+/=]{8,}", re.IGNORECASE)

#: JWT-shaped tokens (three base64url segments).
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+")

#: Common provider key prefixes (Stripe/Lenco-style ``sk_``/``pk_``, ``rk_``,
#: GlitchTip/Sentry ``glitchtip_key=``-style, generic ``AIza`` Google keys).
_PREFIXED_KEY_RE = re.compile(
    r"\b(?:sk|pk|rk|whsec|api|key)_[A-Za-z0-9]{8,}",
    re.IGNORECASE,
)
_GOOGLE_KEY_RE = re.compile(r"\bAIza[A-Za-z0-9_\-]{16,}")

#: ``NAME=value`` / ``NAME: value`` assignments where NAME is an env-style
#: uppercase identifier that *names* a secret. Keeps the name, redacts value.
_ENV_ASSIGNMENT_RE = re.compile(
    r"(?m)^([ \t]*(?:export[ \t]+)?"
    r"[A-Z0-9_]*"
    r"(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|APIKEY|_KEY|PRIVATE|DSN|"
    r"DATABASE_URL|REDIS_URL|BROKER_URL|CREDENTIAL|SIGNING)"
    r"[A-Z0-9_]*)"
    r"([ \t]*[=:][ \t]*)"
    r"(\"[^\"]*\"|'[^']*'|[^\s#]+)"
)

#: Zambian phone numbers: ``+260XXXXXXXXX`` / ``260XXXXXXXXX`` / local
#: ``0XXXXXXXXX`` (9 digits after the leading 0). Pattern mirrors
#: ``validators.validate_zambian_phone``.
_ZM_PHONE_RE = re.compile(r"(?<![\d+])(?:\+?260\d{9}|0\d{9})(?!\d)")

#: NRC numbers: ``123456/78/9`` (mirrors ``validators.validate_nrc``).
_NRC_RE = re.compile(r"(?<!\d)\d{6}/\d{2}/\d(?!\d)")

#: Passport-shaped tokens: 1-2 letters followed by 6-9 digits, e.g. ``ZN1234567``.
_PASSPORT_RE = re.compile(r"\b[A-Z]{1,2}\d{6,9}\b")

#: Long base64/opaque blobs that look like document bodies or encoded payloads.
_LONG_BLOB_RE = re.compile(r"[A-Za-z0-9+/]{200,}={0,2}")

#: Length above which a free-form string is treated as a document body and
#: redacted wholesale (no legitimate setting/name value is this long).
_MAX_FREEFORM_LEN = 2048


def _redact_env_assignment(match: "re.Match[str]") -> str:
    return f"{match.group(1)}{match.group(2)}{REDACTION_MARKER}"


def _redact_bearer(match: "re.Match[str]") -> str:
    return f"{match.group(1)} {REDACTION_MARKER}"


def redact_text(text: Any) -> Any:
    """Scrub secret-shaped substrings out of ``text``.

    Returns the redacted string. Non-string input is returned unchanged so the
    function is safe to call from :func:`redact_obj` on mixed values.
    """
    if not isinstance(text, str):
        return text
    if not text:
        return text

    # Whole-string short-circuit: anything longer than a setting/name value is
    # treated as a document body and dropped entirely.
    if len(text) > _MAX_FREEFORM_LEN:
        return REDACTION_MARKER

    result = text
    # Order matters: redact the most structured/specific shapes first so their
    # internal digits aren't partially rewritten by the phone/NRC passes.
    result = _DATA_URI_RE.sub(REDACTION_MARKER, result)
    result = _LONG_BLOB_RE.sub(REDACTION_MARKER, result)
    result = _ENV_ASSIGNMENT_RE.sub(_redact_env_assignment, result)
    result = _CREDENTIALED_URI_RE.sub(REDACTION_MARKER, result)
    result = _CONN_SCHEME_RE.sub(REDACTION_MARKER, result)
    result = _BEARER_RE.sub(_redact_bearer, result)
    result = _JWT_RE.sub(REDACTION_MARKER, result)
    result = _PREFIXED_KEY_RE.sub(REDACTION_MARKER, result)
    result = _GOOGLE_KEY_RE.sub(REDACTION_MARKER, result)
    result = _ZM_PHONE_RE.sub(REDACTION_MARKER, result)
    result = _NRC_RE.sub(REDACTION_MARKER, result)
    result = _PASSPORT_RE.sub(REDACTION_MARKER, result)
    return result


def redact_obj(obj: Any, _depth: int = 0) -> Any:
    """Recursively redact a dict/list/scalar structure.

    * ``dict`` - for each item, if the *key* names a secret/PII/body field the
      value is replaced wholesale with the marker; otherwise the value is
      redacted recursively. Keys are preserved (names are not secret).
    * ``list`` / ``tuple`` / ``set`` - each element is redacted recursively;
      the container type is normalised to ``list`` for JSON-friendliness.
    * ``str`` - scrubbed via :func:`redact_text`.
    * other scalars (int/float/bool/None) - returned unchanged.
    """
    if _depth >= _MAX_DEPTH:
        return REDACTION_MARKER

    if isinstance(obj, dict):
        redacted: dict[Any, Any] = {}
        for key, value in obj.items():
            if _key_is_sensitive(key):
                redacted[key] = REDACTION_MARKER
            else:
                redacted[key] = redact_obj(value, _depth + 1)
        return redacted

    if isinstance(obj, (list, tuple, set)):
        return [redact_obj(item, _depth + 1) for item in obj]

    if isinstance(obj, str):
        return redact_text(obj)

    # int / float / bool / None and any other scalar - nothing secret-shaped to
    # scrub (a bare int can't be matched to a credential without its key, which
    # is handled by the sensitive-key branch above).
    return obj


def redact(value: Any) -> Any:
    """Top-level redaction entry point used by every gate.

    Dispatches by type:

    * ``str`` -> :func:`redact_text`
    * ``dict`` / ``list`` / ``tuple`` / ``set`` -> :func:`redact_obj`
    * any other value -> returned unchanged.

    This is the single function gates call before writing an Evidence_Artifact.
    """
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, (dict, list, tuple, set)):
        return redact_obj(value)
    return value


__all__ = [
    "REDACTION_MARKER",
    "redact",
    "redact_obj",
    "redact_text",
]
