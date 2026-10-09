"""Canonical fee resolution for application payments.

Resolves the application fee for a student **only** from canonical
``FeeSchedule`` rows (the ``program_fees`` table) keyed on the canonical
program **offering** (:class:`apps.catalog.models.Program`), the fee type, and
the student's residency category. There is no hardcoded default fee and no
display-name lookup.

Spec:     ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 5.4
Requirements: **R7.4** (one active fee per offering/fee-type/residency; duplicate
              races return 409), **R7.5** (missing required fee fails closed with
              a stable configuration error surfaced on readiness),
              **R12.1-R12.2** (server-authored fee quote; missing/ambiguous
              configuration returns ``FEE_NOT_CONFIGURED`` and never substitutes
              a hardcoded amount).
Findings:  **DATA-05** (fee lookup used display names/codes + an invented
              default), **STU-08** (payment hardcoded a K150/USD20 fee).
Design:    design.md §7.1 (FeeSchedule ownership + one-active-fee invariant),
           §10.1 (Fee Quote — "There is no K150/USD20 default. Missing or
           ambiguous configuration returns ``FEE_NOT_CONFIGURED``.").

The single-active-fee guarantee is enforced at the database layer by
``uq_program_fees_one_active`` (Phase 3 task 3.3,
``backend/scripts/2026_07_17_01_integrity_constraints_expand.sql``); the write
path translates a duplicate race to a stable 409 ``DUPLICATE_ACTIVE_FEE``. This
resolver additionally fails closed with :class:`AmbiguousFeeError` if it ever
observes more than one active row, so a missing or misconfigured invariant can
never silently pick an arbitrary amount.

Framework-neutral by design (design §3: services enforce business state, views
handle transport). :class:`FeeConfigurationError` carries a stable ``code`` /
``retryable`` / ``status_code`` so the V1 and V2 payment views can translate it
to the canonical envelope without importing DRF here.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError

from apps.catalog.models import Program
from apps.documents.models import ProgramFee

# Stable, registered error codes (mirror apps.common.v2.error_codes and
# apps.documents.payment_error_codes). Named here so the framework-neutral
# service does not import the DRF exception layer.
FEE_NOT_CONFIGURED_CODE = "FEE_NOT_CONFIGURED"
FEE_AMBIGUOUS_CODE = "FEE_AMBIGUOUS"

_FEE_NOT_CONFIGURED_MESSAGE = (
    "The application fee is not configured for this option."
)
_FEE_AMBIGUOUS_MESSAGE = (
    "More than one active application fee is configured for this option."
)


class FeeConfigurationError(Exception):
    """The canonical fee could not be resolved (fail closed).

    Raised when an active offering lacks a required, uniquely-resolvable
    ``FeeSchedule`` row. This is a configuration-integrity failure, NOT a
    transient outage: the resolver **never** falls back to a hardcoded default
    amount (DATA-05, STU-08). Callers translate it to the stable non-retryable
    422 ``FEE_NOT_CONFIGURED`` envelope (design §10.1, R12.2). It must never be
    swallowed into an invented fee.

    It is deliberately a plain ``Exception`` (not a DRF ``APIException``) so the
    resolver stays transport-agnostic.
    """

    code = FEE_NOT_CONFIGURED_CODE
    retryable = False
    status_code = 422

    def __init__(self, message: str | None = None):
        super().__init__(message or _FEE_NOT_CONFIGURED_MESSAGE)
        self.message = str(self)


class AmbiguousFeeError(FeeConfigurationError):
    """More than one active fee resolved for the same offering/type/residency.

    Structurally prevented by the ``uq_program_fees_one_active`` DB invariant
    (task 3.3); surfaced here as a stable 409 so a missing/disabled constraint
    fails closed instead of arbitrarily picking a row.
    """

    code = FEE_AMBIGUOUS_CODE
    status_code = 409

    def __init__(self, message: str | None = None):
        super().__init__(message or _FEE_AMBIGUOUS_MESSAGE)


@dataclass(frozen=True)
class ResolvedFee:
    """Result of fee resolution for an offering + residency combination."""

    amount: Decimal
    currency: str
    residency_category: str  # 'local' or 'international'
    source: str  # always 'program_fee' — the only canonical source


@dataclass(frozen=True)
class PaymentSnapshot:
    """Immutable fee snapshot captured onto a Payment at initiation time.

    Consumed by ``payment_helpers._build_snapshot_dict`` and the
    ``payment_snapshot_backfill`` script. Carries the canonical
    ``configuration_version`` (task 5.2 assignment snapshot) so a later quote or
    reconciliation can detect fee drift.
    """

    expected_amount: Decimal
    currency: str
    residency_category: str
    program_code: str | None
    intake_id: str | None
    waiver_applied: bool
    original_amount: Decimal
    fee_source: str
    configuration_version: str | None = None


class FeeResolver:
    """Resolves the application fee from canonical ``FeeSchedule`` rows only."""

    @staticmethod
    def _classify_residency(
        nationality: str | None, country: str | None
    ) -> str:
        """Return 'local' if the student is Zambian, else 'international'."""
        if nationality and nationality.lower() == "zambian":
            return "local"
        if country and country.upper() in ("ZAMBIA", "ZM"):
            return "local"
        return "international"

    @staticmethod
    def _lookup_active_fee(
        program: Program, fee_type: str, residency: str
    ) -> ProgramFee:
        """Return the single active ``ProgramFee`` for the offering/type/residency.

        Fails closed: zero rows raise :class:`FeeConfigurationError`
        (``FEE_NOT_CONFIGURED``); more than one active row raises
        :class:`AmbiguousFeeError` (``FEE_AMBIGUOUS``). Never returns a default.
        """
        qs = ProgramFee.objects.filter(
            program=program,
            fee_type=fee_type,
            residency_category=residency,
            is_active=True,
        )
        active_count = qs.count()
        if active_count == 0:
            raise FeeConfigurationError(
                f"No active {fee_type} fee is configured for offering "
                f"{getattr(program, 'id', program)} ({residency})."
            )
        if active_count > 1:
            raise AmbiguousFeeError(
                f"{active_count} active {fee_type} fees are configured for "
                f"offering {getattr(program, 'id', program)} ({residency})."
            )
        return qs.first()

    def resolve_for_offering(
        self,
        offering: Program,
        nationality: str | None,
        country: str | None,
        fee_type: str = "application",
    ) -> ResolvedFee:
        """Resolve the fee for a canonical *offering* (a :class:`Program`).

        This is the canonical entry point: the offering is a canonical ID, never
        a display string. Residency is derived server-side. Fails closed when no
        unique active fee exists.
        """
        residency = self._classify_residency(nationality, country)
        program_fee = self._lookup_active_fee(offering, fee_type, residency)
        return ResolvedFee(
            amount=program_fee.amount,
            currency=program_fee.currency,
            residency_category=residency,
            source="program_fee",
        )

    def resolve_fee(
        self,
        program_code: str,
        nationality: str | None,
        country: str | None,
        fee_type: str = "application",
    ) -> ResolvedFee:
        """Resolve the application fee for *program_code* and student residency.

        The offering is looked up by canonical ``code`` or ``id`` **only** — the
        legacy display-**name** lookup is removed (DATA-05, R7.1). The fee is
        then resolved from the canonical ``FeeSchedule`` for
        (offering, fee_type, residency). There is **no** program-level default
        and **no** hardcoded fallback amount (STU-08); a missing fee fails closed
        with :class:`FeeConfigurationError`.

        Raises :class:`Program.DoesNotExist` when *program_code* matches no
        active offering by code or id.
        """
        try:
            program = Program.objects.get(code=program_code, is_active=True)
        except Program.DoesNotExist:
            # Canonical id fallback only — never a display-name lookup.
            try:
                program = Program.objects.get(id=program_code, is_active=True)
            except (Program.DoesNotExist, ValidationError, ValueError):
                raise Program.DoesNotExist(
                    f"No active offering matches identifier {program_code!r}."
                )
        return self.resolve_for_offering(
            program, nationality, country, fee_type=fee_type
        )

    def resolve_for_application(
        self, application: Any, fee_type: str = "application"
    ) -> tuple[Program, ResolvedFee]:
        """Resolve ``(offering, ResolvedFee)`` for an *application*.

        Uses the application's canonical ``program_offering`` binding (task 5.2
        assignment snapshot) as the sole offering authority. Legacy rows without
        a canonical offering fall back to resolving the offering from the
        immutable display snapshot via :class:`IdentifierResolver`, but the fee
        itself is **always** resolved from the canonical ``FeeSchedule`` and
        fails closed (never an invented default).
        """
        offering = getattr(application, "program_offering", None)
        if offering is None:
            # Legacy bridge for rows created before the canonical assignment
            # snapshot existed. This resolves the offering, not the fee; the fee
            # still comes only from the canonical FeeSchedule below.
            from apps.applications.identifier_resolver import IdentifierResolver

            resolved_program = IdentifierResolver.resolve_program(
                application.program
            )
            if resolved_program.source == "not_found":
                raise FeeConfigurationError(
                    "No active offering is bound to this application."
                )
            offering = Program.objects.get(id=resolved_program.id)

        resolved = self.resolve_for_offering(
            offering,
            getattr(application, "nationality", None),
            getattr(application, "country", None),
            fee_type=fee_type,
        )
        return offering, resolved

    def resolve_for_payment_snapshot(
        self, application: Any, fee_type: str = "application"
    ) -> tuple[ResolvedFee, PaymentSnapshot]:
        """Resolve the canonical fee and build the immutable payment snapshot.

        Applies any active fee waiver to compute the effective (expected) amount
        and captures the canonical ``configuration_version`` so drift can be
        detected later. Fails closed via :class:`FeeConfigurationError` when no
        unique active fee exists — the caller must not fall back to a default.
        """
        offering, resolved = self.resolve_for_application(
            application, fee_type=fee_type
        )

        effective_amount = resolved.amount
        try:
            from apps.documents.fee_waiver_service import FeeWaiverService

            effective_amount = FeeWaiverService.get_effective_fee(
                str(application.id), resolved.amount
            )
        except FeeConfigurationError:
            raise
        except Exception:  # waiver lookup must not invent a fee — keep full fee
            import logging

            logging.getLogger(__name__).warning(
                "Fee waiver check failed for application %s; using full fee",
                getattr(application, "id", None),
                exc_info=True,
            )

        snapshot = PaymentSnapshot(
            expected_amount=effective_amount,
            currency=resolved.currency,
            residency_category=resolved.residency_category,
            program_code=getattr(offering, "code", None),
            intake_id=str(getattr(application, "intake_ref_id", "") or "") or None,
            waiver_applied=str(effective_amount) != str(resolved.amount),
            original_amount=resolved.amount,
            fee_source=resolved.source,
            configuration_version=getattr(
                application, "configuration_version", None
            ),
        )
        return resolved, snapshot
