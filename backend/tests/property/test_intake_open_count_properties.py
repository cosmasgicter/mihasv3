"""Feature: production-stability-hardening, Property 2: Always 2 open intakes"""

from dataclasses import dataclass
from datetime import date
from typing import Optional

from hypothesis import given, settings
from hypothesis import strategies as st

from apps.catalog.intake_date_computer import (
    ComputedIntakeDates,
    compute_intake_dates,
    ensure_minimum_open_intakes,
)


@dataclass
class MockIntake:
    """Lightweight stand-in for a DB Intake row."""

    name: str
    year: int
    application_start_date: Optional[date] = None
    application_deadline: Optional[date] = None


def _computed_to_mock(c: ComputedIntakeDates) -> MockIntake:
    return MockIntake(
        name=c.name,
        year=c.year,
        application_start_date=c.application_start_date,
        application_deadline=c.application_deadline,
    )


def _is_open(intake: MockIntake, today: date) -> bool:
    if intake.application_start_date is None or intake.application_deadline is None:
        return False
    return intake.application_start_date <= today <= intake.application_deadline


# Strategy: generate a list of realistic existing intakes from valid Jan/Jul months
_intake_spec = st.tuples(
    st.sampled_from([1, 7]),
    st.integers(min_value=2024, max_value=2100),
)


@st.composite
def existing_intakes_strategy(draw: st.DrawFn):
    """Generate a list of 0-6 mock intakes built from valid Jan/Jul specs."""
    specs = draw(st.lists(_intake_spec, min_size=0, max_size=6))
    # Deduplicate by (month, year) to avoid identical intakes
    seen: set[tuple[int, int]] = set()
    mocks: list[MockIntake] = []
    for month, year in specs:
        if (month, year) not in seen:
            seen.add((month, year))
            computed = compute_intake_dates(month, year)
            mocks.append(_computed_to_mock(computed))
    return mocks


@given(
    today=st.dates(min_value=date(2024, 1, 1), max_value=date(2100, 12, 31)),
    existing=existing_intakes_strategy(),
)
@settings(max_examples=5)
def test_always_two_open_intakes(today: date, existing: list[MockIntake]) -> None:
    """Feature: production-stability-hardening, Property 2: Always 2 open intakes

    For any date and any set of existing intakes (including empty), after
    ``ensure_minimum_open_intakes``, the combined set has >= 2 open intakes.
    Running again produces zero additional intakes (idempotency).

    **Validates: Requirements 2.1, 2.2, 2.4, 2.5, 3.3**
    """
    # --- First call ---
    new_intakes = ensure_minimum_open_intakes(today, existing, min_open=2)

    # Build the combined set: existing + newly created (as mocks)
    combined = list(existing) + [_computed_to_mock(c) for c in new_intakes]

    # Assertion 1: at least 2 open intakes in the combined set
    open_count = sum(1 for i in combined if _is_open(i, today))
    assert open_count >= 2, (
        f"Expected >= 2 open intakes, got {open_count}. "
        f"today={today}, existing={len(existing)}, new={len(new_intakes)}"
    )

    # --- Second call (idempotency) ---
    second_new = ensure_minimum_open_intakes(today, combined, min_open=2)
    assert second_new == [], (
        f"Idempotency violated: second call returned {len(second_new)} intakes "
        f"instead of 0. today={today}"
    )
