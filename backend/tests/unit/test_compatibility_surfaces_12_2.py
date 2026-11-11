"""Every compatibility surface kept past cutover is registered and evaluable.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task **12.2**
Requirements: **R2.5-R2.7** (compatibility windows / measured deprecation),
**R14.5** (permissive normalizers and legacy aliases are DELETED after cutover,
not retained indefinitely), **R14.7** (breaking removals expose deprecation /
usage telemetry until their exit criteria are met).
Findings: **API-02**, **API-04**, **REL-01**.

These are the **V1 deprecation tests** half of task 12.2's ``_Evidence:`` line.
The other half — the source/route telemetry zero report — is
``scripts/v1_surface_telemetry.py``, whose output is committed under
``docs/v2-evidence/12.2/raw/``.

Three things are pinned, and the third is the one that matters most:

1. **Retired routes are gone and stay gone.** A path removed by an earlier task
   must not be served, and — new here — must not be *registered* either. The two
   stale authority-registry entries (``/email-slip/``, ``/preview-summary/``) had
   been failing ``test_authority_matrix_v2.py``'s drift guard since 10.6 / 7.4;
   task 12.2 de-registered them.

2. **Every surface kept for external compatibility has an announced end date.**
   Not just ``Deprecation: true`` — an RFC 8594 ``Sunset``, with an owner and exit
   criteria in ``apps.common.compatibility_register``. Task 12.2's own constraint
   is "keep documented external compatibility until its **announced end date**",
   which is unfalsifiable without one.

3. **Every re-export shim's documented removal condition is EVALUATED, by this
   test, on every run.** Task 12.1 left two shims, each with a removal condition
   in its own docstring, and 12.1's own dispatch put it plainly: *"A shim whose
   removal condition nobody ever evaluates is exactly the debt this task exists
   to stop."* So the condition is machine-checked here. The test reports which
   importers and which test patch-targets currently block each shim, and it
   **fails when a shim's condition becomes satisfied** — i.e. the shim becomes
   deletable and this test demands the deletion. That is the same shrinking-
   allowlist mechanism task 1.5 built for ``LEGACY_EXCEPTIONS``, applied to
   shims: an allowance that can only get smaller, never quietly permanent.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import pytest
from django.urls import Resolver404, resolve

BACKEND_ROOT = Path(__file__).resolve().parents[2]
APPS_ROOT = BACKEND_ROOT / "apps"
TESTS_ROOT = BACKEND_ROOT / "tests"
REPO_ROOT = BACKEND_ROOT.parent


# --------------------------------------------------------------------------- #
# 1. Retired routes are neither served nor registered
# --------------------------------------------------------------------------- #

#: (path to probe, the task that retired it, its canonical successor).
RETIRED_ROUTES = [
    (
        "/api/v1/applications/11111111-1111-1111-1111-111111111111/email-slip/",
        "10.6 (R13.5, API-04) — 10.4 measured zero use first",
        "/api/v1/applications/{id}/official-documents/{document_type}/email/",
    ),
    (
        "/api/v1/applications/11111111-1111-1111-1111-111111111111/preview-summary/",
        "7.4 (R11.1) — the admissions runtime makes no generative AI call",
        "the deterministic review step, rendered from persisted data",
    ),
]


@pytest.mark.parametrize("path,retired_by,successor", RETIRED_ROUTES)
def test_retired_route_is_not_served(path, retired_by, successor):
    """A route an earlier task removed must not resolve."""
    with pytest.raises(Resolver404):
        resolve(path)


@pytest.mark.parametrize("path,retired_by,successor", RETIRED_ROUTES)
def test_retired_route_is_not_registered(path, retired_by, successor):
    """…and must not be left in the approved authority-matrix registry.

    This is the direct pin for the two stale entries task 12.2 de-registered. The
    reason it is a *separate* assertion from "is not served" is that the two can
    disagree, and did: both routes stopped being served (10.6 / 7.4) while both
    stayed registered, and ``test_authority_matrix_v2.py``'s drift guard failed on
    exactly that pair for nine consecutive tasks. A registry entry for a route the
    URLconf does not serve is drift, not documentation.
    """
    import sys

    scripts_dir = REPO_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    import authority_matrix_registry as reg  # noqa: PLC0415

    # The registry keys are Django path templates, not concrete URLs.
    template = re.sub(
        r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/",
        "/<uuid:application_id>/",
        path,
    )
    assert template not in reg.get_registry(), (
        f"{template} is registered but not served (retired by {retired_by}). "
        "De-register it: a registry entry for a route the URLconf does not serve "
        "is drift, and it fails the zero-unclassified gate."
    )


# --------------------------------------------------------------------------- #
# 2. Every kept-external surface has an announced end date
# --------------------------------------------------------------------------- #

def test_every_registered_surface_has_owner_end_date_and_exit_criteria():
    from apps.common.compatibility_register import COMPATIBILITY_SURFACES

    assert COMPATIBILITY_SURFACES, "the compatibility register must not be empty"
    for surface_id, surface in COMPATIBILITY_SURFACES.items():
        assert surface.owner, f"{surface_id} has no owner"
        assert surface.successor, f"{surface_id} names no successor"
        assert surface.exit_criteria, f"{surface_id} has no exit criteria"
        # An end date that is not a real date is not an announced end date.
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", surface.end_date), surface_id
        assert surface.end_date > surface.announced_on, (
            f"{surface_id}: the window closes before it opens"
        )
        # And it must render as an RFC 8594 / RFC 7231 IMF-fixdate, because that
        # is what a caller reads off the wire.
        assert surface.sunset_http_date.endswith(" GMT"), surface_id
        assert surface.measured_zero_first_party, (
            f"{surface_id} claims a compatibility window without naming the "
            "measurement that says nothing first-party needs it"
        )


def test_legacy_catalog_writes_publish_deprecation_sunset_and_successor():
    """The three frozen catalog write surfaces announce an end date on the wire."""
    from rest_framework.response import Response

    from apps.catalog.legacy_write_telemetry import mark_deprecated

    for resource, successor in (
        ("institution", "/api/v1/admin/institutions/"),
        ("intake", "/api/v1/admin/intakes/"),
        ("program", "/api/v1/admin/institutions/{id}/programs/{id}/"),
    ):
        response = mark_deprecated(Response({}), resource=resource, successor=successor)
        assert response["Deprecation"] == "true", resource
        assert response["Sunset"].endswith(" GMT"), resource
        assert 'rel="successor-version"' in response["Link"], resource
        assert response["X-Legacy-Catalog-Write"] == resource


def test_condition_verify_publishes_deprecation_sunset_and_successor():
    """The deprecated two-outcome condition door announces an end date too.

    Task 10.6 deprecated it on the FIRST zero-use reading and recorded that
    removal "needs a window that starts with this task's measurement, not one that
    ends with it". Task 12.2 is the second reading, so the window now has an end.
    """
    from rest_framework.response import Response

    from apps.applications.admin_amendment_views import (
        _with_condition_deprecation_headers,
    )

    response = _with_condition_deprecation_headers(Response({}))
    assert response["Deprecation"] == "true"
    assert response["Sunset"].endswith(" GMT")
    assert "conditions/{cid}/review/" in response["Link"]


def test_an_unregistered_surface_cannot_be_given_a_sunset():
    """``sunset_for`` refuses an id the register does not carry.

    Deliberate: a ``Sunset`` stamped in front of a caller that no register audits
    is worse than no date, because it looks like a commitment and is not one.
    """
    from apps.common.compatibility_register import sunset_for

    with pytest.raises(KeyError):
        sunset_for("not.a.registered.surface")


# --------------------------------------------------------------------------- #
# 3. Every shim's removal condition is evaluated, and shrinks
# --------------------------------------------------------------------------- #

#: Every re-export shim in the backend, with the module path callers use.
#:
#: Task 12.2 registered **two** — the pair task 12.1 created in its own diff.
#: Task 12.5's category-13 sweep (``COMPATIBILITY_OWNER`` /
#: ``REMOVAL_CONDITION`` across ``backend/apps``) found **six** modules carrying
#: those markers, so four had a documented removal condition that nothing ever
#: evaluated — which is precisely the debt this test was built to stop, applied
#: to a third of the surface. The four are registered here with today's measured
#: blocker counts, so from now on all six shrink or fail.
#:
#: ``docs/v2-evidence/12.5/README.md`` §4.
SHIMS = {
    "apps.catalog.views": APPS_ROOT / "catalog" / "views.py",
    "apps.catalog.admin_views": APPS_ROOT / "catalog" / "admin_views.py",
    # -- added by task 12.5
    "apps.accounts.admin_views": APPS_ROOT / "accounts" / "admin_views.py",
    "apps.accounts.batch_views": APPS_ROOT / "accounts" / "batch_views.py",
    "apps.documents.views": APPS_ROOT / "documents" / "views.py",
}

#: The announced end date for every shim above — the register's *removal date*.
#:
#: Added by admissions-v2 task 13.6's remediation item **L10** (finding
#: **GATE-13.6-01**). Until then each shim had an owner (its own
#: ``COMPATIBILITY_OWNER`` marker, asserted below) and a removal *condition*, but
#: no removal *date* — so a shim whose blockers never reached zero could stay
#: forever without anyone deciding to keep it. 12.5's clause asks for
#: "owner/removal date", and ``scripts/v1_surface_telemetry.py`` half 5b reported
#: the gap.
#:
#: **Not a new commitment**: this is task 12.2's own announced window, read from
#: the canonical register below rather than restated, so there is one date and one
#: place to change it. The two frontend registers spell the same date as a literal
#: and ``test_frontend_register_windows_match_the_canonical_register`` pins them to
#: it.
#:
#: Evidence: ``docs/v2-evidence/13.6/remediation/L9-L11/README.md`` §4.
SHIM_REMOVAL_DATE_SOURCE = "catalog.legacy_institution_write"


def _announced_window_end() -> str:
    """The 12.2 window's end date, read from the canonical register itself."""
    from apps.common.compatibility_register import COMPATIBILITY_SURFACES

    return COMPATIBILITY_SURFACES[SHIM_REMOVAL_DATE_SOURCE].end_date


#: The blockers each shim's own docstring names, measured rather than trusted.
#:
#: These counts are an upper bound that may only DECREASE. A task that repoints
#: an importer or a patch target lowers the number here; a task that adds one
#: fails this test, which is the point — a shim must not grow new callers.
SHIM_BLOCKER_BUDGET = {
    "apps.catalog.views": {"production_importers": 1, "test_files": 11},
    "apps.catalog.admin_views": {"production_importers": 2, "test_files": 3},
    # -- added by task 12.5, at the counts measured on 2026-08-12.
    #
    # Three of the four have **zero** production importers: their URL confs were
    # already repointed at the split modules, so the only thing holding them is
    # test files that import or ``@patch`` through the old path. That is a
    # smaller, purely mechanical removal than the catalog pair's — and it is now
    # a number a future task can watch fall rather than a sentence in a
    # docstring. ``apps.applications.views`` (19 test dependents, the largest)
    # was removed by platform-simplification task 14.3.
    "apps.accounts.admin_views": {"production_importers": 1, "test_files": 11},
    "apps.accounts.batch_views": {"production_importers": 0, "test_files": 2},
    "apps.documents.views": {"production_importers": 0, "test_files": 10},
}


def _python_files(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*.py") if "__pycache__" not in p.parts)


def _production_importers(module: str) -> set[str]:
    """First-party modules that *import* from ``module`` (not merely mention it)."""
    needle_from = re.compile(rf"^\s*from\s+{re.escape(module)}\s+import\b", re.M)
    needle_import = re.compile(rf"^\s*import\s+{re.escape(module)}\b", re.M)
    found: set[str] = set()
    own_path = SHIMS[module]
    for path in _python_files(APPS_ROOT):
        if path == own_path:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if needle_from.search(text) or needle_import.search(text):
            found.add(str(path.relative_to(BACKEND_ROOT)))
    return found


def _test_dependents(module: str) -> set[str]:
    """Test files that import from, or ``@patch`` through, ``module``."""
    needle = re.compile(rf"{re.escape(module)}[.\s]")
    found: set[str] = set()
    for path in _python_files(TESTS_ROOT):
        text = path.read_text(encoding="utf-8", errors="replace")
        for line in text.splitlines():
            if not needle.search(line):
                continue
            stripped = line.strip()
            # A comment naming the shim is documentation, not a dependency.
            if stripped.startswith("#"):
                continue
            found.add(str(path.relative_to(BACKEND_ROOT)))
            break
    return found


@pytest.mark.parametrize("module", sorted(SHIMS))
def test_shim_removal_condition_is_evaluated_and_can_only_shrink(module):
    """Evaluate the shim's own documented removal condition, every run.

    Task 12.2's decision, recorded here rather than in prose only: **both shims
    are KEPT, and their removal conditions are made mechanical.** The reasoning is
    in ``docs/v2-evidence/12.2/README.md``; the short form is that deleting them
    buys ~180 lines and costs edits to 14 test files plus a URL conf, while
    improving no gate — the ``__module__``-keyed gates are already keyed on the
    split modules (which is why two of them were failing), and repointing those
    registers, which task 12.2 did, is independent of the shims.

    What makes keeping them honest is that the condition can no longer rot:

    * the blocker set is measured, printed on failure, and budgeted;
    * the budget may only shrink — adding a caller fails;
    * and when the budget reaches zero the test fails, telling the next task the
      shim is now deletable rather than leaving it to be rediscovered.
    """
    shim_path = SHIMS[module]
    assert shim_path.exists(), f"{module} shim is gone — delete its budget entry"

    source = shim_path.read_text(encoding="utf-8")
    assert "COMPATIBILITY_OWNER" in source, f"{module} must name its owner"
    assert "REMOVAL_CONDITION" in source, f"{module} must state its removal condition"

    # The removal DATE, added by 13.6 item L10 (GATE-13.6-01). An owner and a
    # condition say who and what; with no date, a shim whose blockers never reach
    # zero never has to be reconsidered. Enforcing the window means that when it
    # closes, keeping the shim is a decision somebody makes rather than a default.
    removal_date = _announced_window_end()
    assert date.fromisoformat(removal_date) >= date.today(), (
        f"{module}: the announced compatibility window closed on {removal_date} "
        f"(today {date.today().isoformat()}). Delete the shim and its budget entry, "
        "or announce a new window in apps/common/compatibility_register.py on purpose."
    )

    importers = _production_importers(module)
    dependents = _test_dependents(module)
    budget = SHIM_BLOCKER_BUDGET[module]

    assert len(importers) <= budget["production_importers"], (
        f"{module}: production importers GREW to {len(importers)} "
        f"(budget {budget['production_importers']}): {sorted(importers)}. "
        "A re-export shim must not acquire new callers — import the canonical "
        "split module instead."
    )
    assert len(dependents) <= budget["test_files"], (
        f"{module}: test dependents GREW to {len(dependents)} "
        f"(budget {budget['test_files']}): {sorted(dependents)}. "
        "New tests should import or patch the canonical split module."
    )

    # The condition itself: zero blockers means the shim is deletable NOW.
    assert importers or dependents, (
        f"{module}: its documented REMOVAL_CONDITION is now SATISFIED — no "
        "production module imports it and no test depends on it. Delete the shim "
        "and this budget entry. This assertion exists so a satisfied removal "
        "condition cannot sit unnoticed."
    )


# --------------------------------------------------------------------------- #
# 4. One window, three languages — the date cannot drift
# --------------------------------------------------------------------------- #
#: The two frontend exemption registers that task 13.6 item L10 dated. Each pair
#: is (repo-relative file, the constant that must hold the announced date).
_FRONTEND_DATED_REGISTERS = (
    (
        "apps/admissions/tests/unit/architectureEnforcement.test.ts",
        "LEGACY_EXCEPTION_REMOVE_BY",
    ),
    (
        "apps/admissions/tests/unit/documentFlowDriftGuard.test.ts",
        "PREVIEW_ALLOWLIST_REMOVE_BY",
    ),
)


@pytest.mark.parametrize(("rel", "constant"), _FRONTEND_DATED_REGISTERS)
def test_frontend_register_windows_match_the_canonical_register(rel, constant):
    """The dated frontend registers spell task 12.2's window, not their own.

    Added by admissions-v2 task 13.6 remediation item **L10** (GATE-13.6-01).

    TypeScript cannot import ``compatibility_register.py``, so item L10 wrote the
    announced end date into both frontend registers as a literal. A literal copy
    of a date is a drift risk, and a drifted removal date is worse than none: two
    registers would announce two different windows for the same decision. This
    test is the mechanism that makes the copies safe — it reads each constant out
    of the TypeScript source and compares it with the register's own
    ``end_date``, so the window has exactly one source of truth and moving it
    means moving it once, here.
    """
    expected = _announced_window_end()
    path = REPO_ROOT / rel
    assert path.exists(), f"{rel} is missing — item L10's register is gone"

    source = path.read_text(encoding="utf-8")
    match = re.search(rf"^const {re.escape(constant)} = '([^']+)'", source, re.M)
    assert match, (
        f"{rel}: no `const {constant} = '<ISO date>'` declaration. Item L10's "
        "owner/removal-date register was edited without updating this guard."
    )

    assert match.group(1) == expected, (
        f"{rel}: {constant} announces {match.group(1)}, but "
        f"compatibility_register.COMPATIBILITY_SURFACES['{SHIM_REMOVAL_DATE_SOURCE}']"
        f".end_date announces {expected}. One decision, one window: change the "
        "register and let this guard carry the change to the frontend copies."
    )
