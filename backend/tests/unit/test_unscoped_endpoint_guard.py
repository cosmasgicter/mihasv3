"""Unscoped document-serving-endpoint drift guard — Phase 11, Task 41.2 of
``.kiro/specs/multi-tenant-beanola-remediation/`` (R18.4).

Invariant guarded
-----------------
A *document-serving endpoint* must never return application / payment / document
records whose result set is not constrained by ``AccessScopeService`` scope for
the requesting role (design.md, Component 8, guard 4; R18.4). This guard fails —
and reports the offending ``file:line: class`` — if a future change adds (or
mutates) a document-serving endpoint that returns those records without funnelling
through the scope seam.

Where the companion scope-authorization guard (R18.3,
``test_scope_drift_guard.py``) catches an *admin-role-alone* authorization branch
over a resource, this guard catches the complementary failure: a document-serving
endpoint that returns application / payment / document records while referencing
**no scope seam at all**.

Scanned surface (the document-serving modules named in the task)
---------------------------------------------------------------
Exactly the five modules that serve application / payment / official-document
records to potentially non-super-admin callers — Phase 2/3 of the remediation
hardened these:

* ``apps/documents/document_storage_views.py``      (extract / signed-url /
  download / info / delete / upload — all via ``_get_authorized_document``)
* ``apps/documents/payment_query_views.py``          (payment list / receipt /
  verify / settlement summary — all via ``AccessScopeService.filter_payments``)
* ``apps/applications/document_views.py``            (verify-document, official
  PDF generators — all via ``_get_scoped_application``)
* ``apps/applications/official_document_views.py``   (student-safe official-doc
  status/list — via ``_get_authorized_application``)
* ``apps/applications/student_document_views.py``    (application documents list,
  email-slip)

Scoping the scan to this reviewed module set keeps the guard meaningful and
stable: it is precisely the "document-serving endpoint" surface R18.4 governs,
and it catches a *new* unscoped endpoint dropped into any of these modules
automatically (the embedded ``test_guard_detects_*`` cases prove this).

Heuristic (documented and deliberately pragmatic)
-------------------------------------------------
1. **Parse each module with the AST** and find every view class — a ``class``
   whose bases include ``APIView``, ``ViewSet``, or ``ModelViewSet``.

2. **Only treat a class as *record-serving* when its body references one of the
   tenant resource models** (``Application`` / ``Payment`` /
   ``ApplicationDocument``). A view that does not touch these models (e.g. a
   fee-resolver or program-fee-config endpoint) is not governed by the
   invariant and is skipped.

3. **Require a scope seam in the class body.** For every record-serving class,
   the class source must reference one of the scope-seam tokens — the
   ``AccessScopeService`` authority itself, one of its ``filter_*`` entry
   points, or one of the shared scoped loaders (``_get_authorized_document`` /
   ``_get_authorized_application`` / ``_get_scoped_application``) that funnel
   through it. A record-serving class with **no** seam token — and not on the
   reviewed allowlist — fails the guard with its ``file:line: class``.

This passes on the current (correct) codebase, where every record-serving class
in the five modules references the scope seam, and fails on a real regression
(a new document endpoint returning records with no scope), as the embedded
self-tests prove.

_Requirements: R18.4_
"""
from __future__ import annotations

import ast
from pathlib import Path

# backend/tests/unit/ -> backend/ is parents[2].
_BACKEND_ROOT = Path(__file__).resolve().parents[2]

# The reviewed set of document-serving modules R18.4 governs (repo-relative).
_DOCUMENT_SERVING_MODULES: tuple[str, ...] = (
    "apps/documents/document_storage_views.py",
    "apps/documents/payment_query_views.py",
    "apps/applications/document_views.py",
    "apps/applications/official_document_views.py",
    "apps/applications/student_document_views.py",
)

# Tenant resource models whose records the invariant governs. A view class is
# only "record-serving" when its body references one of these names.
_RESOURCE_MODELS: tuple[str, ...] = (
    "ApplicationDocument",
    "Application",
    "Payment",
)

# Scope-seam tokens. Any one of these in a record-serving class body means the
# class obtains its permitted scope from AccessScopeService (directly, via a
# ``filter_*`` entry point, or via a shared scoped loader that funnels through
# it).
_SCOPE_SEAM_TOKENS: tuple[str, ...] = (
    "AccessScopeService",
    "filter_applications",
    "filter_payments",
    "filter_documents",
    "_get_authorized_document",
    "_get_authorized_application",
    "_get_scoped_application",
    # Object-level + membership scope seams used by the staff endpoints the
    # beanola-production-readiness Task 11 gap register narrowed (GAP-1…GAP-12).
    "_staff_can_access_application",
    "filters_for_user",
    "_scope_institution_ids",
    "_scoped_user_ids",
)

# Base-class name suffixes that mark a class as a DRF view/endpoint.
_VIEW_BASE_SUFFIXES = ("APIView", "ViewSet", "ModelViewSet")

# Reviewed allowlist of ``module::ClassName`` endpoints permitted to touch a
# resource model without a scope seam. Keep tight and reasoned — each entry is a
# legitimate non-record-serving (or owner-only) site. Empty by design: current
# document-serving classes all reference a scope seam.
_ALLOWLIST: dict[str, str] = {}


def _is_view_class(node: ast.ClassDef) -> bool:
    """True if any base class name ends with a known DRF view/viewset suffix."""
    for base in node.bases:
        try:
            name = ast.unparse(base)
        except Exception:  # pragma: no cover - defensive for exotic base exprs
            continue
        if any(name.endswith(suffix) for suffix in _VIEW_BASE_SUFFIXES):
            return True
    return False


def _referenced_identifiers(node: ast.ClassDef) -> set[str]:
    """Return the set of *real* identifiers referenced in a class body.

    Collects ``Name`` ids, ``Attribute`` attribute names, and imported
    aliases — i.e. names the code actually uses. String literals, docstrings,
    and comments are never AST identifiers, so prose mentions of
    ``AccessScopeService`` / ``Payment`` (and identifier *substrings* like
    ``Payment`` inside ``PaymentUserScopedRateThrottle``) never register. This
    is what makes the heuristic precise instead of a noisy substring grep.
    """
    names: set[str] = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Name):
            names.add(child.id)
        elif isinstance(child, ast.Attribute):
            names.add(child.attr)
        elif isinstance(child, ast.ImportFrom):
            for alias in child.names:
                names.add(alias.asname or alias.name)
        elif isinstance(child, ast.Import):
            for alias in child.names:
                names.add((alias.asname or alias.name).split(".")[0])
    return names


def scan_module_source(rel_path: str, source: str) -> list[str]:
    """Return ``rel:line: class`` violations for one module's source text.

    A violation is a record-serving view class (references a tenant resource
    model) whose body references no scope-seam identifier and is not
    allowlisted. Detection is AST identifier-based, so docstrings, comments,
    and identifier substrings cannot create false positives or negatives.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    violations: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef) or not _is_view_class(node):
            continue

        key = f"{rel_path}::{node.name}"
        if key in _ALLOWLIST:
            continue

        identifiers = _referenced_identifiers(node)
        if not identifiers & set(_RESOURCE_MODELS):
            # Not a tenant-record-serving class — outside the invariant.
            continue
        if identifiers & set(_SCOPE_SEAM_TOKENS):
            continue  # Scoped through AccessScopeService — compliant.

        violations.append(f"{rel_path}:{node.lineno}: class {node.name}")
    return violations


def scan_modules() -> list[str]:
    """Scan the reviewed document-serving modules for unscoped record endpoints."""
    violations: list[str] = []
    for rel in _DOCUMENT_SERVING_MODULES:
        path = _BACKEND_ROOT / rel
        try:
            source = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        violations.extend(scan_module_source(rel, source))
    return violations


# --------------------------------------------------------------------------- #
# Guard against the real codebase                                             #
# --------------------------------------------------------------------------- #


def test_document_serving_modules_exist_on_disk():
    """Every governed module must resolve — otherwise the scan is vacuous."""
    missing = [
        rel for rel in _DOCUMENT_SERVING_MODULES if not (_BACKEND_ROOT / rel).exists()
    ]
    assert missing == [], (
        "Document-serving module(s) named by the R18.4 guard no longer exist — "
        "update _DOCUMENT_SERVING_MODULES:\n  " + "\n  ".join(missing)
    )


def test_no_unscoped_document_serving_endpoint():
    """R18.4: no document-serving endpoint returns application/payment/document
    records whose result set is not constrained by AccessScopeService scope."""
    violations = scan_modules()
    assert violations == [], (
        "Unscoped document-serving endpoint detected — a view returns "
        "application/payment/document records without constraining the result "
        "set through AccessScopeService scope (R18.4). Route the record-serving "
        "path through `AccessScopeService().filter_*(...)` / "
        "`_get_authorized_document(...)` / `_get_authorized_application(...)` / "
        "`_get_scoped_application(...)`, or (if the endpoint legitimately serves "
        "no other tenant's records) add it to the reviewed allowlist with a "
        "reason.\nOffending endpoints:\n  " + "\n  ".join(violations)
    )


def test_allowlist_entries_resolve_on_disk():
    """Keep the allowlist honest: every entry must name a class that still
    exists and still touches a resource model (otherwise it is stale)."""
    stale: list[str] = []
    for key in sorted(_ALLOWLIST):
        rel, _, class_name = key.partition("::")
        path = _BACKEND_ROOT / rel
        if not path.exists():
            stale.append(f"{key} (file missing)")
            continue
        source = path.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source)
        except SyntaxError:
            stale.append(f"{key} (module does not parse)")
            continue
        match = next(
            (
                n
                for n in ast.walk(tree)
                if isinstance(n, ast.ClassDef) and n.name == class_name
            ),
            None,
        )
        if match is None:
            stale.append(f"{key} (class missing)")
            continue
        if not _referenced_identifiers(match) & set(_RESOURCE_MODELS):
            stale.append(f"{key} (no resource-model reference)")
    assert stale == [], (
        "Stale unscoped-endpoint allowlist entries — remove these from "
        "_ALLOWLIST:\n  " + "\n  ".join(stale)
    )


# --------------------------------------------------------------------------- #
# beanola-production-readiness Task 11.3 — gap-register scope enforcement      #
# (R5.9, R5.2).                                                                #
#                                                                              #
# Task 11.1 produced ``docs/audits/scope-endpoint-inventory.md`` whose gap     #
# register found 12 staff endpoints (GAP-1…GAP-12) that returned or mutated    #
# tenant records without funnelling through AccessScopeService. They slip past #
# the document-serving heuristic above because they live OUTSIDE the five      #
# document-serving modules and authorize with ``IsAdmin`` /                    #
# ``role in (...)`` membership checks rather than a literal ``role ==          #
# "admin"`` equality (so the companion scope-drift guard misses them too).     #
#                                                                              #
# This guard pins each gap-register endpoint by ``module::ClassName`` and      #
# asserts the class body references a scope seam, so the Task 11.2 narrowing   #
# fixes cannot regress silently. Unlike a broad heuristic it does NOT flag     #
# owner-scoped siblings in the same modules (e.g. NotificationListView,        #
# ApplicationWithdrawView), which are correctly filtered by ``user_id`` and    #
# are not staff-scoped tenant reads.                                           #
# --------------------------------------------------------------------------- #

# The reviewed staff-scoped endpoints named in the Task 11.1 gap register.
# Each MUST reference a scope seam (R5.2/R5.9). ``module → {class: gap-id}``.
_GAP_REGISTER_ENDPOINTS: dict[str, dict[str, str]] = {
    "apps/applications/admin_bulk_views.py": {
        "ApplicationBulkStatusView": "GAP-1",
    },
    "apps/applications/interview_views.py": {
        "ApplicationInterviewListView": "GAP-2",
        "ApplicationInterviewView": "GAP-6",
    },
    "apps/applications/history_views.py": {
        "TimelineHistoryView": "GAP-3",
    },
    "apps/applications/student_withdrawal_views.py": {
        "ApplicationWaitlistPositionView": "GAP-7",
        "ApplicationConditionsView": "GAP-7",
    },
    "apps/applications/admin_amendment_views.py": {
        "ApplicationAdminSummaryView": "GAP-5",
        "ApplicationConditionVerifyView": "GAP-8",
        "ApplicationAmendmentReviewView": "GAP-8",
    },
    "apps/accounts/admin_user_views.py": {
        "AdminUserExportView": "GAP-9",
        "AdminUserDetailView": "GAP-10",
    },
    "apps/accounts/admin_audit_views.py": {
        "AdminAuditLogView": "GAP-11",
    },
    "apps/common/notification_views.py": {
        "AdminNotificationHistoryView": "GAP-12",
    },
}


def _class_node(tree: ast.Module, class_name: str) -> ast.ClassDef | None:
    return next(
        (
            n
            for n in ast.walk(tree)
            if isinstance(n, ast.ClassDef) and n.name == class_name
        ),
        None,
    )


def scan_gap_register() -> list[str]:
    """Return ``gap-id module::Class`` for any gap endpoint missing a scope seam.

    Detection is AST identifier-based (same precision as the document-serving
    scan): docstrings, comments, and identifier substrings cannot create false
    positives or negatives.
    """
    violations: list[str] = []
    for rel, classes in _GAP_REGISTER_ENDPOINTS.items():
        path = _BACKEND_ROOT / rel
        try:
            source = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            violations.append(f"(unreadable) {rel}")
            continue
        try:
            tree = ast.parse(source)
        except SyntaxError:
            violations.append(f"(does not parse) {rel}")
            continue
        for class_name, gap_id in classes.items():
            node = _class_node(tree, class_name)
            if node is None:
                violations.append(f"{gap_id} {rel}::{class_name} (class missing)")
                continue
            identifiers = _referenced_identifiers(node)
            if not (identifiers & set(_SCOPE_SEAM_TOKENS)):
                violations.append(
                    f"{gap_id} {rel}::{class_name} "
                    f"(line {node.lineno}, no AccessScopeService scope seam)"
                )
    return violations


def test_gap_register_endpoints_exist_on_disk():
    """Every gap-register module must resolve — otherwise the scan is vacuous."""
    missing = [
        rel
        for rel in _GAP_REGISTER_ENDPOINTS
        if not (_BACKEND_ROOT / rel).exists()
    ]
    assert missing == [], (
        "Gap-register module(s) named by the Task 11.3 guard no longer exist — "
        "update _GAP_REGISTER_ENDPOINTS:\n  " + "\n  ".join(missing)
    )


def test_gap_register_endpoints_are_scoped():
    """R5.9/R5.2: every staff endpoint in the Task 11.1 gap register funnels
    through AccessScopeService so cross-school leakage cannot regress silently.

    Pins GAP-1…GAP-12 from ``docs/audits/scope-endpoint-inventory.md``. If a
    Task 11.2 narrowing fix is reverted (the scope seam removed from one of
    these classes), this guard fails and names the ``gap-id module::Class``.
    """
    violations = scan_gap_register()
    assert violations == [], (
        "Gap-register staff endpoint(s) no longer reference AccessScopeService "
        "scope — a Task 11.2 narrowing fix has regressed (R5.9/R5.2). Re-route "
        "the record load/mutation through "
        "`AccessScopeService().filter_*(...)` / `_staff_can_access_application(...)` "
        "/ `filters_for_user(...)` / `_scope_institution_ids(...)`.\n"
        "Offending endpoints:\n  " + "\n  ".join(violations)
    )


def test_gap_register_classes_are_view_classes():
    """Keep the registry honest: every pinned name must be a real DRF view
    class — otherwise the pin is stale/misnamed."""
    problems: list[str] = []
    for rel, classes in _GAP_REGISTER_ENDPOINTS.items():
        path = _BACKEND_ROOT / rel
        if not path.exists():
            continue  # covered by test_gap_register_endpoints_exist_on_disk
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for class_name in classes:
            node = _class_node(tree, class_name)
            if node is None:
                problems.append(f"{rel}::{class_name} (class missing)")
                continue
            if not _is_view_class(node):
                problems.append(f"{rel}::{class_name} (not a DRF view class)")
    assert problems == [], (
        "Stale/misnamed gap-register pins — fix _GAP_REGISTER_ENDPOINTS:\n  "
        + "\n  ".join(problems)
    )


# --------------------------------------------------------------------------- #
# Self-tests: prove the guard fails on a real regression and passes on        #
# correctly-scoped code (so a future no-op refactor cannot quietly defang it).#
# --------------------------------------------------------------------------- #


_REGRESSION_SOURCE = '''\
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.documents.models import ApplicationDocument


class LeakyDocumentListView(APIView):
    """Returns document records with NO AccessScopeService scope — the R18.4 bug."""

    def get(self, request, application_id):
        docs = ApplicationDocument.objects.filter(application_id=application_id)
        return Response({"success": True, "data": serialize(docs)})
'''

_COMPLIANT_SOURCE = '''\
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.catalog.services import AccessScopeService
from apps.documents.models import ApplicationDocument


class ScopedDocumentListView(APIView):
    def get(self, request, application_id):
        docs = AccessScopeService().filter_documents(
            ApplicationDocument.objects.filter(application_id=application_id),
            request.user,
        )
        return Response({"success": True, "data": serialize(docs)})
'''

_COMPLIANT_LOADER_SOURCE = '''\
from rest_framework.views import APIView
from rest_framework.response import Response


class LoaderScopedView(APIView):
    def get(self, request, document_id):
        document, error = _get_authorized_document(request, self, document_id)
        if error is not None:
            return error
        return Response({"success": True, "data": {"id": str(document.id)}})
'''

_NON_RESOURCE_SOURCE = '''\
from rest_framework.views import APIView
from rest_framework.response import Response


class FeeResolveView(APIView):
    def get(self, request):
        from apps.documents.fee_resolver import FeeResolver

        resolved = FeeResolver().resolve_fee(program_code="X")
        return Response({"success": True, "data": {"amount": str(resolved.amount)}})
'''


def test_guard_detects_unscoped_regression():
    """A doc-serving view returning records with no seam is flagged with line."""
    violations = scan_module_source("apps/example/leaky.py", _REGRESSION_SOURCE)
    assert len(violations) == 1, violations
    assert violations[0].startswith("apps/example/leaky.py:7:")
    assert "LeakyDocumentListView" in violations[0]


def test_guard_passes_scoped_filter_branch():
    """A class routing records through AccessScopeService.filter_* is compliant."""
    assert scan_module_source("apps/example/scoped.py", _COMPLIANT_SOURCE) == []


def test_guard_passes_scoped_loader_branch():
    """A class routing through the shared scoped loader is compliant."""
    assert scan_module_source("apps/example/loader.py", _COMPLIANT_LOADER_SOURCE) == []


def test_guard_ignores_non_resource_views():
    """A view that touches no tenant resource model is outside the invariant."""
    assert scan_module_source("apps/example/fee.py", _NON_RESOURCE_SOURCE) == []


def test_guard_passes_scoped_email_slip_branch():
    """Email-slip is compliant when staff access routes through scope service."""
    rel = "apps/applications/student_document_views.py"
    source = (
        "from rest_framework.views import APIView\n"
        "from rest_framework.response import Response\n"
        "from apps.catalog.services import AccessScopeService\n"
        "from apps.applications.models import Application\n\n\n"
        "class EmailSlipView(APIView):\n"
        "    def post(self, request, application_id):\n"
        "        application = Application.objects.get(id=application_id)\n"
        "        AccessScopeService().filter_applications(\n"
        "            Application.objects.filter(id=application.id), request.user\n"
        "        )\n"
        "        return Response({'success': True, 'data': {'queued_id': '1'}})\n"
    )
    assert scan_module_source(rel, source) == []


# --------------------------------------------------------------------------- #
# Self-tests for the gap-register scan: prove it flags a reverted Task 11.2    #
# fix (scope seam removed) and passes on a scoped class, so the gap pins       #
# cannot be silently defanged.                                                 #
# --------------------------------------------------------------------------- #


def _gap_register_scan_for(sources: dict[str, str]) -> list[str]:
    """Run the gap-register seam check against in-memory ``rel -> source`` text
    (mirrors ``scan_gap_register`` without touching disk)."""
    violations: list[str] = []
    for rel, classes in _GAP_REGISTER_ENDPOINTS.items():
        source = sources.get(rel)
        if source is None:
            continue
        tree = ast.parse(source)
        for class_name, gap_id in classes.items():
            node = _class_node(tree, class_name)
            if node is None:
                violations.append(f"{gap_id} {rel}::{class_name} (class missing)")
                continue
            if not (_referenced_identifiers(node) & set(_SCOPE_SEAM_TOKENS)):
                violations.append(f"{gap_id} {rel}::{class_name}")
    return violations


_GAP_REVERTED_SOURCE = '''\
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.accounts.permissions import IsAdmin
from apps.applications.models import Application


class ApplicationBulkStatusView(APIView):
    """Reverted Task 11.2 fix: loads the batch with NO AccessScopeService scope."""

    permission_classes = [IsAdmin]

    def post(self, request):
        applications = list(Application.objects.filter(id__in=request.data["ids"]))
        return Response({"success": True, "data": {"updated": len(applications)}})
'''

_GAP_SCOPED_SOURCE = '''\
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.accounts.permissions import IsAdmin
from apps.catalog.services import AccessScopeService
from apps.applications.models import Application


class ApplicationBulkStatusView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        applications = AccessScopeService().filter_applications(
            Application.objects.filter(id__in=request.data["ids"]), request.user,
        )
        return Response({"success": True, "data": {"updated": applications.count()}})
'''


def test_gap_register_scan_detects_reverted_fix():
    """Removing the scope seam from a pinned gap endpoint is flagged by gap-id."""
    rel = "apps/applications/admin_bulk_views.py"
    violations = _gap_register_scan_for({rel: _GAP_REVERTED_SOURCE})
    assert violations == [f"GAP-1 {rel}::ApplicationBulkStatusView"], violations


def test_gap_register_scan_passes_scoped_fix():
    """A pinned gap endpoint routing through AccessScopeService is compliant."""
    rel = "apps/applications/admin_bulk_views.py"
    assert _gap_register_scan_for({rel: _GAP_SCOPED_SOURCE}) == []
