"""Tests for scripts/routes_report.py (platform-simplification task 3.1, 3.5).

Run from the repository root with the backend environment variables set:

    python3 -m pytest -p no:django scripts/tests/test_routes_report.py

The pure tests need only the standard library and hypothesis. The two live
tests configure Django themselves and walk the real URLconf.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

SCRIPTS = Path(__file__).resolve().parents[1]
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import routes_report as rr  # noqa: E402


# --------------------------------------------------------------------------- #
# Normalisation and caller extraction
# --------------------------------------------------------------------------- #
def test_normalise_route_turns_converters_into_wildcards():
    assert rr.normalise_route("/api/v1/applications/<uuid:application_id>/submit/") == (
        "v1",
        ("applications", "*", "submit"),
    )
    assert rr.normalise_route("api/v2/admin/onboarding/") == ("v2", ("admin", "onboarding"))


def test_unversioned_mounts_are_not_part_of_the_contract():
    assert rr.normalise_route("/health/live/") is None
    assert rr.normalise_route("/beanola-admin-panel/") is None


def test_display_route_round_trips():
    key = ("v1", ("jobs", "*"))
    assert rr.parse_display_route(rr.display_route(key)) == key


def test_unprefixed_admissions_literal_is_v1():
    found = rr.extract_callers("apiClient.request('/catalog/context/')", accept_unprefixed=True)
    assert found == {("v1", ("catalog", "context"))}


def test_versioned_literal_keeps_its_version():
    found = rr.extract_callers(
        "const p = `/api/v2/student/applications/${id}/readiness/`", accept_unprefixed=False
    )
    assert found == {("v2", ("student", "applications", "*", "readiness"))}


def test_unprefixed_literal_is_ignored_outside_api_directories():
    assert rr.extract_callers("<Link to='/student/payment' />", accept_unprefixed=False) == set()


def test_expression_prefix_is_dropped():
    found = rr.extract_callers("fetch(`${env.apiBaseUrl}/api/v1/auth/refresh/`)", accept_unprefixed=False)
    assert found == {("v1", ("auth", "refresh"))}


def test_trailing_expression_is_read_as_query_string_and_as_id():
    found = rr.extract_callers("`/admin/audit-logs/${buildQueryString(params)}`", accept_unprefixed=True)
    assert ("v1", ("admin", "audit-logs")) in found
    assert ("v1", ("admin", "audit-logs", "*")) in found


def test_path_constant_in_the_same_file_is_substituted():
    src = "export const FILTERS = '/admin/saved-filters/'\nconst u = `${FILTERS}${id}/`"
    assert ("v1", ("admin", "saved-filters", "*")) in rr.extract_callers(src, accept_unprefixed=True)


def test_comments_are_not_callers():
    src = "// '/api/v1/jobs/'\n/* '/api/v1/outreach/' */\nconst x = 1"
    assert rr.extract_callers(src, accept_unprefixed=False) == set()


def test_all_wildcard_literal_is_not_a_caller():
    assert rr.extract_callers("`/${a}/${b}/`", accept_unprefixed=True) == set()


def test_versions_do_not_borrow_each_others_callers():
    route = ("v1", ("student", "applications", "*", "readiness"))
    callers = {("v2", ("student", "applications", "*", "readiness")): {"x.ts"}}
    report = rr.classify([route], [], callers, [], [])
    assert report.offenders == [rr.display_route(route)]


# --------------------------------------------------------------------------- #
# Classification
# --------------------------------------------------------------------------- #
JOBS = ("v1", ("jobs",))
HOOK = ("v1", ("payments", "webhook", "lenco"))


def _consumer(route: str, **over):
    entry = {"route": route, "consumer": "Lenco", "owner": "platform", "reason": "outside caller"}
    entry.update(over)
    return entry


def test_precedence_caller_consumer_gated_baselined_offender():
    routes = [("v1", ("a",)), ("v1", ("b",)), ("v1", ("c",)), ("v1", ("d",)), ("v1", ("e",))]
    report = rr.classify(
        routes,
        gated=[("v1", ("a",)), ("v1", ("b",)), ("v1", ("c",))],
        callers={("v1", ("a",)): {"f.ts"}},
        consumers=[_consumer("/api/v1/a/"), _consumer("/api/v1/b/")],
        baseline=[
            {"route": "/api/v1/c/", "reason": "r"},
            {"route": "/api/v1/d/", "reason": "r"},
        ],
    )
    assert report.classes == {
        "/api/v1/a/": "caller",
        "/api/v1/b/": "consumer",
        "/api/v1/c/": "gated",
        "/api/v1/d/": "baselined",
        "/api/v1/e/": "offender",
    }
    # c is gated, so its baseline entry is stale: a stronger class wins.
    assert any("/api/v1/c/" in s for s in report.stale_baseline)
    assert report.offenders == ["/api/v1/e/"]
    assert not report.ok


def test_stale_consumer_entry_fails():
    report = rr.classify([JOBS], [], {JOBS: {"x.ts"}}, [_consumer("/api/v1/gone/")], [])
    assert report.invalid_consumers and not report.ok


@pytest.mark.parametrize("missing", ["route", "consumer", "owner", "reason"])
def test_consumer_entry_needs_every_field(missing):
    entry = _consumer("/api/v1/jobs/")
    entry[missing] = " "
    report = rr.classify([JOBS], [], {JOBS: {"x.ts"}}, [entry], [])
    assert report.invalid_consumers


def test_baseline_entry_needs_a_reason():
    report = rr.classify([JOBS], [], {}, [], [{"route": "/api/v1/jobs/", "reason": ""}])
    assert report.invalid_baseline and not report.ok


# --------------------------------------------------------------------------- #
# Property 4: every route gets exactly one class
# --------------------------------------------------------------------------- #
SEGMENT = st.sampled_from(["a", "b", "c", "d", "e", "*"])
ROUTE = st.tuples(st.sampled_from(["v1", "v2"]), st.lists(SEGMENT, min_size=1, max_size=3).map(tuple))


@settings(max_examples=150, deadline=None)
@given(
    routes=st.lists(ROUTE, min_size=1, max_size=12, unique=True),
    data=st.data(),
)
def test_property_4_every_route_gets_exactly_one_class(routes, data):
    """**Property 4: Every route gets exactly one class. Validates: Requirements 2.1, 2.2**"""
    pick = lambda: data.draw(st.lists(st.sampled_from(routes), unique=True, max_size=len(routes)))  # noqa: E731
    gated = pick()
    callers = {k: {"f.ts"} for k in pick()}
    consumers = [_consumer(rr.display_route(k)) for k in pick()]
    baseline = [{"route": rr.display_route(k), "reason": "r"} for k in pick()]

    report = rr.classify(routes, gated, callers, consumers, baseline)

    # One class per route, drawn from the five, none missing, none extra.
    assert len(report.classes) == len({rr.display_route(r) for r in routes})
    assert set(report.classes.values()) <= set(rr.CLASSES)
    # Precedence: a route with a caller is never anything weaker.
    for key in routes:
        name = rr.display_route(key)
        if rr._find_callers(key, callers):
            assert report.classes[name] == "caller"
    # An offender is exactly a route no list explains.
    assert sorted(report.offenders) == sorted(n for n, c in report.classes.items() if c == "offender")


# --------------------------------------------------------------------------- #
# Property 5: stale baseline entries fail
# --------------------------------------------------------------------------- #
@settings(max_examples=100, deadline=None)
@given(
    routes=st.lists(ROUTE, min_size=1, max_size=8, unique=True),
    stale=st.lists(ROUTE, min_size=1, max_size=4, unique=True),
)
def test_property_5_stale_baseline_entries_fail(routes, stale):
    """**Property 5: Stale baseline entries fail. Validates: Requirements 2.5, 19.4**"""
    mounted = set(routes)
    gone = [k for k in stale if k not in mounted and not rr._matches_any(k, mounted)]
    if not gone:
        return
    baseline = [{"route": rr.display_route(k), "reason": "r"} for k in gone]
    report = rr.classify(routes, [], {}, [], baseline)
    assert not report.ok
    assert len(report.stale_baseline) == len(gone)


def test_baseline_entry_that_gained_a_caller_is_stale():
    report = rr.classify([JOBS], [], {JOBS: {"x.ts"}}, [], [{"route": "/api/v1/jobs/", "reason": "r"}])
    assert report.stale_baseline and not report.ok


# --------------------------------------------------------------------------- #
# Live: the real URLconf and the committed lists
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def route_sets():
    return rr.collect_route_sets()


def test_the_flag_changes_the_route_surface(route_sets):
    """A toggle that silently fails must not pass: /api/v1/jobs/ exists only with the flag on."""
    all_routes, gated = route_sets
    assert ("v1", ("jobs",)) in all_routes
    assert ("v1", ("jobs",)) in gated
    assert gated  # at least one route differs between the two states


def test_the_repository_passes_its_own_report():
    report, _ = rr.build_report()
    assert report.ok, (report.offenders, report.stale_baseline, report.invalid_consumers)
