"""Feature: production-stability-hardening, Property 1: Intake date computation invariants"""

import calendar
from datetime import date

from hypothesis import given, settings
from hypothesis import strategies as st

from apps.catalog.intake_date_computer import ComputedIntakeDates, compute_intake_dates


@given(
    intake_month=st.sampled_from([1, 7]),
    intake_year=st.integers(min_value=2024, max_value=2100),
)
@settings(max_examples=5)
def test_intake_date_computation_invariants(intake_month: int, intake_year: int) -> None:
    """Feature: production-stability-hardening, Property 1: Intake date computation invariants

    **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.3**
    """
    result: ComputedIntakeDates = compute_intake_dates(intake_month, intake_year)

    # start_date is the 1st of the intake month/year
    expected_start = date(intake_year, intake_month, 1)
    assert result.start_date == expected_start

    # application_start_date is exactly 11 months before start_date
    app_start_month = intake_month - 11
    app_start_year = intake_year
    if app_start_month <= 0:
        app_start_month += 12
        app_start_year -= 1
    expected_app_start = date(app_start_year, app_start_month, 1)
    assert result.application_start_date == expected_app_start

    # application_deadline is exactly 2 months after start_date
    deadline_month = intake_month + 2
    deadline_year = intake_year
    if deadline_month > 12:
        deadline_month -= 12
        deadline_year += 1
    expected_deadline = date(deadline_year, deadline_month, 1)
    assert result.application_deadline == expected_deadline

    # Ordering: application_start_date < start_date < application_deadline
    assert result.application_start_date < result.start_date < result.application_deadline

    # name equals "{MonthName} {year}"
    expected_name = f"{calendar.month_name[intake_month]} {intake_year}"
    assert result.name == expected_name

    # year equals the start_date year
    assert result.year == intake_year
    assert result.year == result.start_date.year
