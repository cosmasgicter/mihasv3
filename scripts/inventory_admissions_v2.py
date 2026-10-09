#!/usr/bin/env python3
"""
Admissions V2 route/authority/domain/source inventory generator (spec task 0.3).

Findings owned by task 0.3's requirements (R1, R3, R14, R17); initial focus
AUTH-02 (raw-role authority instead of the capability service), API-02
(direct/permissive frontend API surface), and MAINT-01 (oversized modules).

WHAT THIS DOES
--------------
This is the *repeatable generator* the task prefers over a hand-maintained
list. It produces machine-readable inventory artifacts under
``docs/v2-evidence/0.3/inventory/`` and a "zero-unclassified-route report"
that proves every backend endpoint is classified into exactly one authority
class.

It enumerates, from the *real* source (never a guess):

1. Backend Django URL patterns + methods + auth/permission classes, enriched
   from each view class body with capability strings, raw role checks,
   idempotency, audit, tenant-scope, and AI signals, then classified into the
   design §5.2 authority taxonomy. -> ``backend_routes.json`` / ``.csv``
2. The canonical platform/tenant capability catalogue. -> ``capabilities.json``
3. Raw role-string authorization sites across the backend (AUTH-02 evidence).
   -> ``role_checks.json``
4. Application / payment / domain status machines. -> ``status_machines.json``
5. Celery beat scheduled tasks + ``@shared_task`` definitions.
   -> ``scheduled_tasks.json``
6. Provider calls and AI imports across the admissions boundary (R11 de-AI).
   -> ``provider_ai_imports.json``
7. Admissions frontend routes (registry + redirect aliases).
   -> ``frontend_routes.json``
8. Raw ``apiClient`` / ``fetch`` call sites in pages & components (API-02 /
   R14.3). -> ``raw_api_client_calls.json``
9. Legacy endpoint / field indicators (``?action=``, hardcoded fee/brand,
   ``fallback-`` ids, legacy resolvers). -> ``legacy_endpoints_fields.json``

Plus:
- ``zero-unclassified-route-report.md`` / ``.json`` — the proof artifact.
- ``inventory-summary.json`` — index + counts + generation metadata.

DESIGN
------
- The Django route walk requires Django (run under ``backend/.venv``). All
  other scans are pure text/AST and need no third-party packages.
- The classifier and every parser are *pure functions* (``classify_endpoint``,
  ``detect_authority_signals``, ``parse_ts_route_registry``,
  ``scan_role_checks_text``, ``extract_transition_maps``,
  ``parse_celery_beat_schedule``) so they are unit-testable without Django.
- This is an INVENTORY/ANALYSIS task: it only READS source and WRITES evidence
  artifacts. It changes no production behavior.

USAGE
-----
    backend/.venv/bin/python scripts/inventory_admissions_v2.py \
        --repo-root . --out docs/v2-evidence/0.3/inventory

Exit codes: 0 = generated and zero routes unclassified; 2 = one or more routes
could not be classified (the zero-unclassified invariant failed); 1 = a
non-fatal scan degraded (with --strict).
"""

from __future__ import annotations

import argparse
import ast
import csv
import datetime as _dt
import inspect
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


# --------------------------------------------------------------------------- #
# Repo layout helpers
# --------------------------------------------------------------------------- #

def default_repo_root() -> Path:
    """Repo root is one level up from this file's ``scripts/`` directory."""
    return Path(__file__).resolve().parent.parent


def _rel(path: Any, repo_root: Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(repo_root))
    except (ValueError, TypeError):
        return str(path)


def _iter_py_files(root: Path, *, skip: Iterable[str] = ()) -> Iterable[Path]:
    skip = set(skip) | {"__pycache__", ".venv", "node_modules", ".git"}
    for path in sorted(root.rglob("*.py")):
        if any(part in skip for part in path.parts):
            continue
        yield path


def _iter_ts_files(root: Path) -> Iterable[Path]:
    skip = {"node_modules", ".git", "dist", "build", "coverage"}
    for path in sorted(root.rglob("*")):
        if path.suffix not in (".ts", ".tsx"):
            continue
        if any(part in skip for part in path.parts):
            continue
        yield path


# --------------------------------------------------------------------------- #
# Authority signal detection + classification (PURE — unit-testable)
# --------------------------------------------------------------------------- #

# Raw role-string authorization signals (AUTH-02). Each maps a label to a
# regex; a match anywhere in a view/service body means "authority decided by a
# raw role string rather than the capability service".
RAW_ROLE_PATTERNS: Dict[str, re.Pattern] = {
    "role_in_tuple": re.compile(r"\brole\s+in\s*[\(\[]"),
    "role_equals": re.compile(r"\brole\s*==\s*['\"]"),
    "is_super_admin_call": re.compile(r"\bis_super_admin\s*\("),
    "getattr_role": re.compile(r"getattr\(\s*[^,]+,\s*['\"]role['\"]"),
    "user_role_attr": re.compile(r"\brequest\.user\.role\b|\buser\.role\b"),
    "dotted_role_equals": re.compile(r"\.role\s*==\s*['\"]"),
}

# Role-based DRF permission classes (role hierarchy, NOT the capability service).
ROLE_PERMISSION_CLASSES = {
    "IsAdmin",
    "IsSuperAdmin",
    "IsReviewer",
    "IsStudent",
}

# Capability-service / tenant-scope machinery (the canonical authority path).
CAPABILITY_SCOPE_MARKERS = (
    "HasPlatformCapability",
    "TenantScopedCapabilityMixin",
    "AdminCapabilityService",
    "AccessScopeService",
    "visible_institution_queryset",
    "filter_applications",
    "require_capability",
    "require_institution_capability",
    "InstitutionContextService",
)

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def detect_authority_signals(
    class_source: str,
    *,
    permission_classes: List[str],
    base_classes: List[str],
    path: str,
    name: str,
    view_name: str,
) -> Dict[str, Any]:
    """Detect authority/behaviour signals from a view's source + declared classes.

    Pure: takes text and the declared permission/base class names, returns a
    dict of booleans/lists. No Django, no filesystem.
    """
    src = class_source or ""
    perms = set(permission_classes or [])
    bases = set(base_classes or [])

    allow_any = "AllowAny" in perms
    is_authenticated_only = perms == {"IsAuthenticated"}
    role_perm_hits = sorted(perms & ROLE_PERMISSION_CLASSES)

    platform_caps = sorted(set(re.findall(r"platform\.[a-z_]+(?:\.[a-z_]+)*", src)))
    tenant_caps = sorted(set(re.findall(r"tenant\.[a-z_]+(?:\.[a-z_]+)*", src)))
    required_capability = None
    m = re.search(r"required_capability\s*=\s*['\"]([^'\"]+)['\"]", src)
    if m:
        required_capability = m.group(1)

    raw_role_hits = sorted(
        label for label, rx in RAW_ROLE_PATTERNS.items() if rx.search(src)
    )

    uses_capability_service = (
        "HasPlatformCapability" in perms
        or "TenantScopedCapabilityMixin" in bases
        or bool(platform_caps)
        or bool(tenant_caps)
        or bool(required_capability)
        or any(marker in src for marker in CAPABILITY_SCOPE_MARKERS)
    )

    ownership = (
        "IsOwnerOrAdmin" in perms
        or "IsStudent" in perms
        or bool(re.search(r"user_id\s*=\s*str\(\s*request\.user", src))
        or bool(re.search(r"filter\(\s*user_id\s*=", src))
        or "has_object_permission" in src
    )

    webhook = (
        "webhook" in path.lower()
        or "webhook" in (name or "").lower()
        or "webhook" in (view_name or "").lower()
        or "Webhook" in src
        or "WebhookProcessor" in src
        or "verify_signature" in src
        or "hmac" in src.lower()
    )

    idempotent = (
        "@idempotent" in src
        or "IdempotencyKey" in src
        or "Idempotency-Key" in src
        or "idempotency_key" in src
    )

    audit = (
        "TenantAuditService" in src
        or "AuditLog.objects.create" in src
        or "record_review_decision" in src
        or "record_payment_verification" in src
        or "build_audit_network_fields" in src
    )

    ai_touch = bool(
        re.search(r"\bAI_GATEWAY\b|\bai_cache\b|\bai_circuit_breaker\b"
                  r"|\bai_prompt_redactor\b|with_circuit_breaker|AISummary"
                  r"|admin_summary|preview_summary|generate_summary", src)
    )

    throttle_scope = None
    m = re.search(r"throttle_scope\s*=\s*['\"]([^'\"]+)['\"]", src)
    if m:
        throttle_scope = m.group(1)

    uses_raw_role = bool(raw_role_hits) or bool(role_perm_hits)

    return {
        "allow_any": allow_any,
        "is_authenticated_only": is_authenticated_only,
        "role_permission_classes": role_perm_hits,
        "raw_role_signals": raw_role_hits,
        "platform_capabilities": platform_caps,
        "tenant_capabilities": tenant_caps,
        "required_capability": required_capability,
        "uses_capability_service": uses_capability_service,
        "uses_raw_role": uses_raw_role,
        "ownership": ownership,
        "webhook": webhook,
        "idempotent": idempotent,
        "audit": audit,
        "ai_touch": ai_touch,
        "throttle_scope": throttle_scope,
        "super_admin_perm": "IsSuperAdmin" in perms,
        "admin_perm": "IsAdmin" in perms,
        "reviewer_perm": "IsReviewer" in perms,
        "student_perm": "IsStudent" in perms,
        "owner_perm": "IsOwnerOrAdmin" in perms,
        "has_platform_capability_perm": "HasPlatformCapability" in perms,
    }


# The design §5.2 authority taxonomy plus explicit infra/meta classes so the
# classifier is TOTAL (every route lands in exactly one, never "unclassified").
AUTHORITY_CLASSES = (
    # design §5.2 target seven
    "public",
    "owner",
    "reviewer_assignment",
    "tenant_capability",
    "platform_capability",
    "worker",
    "internal_callback",
    # infra / meta (still classified)
    "health",
    "api_docs",
    "api_root",
    "django_admin",
    # honest weak bucket — authenticated but no finer authority declared yet
    "authenticated",
)


def classify_endpoint(record: Dict[str, Any]) -> Tuple[str, str]:
    """Classify one endpoint into exactly one AUTHORITY_CLASS. Pure + total.

    Returns ``(classification, reason)``. Priority order is deliberate: infra
    first, then the unauthenticated inbound classes, then platform/tenant/
    reviewer/owner authority, then the honest ``authenticated`` weak bucket.
    """
    path = (record.get("path") or "").lower()
    name = (record.get("name") or "").lower()
    sig = record.get("signals") or {}

    # 1. Infra / meta by mount location.
    if path.startswith("/health/"):
        return "health", "health-check mount"
    if any(seg in path for seg in ("/schema", "/docs", "/redoc")):
        return "api_docs", "OpenAPI schema/docs mount"
    if path.startswith("/beanola-admin-panel/"):
        return "django_admin", "Django operational admin site"
    if path == "/" or name == "api-root":
        return "api_root", "API root landing view"

    # 2. Unauthenticated inbound.
    if sig.get("webhook"):
        return "internal_callback", "provider webhook / signed callback"
    if sig.get("allow_any"):
        return "public", "AllowAny permission (no authentication required)"

    # 3. Platform authority.
    if (
        sig.get("has_platform_capability_perm")
        or sig.get("platform_capabilities")
        or (sig.get("required_capability") or "").startswith("platform.")
        or sig.get("super_admin_perm")
    ):
        return "platform_capability", "platform.* capability / super-admin gate"

    # 4. Tenant authority: an explicit tenant.* capability, the capability /
    #    tenant-scope machinery (AccessScopeService, visible_institution_queryset,
    #    TenantScopedCapabilityMixin, InstitutionContextService), or the
    #    role-hierarchy admin gate that currently stands in for tenant scope.
    if (
        sig.get("tenant_capabilities")
        or (sig.get("required_capability") or "").startswith("tenant.")
        or sig.get("admin_perm")
        or sig.get("uses_capability_service")
    ):
        return "tenant_capability", "tenant.* capability / tenant-scope service / admin-role gate"

    # 5. Reviewer assignment.
    if sig.get("reviewer_perm"):
        return "reviewer_assignment", "reviewer role / assignment-scoped review"

    # 6. Owner.
    if sig.get("owner_perm") or sig.get("student_perm") or sig.get("ownership"):
        return "owner", "object ownership (student-owned resource)"

    # 7. Honest weak bucket: authenticated but no finer authority declared.
    if sig.get("is_authenticated_only") or record.get("permission_classes"):
        return "authenticated", "authenticated only — authority matrix assignment pending (task 2.1)"

    return "unclassified", "no permission/authority signal detected"


def compute_risk_flags(record: Dict[str, Any]) -> List[str]:
    """Derive authority-risk flags feeding AUTH-02 / API / R17 findings. Pure."""
    sig = record.get("signals") or {}
    methods = set(record.get("methods") or [])
    has_write = bool(methods & WRITE_METHODS)
    flags: List[str] = []

    classification = record.get("classification")

    if has_write and sig.get("uses_raw_role") and not sig.get("uses_capability_service"):
        flags.append("mutation_authority_raw_role")  # AUTH-02
    if (
        classification in ("tenant_capability", "platform_capability")
        and sig.get("uses_raw_role")
        and not sig.get("uses_capability_service")
    ):
        flags.append("admin_authority_raw_role")  # AUTH-02
    if sig.get("allow_any") and has_write and not sig.get("webhook"):
        flags.append("unauthenticated_write")
    if classification == "authenticated":
        flags.append("authority_matrix_pending")  # task 2.1
    if has_write and not sig.get("idempotent") and classification not in (
        "public", "health", "api_docs", "django_admin", "api_root",
    ):
        flags.append("mutation_without_idempotency")  # R17.1
    if sig.get("ai_touch"):
        flags.append("admissions_ai_touchpoint")  # R11 de-AI
    return flags


# --------------------------------------------------------------------------- #
# Backend route walk (requires Django)
# --------------------------------------------------------------------------- #

def _setup_django(repo_root: Path) -> Optional[str]:
    """Configure Django for offline URL introspection. Returns error or None."""
    backend = repo_root / "backend"
    if str(backend) not in sys.path:
        sys.path.insert(0, str(backend))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    # Enumerate the FULL surface including the production-gated jobs-ops routes.
    os.environ["ENABLE_JOBS_OPS_ROUTES"] = "1"
    try:
        import django  # noqa: F401
        django.setup()
        return None
    except Exception as exc:  # pragma: no cover - environment dependent
        return f"{type(exc).__name__}: {exc}"


def _view_class_from_callback(callback: Any):
    return getattr(callback, "cls", None) or getattr(callback, "view_class", None)


def _class_names(objs: Any) -> List[str]:
    out: List[str] = []
    for obj in objs or []:
        out.append(getattr(obj, "__name__", str(obj)))
    return out


def _endpoint_methods(callback: Any, view_cls: Any) -> List[str]:
    # ViewSet: as_view({"get": "list", ...}) exposes .actions.
    actions = getattr(callback, "actions", None)
    if isinstance(actions, dict) and actions:
        return sorted(m.upper() for m in actions.keys())
    if view_cls is not None:
        http_names = getattr(view_cls, "http_method_names", []) or []
        semantic = [
            m.upper()
            for m in http_names
            if m in ("get", "post", "put", "patch", "delete")
            and callable(getattr(view_cls, m, None))
        ]
        if semantic:
            return sorted(semantic)
        # Fallback: any defined handler except the auto-provided ones.
        defined = [
            m.upper()
            for m in http_names
            if m not in ("options", "head", "trace")
            and callable(getattr(view_cls, m, None))
        ]
        return sorted(defined) or ["(none-detected)"]
    return ["(unknown)"]


def _walk_urlpatterns(resolver, prefix: str, out: List[Tuple[str, Any]]) -> None:
    from django.urls import URLPattern, URLResolver

    for entry in resolver.url_patterns:
        if isinstance(entry, URLResolver):
            _walk_urlpatterns(entry, prefix + str(entry.pattern), out)
        elif isinstance(entry, URLPattern):
            out.append((prefix + str(entry.pattern), entry))


def collect_backend_routes(repo_root: Path) -> Dict[str, Any]:
    """Walk the live URLConf and build the enriched route/authority catalogue.

    Configures Django (offline) then delegates the URLConf walk to
    :func:`build_backend_route_catalogue`. The walk is factored out so callers
    that already have Django configured (e.g. the authority-matrix generator in
    ``scripts/authority_matrix_v2.py`` and the backend pytest gate) can reuse the
    exact same route/authority extraction without re-running ``django.setup()``
    or overriding the live ``ROOT_URLCONF`` — they control the URLConf state
    themselves and call ``build_backend_route_catalogue`` directly.
    """
    err = _setup_django(repo_root)
    if err:
        return {"available": False, "error": err, "routes": []}
    return build_backend_route_catalogue(repo_root)


def build_backend_route_catalogue(repo_root: Path) -> Dict[str, Any]:
    """Walk the currently-configured ``ROOT_URLCONF`` into the route catalogue.

    Assumes Django is already configured (``django.setup()`` has run). Reusable
    by any caller that has set up the desired URLConf — including a pytest that
    has flipped ``ENABLE_JOBS_OPS_ROUTES`` and reloaded ``config.urls`` to
    enumerate the full route surface deterministically.
    """
    from django.urls import get_resolver

    resolver = get_resolver()
    flat: List[Tuple[str, Any]] = []
    _walk_urlpatterns(resolver, "", flat)

    routes: List[Dict[str, Any]] = []
    django_admin_count = 0
    for pattern_str, urlpattern in flat:
        full = "/" + pattern_str if not pattern_str.startswith("/") else pattern_str
        # Normalize Django's regex tail markers for readability.
        full = full.replace("^", "").replace("$", "")
        name = getattr(urlpattern, "name", None)
        callback = getattr(urlpattern, "callback", None)
        view_cls = _view_class_from_callback(callback)

        # Collapse the Django operational admin subtree to a single classified
        # entry (its auto-generated CRUD URLs would otherwise flood the
        # catalogue with framework internals). Everything else is enumerated
        # per-endpoint.
        if full.startswith("/beanola-admin-panel/"):
            django_admin_count += 1
            continue

        view_name = getattr(view_cls, "__name__", getattr(callback, "__name__", "?"))
        module = getattr(view_cls, "__module__", getattr(callback, "__module__", "?"))
        perms = _class_names(getattr(view_cls, "permission_classes", []))
        auths = _class_names(getattr(view_cls, "authentication_classes", []))
        throttles = _class_names(getattr(view_cls, "throttle_classes", []))
        bases = _class_names(getattr(view_cls, "__mro__", [])[1:]) if view_cls else []

        class_source = ""
        source_file = None
        source_line = None
        if view_cls is not None:
            try:
                class_source = inspect.getsource(view_cls)
            except (OSError, TypeError):
                class_source = ""
            try:
                source_file = _rel(inspect.getsourcefile(view_cls), repo_root)
                source_line = inspect.getsourcelines(view_cls)[1]
            except (OSError, TypeError):
                pass

        methods = _endpoint_methods(callback, view_cls)
        signals = detect_authority_signals(
            class_source,
            permission_classes=perms,
            base_classes=bases,
            path=full,
            name=name or "",
            view_name=view_name,
        )

        record: Dict[str, Any] = {
            "path": full,
            "name": name,
            "methods": methods,
            "view": view_name,
            "module": module,
            "source_file": source_file,
            "source_line": source_line,
            "authentication_classes": auths,
            "permission_classes": perms,
            "throttle_classes": throttles,
            "throttle_scope": signals.get("throttle_scope"),
            "signals": signals,
        }
        classification, reason = classify_endpoint(record)
        record["classification"] = classification
        record["classification_reason"] = reason
        record["authority_model"] = _authority_model(signals)
        record["idempotent"] = signals.get("idempotent")
        record["audited"] = signals.get("audit")
        record["risk_flags"] = compute_risk_flags(record)
        routes.append(record)

    # Add one synthetic entry representing the collapsed Django admin subtree.
    if django_admin_count:
        admin_rec = {
            "path": "/beanola-admin-panel/",
            "name": "django-admin-site",
            "methods": ["GET", "POST"],
            "view": "AdminSite",
            "module": "django.contrib.admin.sites",
            "source_file": None,
            "source_line": None,
            "authentication_classes": ["(django session/admin)"],
            "permission_classes": ["(staff_member_required)"],
            "throttle_classes": [],
            "throttle_scope": None,
            "signals": {},
            "classification": "django_admin",
            "classification_reason": (
                f"Django operational admin site (collapsed; "
                f"{django_admin_count} auto-generated admin URLs)"
            ),
            "authority_model": "django_staff",
            "idempotent": None,
            "audited": None,
            "risk_flags": [],
            "collapsed_admin_url_count": django_admin_count,
        }
        routes.append(admin_rec)

    routes.sort(key=lambda r: (r["path"], ",".join(r["methods"])))
    return {
        "available": True,
        "error": None,
        "route_count": len(routes),
        "django_admin_url_count": django_admin_count,
        "routes": routes,
    }


def _authority_model(signals: Dict[str, Any]) -> str:
    if not signals:
        return "unknown"
    parts = []
    if signals.get("uses_capability_service"):
        parts.append("capability")
    if signals.get("ownership"):
        parts.append("ownership")
    if signals.get("uses_raw_role"):
        parts.append("raw_role")
    if signals.get("allow_any"):
        parts.append("public")
    if not parts and signals.get("is_authenticated_only"):
        parts.append("authenticated")
    return "+".join(parts) if parts else "none"


# --------------------------------------------------------------------------- #
# Capability catalogue
# --------------------------------------------------------------------------- #

def collect_capabilities(repo_root: Path) -> Dict[str, Any]:
    """Read the canonical platform/tenant capability catalogue from source."""
    # Prefer importing the live class (exact truth); fall back to a source scan.
    try:
        from apps.catalog.services import AdminCapabilityService as _Svc

        platform = sorted(_Svc.PLATFORM_CAPABILITIES)
        tenant = sorted(_Svc.TENANT_CAPABILITIES)
        default_read = sorted(getattr(_Svc, "_DEFAULT_TENANT_READ_CAPABILITIES", []))
        granted = {
            k: sorted(v)
            for k, v in getattr(_Svc, "_GRANTED_MUTATION_CAPABILITIES", {}).items()
        }
        return {
            "available": True,
            "source": "backend/apps/catalog/services.py:AdminCapabilityService",
            "platform_capability_count": len(platform),
            "tenant_capability_count": len(tenant),
            "platform_capabilities": platform,
            "tenant_capabilities": tenant,
            "default_tenant_read_capabilities": default_read,
            "granted_mutation_capabilities": granted,
        }
    except Exception as exc:  # pragma: no cover - fallback path
        return {"available": False, "error": f"{type(exc).__name__}: {exc}"}


# --------------------------------------------------------------------------- #
# Raw role-check scan (AUTH-02)
# --------------------------------------------------------------------------- #

def scan_role_checks_text(text: str) -> List[Dict[str, Any]]:
    """Return raw-role-check hits (label, line, snippet) for one file's text. Pure."""
    hits: List[Dict[str, Any]] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        for label, rx in RAW_ROLE_PATTERNS.items():
            if rx.search(line):
                hits.append(
                    {"line": lineno, "signal": label, "snippet": line.strip()[:200]}
                )
    return hits


def collect_role_checks(repo_root: Path) -> Dict[str, Any]:
    backend_apps = repo_root / "backend" / "apps"
    files: List[Dict[str, Any]] = []
    total = 0
    for path in _iter_py_files(backend_apps, skip=("migrations", "tests")):
        if path.name.startswith("test_"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        hits = scan_role_checks_text(text)
        if hits:
            total += len(hits)
            files.append({"file": _rel(path, repo_root), "hit_count": len(hits), "hits": hits})
    files.sort(key=lambda f: (-f["hit_count"], f["file"]))
    return {"available": True, "total_hits": total, "file_count": len(files), "files": files}


# --------------------------------------------------------------------------- #
# Status machines
# --------------------------------------------------------------------------- #

def extract_transition_maps(text: str) -> List[Dict[str, Any]]:
    """Extract *_TRANSITION(S) dict literals via AST from one file's text. Pure.

    Finds module-level and class-level assignments whose target name contains
    "TRANSITION" (case-insensitive) and whose value is a literal dict, and
    returns the resolved mapping (keys -> list of targets) where the value is a
    pure literal (``ast.literal_eval``-able).
    """
    out: List[Dict[str, Any]] = []
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return out

    def _handle_assign(node: ast.Assign, scope: str) -> None:
        for target in node.targets:
            names: List[str] = []
            if isinstance(target, ast.Name):
                names = [target.id]
            elif isinstance(target, ast.Attribute):
                names = [target.attr]
            for nm in names:
                if "TRANSITION" not in nm.upper():
                    continue
                try:
                    value = ast.literal_eval(node.value)
                except (ValueError, TypeError, SyntaxError):
                    value = None
                serializable = None
                if isinstance(value, dict):
                    serializable = {
                        str(k): sorted(v) if isinstance(v, (set, frozenset, list, tuple)) else v
                        for k, v in value.items()
                    }
                out.append(
                    {
                        "name": nm,
                        "scope": scope,
                        "line": node.lineno,
                        "literal_resolved": serializable is not None,
                        "mapping": serializable,
                    }
                )

    for node in tree.body:
        if isinstance(node, ast.Assign):
            _handle_assign(node, "module")
        elif isinstance(node, ast.ClassDef):
            for sub in node.body:
                if isinstance(sub, ast.Assign):
                    _handle_assign(sub, f"class {node.name}")
    return out


def collect_status_machines(repo_root: Path) -> Dict[str, Any]:
    targets = [
        "backend/apps/applications/services.py",
        "backend/apps/documents/payment_service_mixins/_core.py",
        "backend/apps/documents/payment_service_mixins/_verification.py",
        "backend/apps/catalog/services.py",
        "backend/apps/applications/admin_bulk_views.py",
    ]
    machines: List[Dict[str, Any]] = []
    for rel in targets:
        path = repo_root / rel
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for m in extract_transition_maps(text):
            m["file"] = rel
            machines.append(m)
    # Also record the ApplicationStatus catalogue if present.
    return {
        "available": True,
        "machine_count": len(machines),
        "machines": machines,
    }


# --------------------------------------------------------------------------- #
# Scheduled tasks
# --------------------------------------------------------------------------- #

def parse_celery_beat_schedule(text: str) -> List[Dict[str, Any]]:
    """Extract CELERY_BEAT_SCHEDULE entries (name, task, schedule expr). Pure."""
    out: List[Dict[str, Any]] = []
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return out
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "CELERY_BEAT_SCHEDULE" for t in node.targets
        ):
            if not isinstance(node.value, ast.Dict):
                continue
            for key, val in zip(node.value.keys, node.value.values):
                entry_name = key.value if isinstance(key, ast.Constant) else ast.dump(key)
                task = None
                schedule = None
                if isinstance(val, ast.Dict):
                    for k2, v2 in zip(val.keys, val.values):
                        k2name = k2.value if isinstance(k2, ast.Constant) else None
                        if k2name == "task" and isinstance(v2, ast.Constant):
                            task = v2.value
                        elif k2name == "schedule":
                            try:
                                schedule = ast.unparse(v2)
                            except Exception:
                                schedule = None
                out.append({"name": entry_name, "task": task, "schedule": schedule})
    return out


def collect_scheduled_tasks(repo_root: Path) -> Dict[str, Any]:
    base = repo_root / "backend" / "config" / "settings" / "base.py"
    schedule: List[Dict[str, Any]] = []
    if base.is_file():
        schedule = parse_celery_beat_schedule(base.read_text(encoding="utf-8"))

    # Enumerate @shared_task definitions across the backend.
    task_defs: List[Dict[str, Any]] = []
    task_rx = re.compile(r"@(?:shared_task|app\.task|celery_app\.task)")
    def_rx = re.compile(r"^\s*def\s+(\w+)\s*\(")
    for path in _iter_py_files(repo_root / "backend" / "apps", skip=("migrations", "tests")):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for i, line in enumerate(lines):
            if task_rx.search(line):
                # find the next def
                for j in range(i + 1, min(i + 8, len(lines))):
                    dm = def_rx.match(lines[j])
                    if dm:
                        task_defs.append(
                            {
                                "function": dm.group(1),
                                "file": _rel(path, repo_root),
                                "line": j + 1,
                            }
                        )
                        break
    task_defs.sort(key=lambda t: (t["file"], t["line"]))

    scheduled_task_names = {e["task"] for e in schedule if e.get("task")}
    return {
        "available": True,
        "beat_entry_count": len(schedule),
        "beat_schedule": schedule,
        "shared_task_count": len(task_defs),
        "shared_tasks": task_defs,
        "scheduled_task_dotted_names": sorted(n for n in scheduled_task_names if n),
    }


# --------------------------------------------------------------------------- #
# Provider calls + AI imports
# --------------------------------------------------------------------------- #

PROVIDER_MARKERS: Dict[str, re.Pattern] = {
    "lenco_payment": re.compile(r"\bLENCO\b|lenco", re.IGNORECASE),
    "object_storage_r2_s3": re.compile(r"\bboto3\b|django-storages|storages\.|S3Boto3Storage"),
    "email_smtp": re.compile(r"\bsmtplib\b|send_mail\(|EmailMessage\(|EmailMultiAlternatives|smtp\.zoho"),
    "email_resend": re.compile(r"\bresend\b", re.IGNORECASE),
    "sentry_glitchtip": re.compile(r"\bsentry_sdk\b"),
    "telegram": re.compile(r"\btelegram\b", re.IGNORECASE),
    "http_requests": re.compile(r"^\s*import requests\b|^\s*from requests\b|requests\.(get|post|put|patch|delete)\(", re.MULTILINE),
    "redis": re.compile(r"\bredis\b", re.IGNORECASE),
}

AI_MARKERS: Dict[str, re.Pattern] = {
    "ai_gateway_key": re.compile(r"\bAI_GATEWAY\b|AI_GATEWAY_API_KEY"),
    "ai_cache": re.compile(r"\bai_cache\b"),
    "ai_circuit_breaker": re.compile(r"ai_circuit_breaker|with_circuit_breaker"),
    "ai_prompt_redactor": re.compile(r"ai_prompt_redactor"),
    "ai_model_setting": re.compile(r"\bAI_MODEL_(FAST|VISION|ANALYSIS|SMART)\b"),
    "openai_sdk": re.compile(r"\bopenai\b", re.IGNORECASE),
    "ai_summary_symbol": re.compile(r"AISummary|admin_summary|preview_summary|generate_summary"),
}


def _scan_markers(text: str, markers: Dict[str, re.Pattern]) -> List[str]:
    return sorted(label for label, rx in markers.items() if rx.search(text))


def collect_provider_ai(repo_root: Path) -> Dict[str, Any]:
    backend_apps = repo_root / "backend" / "apps"
    provider_files: List[Dict[str, Any]] = []
    ai_files: List[Dict[str, Any]] = []

    # Admissions-boundary backend apps (R11 says these must have zero AI at
    # cutover); jobs-ops/integrations AI is allowed but recorded separately.
    admissions_apps = {"applications", "documents", "catalog", "accounts", "common"}

    for path in _iter_py_files(backend_apps, skip=("migrations", "tests")):
        if path.name.startswith("test_"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        rel = _rel(path, repo_root)
        app = rel.split("/")[2] if rel.startswith("backend/apps/") and len(rel.split("/")) > 2 else "?"

        prov = _scan_markers(text, PROVIDER_MARKERS)
        if prov:
            provider_files.append({"file": rel, "app": app, "providers": prov})
        ai = _scan_markers(text, AI_MARKERS)
        if ai:
            ai_files.append(
                {
                    "file": rel,
                    "app": app,
                    "ai_markers": ai,
                    "admissions_boundary": app in admissions_apps,
                }
            )

    # Frontend admissions AI markers (panels, hooks, copy).
    frontend_src = repo_root / "apps" / "admissions" / "src"
    frontend_ai: List[Dict[str, Any]] = []
    fe_ai_rx = re.compile(r"AISummary|ai[- _]?summary|useOcr|Tesseract|tesseract|admin-summary|preview-summary", re.IGNORECASE)
    if frontend_src.is_dir():
        for path in _iter_ts_files(frontend_src):
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            if fe_ai_rx.search(text):
                frontend_ai.append({"file": _rel(path, repo_root)})

    ai_admissions_boundary = [f for f in ai_files if f["admissions_boundary"]]
    return {
        "available": True,
        "backend_provider_file_count": len(provider_files),
        "backend_provider_files": provider_files,
        "backend_ai_file_count": len(ai_files),
        "backend_ai_files": ai_files,
        "backend_ai_admissions_boundary_count": len(ai_admissions_boundary),
        "frontend_ai_file_count": len(frontend_ai),
        "frontend_ai_files": frontend_ai,
    }


# --------------------------------------------------------------------------- #
# Frontend routes
# --------------------------------------------------------------------------- #

def parse_ts_route_registry(text: str) -> List[Dict[str, Any]]:
    """Parse the ``ROUTES`` object in routeRegistry.ts into route records. Pure.

    Tolerant block parser: for each ``id: '...'`` it captures the sibling
    ``path``, ``guard``, ``requiresSuperAdmin``, and ``aliases`` within the same
    object entry (bounded by the next ``id:`` or the end of the object).
    """
    routes: List[Dict[str, Any]] = []
    # Isolate each entry that starts with `id: '...'`.
    id_positions = [m.start() for m in re.finditer(r"\bid:\s*['\"]", text)]
    id_positions.append(len(text))
    for i in range(len(id_positions) - 1):
        block = text[id_positions[i]: id_positions[i + 1]]
        idm = re.search(r"id:\s*['\"]([^'\"]+)['\"]", block)
        pathm = re.search(r"path:\s*['\"]([^'\"]+)['\"]", block)
        guardm = re.search(r"guard:\s*['\"]([^'\"]+)['\"]", block)
        superm = re.search(r"requiresSuperAdmin:\s*true", block)
        aliasm = re.search(r"aliases:\s*\[([^\]]*)\]", block)
        capm = re.search(r"requiredCapabilities:\s*\[([^\]]*)\]", block)
        if not idm or not pathm:
            continue
        aliases = []
        if aliasm:
            aliases = re.findall(r"['\"]([^'\"]+)['\"]", aliasm.group(1))
        caps = []
        if capm:
            caps = re.findall(r"['\"]([^'\"]+)['\"]", capm.group(1))
        routes.append(
            {
                "id": idm.group(1),
                "path": pathm.group(1),
                "guard": guardm.group(1) if guardm else None,
                "requiresSuperAdmin": bool(superm),
                "aliases": aliases,
                "requiredCapabilities": caps,
            }
        )
    return routes


def parse_ts_redirects(text: str) -> List[Dict[str, Any]]:
    """Parse inline ``{ path: '...', element: <Navigate to=... /> }`` redirects. Pure."""
    out: List[Dict[str, Any]] = []
    for m in re.finditer(r"path:\s*['\"]([^'\"]+)['\"]\s*,\s*element:\s*<Navigate\s+to=\{?([^}\s/]+)?", text):
        out.append({"path": m.group(1), "redirect": True})
    return out


def collect_frontend_routes(repo_root: Path) -> Dict[str, Any]:
    registry = repo_root / "apps" / "admissions" / "src" / "routes" / "routeRegistry.ts"
    config = repo_root / "apps" / "admissions" / "src" / "routes" / "config.tsx"
    routes: List[Dict[str, Any]] = []
    redirects: List[Dict[str, Any]] = []
    if registry.is_file():
        routes = parse_ts_route_registry(registry.read_text(encoding="utf-8"))
    if config.is_file():
        cfg = config.read_text(encoding="utf-8")
        redirects = [
            r for r in parse_ts_redirects(cfg)
            if not any(r["path"] == rt["path"] for rt in routes)
        ]
    by_guard: Dict[str, int] = {}
    for r in routes:
        by_guard[r.get("guard") or "unknown"] = by_guard.get(r.get("guard") or "unknown", 0) + 1
    return {
        "available": bool(routes),
        "source": _rel(registry, repo_root),
        "route_count": len(routes),
        "by_guard": by_guard,
        "routes": routes,
        "redirect_count": len(redirects),
        "redirects": redirects,
    }


# --------------------------------------------------------------------------- #
# Raw API-client call sites
# --------------------------------------------------------------------------- #

def collect_raw_api_client_calls(repo_root: Path) -> Dict[str, Any]:
    """Find direct ``apiClient`` usage and raw ``fetch`` in pages/components."""
    src = repo_root / "apps" / "admissions" / "src"
    result: Dict[str, Any] = {"available": False}
    if not src.is_dir():
        return result

    api_client_rx = re.compile(r"\bapiClient\b")
    fetch_rx = re.compile(r"(?<![\w.])fetch\s*\(")
    import_client_rx = re.compile(r"from\s+['\"][^'\"]*services/client['\"]")

    pages_components: List[Dict[str, Any]] = []
    service_layer: List[str] = []
    fetch_sites: List[Dict[str, Any]] = []

    for path in _iter_ts_files(src):
        rel = _rel(path, repo_root)
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        in_pages_or_components = ("/pages/" in rel) or ("/components/" in rel)
        client_hits = [
            {"line": i + 1, "snippet": ln.strip()[:200]}
            for i, ln in enumerate(text.splitlines())
            if api_client_rx.search(ln)
        ]
        if client_hits and in_pages_or_components:
            pages_components.append(
                {"file": rel, "hit_count": len(client_hits), "hits": client_hits[:20]}
            )
        elif client_hits and ("/services/" in rel or "/lib/" in rel):
            service_layer.append(rel)

        if in_pages_or_components:
            f_hits = [
                {"line": i + 1, "snippet": ln.strip()[:200]}
                for i, ln in enumerate(text.splitlines())
                if fetch_rx.search(ln)
            ]
            if f_hits:
                fetch_sites.append({"file": rel, "hit_count": len(f_hits), "hits": f_hits[:20]})

    pages_components.sort(key=lambda f: (-f["hit_count"], f["file"]))
    return {
        "available": True,
        "note": (
            "Direct apiClient use in pages/components violates the target "
            "architecture (R14.3, API-02); service-layer use is expected."
        ),
        "pages_components_direct_call_file_count": len(pages_components),
        "pages_components_direct_calls": pages_components,
        "service_layer_client_file_count": len(service_layer),
        "service_layer_client_files": sorted(service_layer),
        "raw_fetch_in_pages_components_count": len(fetch_sites),
        "raw_fetch_in_pages_components": fetch_sites,
    }


# --------------------------------------------------------------------------- #
# Legacy endpoint / field indicators
# --------------------------------------------------------------------------- #

LEGACY_MARKERS: Dict[str, re.Pattern] = {
    "action_query_param": re.compile(r"[?&]action=|query_params\.get\(\s*['\"]action['\"]|\.GET\.get\(\s*['\"]action['\"]"),
    "hardcoded_fee_k150": re.compile(r"\bK150\b|\bUSD\s?20\b|\b150\.0?0?\b\s*#?\s*fee", re.IGNORECASE),
    "fallback_subject_id": re.compile(r"fallback-"),
    "legacy_institution_code": re.compile(r"_LEGACY_INSTITUTION_CODE|_resolve_institution_code_legacy"),
    "clear_all_draft_data": re.compile(r"clearAllDraftData"),
    "legacy_string_create": re.compile(r"legacy_string_create|Legacy string-create"),
    "brand_hardcode": re.compile(r"\bMIHAS\b|\bKATC\b"),
}


def collect_legacy_indicators(repo_root: Path) -> Dict[str, Any]:
    backend_apps = repo_root / "backend" / "apps"
    frontend_src = repo_root / "apps" / "admissions" / "src"
    by_marker: Dict[str, List[Dict[str, Any]]] = {k: [] for k in LEGACY_MARKERS}

    def _scan(root: Path, iterator) -> None:
        for path in iterator:
            rel = _rel(path, repo_root)
            if "/tests/" in rel or path.name.startswith("test_"):
                continue
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except OSError:
                continue
            for i, line in enumerate(lines):
                for label, rx in LEGACY_MARKERS.items():
                    if rx.search(line):
                        by_marker[label].append(
                            {"file": rel, "line": i + 1, "snippet": line.strip()[:180]}
                        )

    if backend_apps.is_dir():
        _scan(backend_apps, _iter_py_files(backend_apps, skip=("migrations",)))
    if frontend_src.is_dir():
        _scan(frontend_src, _iter_ts_files(frontend_src))

    counts = {k: len(v) for k, v in by_marker.items()}
    return {
        "available": True,
        "counts": counts,
        "markers": {k: v[:100] for k, v in by_marker.items()},
    }


# --------------------------------------------------------------------------- #
# Zero-unclassified route report
# --------------------------------------------------------------------------- #

def build_zero_unclassified_report(backend: Dict[str, Any]) -> Dict[str, Any]:
    routes = backend.get("routes", [])
    by_class: Dict[str, int] = {}
    unclassified: List[Dict[str, Any]] = []
    target_seven = {
        "public", "owner", "reviewer_assignment", "tenant_capability",
        "platform_capability", "worker", "internal_callback",
    }
    for r in routes:
        cls = r.get("classification", "unclassified")
        by_class[cls] = by_class.get(cls, 0) + 1
        if cls == "unclassified":
            unclassified.append({"path": r["path"], "methods": r["methods"], "view": r.get("view")})

    target_seven_count = sum(v for k, v in by_class.items() if k in target_seven)
    weak_authenticated = by_class.get("authenticated", 0)
    infra_meta = sum(
        by_class.get(k, 0) for k in ("health", "api_docs", "api_root", "django_admin")
    )
    return {
        "total_routes": len(routes),
        "classified": len(routes) - len(unclassified),
        "unclassified_count": len(unclassified),
        "unclassified": unclassified,
        "zero_unclassified": len(unclassified) == 0,
        "by_class": dict(sorted(by_class.items())),
        "target_authority_class_count": target_seven_count,
        "weak_authenticated_pending_matrix": weak_authenticated,
        "infra_meta_count": infra_meta,
    }


# --------------------------------------------------------------------------- #
# Orchestration + output
# --------------------------------------------------------------------------- #

def _git_commit(repo_root: Path) -> Optional[str]:
    try:
        out = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=10,
        )
        if out.returncode == 0:
            return out.stdout.strip()
    except Exception:
        pass
    return None


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def _write_backend_csv(path: Path, backend: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "path", "methods", "view", "module", "source_file", "source_line",
        "authentication_classes", "permission_classes", "classification",
        "authority_model", "idempotent", "audited", "throttle_scope", "risk_flags",
    ]
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for r in backend.get("routes", []):
            row = dict(r)
            for k in ("methods", "authentication_classes", "permission_classes", "risk_flags"):
                if isinstance(row.get(k), list):
                    row[k] = "|".join(str(x) for x in row[k])
            writer.writerow(row)


def generate(repo_root: Path, out_dir: Path) -> Dict[str, Any]:
    """Run every collector, write artifacts, return the summary dict."""
    out_dir.mkdir(parents=True, exist_ok=True)

    backend = collect_backend_routes(repo_root)
    capabilities = collect_capabilities(repo_root)
    role_checks = collect_role_checks(repo_root)
    status_machines = collect_status_machines(repo_root)
    scheduled = collect_scheduled_tasks(repo_root)
    provider_ai = collect_provider_ai(repo_root)
    frontend = collect_frontend_routes(repo_root)
    raw_calls = collect_raw_api_client_calls(repo_root)
    legacy = collect_legacy_indicators(repo_root)
    zero_report = build_zero_unclassified_report(backend)

    _write_json(out_dir / "backend_routes.json", backend)
    _write_backend_csv(out_dir / "backend_routes.csv", backend)
    _write_json(out_dir / "capabilities.json", capabilities)
    _write_json(out_dir / "role_checks.json", role_checks)
    _write_json(out_dir / "status_machines.json", status_machines)
    _write_json(out_dir / "scheduled_tasks.json", scheduled)
    _write_json(out_dir / "provider_ai_imports.json", provider_ai)
    _write_json(out_dir / "frontend_routes.json", frontend)
    _write_json(out_dir / "raw_api_client_calls.json", raw_calls)
    _write_json(out_dir / "legacy_endpoints_fields.json", legacy)
    _write_json(out_dir / "zero-unclassified-route-report.json", zero_report)
    _write_md_zero_report(out_dir / "zero-unclassified-route-report.md", zero_report, backend)

    summary = {
        "generator": "scripts/inventory_admissions_v2.py",
        "spec_task": "0.3",
        "generated_at_utc": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "repo_root": str(repo_root),
        "git_commit": _git_commit(repo_root),
        "django_available": backend.get("available", False),
        "django_error": backend.get("error"),
        "artifacts": {
            "backend_routes": "backend_routes.json",
            "backend_routes_csv": "backend_routes.csv",
            "capabilities": "capabilities.json",
            "role_checks": "role_checks.json",
            "status_machines": "status_machines.json",
            "scheduled_tasks": "scheduled_tasks.json",
            "provider_ai_imports": "provider_ai_imports.json",
            "frontend_routes": "frontend_routes.json",
            "raw_api_client_calls": "raw_api_client_calls.json",
            "legacy_endpoints_fields": "legacy_endpoints_fields.json",
            "zero_unclassified_route_report": "zero-unclassified-route-report.md",
        },
        "counts": {
            "backend_routes": backend.get("route_count", 0),
            "backend_django_admin_urls": backend.get("django_admin_url_count", 0),
            "platform_capabilities": capabilities.get("platform_capability_count", 0),
            "tenant_capabilities": capabilities.get("tenant_capability_count", 0),
            "raw_role_check_hits": role_checks.get("total_hits", 0),
            "raw_role_check_files": role_checks.get("file_count", 0),
            "status_machines": status_machines.get("machine_count", 0),
            "beat_scheduled_tasks": scheduled.get("beat_entry_count", 0),
            "shared_task_defs": scheduled.get("shared_task_count", 0),
            "backend_ai_admissions_boundary_files": provider_ai.get("backend_ai_admissions_boundary_count", 0),
            "frontend_ai_files": provider_ai.get("frontend_ai_file_count", 0),
            "frontend_routes": frontend.get("route_count", 0),
            "pages_components_direct_api_calls": raw_calls.get("pages_components_direct_call_file_count", 0),
        },
        "zero_unclassified": zero_report.get("zero_unclassified", False),
        "unclassified_count": zero_report.get("unclassified_count", 0),
        "classification_breakdown": zero_report.get("by_class", {}),
    }
    _write_json(out_dir / "inventory-summary.json", summary)
    return summary


def _write_md_zero_report(path: Path, zero: Dict[str, Any], backend: Dict[str, Any]) -> None:
    lines = [
        "# Zero-Unclassified-Route Report — Admissions V2 task 0.3",
        "",
        f"Total backend endpoints enumerated: **{zero['total_routes']}**  ",
        f"Classified: **{zero['classified']}**  ",
        f"Unclassified: **{zero['unclassified_count']}**  ",
        f"Zero-unclassified invariant: **{'PASS' if zero['zero_unclassified'] else 'FAIL'}**",
        "",
        "Every enumerated endpoint is assigned exactly one authority class by "
        "the deterministic classifier in `scripts/inventory_admissions_v2.py` "
        "(`classify_endpoint`). The classifier is total: an endpoint that "
        "matched no rule would be reported as `unclassified` and fail this gate.",
        "",
        "## Classification breakdown",
        "",
        "| Authority class | Count | Kind |",
        "| --- | --- | --- |",
    ]
    kind = {
        "public": "design §5.2 target-7",
        "owner": "design §5.2 target-7",
        "reviewer_assignment": "design §5.2 target-7",
        "tenant_capability": "design §5.2 target-7",
        "platform_capability": "design §5.2 target-7",
        "worker": "design §5.2 target-7",
        "internal_callback": "design §5.2 target-7",
        "authenticated": "weak bucket — authority-matrix assignment pending (task 2.1)",
        "health": "infra/meta",
        "api_docs": "infra/meta",
        "api_root": "infra/meta",
        "django_admin": "infra/meta",
    }
    for cls, count in zero["by_class"].items():
        lines.append(f"| `{cls}` | {count} | {kind.get(cls, '?')} |")
    lines += [
        "",
        f"- Endpoints in a design §5.2 target authority class: "
        f"**{zero['target_authority_class_count']}**",
        f"- Endpoints in the weak `authenticated` bucket (need explicit "
        f"authority-matrix assignment in task 2.1): "
        f"**{zero['weak_authenticated_pending_matrix']}**",
        f"- Infra/meta endpoints (health, docs, admin, root): "
        f"**{zero['infra_meta_count']}**",
        "",
    ]
    if zero["unclassified"]:
        lines += ["## Unclassified endpoints (MUST be empty)", ""]
        for u in zero["unclassified"]:
            lines.append(f"- `{','.join(u['methods'])} {u['path']}` ({u['view']})")
    else:
        lines += [
            "## Unclassified endpoints",
            "",
            "None. Every endpoint is classified.",
        ]
    lines += [
        "",
        "## Authority-risk summary (feeds AUTH-02)",
        "",
        "Endpoints whose authority is decided by a raw role string rather than "
        "the capability service, and mutations without idempotency, are flagged "
        "in `backend_routes.json` under `risk_flags`. Aggregate counts:",
        "",
    ]
    risk_counts: Dict[str, int] = {}
    for r in backend.get("routes", []):
        for f in r.get("risk_flags", []) or []:
            risk_counts[f] = risk_counts.get(f, 0) + 1
    lines += ["| Risk flag | Endpoint count |", "| --- | --- |"]
    for flag, count in sorted(risk_counts.items()):
        lines.append(f"| `{flag}` | {count} |")
    lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate the Admissions V2 route/authority/domain/source inventory (task 0.3).",
    )
    parser.add_argument("--repo-root", type=Path, default=default_repo_root())
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (default: <repo>/docs/v2-evidence/0.3/inventory).",
    )
    parser.add_argument("--json", action="store_true", dest="json_flag", help="Print the summary as JSON.")
    parser.add_argument("--strict", action="store_true", help="Exit 1 if any collector degraded.")
    args = parser.parse_args(argv)

    repo_root = args.repo_root.resolve()
    out_dir = (args.out or (repo_root / "docs" / "v2-evidence" / "0.3" / "inventory")).resolve()

    summary = generate(repo_root, out_dir)

    if args.json_flag:
        print(json.dumps(summary, indent=2))
    else:
        print("=" * 66)
        print("ADMISSIONS V2 INVENTORY (task 0.3)")
        print("=" * 66)
        print(f"Output:            {out_dir}")
        print(f"Django available:  {summary['django_available']}")
        if summary.get("django_error"):
            print(f"Django error:      {summary['django_error']}")
        print(f"Backend routes:    {summary['counts']['backend_routes']}")
        print(f"Frontend routes:   {summary['counts']['frontend_routes']}")
        print(f"Platform caps:     {summary['counts']['platform_capabilities']}")
        print(f"Tenant caps:       {summary['counts']['tenant_capabilities']}")
        print(f"Raw role hits:     {summary['counts']['raw_role_check_hits']} "
              f"in {summary['counts']['raw_role_check_files']} files")
        print(f"Status machines:   {summary['counts']['status_machines']}")
        print(f"Beat tasks:        {summary['counts']['beat_scheduled_tasks']}")
        print(f"Direct api calls:  {summary['counts']['pages_components_direct_api_calls']} page/component files")
        print(f"Admissions AI files (backend): {summary['counts']['backend_ai_admissions_boundary_files']}")
        print("-" * 66)
        print("Classification breakdown:")
        for cls, count in summary["classification_breakdown"].items():
            print(f"  {cls:22} {count}")
        print("-" * 66)
        print(f"ZERO-UNCLASSIFIED: {'PASS' if summary['zero_unclassified'] else 'FAIL'} "
              f"({summary['unclassified_count']} unclassified)")

    if not summary["zero_unclassified"]:
        return 2
    if args.strict and not summary["django_available"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
