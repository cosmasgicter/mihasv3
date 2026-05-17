"""Payment service constants — extracted from payment_service.py.

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

# LEGACY: used by ``_update_payment_status`` prior to payment-hardening.
# Kept as-is so the pre-hardening code paths continue to work when
# ``PAYMENT_HARDENING_FORWARD_ONLY`` is disabled.
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"successful", "failed", "expired"},
    "deferred": {"pending", "successful", "failed", "expired"},
}


# Forward-only state machine (payment-hardening Task 11.2).
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
ALLOWED_TRANSITIONS: dict[tuple[str, str], set[str]] = {
    # (none) → pending / deferred / force_approved
    ("", "pending"): {"initiate"},
    ("", "deferred"): {"initiate"},
    ("", "force_approved"): {"admin_override", "super_admin_correction"},
    # pending → *
    ("pending", "successful"): {"verify", "webhook", "reconciliation", "super_admin_correction"},
    ("pending", "failed"): {"verify", "webhook", "super_admin_correction"},
    ("pending", "expired"): {"reconciliation", "super_admin_correction"},
    # deferred → *
    ("deferred", "pending"): {"initiate", "super_admin_correction"},
    ("deferred", "successful"): {"verify", "webhook", "reconciliation", "super_admin_correction"},
    ("deferred", "failed"): {"verify", "webhook", "super_admin_correction"},
    ("deferred", "expired"): {"reconciliation", "super_admin_correction"},
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


__all__ = [
    "ALLOWED_TRANSITIONS",
    "CanonicalStatus",
    "EXPIRED_EXCLUSION_DAYS",
    "MAX_PAYMENT_ATTEMPTS",
    "PAYMENT_TO_APP_MAP",
    "PROVIDER_STATUS_ACCEPTED",
    "PROVIDER_STATUS_NOT_STARTED",
    "PROVIDER_STATUS_REJECTED",
    "PROVIDER_STATUS_SENT",
    "PROVIDER_STATUS_UNKNOWN",
    "ProviderInitiationStatus",
    "TransitionSource",
    "_ALLOWED_TRANSITIONS",
    "_LENCO_STATUS_MAP",
    "_LENCO_TIMEOUT",
    "_SECURITY_RETENTION_ACTION_PREFIXES",
]
