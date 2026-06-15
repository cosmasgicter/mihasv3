"""Scope-authorization drift guard — Phase 11, Task 41.1 of
``.kiro/specs/multi-tenant-beanola-remediation/`` (R18.3).

Invariant guarded
-----------------
``AccessScopeService`` is the *sole* authority for non-super-admin scope. No
view may authorize application / payment / document access on an ``admin`` role
check **alone**; School_Staff scope must always be obtained from
``AccessScopeService`` (design.md, Component 11, guard 3). This guard fails — and
reports the offending ``file:line`` — if a future change reintroduces a
role-only authorization path for any role other than Super_Admin.

Heuristic (documented and deliberately pragmatic)
-------------------------------------------------
A purely textual ``role == "admin"`` search is noisy: the same string appears in
docstrings, comments, membership checks (``role in ("admin", "super_admin")``),
and non-authorization role logic. To stay meaningful and stable this guard:

1. **Uses the Python tokenizer, not regex**, to find *real* equality
   comparisons against the literal ``"admin"`` (an ``==`` operator token
   adjacent to a string token whose value is exactly ``admin``). Because
   comments and docstrings are single ``COMMENT`` / ``STRING`` tokens — never a
   ``NAME == STRING`` operator sequence — the prose mentions of ``role ==
   "admin"`` in module docstrings are excluded automatically. Membership checks
   (``role in ("admin", "super_admin")``) and ``== "super_admin"`` are excluded
   because their string value is not exactly ``admin``.

2. **Pairs the admin-role signal with a resource-access signal.** A bare
   ``admin`` comparison is only treated as a *resource-authorization* site when
   its enclosing function also references one of the application / payment /
   document resources (the ``Application`` / ``Payment`` /
   ``ApplicationDocument`` models or the ``AccessScopeService.filter_*`` /
   ``_get_authorized_document`` scope entry-points). This scopes the scan to the
   sites the invariant actually governs.

3. **Requires ``AccessScopeService`` in the same function.** For every such
   resource-authorization site, the enclosing function must reference
   ``AccessScopeService``. If it authorizes on the admin role check alone — with
   no ``AccessScopeService`` anywhere in the function — the guard fails and names
   the ``file:line``.

This passes on the current (correct) codebase, where every singular ``role ==
"admin"`` authorization check in ``document_storage_views.py``,
``payment_query_views.py`` and ``student_draft_views.py`` is paired with an
``AccessScopeService().filter_*(...)`` call in the same function. It fails on a
real regression (an admin-alone authorization branch over a resource), as the
embedded ``test_guard_detects_*`` cases prove.

Allowlist
---------
``apps/catalog/services.py`` is the home of ``AccessScopeService`` itself — the
scope authority necessarily defines its own role/admin logic (e.g. the
``_legacy_admin_test_scope`` helper's ``.lower() == "admin"`` check) and is the
single source of truth the invariant points *at*, not a consumer of it. It is
the only allowlisted file, with the reason recorded inline below.

_Requirements: R18.3_
"""
from __future__ import annotations

import ast
import io
import tokenize
from pathlib import Path

# backend/tests/unit/ -> backend/ is parents[2].
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
SCAN_ROOT = _BACKEND_ROOT / "apps"

# Directories whose ``.py`` files are never production authorization code.
_SKIP_DIR_NAMES = {"__pycache__", ".pytest_cache", "migrations", "tests"}

# Resource-access signals: tokens that mark a function as authorizing access to
# application / payment / document data. The admin-role signal is only treated
# as a resource-authorization site when paired with one of these.
_RESOURCE_SIGNALS = (
    "Application",
    "Payment",
    "ApplicationDocument",
    "filter_applications",
    "filter_payments",
    "filter_documents",
    "_get_authorized_document",
)

# The scope authority that MUST be present in any resource-authorization
# function for the admin branch to be considered scoped.
_SCOPE_AUTHORITY = "AccessScopeService"

# Reviewed allowlist of repo-relative files permitted to compare against the
# ``"admin"`` literal without an accompanying ``AccessScopeService`` call.
# Keep this tight and reasoned — each entry is a legitimate, non-consumer site.
_ALLOWLIST: dict[str, str] = {
    # AccessScopeService lives here: the scope authority defines its own
    # admin/role logic (``_legacy_admin_test_scope`` -> ``.lower() == "admin"``)
    # and is the source of truth the R18.3 invariant points at, not a consumer.
    "apps/catalog/services.py": (
        "Home of AccessScopeService — the scope authority itself, not a "
        "consumer of it (R18.3)."
    ),
}


def _admin_equality_lines(source: str) -> set[int]:
    """Return 1-indexed line numbers of *real* ``== "admin"`` comparisons.

    Uses the tokenizer so comments and docstrings (single COMMENT/STRING
    tokens) are excluded — only an ``==`` operator adjacent to a string token
    whose literal value is exactly ``admin`` counts.
    """
    lines: set[int] = set()
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return lines

    def _is_admin_string(tok: tokenize.TokenInfo) -> bool:
        if tok.type != tokenize.STRING:
            return False
        try:
            value = ast.literal_eval(tok.string)
        except (ValueError, SyntaxError):
            return False
        return isinstance(value, str) and value == "admin"

    for index, tok in enumerate(tokens):
        if tok.type != tokenize.OP or tok.string != "==":
            continue
        nxt = tokens[index + 1] if index + 1 < len(tokens) else None
        prev = tokens[index - 1] if index - 1 >= 0 else None
        if (nxt is not None and _is_admin_string(nxt)) or (
            prev is not None and _is_admin_string(prev)
        ):
            lines.add(tok.start[0])
    return lines


def _function_spans(source: str) -> list[tuple[int, int]]:
    """Return ``(start_line, end_line)`` spans for every def in the module."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []
    spans: list[tuple[int, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            end = getattr(node, "end_lineno", None) or node.lineno
            spans.append((node.lineno, end))
    return spans


def _enclosing_span(line: int, spans: list[tuple[int, int]]) -> tuple[int, int]:
    """Return the innermost def span containing ``line`` (window fallback)."""
    containing = [(s, e) for (s, e) in spans if s <= line <= e]
    if containing:
        # Innermost = smallest span.
        return min(containing, key=lambda se: se[1] - se[0])
    # Module-level comparison: fall back to a small window around the line.
    return (max(1, line - 8), line + 8)


def _iter_source_files():
    for path in sorted(SCAN_ROOT.rglob("*.py")):
        if not path.is_file():
            continue
        if any(part in _SKIP_DIR_NAMES for part in path.relative_to(_BACKEND_ROOT).parts):
            continue
        yield path


def scan_source(rel_path: str, source: str) -> list[str]:
    """Return ``rel:line: snippet`` violations for one module's source text."""
    admin_lines = _admin_equality_lines(source)
    if not admin_lines:
        return []
    spans = _function_spans(source)
    text_lines = source.splitlines()
    violations: list[str] = []
    for line in sorted(admin_lines):
        start, end = _enclosing_span(line, spans)
        block = "\n".join(text_lines[start - 1 : end])
        # Only a resource-authorization site is governed by the invariant.
        if not any(signal in block for signal in _RESOURCE_SIGNALS):
            continue
        if _SCOPE_AUTHORITY in block:
            continue  # Scoped through AccessScopeService — compliant.
        snippet = text_lines[line - 1].strip()[:160] if line - 1 < len(text_lines) else ""
        violations.append(f"{rel_path}:{line}: {snippet}")
    return violations


def scan_tree() -> list[str]:
    """Scan ``backend/apps`` for admin-alone resource-authorization sites."""
    violations: list[str] = []
    for path in _iter_source_files():
        rel = path.relative_to(_BACKEND_ROOT).as_posix()
        if rel in _ALLOWLIST:
            continue
        try:
            source = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        violations.extend(scan_source(rel, source))
    return violations


# --------------------------------------------------------------------------- #
# Guard against the real codebase                                             #
# --------------------------------------------------------------------------- #


def test_no_admin_alone_resource_authorization_in_backend_apps():
    """R18.3: no non-super-admin path authorizes app/payment/document access on
    an admin role check alone, without ``AccessScopeService``."""
    violations = scan_tree()
    assert violations == [], (
        "Admin-role-alone authorization of application/payment/document access "
        "detected — scope must come from AccessScopeService, never a bare "
        "`role == \"admin\"` check (R18.3). Either route the branch through "
        "`AccessScopeService().filter_*(...)` / `_get_authorized_document(...)`, "
        "or (if this is the scope authority itself) add the file to the reviewed "
        "allowlist with a reason.\nOffending paths:\n  " + "\n  ".join(violations)
    )


def test_allowlist_entries_resolve_on_disk():
    """Keep the allowlist honest: every entry must exist and still compare to
    the ``"admin"`` literal (otherwise it is stale and should be removed)."""
    stale: list[str] = []
    for rel in sorted(_ALLOWLIST):
        path = _BACKEND_ROOT / rel
        if not path.exists():
            stale.append(f"{rel} (file missing)")
            continue
        source = path.read_text(encoding="utf-8")
        if not _admin_equality_lines(source):
            stale.append(f"{rel} (no `== \"admin\"` comparison present)")
    assert stale == [], (
        "Stale scope-drift allowlist entries — remove these from _ALLOWLIST:\n  "
        + "\n  ".join(stale)
    )


# --------------------------------------------------------------------------- #
# Self-tests: prove the guard fails on a real regression and passes on        #
# correctly-scoped code (so a future no-op refactor cannot quietly defang it).#
# --------------------------------------------------------------------------- #


_REGRESSION_SOURCE = '''\
from apps.catalog.services import AccessScopeService  # noqa: F401


def get(self, request, application_id):
    role = getattr(request.user, "role", "student")
    application = Application.objects.get(id=application_id)
    if role == "admin":
        # Admin-alone authorization over a resource — the bug R18.3 forbids.
        return Response({"success": True, "data": serialize(application)})
    return Response(status=403)
'''

_COMPLIANT_SOURCE = '''\
def get(self, request, application_id):
    role = getattr(request.user, "role", "student")
    application = Application.objects.get(id=application_id)
    if role == "admin":
        scoped = AccessScopeService().filter_applications(
            Application.objects.filter(id=application.id), request.user,
        )
        if not scoped.exists():
            return Response(status=404)
    return Response({"success": True, "data": serialize(application)})
'''

_MEMBERSHIP_SOURCE = '''\
def get(self, request, application_id):
    role = getattr(request.user, "role", "student")
    application = Application.objects.get(id=application_id)
    if role in ("admin", "super_admin"):
        return Response({"success": True, "data": serialize(application)})
    return Response(status=403)
'''

_NON_RESOURCE_SOURCE = '''\
def label_for(user):
    role = getattr(user, "role", "student")
    if role == "admin":
        return "Administrator"
    return "Student"
'''


def test_guard_detects_admin_alone_regression():
    """A resource authorized on `role == "admin"` alone is flagged with line."""
    violations = scan_source("apps/example/regression.py", _REGRESSION_SOURCE)
    assert len(violations) == 1, violations
    assert violations[0].startswith("apps/example/regression.py:7:")


def test_guard_passes_scoped_admin_branch():
    """An admin branch paired with AccessScopeService is compliant."""
    assert scan_source("apps/example/compliant.py", _COMPLIANT_SOURCE) == []


def test_guard_ignores_membership_checks():
    """`role in ("admin", "super_admin")` is not an admin-alone equality."""
    assert scan_source("apps/example/membership.py", _MEMBERSHIP_SOURCE) == []


def test_guard_ignores_non_resource_admin_checks():
    """A non-authorization role check (no resource signal) is not flagged."""
    assert scan_source("apps/example/label.py", _NON_RESOURCE_SOURCE) == []


def test_tokenizer_excludes_docstring_and_comment_mentions():
    """Prose mentions of `role == "admin"` never register as comparisons."""
    source = (
        '"""Docs: never authorize on role == "admin" alone."""\n'
        "# comment: role == \"admin\" must pair with AccessScopeService\n"
        "x = 1\n"
    )
    assert _admin_equality_lines(source) == set()
