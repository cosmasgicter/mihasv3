"""Payment service result dataclasses - extracted from payment_service.py.

Stream 9 Phase 2 of the canonical-truth program. The four frozen dataclasses
that ``PaymentService`` returns from its public methods are kept here so any
caller (admin views, tasks, tests) can import them without pulling in the
full 2.6k-line service module.

The ``payment_service.py`` module continues to re-export every symbol here
for backward compatibility with existing imports.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional
from uuid import UUID

from apps.documents.payment_constants import CanonicalStatus


@dataclass(frozen=True)
class PaymentInitiationResult:
    """Returned by ``PaymentService.initiate_payment()``."""

    payment_id: UUID | None
    reference: str
    amount: Decimal
    currency: str


@dataclass(frozen=True)
class PaymentVerificationResult:
    """Returned by ``PaymentService.verify_payment()``."""

    status: str
    amount: Decimal | None
    currency: str | None
    lenco_reference: str | None
    payment_method: str | None
    error: str | None


@dataclass(frozen=True)
class PaymentSnapshot:
    """Immutable snapshot of fee/resolution state captured at initiation.

    Persisted to ``Payment.metadata["snapshot"]`` and used by the integrity
    gate in ``PaymentService._transition()`` for successful-payment
    verification.

    Requirements: R6.2, R6.3.
    """

    expected_amount: Decimal
    currency: str
    residency_category: str
    program_code: str
    intake_id: Optional[str]
    waiver_applied: bool
    original_amount: Decimal
    fee_source: str


@dataclass(frozen=True)
class TransitionResult:
    """Result of ``PaymentService._transition()``.

    ``risk_flag`` is set to a short string (e.g. ``"amount_mismatch"``,
    ``"currency_mismatch"``, ``"missing_provider_reference"``,
    ``"invalid_amount"``) when an integrity-gate check blocked the
    transition; it is ``None`` otherwise. When blocked, ``status`` reflects
    the unchanged current payment status.
    """

    payment_id: UUID
    status: CanonicalStatus
    risk_flag: Optional[str]


__all__ = [
    "PaymentInitiationResult",
    "PaymentSnapshot",
    "PaymentVerificationResult",
    "TransitionResult",
]
