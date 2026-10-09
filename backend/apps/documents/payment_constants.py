"""Payment service constants - extracted from payment_service.py.

Stream 9 Phase 2 of the canonical-truth program. All constants used by
``PaymentService`` are kept here so the main service file shrinks and other
modules (admin views, reconciliation tasks, audit code) can import the same
canonical values without a circular dependency.

The ``payment_service.py`` module continues to re-export every symbol here
for backward compatibility with existing imports.
"""

from __future__ import annotations

from typing import Literal


# ---------------------------------------------------------------------------
# Canonical type aliases
# ---------------------------------------------------------------------------

CanonicalStatus = Literal[
    "pending",
    "deferred",
    "successful",
    "failed",
    "expired",
    "force_approved",
]

ProviderInitiationStatus = Literal[
    "not_started",
    "sent",
    "accepted",
    "rejected",
    "unknown",
]

TransitionSource = Literal[
    "initiate",
    "verify",
    "webhook",
    "admin_override",
    "reconciliation",
    "super_admin_correction",
]


# ---------------------------------------------------------------------------
# Allowed forward-only transitions
# ---------------------------------------------------------------------------

# The payment state machine. One matrix, forward-only, no alternative.
#
# Mirrors the "State Machine (Formal)" table in
# ``.kiro/specs/payment-hardening/design.md``. Keys are
# ``(from_status, target_status)`` and values are the set of sources allowed
# to perform that transition. ``from_status=""`` represents creation (no
# prior row). ``super_admin_correction`` is permitted for any from→to pair
# when the caller supplies a reason ≥ 10 chars (enforced at the service
# layer, not here). Listing every pair here would be noisy, so
# ``PaymentService._transition()`` allows ``source == "super_admin_correction"``
# when the tuple is not in ``ALLOWED_TRANSITIONS`` (terminal → anything).
#
# admissions-v2 task 8.2: the pre-hardening ``_ALLOWED_TRANSITIONS`` map (a
# second, narrower matrix used by the deleted ``_update_payment_status``) is
# gone. This is the only transition authority.
ALLOWED_TRANSITIONS: dict[tuple[str, str], set[str]] = {
    # (none) → pending / deferred / force_approved
    ("", "pending"): {"initiate"},
    ("", "deferred"): {"initiate"},
    ("", "force_approved"): {"admin_override", "super_admin_correction"},
    # pending → *
    ("pending", "successful"): {"verify", "webhook", "reconciliation", "super_admin_correction"},
    ("pending", "failed"): {"verify", "webhook", "super_admin_correction"},
    ("pending", "expired"): {"reconciliation", "super_admin_correction"},
    ("pending", "deferred"): {"initiate", "super_admin_correction"},
    # deferred → *
    ("deferred", "pending"): {"initiate", "super_admin_correction"},
    ("deferred", "successful"): {"verify", "webhook", "reconciliation", "super_admin_correction"},
    ("deferred", "failed"): {"verify", "webhook", "super_admin_correction"},
    ("deferred", "expired"): {"reconciliation", "super_admin_correction"},
    # Provider truth can arrive out of order: a provisional failure webhook
    # may be followed by a later integrity-clean success from the gateway.
    ("failed", "successful"): {"webhook", "super_admin_correction"},
    # Admin override onto a live row.
    ("pending", "force_approved"): {"admin_override", "super_admin_correction"},
    ("deferred", "force_approved"): {"admin_override", "super_admin_correction"},
}


# ---------------------------------------------------------------------------
# Application-status derivation map
# ---------------------------------------------------------------------------

# ADR-1: ``applications.payment_status`` is a derived summary of the
# canonical Payment state. The mapping below is the single source of truth
# for the derived value and MUST be kept in sync with the ADR.
PAYMENT_TO_APP_MAP: dict[str, str] = {
    "successful": "verified",
    "force_approved": "verified",
    "failed": "failed",
    "expired": "not_paid",
    "deferred": "deferred",
    "pending": "pending_review",
}


# Precedence used to project *all* of an application's payments onto the single
# ``applications.payment_status`` summary (admissions-v2 task 8.2, R12.5/R15.9).
#
# Mapping one payment's status is not enough: an application can hold several
# payment rows over its life (an expired attempt, a retry, an admin override),
# and whichever row moved last is not necessarily the row that says what the
# student owes. Deriving from the whole ledger with a fixed precedence makes the
# projection converge — replaying a callback, re-running the reconciliation
# sweep, or processing events out of order all land on the same answer instead of
# flapping the summary.
#
# Highest precedence first. Legacy DB values (``verified``, ``paid``) sit with
# their canonical equivalents so pre-hardening rows project identically.
APP_PAYMENT_STATUS_PRECEDENCE: tuple[tuple[str, frozenset[str]], ...] = (
    # Money has arrived, or the platform has accepted it as arrived.
    ("verified", frozenset({"successful", "force_approved", "verified", "paid"})),
    # The student was allowed to submit and pay later.
    ("deferred", frozenset({"deferred"})),
    # An attempt is in flight with the provider.
    ("pending_review", frozenset({"pending"})),
    # Every attempt ended badly; the most recent failure is what to show.
    ("failed", frozenset({"failed"})),
    # Attempts only ever timed out — the student still owes the fee.
    ("not_paid", frozenset({"expired"})),
)


def derive_application_payment_status(payment_statuses) -> str | None:
    """Project a set of Payment statuses onto the application summary.

    Pure function. Returns ``None`` when no status maps — that is, when the
    application has no payment rows at all (or only rows with statuses this
    platform does not recognise), in which case the caller must leave the
    existing summary alone rather than invent one.
    """
    present = {str(status or "").strip().lower() for status in payment_statuses}
    present.discard("")
    for app_status, ledger_statuses in APP_PAYMENT_STATUS_PRECEDENCE:
        if present & ledger_statuses:
            return app_status
    return None


# ---------------------------------------------------------------------------
# Audit retention policy
# ---------------------------------------------------------------------------

# Audit action prefixes that should be retained for the longer security
# retention window (365 days). Everything else defaults to "standard".
_SECURITY_RETENTION_ACTION_PREFIXES: tuple[str, ...] = (
    "payment.force_approved",
    "payment.super_admin_corrected",
    "payment.dev_bypass_used",
    "payment.rate_limited",
)


# ---------------------------------------------------------------------------
# Retry / expiry limits
# ---------------------------------------------------------------------------

# Maximum payment attempts per application (Req 8.4).
MAX_PAYMENT_ATTEMPTS = 5

# Expired payments older than this are excluded from attempt count (Req 8.5).
EXPIRED_EXCLUSION_DAYS = 7


# ---------------------------------------------------------------------------
# Lenco provider mapping
# ---------------------------------------------------------------------------

# Lenco API status → internal status mapping.
_LENCO_STATUS_MAP: dict[str, str] = {
    "successful": "successful",
    "paid": "successful",
    "failed": "failed",
    "pending": "pending",
    "pay-offline": "pending",
    "otp-required": "pending",
}

# Lenco API timeout in seconds.
_LENCO_TIMEOUT = 15


# ---------------------------------------------------------------------------
# Provider initiation status string constants
# ---------------------------------------------------------------------------

PROVIDER_STATUS_NOT_STARTED = "not_started"
PROVIDER_STATUS_SENT = "sent"
PROVIDER_STATUS_ACCEPTED = "accepted"
PROVIDER_STATUS_REJECTED = "rejected"
PROVIDER_STATUS_UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# Derived payment-status tuples (canonical source of truth)
# ---------------------------------------------------------------------------

# Full set of statuses meaning "payment resolved" for approval/submission
# gates. Includes legacy DB values (verified, paid) and current canonical
# values (successful, force_approved) plus deferred.
RESOLVED_PAYMENT_STATUSES: tuple[str, ...] = (
    "successful", "force_approved", "verified", "paid", "deferred",
)

# Statuses meaning "already paid" (no deferred). Used for early-return
# guards that prevent duplicate payment initiation. Includes legacy values.
COMPLETED_PAYMENT_STATUSES: tuple[str, ...] = (
    "successful", "force_approved", "verified", "paid",
)

# Only canonical terminal-success statuses eligible for receipt generation.
RECEIPT_ELIGIBLE_STATUSES: tuple[str, ...] = (
    "successful", "force_approved",
)


__all__ = [
    "ALLOWED_TRANSITIONS",
    "APP_PAYMENT_STATUS_PRECEDENCE",
    "CanonicalStatus",
    "derive_application_payment_status",
    "COMPLETED_PAYMENT_STATUSES",
    "EXPIRED_EXCLUSION_DAYS",
    "MAX_PAYMENT_ATTEMPTS",
    "PAYMENT_TO_APP_MAP",
    "PROVIDER_STATUS_ACCEPTED",
    "PROVIDER_STATUS_NOT_STARTED",
    "PROVIDER_STATUS_REJECTED",
    "PROVIDER_STATUS_SENT",
    "PROVIDER_STATUS_UNKNOWN",
    "ProviderInitiationStatus",
    "RECEIPT_ELIGIBLE_STATUSES",
    "RESOLVED_PAYMENT_STATUSES",
    "TransitionSource",
    "_LENCO_STATUS_MAP",
    "_LENCO_TIMEOUT",
    "_SECURITY_RETENTION_ACTION_PREFIXES",
]
