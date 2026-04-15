"""
Pure functions for computing intake dates and ensuring minimum open intakes.

No database access — the Celery task orchestrates DB reads/writes around these
pure computations, making the date logic independently testable.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from typing import Any


@dataclass(frozen=True)
class ComputedIntakeDates:
    """Immutable result of computing dates for a single intake."""

    name: str  # e.g. "January 2027"
    year: int  # e.g. 2027
    start_date: date  # 1st of intake month
    application_start_date: date  # 11 months before start_date
    application_deadline: date  # 2 months after start_date


def compute_intake_dates(intake_month: int, intake_year: int) -> ComputedIntakeDates:
    """Compute all dates for a single intake.

    Args:
        intake_month: Must be 1 (January) or 7 (July).
        intake_year: The year of the intake start date.

    Returns:
        A frozen ``ComputedIntakeDates`` with all fields populated.

    Raises:
        ValueError: If *intake_month* is not 1 or 7.
    """
    if intake_month not in (1, 7):
        raise ValueError(f"intake_month must be 1 or 7, got {intake_month}")

    start_date = date(intake_year, intake_month, 1)

    # application_start_date: 11 months before start_date
    app_start_month = intake_month - 11
    app_start_year = intake_year
    if app_start_month <= 0:
        app_start_month += 12
        app_start_year -= 1
    application_start_date = date(app_start_year, app_start_month, 1)

    # application_deadline: 2 months after start_date
    deadline_month = intake_month + 2
    deadline_year = intake_year
    if deadline_month > 12:
        deadline_month -= 12
        deadline_year += 1
    application_deadline = date(deadline_year, deadline_month, 1)

    month_name = calendar.month_name[intake_month]
    name = f"{month_name} {intake_year}"

    return ComputedIntakeDates(
        name=name,
        year=intake_year,
        start_date=start_date,
        application_start_date=application_start_date,
        application_deadline=application_deadline,
    )


def get_next_intake_month_year(after: date) -> tuple[int, int]:
    """Return the next ``(month, year)`` in the Jan/Jul pattern after *after*.

    The pattern is: Jan Year N → Jul Year N → Jan Year N+1 → Jul Year N+1 → …

    If *after* falls before July of its year, the next intake is July of that
    year.  If *after* falls in or after July, the next intake is January of the
    following year.
    """
    if after.month < 7:
        return 7, after.year
    return 1, after.year + 1


def _is_intake_open(intake_dates: ComputedIntakeDates, today: date) -> bool:
    """Check whether an intake's application window covers *today*."""
    return intake_dates.application_start_date <= today <= intake_dates.application_deadline


def _existing_intake_is_open(intake: Any, today: date) -> bool:
    """Check whether an existing DB-style intake object is open on *today*.

    Handles ``None`` date fields gracefully — an intake with missing dates is
    never considered open.
    """
    app_start = getattr(intake, "application_start_date", None)
    app_deadline = getattr(intake, "application_deadline", None)
    if app_start is None or app_deadline is None:
        return False
    return app_start <= today <= app_deadline


def ensure_minimum_open_intakes(
    today: date,
    existing_intakes: list[Any],
    min_open: int = 2,
) -> list[ComputedIntakeDates]:
    """Return a list of ``ComputedIntakeDates`` that need to be created.

    The function counts how many *existing_intakes* are currently open
    (``application_start_date <= today <= application_deadline``), then
    generates future intakes in the Jan/Jul pattern until the combined count
    reaches *min_open*.

    Intakes whose ``name`` and ``year`` match an existing record are skipped
    (no duplicates).

    Args:
        today: The reference date (typically ``date.today()``).
        existing_intakes: Objects with at least ``name``, ``year``,
            ``application_start_date``, and ``application_deadline`` attributes.
        min_open: Minimum number of open intakes required (default 2).

    Returns:
        A (possibly empty) list of ``ComputedIntakeDates`` to create.
    """
    # Build a set of (name, year) for existing intakes to detect duplicates.
    existing_keys: set[tuple[str, int | None]] = set()
    for intake in existing_intakes:
        existing_keys.add((intake.name, intake.year))

    # Count currently open intakes among existing ones.
    open_count = sum(1 for i in existing_intakes if _existing_intake_is_open(i, today))

    to_create: list[ComputedIntakeDates] = []

    # Start from the current intake period (not just the next one) so that
    # intakes whose application window already covers *today* are considered.
    # Walk backward through the Jan/Jul pattern to find the earliest intake
    # that could still be open on *today*.
    if today.month < 7:
        next_month, next_year = 1, today.year
    else:
        next_month, next_year = 7, today.year

    # Safety cap to avoid infinite loops in degenerate inputs.
    max_iterations = min_open + 10

    iterations = 0
    while open_count < min_open and iterations < max_iterations:
        iterations += 1
        computed = compute_intake_dates(next_month, next_year)

        if (computed.name, computed.year) not in existing_keys:
            to_create.append(computed)
            existing_keys.add((computed.name, computed.year))
            if _is_intake_open(computed, today):
                open_count += 1

        # Advance to the next intake in the pattern.
        if next_month == 1:
            next_month = 7
        else:
            next_month = 1
            next_year += 1

    return to_create
