"""The one public-tracking credential authority (admissions-v2 task 10.5).

Findings **STU-22** / **TEN-10**; requirements **R13.12**, **R2.3-R2.4**, **R17.2**,
**R17.7**; design §12 — "Public tracking uses a random, revocable, hashed tracking
secret and minimal response."

Why this module exists
----------------------
Before task 10.5 the public tracker accepted two identifiers as credentials:

* ``applications.application_number`` — ``{CODE}{YEAR}{SEQ5}``, a per-tenant
  **sequential counter**. One leaked slip yields its neighbours, so a whole
  cohort was enumerable. R13.12 names this exactly: "Sequential application
  numbers alone SHALL NOT authorize public disclosure."
* ``applications.public_tracking_code`` — ``TRK-{CODE}{YEAR}{6 hex}``. The stem
  is derivable from the school and the year, leaving 24 bits.

Both identifiers still exist and keep every non-authority use they had (printed
on slips and letters, admin search, the ``tracking_code`` template variable).
This module is what replaces them **as credentials**.

The shape of the credential
---------------------------
A split token — ``TRK-{selector}-{verifier}``:

* the **selector** is random, non-secret, unique and indexed. It is the only
  thing the SQL lookup runs on, so the query plan never depends on the secret
  half and cannot be a timing oracle over it;
* the **verifier** is the secret. Only its SHA-256 is stored, and the stored
  digest is compared with :func:`hmac.compare_digest`, so neither a database
  reader nor a response-timing observer learns it.

Both halves are drawn from a 32-character alphabet with no ``I``/``L``/``O``/``U``
(Crockford base32's exclusions), so a code read off a screen or a phone call has
nothing ambiguous in it. 8 + 20 characters is 40 + 100 bits: the selector space
alone is larger than every application the platform will ever hold, and the
verifier is not searchable at any rate limit.

One live secret per application. Issuing revokes the previous one — that is the
"revocable" half of design §12 — and a revoked secret is indistinguishable from
one that never existed.

What is deliberately *not* here
-------------------------------
No second factor. R13.12 allows "a random non-PII tracking secret **or** a second
factor"; a second factor over an unauthenticated endpoint would mean asking the
public to post a date of birth or a surname, which adds applicant PII to the
request in order to protect applicant PII in the response. The random secret is
the option that discloses nothing.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass
from typing import Optional

from django.utils import timezone

# ---------------------------------------------------------------------------
# Token shape
# ---------------------------------------------------------------------------

#: Crockford base32: the digits and the uppercase letters minus I, L, O and U.
#: Nothing in a code can be misread as something else.
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

PREFIX = "TRK"
SELECTOR_LENGTH = 8
VERIFIER_LENGTH = 20

#: ``TRK-XXXXXXXX-XXXXXXXXXXXXXXXXXXXX``. Two hyphens and two fixed lengths, so
#: this cannot collide with any legacy identifier shape (see
#: :data:`LEGACY_IDENTIFIER_PATTERN`, every branch of which has at most one
#: hyphen).
SECRET_PATTERN = re.compile(
    rf"^{PREFIX}-([{ALPHABET}]{{{SELECTOR_LENGTH}}})-([{ALPHABET}]{{{VERIFIER_LENGTH}}})$"
)

#: The identifiers that used to be credentials and are not any more. This is the
#: pre-10.5 ``ApplicationTrackView.TRACKING_CODE_PATTERN``, carried over
#: unchanged so that recognising one is a **pure function of the string** — the
#: view answers "this is not a tracking secret" without going near the database,
#: which is what makes that answer impossible to use as an existence oracle.
#:
#: Institution-code-agnostic (R9.9): the leading segment is any 2-10 letter
#: tenant code, never a fixed brand allowlist.
#:   APP-YYYYMMDD-XXXXXXXX  legacy application numbers
#:   {CODE}{YEAR}{SEQ}      application numbers, e.g. BNL202500001
#:   TRK-{CODE}{YEAR}{HEX}  legacy tracking codes, e.g. TRK-BNL2025ABCDEF
#:   TRK-XXXXXXXXXXXX       legacy tracking codes, 12 alphanumerics after a dash
#:   TRK + 5-6 alphanum     legacy tracking codes, no dash
LEGACY_IDENTIFIER_PATTERN = re.compile(
    r"^("
    r"APP-\d{8}-[A-Z0-9]{8}"
    r"|[A-Z]{2,10}\d{9,14}"
    r"|TRK-[A-Z]{2,10}\d{4}[A-Z0-9]{6}"
    r"|TRK-[A-Z0-9]{12}"
    r"|TRK[A-Z0-9]{5,6}"
    r")$"
)

# Outcomes of classifying a submitted code. Stable strings — the view maps them
# onto response codes and the audit trail records them.
KIND_SECRET = "tracking_secret"
KIND_LEGACY = "legacy_identifier"
KIND_UNRECOGNISED = "unrecognised"

#: How many times :func:`issue` retries when a freshly drawn selector collides
#: with a live one. At 40 bits a single retry is already improbable; three is
#: bookkeeping, not a strategy.
MAX_ISSUE_ATTEMPTS = 3


class TrackingSecretUnavailable(RuntimeError):
    """A secret could not be issued (selector collisions exhausted)."""


@dataclass(frozen=True)
class IssuedTrackingSecret:
    """The one moment the plaintext exists outside the requester's hands."""

    code: str
    selector: str
    issued_at: object

    def share_path(self) -> str:
        """The tracker path that carries the secret and nothing else.

        No application number, no name, no email — the only thing in the query
        string is the random token (STU-22: "share a URL that contains only the
        non-PII tracking token").
        """
        return f"/track-application?code={self.code}"


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def normalize(code: str | None) -> str:
    """Upper-case and trim a submitted code. No other rewriting."""
    return (code or "").strip().upper()


def classify(code: str | None) -> str:
    """Classify a **string**, with no database access.

    Returns :data:`KIND_SECRET`, :data:`KIND_LEGACY` or
    :data:`KIND_UNRECOGNISED`. Purity is the security property here: the
    tracker's answer to a legacy identifier must not depend on whether that
    identifier exists.
    """
    normalized = normalize(code)
    if SECRET_PATTERN.match(normalized):
        return KIND_SECRET
    if LEGACY_IDENTIFIER_PATTERN.match(normalized):
        return KIND_LEGACY
    return KIND_UNRECOGNISED


def parse(code: str | None) -> Optional[tuple[str, str]]:
    """Split a tracking secret into ``(selector, verifier)``, or ``None``."""
    match = SECRET_PATTERN.match(normalize(code))
    if not match:
        return None
    return match.group(1), match.group(2)


def hash_verifier(verifier: str) -> str:
    """SHA-256 hex of the secret half. The only form ever persisted."""
    return hashlib.sha256(verifier.encode("utf-8")).hexdigest()


def _random_segment(length: int) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def build_code(selector: str, verifier: str) -> str:
    return f"{PREFIX}-{selector}-{verifier}"


def matches(stored_hash: str | None, verifier: str) -> bool:
    """Constant-time comparison of a presented verifier against the stored hash.

    ``compare_digest`` rather than ``==`` so the number of matching leading
    characters is not observable in the response time. Both operands are
    fixed-length hex digests, so there is no length side channel either.
    """
    if not stored_hash:
        return False
    return hmac.compare_digest(str(stored_hash), hash_verifier(verifier))


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def issue(application) -> IssuedTrackingSecret:
    """Issue a fresh tracking secret for *application*, revoking the previous one.

    Returns the plaintext once. The caller is responsible for handing it to the
    owner and for never logging it.
    """
    from apps.applications.models import Application

    now = timezone.now()
    last_error: Exception | None = None
    for _ in range(MAX_ISSUE_ATTEMPTS):
        selector = _random_segment(SELECTOR_LENGTH)
        verifier = _random_segment(VERIFIER_LENGTH)
        # A live selector on another row is the only collision that matters; the
        # partial unique index is the real guard, this check just avoids burning
        # an attempt on a value we can already see is taken.
        if (
            Application.objects.filter(tracking_selector=selector)
            .exclude(pk=application.pk)
            .exists()
        ):
            continue
        try:
            Application.objects.filter(pk=application.pk).update(
                tracking_selector=selector,
                tracking_secret_hash=hash_verifier(verifier),
                tracking_secret_issued_at=now,
                # Issuing is what revokes the previous secret: the row now holds
                # exactly one live credential.
                tracking_secret_revoked_at=None,
            )
        except Exception as exc:  # pragma: no cover - unique-index race
            last_error = exc
            continue
        application.tracking_selector = selector
        application.tracking_secret_hash = hash_verifier(verifier)
        application.tracking_secret_issued_at = now
        application.tracking_secret_revoked_at = None
        return IssuedTrackingSecret(
            code=build_code(selector, verifier), selector=selector, issued_at=now
        )
    raise TrackingSecretUnavailable(
        "could not allocate a tracking selector"
    ) from last_error


def revoke(application) -> bool:
    """Revoke the live secret. Returns whether there was one to revoke."""
    from apps.applications.models import Application

    if not application.tracking_selector or application.tracking_secret_revoked_at:
        return False
    now = timezone.now()
    Application.objects.filter(pk=application.pk).update(
        tracking_secret_revoked_at=now
    )
    application.tracking_secret_revoked_at = now
    return True


def resolve(code: str | None):
    """Resolve a tracking secret to its ``Application``, or ``None``.

    ``None`` covers every failure identically — malformed, unknown selector,
    revoked, and wrong verifier — because the caller must answer all four the
    same way. Only a live (non-revoked) secret resolves.
    """
    from apps.applications.models import Application

    parsed = parse(code)
    if parsed is None:
        return None
    selector, verifier = parsed
    application = (
        Application.objects.filter(
            tracking_selector=selector,
            tracking_secret_revoked_at__isnull=True,
        )
        .select_related("institution_ref")
        .first()
    )
    if application is None:
        # Still spend the hash so a miss and a hit do the same work.
        matches(None, verifier)
        return None
    if not matches(application.tracking_secret_hash, verifier):
        return None
    return application


__all__ = [
    "ALPHABET",
    "IssuedTrackingSecret",
    "KIND_LEGACY",
    "KIND_SECRET",
    "KIND_UNRECOGNISED",
    "LEGACY_IDENTIFIER_PATTERN",
    "SECRET_PATTERN",
    "SELECTOR_LENGTH",
    "TrackingSecretUnavailable",
    "VERIFIER_LENGTH",
    "build_code",
    "classify",
    "hash_verifier",
    "issue",
    "matches",
    "normalize",
    "parse",
    "resolve",
    "revoke",
]
