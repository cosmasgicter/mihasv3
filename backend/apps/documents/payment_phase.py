"""Payment phase — what is actually happening to a payment right now.

admissions-v2 task 8.2 (R12.4, R12.6), finding STU-09.

``payments.status`` answers "has the money arrived?". It deliberately does not
answer "who are we waiting for?", and those are different questions with
different consequences:

* A ``pending`` payment where Lenco has accepted the collection request is
  waiting on **the student** — they have a prompt on their handset and must enter
  their mobile-money PIN. The right UI is an instruction and a resend, and the
  right timeout is short, because a prompt the student never saw is worth
  re-sending in a couple of minutes.
* A ``pending`` payment where we have handed the request to the provider and have
  no confirmation it reached anyone is waiting on **Lenco**. The right UI is a
  "we're confirming with your provider" state with no action to take, and the
  right timeout is long, because nagging the student cannot help and a second
  collection request could double-charge them.

Conflating the two is finding STU-09: the student is either told to do something
they cannot do, or told to wait when they are the one holding the queue.

This module is the single derivation. It is pure, so the same inputs always yield
the same phase, and both the API and the UI read the same answer.
"""

from __future__ import annotations

from typing import Literal

PaymentPhase = Literal[
    # No provider interaction has been attempted for this payment yet.
    "not_started",
    # The student must do something on their device (PIN, approve prompt).
    "action_required",
    # The platform is waiting on the provider; the student can do nothing.
    "provider_processing",
    # Money has arrived, or the platform has accepted it as arrived.
    "paid",
    # The attempt failed and a new attempt is allowed.
    "failed_retryable",
    # The attempt timed out; the fee is still owed.
    "expired",
    # The student chose to pay later.
    "deferred",
]

# ``metadata.provider_initiation.status`` values, as classified by
# ``payment_helpers._classify_mobile_money_response``.
PROVIDER_ACCEPTED = "accepted"
PROVIDER_SENT = "sent"
PROVIDER_REJECTED = "rejected"
PROVIDER_UNKNOWN = "unknown"
PROVIDER_NOT_STARTED = "not_started"

# How long a phase may sit before the UI should offer a way out. These are UI
# timeouts, not payment timeouts: a payment's real expiry is 24 h and is enforced
# by the reconciliation sweep, never by a browser.
#
# ``action_required`` is short because the student is the bottleneck and a lost
# prompt is cheap to resend. ``provider_processing`` is long because the student
# cannot help and a premature "try again" is how people get charged twice.
PHASE_UI_TIMEOUT_SECONDS: dict[str, int] = {
    "action_required": 120,
    "provider_processing": 600,
}

_PAID_STATUSES = frozenset({"successful", "force_approved", "verified", "paid"})


def derive_payment_phase(
    status: str | None, provider_initiation: dict | None = None
) -> PaymentPhase:
    """Derive the phase of one payment from its status and provider state.

    ``provider_initiation`` is ``payments.metadata['provider_initiation']`` (or
    ``None``). Only its ``status`` key is read; no PII is involved.
    """
    normalized = str(status or "").strip().lower()

    if normalized in _PAID_STATUSES:
        return "paid"
    if normalized == "failed":
        return "failed_retryable"
    if normalized == "expired":
        return "expired"
    if normalized == "deferred":
        return "deferred"

    if normalized != "pending":
        # Unknown/blank status: claim nothing about who is being waited on.
        return "not_started"

    provider_status = str(
        (provider_initiation or {}).get("status") or PROVIDER_NOT_STARTED
    ).strip().lower()

    if provider_status == PROVIDER_ACCEPTED:
        # Lenco took the collection request, so the customer prompt is out.
        return "action_required"
    if provider_status in (PROVIDER_SENT, PROVIDER_UNKNOWN):
        # We sent it but have no confirmation the customer was prompted, or the
        # provider errored in a way that leaves the request's fate unknown.
        # Either way the student has nothing to act on yet.
        return "provider_processing"
    if provider_status == PROVIDER_REJECTED:
        # The provider refused the request outright. The payment row is still
        # ``pending`` (no money moved), and a retry is the way forward.
        return "failed_retryable"

    # ``not_started``: a pending row with no provider call yet — a card-widget
    # payment before the widget completes, or a freshly initiated row.
    return "not_started"


def phase_ui_timeout_seconds(phase: str) -> int | None:
    """UI wait budget for a phase, or ``None`` when waiting is not the state."""
    return PHASE_UI_TIMEOUT_SECONDS.get(phase)


__all__ = [
    "PHASE_UI_TIMEOUT_SECONDS",
    "PaymentPhase",
    "derive_payment_phase",
    "phase_ui_timeout_seconds",
]
