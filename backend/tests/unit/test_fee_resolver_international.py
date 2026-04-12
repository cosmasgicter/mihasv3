"""Verify FeeResolver returns K306 for international residency.

Task 2.2: After seeding international program_fees rows (task 2.1),
the FeeResolver must return amount=306.00, currency='ZMW',
residency_category='international', source='program_fee' for each
of the 4 programs when the student is non-Zambian.

**Validates: Requirements 2.2**
"""

import os
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402

from apps.documents.fee_resolver import FeeResolver, ResolvedFee  # noqa: E402

# The 4 program codes used in the system
PROGRAM_CODES = ["PRG-CS", "PRG-BA", "PRG-NUR", "PRG-EDU"]

# International fee amount seeded in task 2.1
INTERNATIONAL_FEE = Decimal("306.00")
CURRENCY = "ZMW"


def _make_mock_program(code: str) -> MagicMock:
    """Create a mock Program with the given code."""
    prog = MagicMock()
    prog.id = uuid.uuid4()
    prog.code = code
    prog.application_fee = Decimal("153.00")
    prog.is_active = True
    return prog


def _make_mock_international_fee() -> MagicMock:
    """Create a mock ProgramFee representing the seeded international row."""
    fee = MagicMock()
    fee.amount = INTERNATIONAL_FEE
    fee.currency = CURRENCY
    fee.residency_category = "international"
    fee.fee_type = "application"
    fee.is_active = True
    return fee


class TestFeeResolverInternational(SimpleTestCase):
    """FeeResolver returns K306 for international students across all programs.

    **Validates: Requirements 2.2**
    """

    def _resolve_international(self, program_code: str) -> ResolvedFee:
        """Helper: resolve fee for a non-Zambian student on the given program."""
        mock_program = _make_mock_program(program_code)
        mock_fee = _make_mock_international_fee()

        with (
            patch("apps.documents.fee_resolver.Program.objects") as mock_prog_qs,
            patch("apps.documents.fee_resolver.ProgramFee.objects") as mock_fee_qs,
        ):
            mock_prog_qs.get.return_value = mock_program
            mock_fee_qs.filter.return_value.first.return_value = mock_fee

            resolver = FeeResolver()
            result = resolver.resolve_fee(
                program_code=program_code,
                nationality="Kenyan",
                country="Kenya",
            )

            # Verify the filter targeted international residency
            mock_fee_qs.filter.assert_called_once_with(
                program=mock_program,
                fee_type="application",
                residency_category="international",
                is_active=True,
            )

        return result

    def test_international_fee_prg_cs(self):
        """PRG-CS returns K306 for international student."""
        result = self._resolve_international("PRG-CS")
        self.assertEqual(result.amount, INTERNATIONAL_FEE)
        self.assertEqual(result.currency, CURRENCY)
        self.assertEqual(result.residency_category, "international")
        self.assertEqual(result.source, "program_fee")

    def test_international_fee_prg_ba(self):
        """PRG-BA returns K306 for international student."""
        result = self._resolve_international("PRG-BA")
        self.assertEqual(result.amount, INTERNATIONAL_FEE)
        self.assertEqual(result.currency, CURRENCY)
        self.assertEqual(result.residency_category, "international")
        self.assertEqual(result.source, "program_fee")

    def test_international_fee_prg_nur(self):
        """PRG-NUR returns K306 for international student."""
        result = self._resolve_international("PRG-NUR")
        self.assertEqual(result.amount, INTERNATIONAL_FEE)
        self.assertEqual(result.currency, CURRENCY)
        self.assertEqual(result.residency_category, "international")
        self.assertEqual(result.source, "program_fee")

    def test_international_fee_prg_edu(self):
        """PRG-EDU returns K306 for international student."""
        result = self._resolve_international("PRG-EDU")
        self.assertEqual(result.amount, INTERNATIONAL_FEE)
        self.assertEqual(result.currency, CURRENCY)
        self.assertEqual(result.residency_category, "international")
        self.assertEqual(result.source, "program_fee")

    def test_residency_classified_as_international(self):
        """Non-Zambian nationality + non-Zambia country → international."""
        result = FeeResolver._classify_residency("Kenyan", "Kenya")
        self.assertEqual(result, "international")

    def test_none_nationality_is_international(self):
        """None nationality + non-Zambia country → international."""
        result = FeeResolver._classify_residency(None, "Kenya")
        self.assertEqual(result, "international")

    def test_international_fee_not_fallback(self):
        """When international ProgramFee exists, source is 'program_fee' not 'program_default'."""
        result = self._resolve_international("PRG-CS")
        self.assertNotEqual(result.source, "program_default")
        self.assertEqual(result.source, "program_fee")
