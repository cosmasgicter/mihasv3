"""Drift guard — no NEW runtime logic matches on the legacy tenant strings.

The Beanola multi-tenant conversion makes the canonical IDs
(``canonical_programs.id`` / ``programs.id`` / ``institutions.id`` /
``intakes.id``) the **sole** sources of truth for routing, scoping, payment
tagging, and document generation (R1.2). The pre-canonical
``applications.program`` / ``applications.intake`` / ``applications.institution``
columns are **display snapshots only** — read-only mirrors that must never drive
new business logic (R1.3).

This guard is the static-analysis enforcement of that rule. It walks every
Python module under ``backend/apps/`` and uses the AST to find ORM *query
predicates* — ``.filter(...)`` / ``.exclude(...)`` / ``.get(...)`` calls and
``Q(...)`` constructors — that key on one of the legacy string fields
(``program`` / ``intake`` / ``institution``) either bare or via a *string*
lookup (``__icontains``, ``__iexact``, …).

It deliberately does NOT flag:

* FK predicates on the catalog models themselves (e.g.
  ``ProgramFee.objects.filter(program=program_obj)`` or
  ``Program.objects.filter(institution_id=...)``) — on those models
  ``program`` / ``institution`` / ``intake`` are real foreign keys, not the
  Application legacy strings. These are skipped by model-root detection.
* Relation traversals such as ``program__institution_id__in`` or
  ``institution__is_active`` — the lookup suffix is not a string lookup, so the
  predicate is targeting a canonical relation, not a legacy display string.
* Writes — ``.create(institution=...)`` / constructor kwargs / log kwargs /
  notification kwargs. Writing the display snapshot is allowed; only *matching*
  on it is forbidden.

Every legitimate remaining legacy-string predicate lives in an explicitly
labelled legacy-fallback / pre-canonical branch and is allowlisted below by a
stable ``(relative_path, field, value_expr)`` signature. Any UNLISTED new
occurrence fails the test, pointing the author at the canonical IDs instead.

Uses pure file I/O + ``ast`` — no Django DB fixture, no models loaded. The one
import from ``apps`` is ``apps.common.compatibility_register`` (dataclasses and
datetime only), read for the announced window every dated register shares.

Validates: Requirements R1.2, R1.3, R1.6
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from datetime import date
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# backend/tests/unit/test_canonical_tenant_drift_guard.py
#   .parents[2] -> backend/
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_APPS_ROOT = _BACKEND_ROOT / "apps"

_SKIP_DIR_NAMES = {"__pycache__", "migrations"}


# ---------------------------------------------------------------------------
# What counts as a legacy-string predicate
# ---------------------------------------------------------------------------

# The three pre-canonical Application display-snapshot columns.
_LEGACY_FIELDS = {"program", "intake", "institution"}

# Django string lookups. A ``program__<suffix>`` predicate is only a legacy
# *string* match when the suffix is one of these; anything else (e.g.
# ``program__institution_id``) is a relation traversal onto canonical IDs.
_STRING_LOOKUPS = {
    "icontains",
    "iexact",
    "exact",
    "contains",
    "startswith",
    "istartswith",
    "endswith",
    "iendswith",
    "regex",
    "iregex",
}

# ORM query-predicate call names. Writes (``create``/``update``/``bulk_*``) are
# intentionally absent — persisting the snapshot string is allowed.
_PREDICATE_METHODS = {"filter", "exclude", "get"}

# Catalog / other model classes on which ``program`` / ``intake`` /
# ``institution`` are genuine foreign keys (NOT the Application legacy strings).
# A method-call predicate whose receiver chain roots at one of these is skipped.
_NON_APPLICATION_MODEL_ROOTS = {
    "Program",
    "ProgramFee",
    "ProgramIntake",
    "Institution",
    "CanonicalProgram",
    "Intake",
    "InstitutionDomain",
    "InstitutionAsset",
    "InstitutionDocumentTemplate",
    "InstitutionRequiredDocument",
    "UserInstitutionMembership",
    "AccessGrant",
    "Subject",
    "CourseRequirement",
    "AcademicCalendarEvent",
}


# ---------------------------------------------------------------------------
# Allowlist — the explicit, labelled legacy-fallback / pre-canonical branches.
#
# Each entry carries ``path``, ``signature``, accountable owner and removal
# date. These are the ONLY places allowed to match on the Application legacy
# strings; every one is a documented legacy-fallback or pre-canonical-display
# branch. A new predicate with any other signature fails the guard.
#
# Every entry is a genuinely transitional Legacy_Exception: the shared removal
# condition in docs/canonical-truth-map.md ("Removal condition (R1.5)") says each
# branch goes once no ``applications`` row has a null canonical ID. None of the
# eleven is permanent by design, so all eleven are dated.
# ---------------------------------------------------------------------------

@dataclass(frozen=True, order=True)
class LegacyPredicateException:
    path: str
    signature: str
    owner: str
    remove_by: date


#: The owner of every entry — read from the register's own records, not coined
#: here. Set by admissions-v2 task 12.5 pass 2 (2026-10-09, finding GATE-13.6-01)
#: under the user's authorization, on behalf of the owning spec:
#:
#: * ``docs/canonical-truth-map.md`` documents this register under
#:   "## Multi-Tenant (Beanola)", whose spec of record is
#:   ``.kiro/specs/_archived/multi-tenant-beanola-admissions/``;
#: * that spec's R1.3 *is* the exception class this register implements ("a
#:   clearly labelled legacy-fallback branch for rows with null Canonical_IDs")
#:   and its R1.6 requires this drift guard — the R-ids this module validates;
#: * GATE-13.6-01 names ``multi-tenant-beanola`` as an owning lane.
#:
#: It replaces ``platform-tenancy``, which M11 (docs/v2-evidence/13.6/remediation/
#: M11/README.md Q12) measured as a name no spec, steering file or the truth map
#: contains. ``_OWNER_PROVENANCE`` below makes that check mechanical.
_LEGACY_PREDICATE_OWNER = "multi-tenant-beanola"

#: Owner -> the repo record that names it. An owner with no record here, or whose
#: record is gone, fails ``test_allowed_predicates_carry_owner_and_the_announced_window``
#: — the owner-side twin of the window parity below.
_OWNER_PROVENANCE = {
    "multi-tenant-beanola": ".kiro/specs/_archived/multi-tenant-beanola-admissions",
}

#: Where the removal date comes from: task 12.2's announced compatibility window,
#: READ from the canonical register rather than restated, so this register, the
#: SHIMS register (test_compatibility_surfaces_12_2.SHIM_REMOVAL_DATE_SOURCE reads
#: the same entry) and the brand allowlist carry one date with one place to change
#: it. It replaces the literal ``date(2027, 2, 7)`` M11 Q12 flagged.
_WINDOW_SOURCE = "catalog.legacy_institution_write"


def _announced_window_end() -> date:
    """The 12.2 window's end date, read from ``apps.common.compatibility_register``."""
    from apps.common.compatibility_register import COMPATIBILITY_SURFACES

    return date.fromisoformat(COMPATIBILITY_SURFACES[_WINDOW_SOURCE].end_date)


_LEGACY_PREDICATE_REMOVE_BY = _announced_window_end()


def _legacy_exception(path: str, signature: str) -> LegacyPredicateException:
    return LegacyPredicateException(
        path=path,
        signature=signature,
        owner=_LEGACY_PREDICATE_OWNER,
        remove_by=_LEGACY_PREDICATE_REMOVE_BY,
    )


_ALLOWED_PREDICATES: set[LegacyPredicateException] = {
    # duplicate_checker.py — canonical-first keying with an explicit legacy
    # string fallback only when the canonical id is absent (R8.5).
    _legacy_exception("apps/applications/duplicate_checker.py", "program=program"),
    _legacy_exception("apps/applications/duplicate_checker.py", "intake=intake"),
    # waitlist_manager.py — waitlist position/promotion keyed on the
    # pre-canonical program+intake display strings (pre-Beanola business logic).
    #
    # ``program=application.program`` and ``intake=application.intake`` were
    # REMOVED from this set by admissions-v2 task 12.5: the new staleness test
    # below found them on its first run, and the predicates they exempted are no
    # longer in the module. `application.program` / `application.intake` still
    # appear there, but as positional arguments to a helper and in notification
    # copy — not as ORM query kwargs, so they are not predicates and need no
    # exemption. The exemptions had outlived the code they covered.
    _legacy_exception("apps/applications/waitlist_manager.py", "program=program"),
    _legacy_exception("apps/applications/waitlist_manager.py", "intake=intake"),
    # intake_enforcer.py — capacity counts keyed on the legacy intake/program
    # name strings (pre-canonical enrollment counting).
    _legacy_exception("apps/applications/intake_enforcer.py", "intake=intake_name"),
    _legacy_exception("apps/applications/intake_enforcer.py", "program=program_name"),
    # tasks/waitlist.py — waitlist_cascade_task carries waitlisted rows to the
    # next intake using the pre-canonical program/intake display strings
    # (existing pre-Beanola cascade business logic; the Application.create()
    # below writes the snapshot and is correctly NOT a match).
    _legacy_exception("apps/applications/tasks/waitlist.py", "intake=intake.name"),
    _legacy_exception("apps/applications/tasks/waitlist.py", "program=app.program"),
    _legacy_exception("apps/applications/tasks/waitlist.py", "intake=next_intake.name"),
    # analytics/admissions_analytics.py — admin display-string contains filter
    # over the pre-canonical institution/program snapshots (reporting only).
    # Signatures are normalised by ast.unparse (single quotes).
    _legacy_exception(
        "apps/analytics/admissions_analytics.py",
        "institution__icontains=filters['institution']",
    ),
    _legacy_exception(
        "apps/analytics/admissions_analytics.py",
        "program__icontains=filters['program']",
    ),
}


_ALLOWED_PREDICATE_KEYS = {
    (entry.path, entry.signature) for entry in _ALLOWED_PREDICATES
}


# ---------------------------------------------------------------------------
# AST helpers
# ---------------------------------------------------------------------------


def _iter_py_files(root: Path):
    for path in root.rglob("*.py"):
        if any(part in _SKIP_DIR_NAMES for part in path.parts):
            continue
        yield path.resolve()


def _legacy_kwarg(name: str | None) -> bool:
    """True when *name* targets a legacy string field (bare or string lookup)."""
    if not name:
        return False
    parts = name.split("__")
    if parts[0] not in _LEGACY_FIELDS:
        return False
    if len(parts) == 1:
        return True
    if len(parts) == 2 and parts[1] in _STRING_LOOKUPS:
        return True
    return False


def _root_name(node: ast.AST) -> str | None:
    """Walk a receiver chain (calls/attributes/subscripts) to its root Name."""
    cur = node
    while True:
        if isinstance(cur, ast.Call):
            cur = cur.func
        elif isinstance(cur, ast.Attribute):
            cur = cur.value
        elif isinstance(cur, ast.Subscript):
            cur = cur.value
        else:
            break
    return cur.id if isinstance(cur, ast.Name) else None


def _unparse(value: ast.AST) -> str:
    try:
        return ast.unparse(value)
    except Exception:  # pragma: no cover - defensive
        return "<unparseable>"


def _is_query_predicate_call(call: ast.Call) -> bool:
    """True for ``X.filter/exclude/get(...)`` or ``Q(...)`` calls."""
    func = call.func
    if isinstance(func, ast.Attribute) and func.attr in _PREDICATE_METHODS:
        return True
    if isinstance(func, ast.Name) and func.id == "Q":
        return True
    return False


def _call_is_skippable_fk_predicate(call: ast.Call) -> bool:
    """Skip method-call predicates rooted at a known non-Application model."""
    func = call.func
    if isinstance(func, ast.Attribute):
        root = _root_name(func.value)
        return root in _NON_APPLICATION_MODEL_ROOTS
    return False  # Q(...) has no receiver — never skipped here.


def _scan_file(path: Path) -> list[tuple[str, int, str]]:
    """Return ``(signature, line_no, source_line)`` legacy-string predicate hits."""
    rel = str(path.relative_to(_BACKEND_ROOT))
    source = path.read_text(encoding="utf-8", errors="replace")
    try:
        tree = ast.parse(source, filename=rel)
    except SyntaxError:  # pragma: no cover - defensive
        return []
    src_lines = source.splitlines()

    hits: list[tuple[str, int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not _is_query_predicate_call(node):
            continue
        if _call_is_skippable_fk_predicate(node):
            continue
        for kw in node.keywords:
            if kw.arg is None:  # **kwargs splat
                continue
            if not _legacy_kwarg(kw.arg):
                continue
            signature = f"{kw.arg}={_unparse(kw.value)}"
            line_no = getattr(kw.value, "lineno", node.lineno)
            src = src_lines[line_no - 1].strip() if 0 < line_no <= len(src_lines) else ""
            hits.append((signature, line_no, src))
    return hits


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------


def test_no_new_runtime_logic_matches_legacy_tenant_strings():
    """Canonical IDs are the sole routing/scoping authority (R1.2, R1.3).

    Fails when any module under ``backend/apps/`` adds a NEW ORM predicate that
    matches on the ``applications.program/intake/institution`` legacy strings
    outside the explicitly allowlisted legacy-fallback branches.

    Validates: Requirements R1.2, R1.3, R1.6
    """
    assert _APPS_ROOT.is_dir(), f"expected backend/apps to exist at {_APPS_ROOT}"

    offenders: dict[str, list[tuple[str, int, str]]] = {}
    for path in _iter_py_files(_APPS_ROOT):
        rel = str(path.relative_to(_BACKEND_ROOT))
        for signature, line_no, src in _scan_file(path):
            if (rel, signature) in _ALLOWED_PREDICATE_KEYS:
                continue
            offenders.setdefault(rel, []).append((signature, line_no, src))

    if offenders:
        lines = [
            "Canonical IDs (canonical_programs.id / programs.id / "
            "institutions.id / intakes.id) are the sole sources of truth for "
            "routing, scoping, payment tagging, and document generation "
            "(R1.2, R1.3). The following modules add NEW runtime logic that "
            "matches on the legacy applications.program/intake/institution "
            "display strings. Key on the canonical IDs instead, or — if this is "
            "a deliberate, labelled legacy-fallback branch — add its "
            "(path, 'field=value') signature to _ALLOWED_PREDICATES with a "
            "comment.",
            "",
        ]
        for rel in sorted(offenders):
            lines.append(f"  {rel}")
            for signature, line_no, src in offenders[rel]:
                lines.append(f"    line {line_no} [{signature}]: {src}")
            lines.append("")
        raise AssertionError("\n".join(lines))


def test_allowed_predicates_has_no_stale_entries_and_can_only_shrink():
    """The allowlist may only SHRINK — an entry that stopped being a violation fails.

    Added by admissions-v2 task **12.5** (R1.5, R14.7). Until this test existed,
    ``_ALLOWED_PREDICATES`` had the one property an exemption register must not
    have: nothing failed when an entry stopped matching. A legacy-fallback branch
    that a later task rewrote onto canonical IDs would leave its exemption behind
    silently, and the register would grow monotonically while looking clean.

    Task 12.4 §4.3 built exactly this mechanism for ``DECLINED_REMOVALS``
    (*"an entry that stops being dead ALSO fails it"*), and task 12.2 §10.3 built
    it for the re-export shims. This is the same mechanism on the third register,
    reused rather than reinvented — which is why this test adds no new allowlist
    of its own.

    The removal condition for the whole set is in
    ``docs/canonical-truth-map.md`` → *"Removal condition (R1.5)"*: each branch is
    retained only while ``applications`` rows with null canonical IDs still exist.
    That is a **data** condition, so it cannot be evaluated from source; what this
    test evaluates is the weaker but still useful source condition — the branch it
    exempts is still there.

    Validates: Requirements R1.5
    """
    live: set[tuple[str, str]] = set()
    for path in _iter_py_files(_APPS_ROOT):
        rel = str(path.relative_to(_BACKEND_ROOT))
        for signature, _line_no, _src in _scan_file(path):
            live.add((rel, signature))

    stale = sorted(_ALLOWED_PREDICATE_KEYS - live)
    assert not stale, (
        "Stale _ALLOWED_PREDICATES entries: the legacy-string predicate each one "
        "exempts is no longer present, so the exemption outlived the code it "
        "covered (R1.5). Delete these entries — the allowlist may only shrink:\n"
        + "\n".join(f"  {rel}  [{sig}]" for rel, sig in stale)
        + "\n\nAlso drop the corresponding row from the legacy-string fallback "
        "allowlist table in docs/canonical-truth-map.md."
    )


def test_allowed_predicates_carry_owner_and_the_announced_window():
    """Every entry is an accountable Legacy_Exception on the platform's one window.

    Task 12.5's clause allows a remaining match only as *"a registered
    Legacy_Exception with owner/removal date"* (finding GATE-13.6-01). This is the
    same mechanism admissions-v2 task 13.6 item L10 gave the SHIMS,
    LEGACY_EXCEPTIONS and PREVIEW_ALLOWLIST registers
    (docs/v2-evidence/13.6/remediation/L9-L11/README.md §4.4), replacing the
    invented owner and the hardcoded date M11 Q12 flagged:

    * the owner must name a lane with a record in this repo (``_OWNER_PROVENANCE``);
    * the date must BE task 12.2's announced window, read from
      ``compatibility_register`` — never a second date for the same decision;
    * and the window is evaluated, not announced: once it closes this test fails
      **on purpose**, naming the only two legitimate answers.

    The removal condition itself is a DATA condition (zero ``applications`` rows
    with a null canonical ID, docs/canonical-truth-map.md "Removal condition
    (R1.5)") and cannot be evaluated from source; the staleness test above
    evaluates the source half. The window is what makes the data half get
    reconsidered by a date instead of never.

    Validates: Requirements R1.5; admissions-v2 R15.6 (an exception carries an owner
    and a removal date)
    """
    repo_root = _BACKEND_ROOT.parent
    window_end = _announced_window_end()
    problems: list[str] = []
    for entry in sorted(_ALLOWED_PREDICATES):
        label = f"{entry.path} [{entry.signature}]"
        record = _OWNER_PROVENANCE.get(entry.owner.strip())
        if record is None:
            problems.append(
                f"{label}: owner {entry.owner!r} has no record in _OWNER_PROVENANCE — "
                "name the lane whose spec owns this branch, not an invented one"
            )
        elif not (repo_root / record).exists():
            problems.append(f"{label}: owner {entry.owner!r}'s record {record} is missing")
        if entry.remove_by != window_end:
            problems.append(
                f"{label}: removal date {entry.remove_by.isoformat()} is not the announced "
                f"window ({window_end.isoformat()}, compatibility_register."
                f"COMPATIBILITY_SURFACES[{_WINDOW_SOURCE!r}].end_date). One decision, one "
                "window: move the register, not this entry"
            )
    assert not problems, "Legacy predicate exceptions (R1.5, task 12.5 clause):\n  " + "\n  ".join(
        problems
    )

    today = date.today()
    assert window_end >= today, (
        f"The announced window for all {len(_ALLOWED_PREDICATES)} legacy-string predicate "
        f"exceptions closed on {window_end.isoformat()} (today {today.isoformat()}). The "
        "two legitimate answers: meet the removal condition — backfill canonical IDs onto "
        "the remaining legacy applications rows, drop the legacy-string predicate from "
        "each module (keeping the canonical-ID path), delete its entry here and its row "
        "in docs/canonical-truth-map.md — or announce a new window in "
        "apps/common/compatibility_register.py on purpose."
    )
