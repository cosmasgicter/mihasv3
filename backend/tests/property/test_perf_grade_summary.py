"""Property 9 — Grade summary equivalence and single computation
(system-performance-hardening, task 4.2).

# Feature: system-performance-hardening, Property 9

R8 memoizes the grade summary in ``ApplicationListSerializer._grade_summary``
so the grade summary, total-subjects, and points values are computed **once**
per application per serializer instance and reused across the three
``SerializerMethodField``s that consume them (``grades_summary``,
``total_subjects``, ``points``). Property 9 proves two things hold across
arbitrary grade-record sets under Zambian ECZ grading:

* **(a) Equivalence (R8.4).** The memoized serializer field outputs are
  identical to the pre-feature single-application computation — the same value
  the un-memoized ``build_grades_summary`` / ``len(get_application_grades(...))``
  / ``calculate_points_from_grades`` helpers produce — and the totals/points
  also match a fully independent oracle derived straight from the raw grade
  specs (count of subjects; sum of the lowest five 1–9 grades), and every
  emitted summary line round-trips back to the exact set of (subject, grade)
  records.
* **(b) Single computation (R8.1).** With the underlying grade resolver
  (``get_application_grades``) wrapped in a counting spy, exercising all three
  dependent field getters on one serializer instance resolves grades **at most
  once per application** — never once per field — even across a list of several
  applications served by the same serializer instance.

**Validates: Requirements 8.1, 8.4**

Backend note: this runs against the SQLite ``config.settings.test`` database
(per the task's run command). The serializer's non-prefetch path orders grades
by ``subject__name`` and the equivalence assertions compare the memoized output
to the un-memoized helper output computed over the same ordered resolver, so
the asserted summary string is correct regardless of DB collation; the
order-independent total/points oracle and the line round-trip set comparison
add a genuinely independent ECZ check on top.
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------------
#
# A grade record set is a list of (subject token, ECZ grade) pairs with unique
# subjects. The empty list is the no-grades case. ECZ grades are 1–9. The
# subject token becomes a sortable, collation-stable ASCII-hex subject name so
# the resolver's ``subject__name`` ordering is deterministic.

_grade_record_sets = st.lists(
    st.tuples(st.uuids(), st.integers(min_value=1, max_value=9)),
    max_size=10,
    unique_by=lambda pair: pair[0],
)


def _subject_name(token: uuid.UUID) -> str:
    return f"SUBJ-{token.hex}"


# ---------------------------------------------------------------------------
# Independent oracle (order-independent, derived from the raw specs)
# ---------------------------------------------------------------------------


def _expected_total(specs) -> int:
    return len(specs)


def _expected_points(specs) -> int:
    """ECZ points: the sum of the five lowest valid (1–9) grades."""
    valid = sorted(grade for _, grade in specs if isinstance(grade, int) and 1 <= grade <= 9)
    return sum(valid[:5]) if valid else 0


def _expected_line_set(specs) -> set[tuple[str, int]]:
    return {(_subject_name(token), grade) for token, grade in specs}


def _parse_summary_lines(summary: str) -> set[tuple[str, int]]:
    """Round-trip the rendered summary text back to a (subject, grade) set.

    Each line is ``"<subject name>: Grade <n>"`` (see ``grades_summary_from_grades``).
    """
    parsed: set[tuple[str, int]] = set()
    for line in (line for line in summary.split("\n") if line):
        name, _, tail = line.partition(": Grade ")
        parsed.add((name, int(tail)))
    return parsed


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def _build_application_with_grades(specs):
    """Persist a fresh application plus the generated grade rows.

    Each call builds an independent tenant world so grade sets from successive
    Hypothesis examples never collide (the test DB is not rolled back between
    examples).
    """
    from apps.documents.models import ApplicationGrade
    from apps.catalog.models import Subject
    from tests.tenant_fixtures import build_application, build_tenant_world

    world = build_tenant_world(with_application=False)
    application = build_application(
        student=world.student,
        institution=world.institution,
        canonical_program=world.canonical_program,
        offering=world.offering,
        intake=world.intake,
        suffix=f"p9-{uuid.uuid4().hex[:8]}",
        status="submitted",
    )

    now = timezone.now().replace(microsecond=0)
    for token, grade in specs:
        subject = Subject.objects.create(
            id=uuid.uuid4(),
            name=_subject_name(token),
            code=None,
            is_active=True,
            curriculum_type="ecz",
            created_at=now,
        )
        ApplicationGrade.objects.create(
            id=uuid.uuid4(),
            application=application,
            subject=subject,
            grade=grade,
            created_at=now,
        )
    return application


def _fresh(application_id):
    from apps.applications.models import Application

    return Application.objects.get(id=application_id)


# ---------------------------------------------------------------------------
# Property 9 (a) — Grade summary equivalence
# ---------------------------------------------------------------------------


@given(specs=_grade_record_sets)
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
    ],
)
def test_property_9_grade_summary_equivalence(specs):
    """Memoized serializer fields equal the pre-feature single computation.

    For any grade record set, the serializer's ``grades_summary`` /
    ``total_subjects`` / ``points`` match both the un-memoized helper output
    (R8.4) and the independent raw-spec oracle (ECZ totals/points + line
    round-trip).

    **Validates: Requirements 8.4**
    """
    from apps.applications.serializers import (
        ApplicationListSerializer,
        build_grades_summary,
        calculate_points_from_grades,
        get_application_grades,
    )

    application = _build_application_with_grades(specs)

    # Observable, memoized output through the serializer field getters.
    ser = ApplicationListSerializer()
    obj = _fresh(application.id)
    actual_summary = ser.get_grades_summary(obj)
    actual_total = ser.get_total_subjects(obj)
    actual_points = ser.get_points(obj)

    # Pre-feature single-application computation (un-memoized helpers), over an
    # independently fetched instance so the serializer's per-instance cache
    # cannot influence the reference.
    ref = _fresh(application.id)
    expected_summary = build_grades_summary(ref)
    expected_total = len(get_application_grades(_fresh(application.id)))
    expected_points = calculate_points_from_grades(_fresh(application.id))

    # (1) Equivalence to the pre-feature computation (R8.4).
    assert actual_summary == expected_summary
    assert actual_total == expected_total
    assert actual_points == expected_points

    # (2) Equivalence to a fully independent oracle derived from the raw specs.
    assert actual_total == _expected_total(specs)
    assert actual_points == _expected_points(specs)
    assert _parse_summary_lines(actual_summary) == _expected_line_set(specs)


# ---------------------------------------------------------------------------
# Property 9 (b) — Single computation per application per serializer instance
# ---------------------------------------------------------------------------


@given(
    grade_sets=st.lists(
        st.lists(
            st.tuples(st.uuids(), st.integers(min_value=1, max_value=9)),
            max_size=6,
            unique_by=lambda pair: pair[0],
        ),
        min_size=1,
        max_size=4,
    )
)
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
    ],
)
def test_property_9_single_computation(grade_sets):
    """The grade resolver runs at most once per application per serializer.

    All three dependent field getters are exercised for every application on a
    single serializer instance; the wrapped ``get_application_grades`` spy must
    fire exactly once per distinct application — never once per field, never
    once per application per getter.

    **Validates: Requirements 8.1**
    """
    import apps.applications.serializers as serializers_module
    from apps.applications.serializers import ApplicationListSerializer

    applications = [_build_application_with_grades(specs) for specs in grade_sets]
    objs = [_fresh(app.id) for app in applications]

    real_resolver = serializers_module.get_application_grades
    calls: dict[object, int] = {}

    def _counting_resolver(application):
        key = getattr(application, "id", id(application))
        calls[key] = calls.get(key, 0) + 1
        return real_resolver(application)

    ser = ApplicationListSerializer()
    with patch.object(serializers_module, "get_application_grades", _counting_resolver):
        for obj in objs:
            # Three distinct fields, all backed by the memoized _grade_summary.
            ser.get_grades_summary(obj)
            ser.get_total_subjects(obj)
            ser.get_points(obj)

    # At most one resolve per application, and never more getters than apps.
    assert calls, "resolver was never invoked"
    assert all(count == 1 for count in calls.values()), (
        f"grade resolver ran more than once for some application: {calls}"
    )
    assert len(calls) == len(objs), (
        f"expected one resolve per application ({len(objs)}), got {len(calls)}"
    )
