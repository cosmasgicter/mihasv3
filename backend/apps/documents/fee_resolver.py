"""Fee resolution for application payments.

Determines the correct application fee for a student based on their selected
program and residency classification (local or international).

Requirements: 6.1, 6.2, 5.7, 6.5
"""

from dataclasses import dataclass
from decimal import Decimal

from django.core.exceptions import ValidationError

from apps.catalog.models import Program
from apps.documents.models import ProgramFee

# Default currency when falling back to the program-level application_fee.
_DEFAULT_CURRENCY = 'ZMW'

# Default fallback fee when the program has no application_fee set.
_DEFAULT_APPLICATION_FEE = Decimal('150.00')


@dataclass(frozen=True)
class ResolvedFee:
    """Result of fee resolution for a program + residency combination."""

    amount: Decimal
    currency: str
    residency_category: str  # 'local' or 'international'
    source: str  # 'program_fee' or 'program_default'


class FeeResolver:
    """Resolves the application fee for a given program identifier and residency."""

    @staticmethod
    def _classify_residency(
        nationality: str | None, country: str | None
    ) -> str:
        """Return 'local' if the student is Zambian, else 'international'."""
        if nationality == 'Zambian':
            return 'local'
        if country in ('Zambia', 'ZM'):
            return 'local'
        return 'international'

    def resolve_fee(
        self,
        program_code: str,
        nationality: str | None,
        country: str | None,
    ) -> ResolvedFee:
        """Resolve the application fee for *program_code* and student residency.

        1. Determine residency: 'local' if nationality == 'Zambian' or
           country in ('Zambia', 'ZM'), else 'international'.
        2. Look up an active ``ProgramFee`` for (program.id, 'application',
           residency) via program id, name, or code.
        3. Fallback to ``program.application_fee`` with currency ZMW.

        Raises ``Program.DoesNotExist`` when *program_code* matches no active program.
        """
        try:
            program = Program.objects.get(code=program_code, is_active=True)
        except Program.DoesNotExist:
            try:
                program = Program.objects.get(id=program_code, is_active=True)
            except (Program.DoesNotExist, ValidationError, ValueError):
                program = Program.objects.get(name=program_code, is_active=True)
        residency = self._classify_residency(nationality, country)

        program_fee = (
            ProgramFee.objects.filter(
                program=program,
                fee_type='application',
                residency_category=residency,
                is_active=True,
            )
            .first()
        )

        if program_fee is not None:
            return ResolvedFee(
                amount=program_fee.amount,
                currency=program_fee.currency,
                residency_category=residency,
                source='program_fee',
            )

        # Fallback: use the program-level application_fee (defaults to 153.00).
        fallback_amount = (
            program.application_fee
            if program.application_fee is not None
            else _DEFAULT_APPLICATION_FEE
        )

        return ResolvedFee(
            amount=fallback_amount,
            currency=_DEFAULT_CURRENCY,
            residency_category=residency,
            source='program_default',
        )
