"""Property-based tests for program fee coverage.

# Feature: pre-launch-audit, Property 8: Program fee coverage

For any active program (where is_active = true), the program_fees table
should contain at least one row with residency_category = 'local' and
fee_type = 'application', and at least one row with
residency_category = 'international' and fee_type = 'application'.

This test validates the FEE COVERAGE CHECKING LOGIC — it does NOT require
a live database connection.

**Validates: Requirements 2.6**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from dataclasses import dataclass  # noqa: E402
from decimal import Decimal  # noqa: E402

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import assume, given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

REQUIRED_RESIDENCY_CATEGORIES = ("local", "international")
REQUIRED_FEE_TYPE = "application"


@dataclass(frozen=True)
class ProgramConfig:
    """A simplified program record."""

    program_id: str
    code: str
    is_active: bool


@dataclass(frozen=True)
class FeeEntry:
    """A program fee row."""

    program_id: str
    fee_type: str
    residency_category: str
    amount: Decimal
    is_active: bool


# ---------------------------------------------------------------------------
# Fee coverage checking logic (pure, no DB)
# ---------------------------------------------------------------------------


def check_fee_coverage(
    program: ProgramConfig,
    fees: list[FeeEntry],
) -> dict[str, bool]:
    """Check if a program has both local and international application fees.

    Returns a dict mapping residency_category → whether a matching active
    fee exists.
    """
    coverage: dict[str, bool] = {}
    for residency in REQUIRED_RESIDENCY_CATEGORIES:
        has_fee = any(
            f.program_id == program.program_id
            and f.fee_type == REQUIRED_FEE_TYPE
            and f.residency_category == residency
            and f.is_active
            for f in fees
        )
        coverage[residency] = has_fee
    return coverage


def is_fully_covered(coverage: dict[str, bool]) -> bool:
    """Return True if both local and international fees are present."""
    return all(coverage.get(r, False) for r in REQUIRED_RESIDENCY_CATEGORIES)


def find_uncovered_programs(
    programs: list[ProgramConfig],
    fees: list[FeeEntry],
) -> list[tuple[ProgramConfig, list[str]]]:
    """Return active programs missing one or both residency fee entries.

    Each result is (program, list_of_missing_residency_categories).
    """
    uncovered = []
    for program in programs:
        if not program.is_active:
            continue
        coverage = check_fee_coverage(program, fees)
        missing = [r for r in REQUIRED_RESIDENCY_CATEGORIES if not coverage[r]]
        if missing:
            uncovered.append((program, missing))
    return uncovered


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

program_id_st = st.sampled_from(["P001", "P002", "P003", "P004", "P005"])

decimal_amount_st = st.decimals(
    min_value=Decimal("1.00"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


def active_program_st() -> st.SearchStrategy[ProgramConfig]:
    return st.builds(
        ProgramConfig,
        program_id=program_id_st,
        code=program_id_st,
        is_active=st.just(True),
    )


def fee_entry_st(
    program_id: st.SearchStrategy[str] | None = None,
) -> st.SearchStrategy[FeeEntry]:
    pid = program_id or program_id_st
    return st.builds(
        FeeEntry,
        program_id=pid,
        fee_type=st.sampled_from(["application", "tuition"]),
        residency_category=st.sampled_from(REQUIRED_RESIDENCY_CATEGORIES),
        amount=decimal_amount_st,
        is_active=st.booleans(),
    )


def full_coverage_fees_st(
    program_id: str,
) -> st.SearchStrategy[list[FeeEntry]]:
    """Generate a fee list that fully covers a program (both residencies)."""
    return st.tuples(decimal_amount_st, decimal_amount_st).map(
        lambda amounts: [
            FeeEntry(program_id, "application", "local", amounts[0], True),
            FeeEntry(program_id, "application", "international", amounts[1], True),
        ]
    )


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestProgramFeeCoverage(SimpleTestCase):
    """Property 8: Program fee coverage.

    For any active program, program_fees should contain both local and
    international rows with fee_type='application'.

    **Validates: Requirements 2.6**
    """

    # ------------------------------------------------------------------
    # Property: fully covered program passes check
    # ------------------------------------------------------------------

    @given(
        program=active_program_st(),
        data=st.data(),
    )
    @settings(max_examples=200)
    def test_fully_covered_program_passes(
        self, program: ProgramConfig, data: st.DataObject
    ):
        """For any active program with both local and international
        application fees, is_fully_covered should return True."""
        fees = data.draw(full_coverage_fees_st(program.program_id))
        coverage = check_fee_coverage(program, fees)
        self.assertTrue(
            is_fully_covered(coverage),
            f"Program {program.program_id} with both fees should be fully covered. "
            f"Coverage: {coverage}",
        )

    # ------------------------------------------------------------------
    # Property: missing local fee is detected
    # ------------------------------------------------------------------

    @given(
        program=active_program_st(),
        amount=decimal_amount_st,
    )
    @settings(max_examples=200)
    def test_missing_local_fee_detected(
        self, program: ProgramConfig, amount: Decimal
    ):
        """When only international fee exists, coverage should show local
        as missing."""
        fees = [
            FeeEntry(program.program_id, "application", "international", amount, True),
        ]
        coverage = check_fee_coverage(program, fees)
        self.assertFalse(coverage["local"])
        self.assertTrue(coverage["international"])
        self.assertFalse(is_fully_covered(coverage))

    # ------------------------------------------------------------------
    # Property: missing international fee is detected
    # ------------------------------------------------------------------

    @given(
        program=active_program_st(),
        amount=decimal_amount_st,
    )
    @settings(max_examples=200)
    def test_missing_international_fee_detected(
        self, program: ProgramConfig, amount: Decimal
    ):
        """When only local fee exists, coverage should show international
        as missing."""
        fees = [
            FeeEntry(program.program_id, "application", "local", amount, True),
        ]
        coverage = check_fee_coverage(program, fees)
        self.assertTrue(coverage["local"])
        self.assertFalse(coverage["international"])
        self.assertFalse(is_fully_covered(coverage))

    # ------------------------------------------------------------------
    # Property: inactive fees don't count toward coverage
    # ------------------------------------------------------------------

    @given(
        program=active_program_st(),
        amount_local=decimal_amount_st,
        amount_intl=decimal_amount_st,
    )
    @settings(max_examples=100)
    def test_inactive_fees_dont_count(
        self,
        program: ProgramConfig,
        amount_local: Decimal,
        amount_intl: Decimal,
    ):
        """Inactive fee entries should not satisfy the coverage requirement."""
        fees = [
            FeeEntry(program.program_id, "application", "local", amount_local, False),
            FeeEntry(program.program_id, "application", "international", amount_intl, False),
        ]
        coverage = check_fee_coverage(program, fees)
        self.assertFalse(is_fully_covered(coverage))

    # ------------------------------------------------------------------
    # Property: find_uncovered_programs returns correct results
    # ------------------------------------------------------------------

    @given(data=st.data())
    @settings(max_examples=100)
    def test_find_uncovered_programs_correctness(self, data: st.DataObject):
        """find_uncovered_programs should return exactly the active programs
        that are missing one or both residency fees."""
        # Create a mix of covered and uncovered programs
        programs = [
            ProgramConfig("P001", "P001", True),
            ProgramConfig("P002", "P002", True),
            ProgramConfig("P003", "P003", False),  # inactive — should be skipped
        ]

        # P001 gets full coverage
        fees_p1 = data.draw(full_coverage_fees_st("P001"))
        # P002 gets only local
        amount_p2 = data.draw(decimal_amount_st)
        fees_p2 = [FeeEntry("P002", "application", "local", amount_p2, True)]

        all_fees = fees_p1 + fees_p2

        uncovered = find_uncovered_programs(programs, all_fees)

        # P001 should not be in uncovered
        uncovered_ids = {p.program_id for p, _ in uncovered}
        self.assertNotIn("P001", uncovered_ids)

        # P002 should be in uncovered with 'international' missing
        self.assertIn("P002", uncovered_ids)
        for prog, missing in uncovered:
            if prog.program_id == "P002":
                self.assertIn("international", missing)

        # P003 (inactive) should not appear
        self.assertNotIn("P003", uncovered_ids)

    # ------------------------------------------------------------------
    # Property: tuition fees don't satisfy application fee requirement
    # ------------------------------------------------------------------

    @given(
        program=active_program_st(),
        amount_local=decimal_amount_st,
        amount_intl=decimal_amount_st,
    )
    @settings(max_examples=100)
    def test_tuition_fees_dont_satisfy_application_requirement(
        self,
        program: ProgramConfig,
        amount_local: Decimal,
        amount_intl: Decimal,
    ):
        """Tuition fee entries should not satisfy the application fee
        coverage requirement."""
        fees = [
            FeeEntry(program.program_id, "tuition", "local", amount_local, True),
            FeeEntry(program.program_id, "tuition", "international", amount_intl, True),
        ]
        coverage = check_fee_coverage(program, fees)
        self.assertFalse(is_fully_covered(coverage))

    # ------------------------------------------------------------------
    # Structural: empty fee table means no coverage
    # ------------------------------------------------------------------

    def test_empty_fee_table_means_no_coverage(self):
        """With no fees at all, no program should be covered."""
        program = ProgramConfig("P001", "P001", True)
        coverage = check_fee_coverage(program, [])
        self.assertFalse(coverage["local"])
        self.assertFalse(coverage["international"])
        self.assertFalse(is_fully_covered(coverage))

    def test_inactive_program_is_skipped(self):
        """Inactive programs should not appear in uncovered list."""
        programs = [ProgramConfig("P001", "P001", False)]
        uncovered = find_uncovered_programs(programs, [])
        self.assertEqual(len(uncovered), 0)
