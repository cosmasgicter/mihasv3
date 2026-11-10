#!/usr/bin/env python3
"""
Admissions V2 — APPROVED endpoint authority matrix generator + gate (task 2.1).

This turns the task-0.3 route inventory (``scripts/inventory_admissions_v2.py``)
into the APPROVED authority matrix by overlaying the human-reviewed registry
(``scripts/authority_matrix_registry.py``). It EXTENDS the 0.3 route catalogue
rather than forking a parallel one: it reuses the exact same live-URLConf walk
(``inventory_admissions_v2.build_backend_route_catalogue``) and enriches each
route record with its approved design §5.2 registry entry.

It emits, under ``docs/v2-evidence/2.1/`` by default:

1. ``authority-matrix.json`` — every live backend route with its 0.3 heuristic
   fields PLUS the approved §5.2 authority entry and a reconciliation record
   (heuristic vs approved class, weak-bucket-resolved, overridden).
2. ``authority-matrix.csv`` — the same, flat.
3. ``zero-unclassified-endpoint-report.{json,md}`` — the EXECUTABLE GATE. It is
   strictly stronger than 0.3's: it FAILS unless EVERY live route resolves to a
   design §5.2 authority class (target-seven) or an explicitly-approved boundary
   (infra / jobs_ops). ANY route left in the weak ``authenticated`` bucket, any
   unregistered admissions route, or any stale registry entry FAILS the gate.
4. ``authority-case-matrix.json`` — the generated allow/deny CASE MATRIX for the
   five actor contexts (anonymous, Student, Reviewer, Tenant_Admin,
   Platform_Admin) across two institutions (tenant A and tenant B) and
   cross-tenant object IDs. This is the test-generation input task 2.2 consumes
   to enforce every protected endpoint (R3.6).
5. ``disclosure-policy.json`` — the per-class object-disclosure (404 vs
   non-revealing 403) policy (R3.2).
6. ``authority-matrix-summary.json`` — index + counts + generation metadata.

Exit codes: 0 = generated and the zero-unclassified gate PASSED; 2 = the gate
FAILED (an unresolved / weak-bucket route, an unregistered admissions route, or
a stale registry entry); 1 = Django could not be configured (route walk
unavailable) under ``--strict``.

USAGE
-----
    backend/.venv/bin/python scripts/authority_matrix_v2.py \
        --repo-root . --out docs/v2-evidence/2.1
"""

from __future__ import annotations

import argparse
import csv
import datetime as _dt
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

# Make the sibling 0.3 inventory + the approved registry importable regardless
# of the working directory or caller (script CLI or backend pytest).
_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import authority_matrix_registry as reg  # noqa: E402
import inventory_admissions_v2 as inv  # noqa: E402


# --------------------------------------------------------------------------- #
# Canonical capability bundles (mirror AdminCapabilityService; drift-guarded by
# backend/tests/unit/test_authority_matrix_v2.py::test_capability_bundles_match)
# --------------------------------------------------------------------------- #

PLATFORM_CAPABILITIES = frozenset(
    {
        "platform.tenant.read_all",
        "platform.tenant.create",
        "platform.tenant.update",
        "platform.tenant.deactivate",
        "platform.domain.manage",
        "platform.asset.manage",
        "platform.template.manage",
        "platform.document.manage",
        "platform.canonical_program.manage",
        "platform.program_assignment.manage",
        "platform.intake.manage",
        "platform.user.manage_all",
        "platform.access_grant.manage",
        "platform.audit.read_all",
        "platform.routing.simulate_all",
        "platform.settings.manage",
    }
)

TENANT_CAPABILITIES = frozenset(
    {
        "tenant.profile.read",
        "tenant.profile.request_change",
        "tenant.application.read",
        "tenant.application.review",
        "tenant.application.export",
        "tenant.document.read",
        "tenant.document.verify",
        "tenant.payment.read",
        "tenant.payment.verify",
        "tenant.staff.read",
        "tenant.staff.invite",
        "tenant.staff.disable",
        "tenant.audit.read",
        "tenant.program.read",
        "tenant.program.request_change",
        "tenant.domain.read",
        "tenant.domain.request_change",
    }
)

#: Read-by-default bundle any scoped membership/grant confers (mirror of
#: AdminCapabilityService._DEFAULT_TENANT_READ_CAPABILITIES).
TENANT_READ_BUNDLE = frozenset(
    {
        "tenant.profile.read",
        "tenant.application.read",
        "tenant.document.read",
        "tenant.payment.read",
        "tenant.staff.read",
        "tenant.audit.read",
        "tenant.program.read",
        "tenant.domain.read",
    }
)


# --------------------------------------------------------------------------- #
# Actor capability profiles for the case matrix
# --------------------------------------------------------------------------- #
#
# The five R3.6 actor contexts, resolved to the tenant.*/platform.* authority
# each holds for tenant A (their scope). A fully-provisioned Tenant_Admin holds
# every tenant.* capability for A; a Reviewer holds only the read bundle for A
# (mutations require an explicit assignment/grant); a Student holds none;
# Platform_Admin holds all platform.* (all-access, every tenant).

def _actor_profile(actor_id: str) -> Dict[str, Any]:
    if actor_id == "anonymous":
        return {"authenticated": False, "tenant": None, "tenant_caps": frozenset(), "platform_caps": frozenset(), "all_access": False, "owner_capable": False}
    if actor_id == "student_A":
        return {"authenticated": True, "tenant": "A", "tenant_caps": frozenset(), "platform_caps": frozenset(), "all_access": False, "owner_capable": True}
    if actor_id == "reviewer_A":
        return {"authenticated": True, "tenant": "A", "tenant_caps": TENANT_READ_BUNDLE, "platform_caps": frozenset(), "all_access": False, "owner_capable": False, "assignment_scoped": True}
    if actor_id == "tenant_admin_A":
        return {"authenticated": True, "tenant": "A", "tenant_caps": TENANT_CAPABILITIES, "platform_caps": frozenset(), "all_access": False, "owner_capable": False}
    if actor_id == "platform_admin":
        return {"authenticated": True, "tenant": "*", "tenant_caps": TENANT_CAPABILITIES, "platform_caps": PLATFORM_CAPABILITIES, "all_access": True, "owner_capable": False}
    raise KeyError(actor_id)


# --------------------------------------------------------------------------- #
# Merge / resolve (extend the 0.3 catalogue with the approved entry)
# --------------------------------------------------------------------------- #

WEAK_BUCKET = "authenticated"


def resolve_route(route: Dict[str, Any], registry: Dict[str, Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], str]:
    """Resolve one live route to its approved entry + a resolution source.

    Returns ``(entry, source)`` where ``source`` is ``registry`` (explicit
    approved decision), ``boundary`` (reviewed infra/jobs_ops rule), or
    ``unresolved`` (entry is ``None`` — the gate fails).
    """
    path = route.get("path", "")
    entry = registry.get(path)
    if entry is not None:
        return entry, "registry"
    boundary = reg.classify_boundary(path, route.get("classification", ""), route.get("module", "") or "")
    if boundary is not None:
        return boundary, "boundary"
    return None, "unresolved"


def build_matrix(catalogue: Dict[str, Any], registry: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge live routes with the approved registry into the authority matrix.

    Each record EXTENDS the 0.3 route record with the approved §5.2 entry and a
    reconciliation block (heuristic class vs approved class, weak-bucket
    resolution, override).
    """
    matrix: List[Dict[str, Any]] = []
    for route in catalogue.get("routes", []):
        entry, source = resolve_route(route, registry)
        heuristic_class = route.get("classification", "unclassified")
        approved_class = entry["authority_class"] if entry else "unclassified"
        matrix.append(
            {
                "path": route.get("path"),
                "methods": route.get("methods", []),
                "view": route.get("view"),
                "module": route.get("module"),
                "source_file": route.get("source_file"),
                "permission_classes": route.get("permission_classes", []),
                # 0.3 heuristic result (kept for reconciliation).
                "heuristic_class": heuristic_class,
                # Approved §5.2 decision (task 2.1).
                "approved_class": approved_class,
                "resolution_source": source,
                "weak_bucket_resolved": heuristic_class == WEAK_BUCKET and approved_class != WEAK_BUCKET,
                "class_overridden": (
                    heuristic_class != approved_class
                    and heuristic_class not in reg.INFRA_HEURISTIC_CLASSES
                    and approved_class not in reg.BOUNDARY_CLASSES
                ),
                "authority": entry,
            }
        )
    matrix.sort(key=lambda r: (r["path"] or "", ",".join(r["methods"])))
    return matrix


# --------------------------------------------------------------------------- #
# Zero-unclassified gate (strictly stronger than 0.3)
# --------------------------------------------------------------------------- #

def build_zero_unclassified_report(
    matrix: List[Dict[str, Any]], registry: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """Build the executable zero-unclassified gate report.

    The gate PASSES iff every live route resolves to an approved class in
    ``reg.APPROVED_CLASSES`` (never the weak ``authenticated`` bucket) AND there
    is no drift (no unregistered admissions route, no stale registry entry).
    """
    by_class: Dict[str, int] = {}
    unresolved: List[Dict[str, Any]] = []
    weak_remaining: List[Dict[str, Any]] = []
    for rec in matrix:
        cls = rec["approved_class"]
        by_class[cls] = by_class.get(cls, 0) + 1
        if rec["authority"] is None or cls not in reg.APPROVED_CLASSES:
            unresolved.append({"path": rec["path"], "methods": rec["methods"], "view": rec["view"]})
        if cls == WEAK_BUCKET:
            weak_remaining.append({"path": rec["path"], "methods": rec["methods"]})

    live_paths = {rec["path"] for rec in matrix}
    # Drift: a registry entry whose path no longer exists in the live URLConf.
    stale_registry = sorted(p for p in registry if p not in live_paths)
    # Admissions routes resolved only by the boundary rule would be a review
    # gap; boundary is reserved for infra + jobs_ops, so this stays empty.
    boundary_resolved = sorted(
        rec["path"] for rec in matrix if rec["resolution_source"] == "boundary"
    )

    target_seven = sum(v for k, v in by_class.items() if k in reg.TARGET_SEVEN)
    boundary_count = sum(v for k, v in by_class.items() if k in reg.BOUNDARY_CLASSES)

    passed = (
        len(unresolved) == 0
        and len(weak_remaining) == 0
        and len(stale_registry) == 0
    )
    return {
        "gate": "zero-unclassified-endpoint",
        "spec_task": "2.1",
        "total_routes": len(matrix),
        "resolved": len(matrix) - len(unresolved),
        "unresolved_count": len(unresolved),
        "unresolved": unresolved,
        "weak_bucket_remaining_count": len(weak_remaining),
        "weak_bucket_remaining": weak_remaining,
        "stale_registry_entries": stale_registry,
        "boundary_resolved_paths": boundary_resolved,
        "by_approved_class": dict(sorted(by_class.items())),
        "target_seven_count": target_seven,
        "boundary_count": boundary_count,
        "weak_bucket_resolved_count": sum(1 for r in matrix if r["weak_bucket_resolved"]),
        "class_overridden_count": sum(1 for r in matrix if r["class_overridden"]),
        "zero_unclassified": passed,
        "passed": passed,
    }


# --------------------------------------------------------------------------- #
# Allow/deny case matrix (R3.6) — pure expected-outcome model
# --------------------------------------------------------------------------- #

PROTECTED_CLASSES = ("owner", "reviewer_assignment", "tenant_capability", "platform_capability")


def _effective_method_entries(rec: Dict[str, Any]) -> List[Tuple[str, Dict[str, Any]]]:
    """Yield ``(method, entry)`` for a matrix record, honoring ``by_method``."""
    entry = rec["authority"]
    if entry is None:
        return []
    by_method = entry.get("by_method")
    methods = rec.get("methods", []) or ["(any)"]
    out: List[Tuple[str, Dict[str, Any]]] = []
    for method in methods:
        if by_method and method in by_method:
            out.append((method, by_method[method]))
        else:
            out.append((method, entry))
    return out


def _object_variants(entry: Dict[str, Any]) -> List[str]:
    cls = entry["authority_class"]
    object_scoped = bool(entry.get("tenant_object_path"))
    if cls == "owner":
        return ["own_A", "other_owner_A", "cross_tenant_B"] if object_scoped else ["self"]
    if cls in ("tenant_capability", "reviewer_assignment"):
        return ["in_scope_A", "cross_tenant_B"] if object_scoped else ["scoped_aggregate"]
    if cls == "platform_capability":
        return ["tenant_A", "tenant_B"] if object_scoped else ["global"]
    return ["n/a"]


def _variant_tenant(variant: str) -> Optional[str]:
    if variant.endswith("_B") or variant == "tenant_B":
        return "B"
    if variant in ("own_A", "other_owner_A", "in_scope_A", "tenant_A"):
        return "A"
    return None


def expected_outcome(entry: Dict[str, Any], actor_id: str, variant: str) -> Dict[str, Any]:
    """Pure expected allow/deny outcome for (endpoint-authority, actor, object).

    Encodes the TARGET authority model (what task 2.2 must enforce), not the
    current buggy behavior. This is the single source of truth the generated
    authority-matrix test derives its assertions from (R3.6).
    """
    cls = entry["authority_class"]
    prof = _actor_profile(actor_id)

    # Unauthenticated: every protected class denies with 401.
    if not prof["authenticated"]:
        return {"expect": "deny", "status": 401, "reason": "unauthenticated"}

    obj_tenant = _variant_tenant(variant)
    composed = set(entry.get("composed_authorities") or [])
    cap = entry.get("capability")

    if cls == "owner":
        # The owning Student.
        if variant in ("self", "own_A"):
            if prof["owner_capable"] and prof["tenant"] in ("A", "*"):
                return {"expect": "allow", "status": 200, "reason": "owner"}
        # A non-owner Student hitting someone else's object.
        if variant == "other_owner_A" and prof["owner_capable"]:
            return {"expect": "deny", "status": 404, "reason": "non-owner (not-found mask)"}
        # Composed scoped-staff read (only when the endpoint is owner+staff).
        if composed:
            if prof["all_access"]:
                return {"expect": "allow", "status": 200, "reason": "platform all-access (composed staff read)"}
            if obj_tenant == prof["tenant"] and (composed & prof["tenant_caps"]):
                return {"expect": "allow", "status": 200, "reason": "scoped staff (composed tenant capability)"}
            if obj_tenant and obj_tenant != prof["tenant"]:
                return {"expect": "deny", "status": 404, "reason": "cross-tenant staff (not-found mask)"}
        # Everything else on an owner endpoint is masked as not-found.
        return {"expect": "deny", "status": 404, "reason": "not owner / not in scope (not-found mask)"}

    if cls == "reviewer_assignment":
        if prof["all_access"]:
            return {"expect": "allow", "status": 200, "reason": "platform all-access"}
        if obj_tenant and obj_tenant != prof["tenant"]:
            return {"expect": "deny", "status": 404, "reason": "cross-tenant (not-found mask)"}
        # In-tenant: a provisioned Tenant_Admin with review supersedes assignment;
        # a Reviewer needs an explicit assignment (modeled as unassigned here).
        if "tenant.application.review" in prof["tenant_caps"] and actor_id == "tenant_admin_A":
            return {"expect": "allow", "status": 200, "reason": "tenant admin review capability"}
        if prof.get("assignment_scoped"):
            return {"expect": "deny", "status": 404, "reason": "reviewer without assignment (not-found mask)"}
        return {"expect": "deny", "status": 404, "reason": "no assignment / not staff (not-found mask)"}

    if cls == "tenant_capability":
        if prof["all_access"]:
            return {"expect": "allow", "status": 200, "reason": "platform all-access"}
        # Cross-tenant object is masked BEFORE any capability check.
        if obj_tenant and obj_tenant != prof["tenant"]:
            return {"expect": "deny", "status": 404, "reason": "out-of-scope tenant (scope-before-lookup 404)"}
        # A Student holds no tenant scope for an admin surface -> masked 404.
        if actor_id == "student_A":
            return {"expect": "deny", "status": 404, "reason": "student not in tenant admin scope (not-found mask)"}
        # In-scope staff: allow iff they hold the capability (cap=None means
        # admin-tier read, satisfied by any tenant membership).
        if cap is None or cap in prof["tenant_caps"]:
            return {"expect": "allow", "status": 200, "reason": f"in-scope + capability ({cap or 'admin-tier read'})"}
        return {"expect": "deny", "status": 403, "reason": f"in-scope but missing capability {cap} (non-revealing 403)"}

    if cls == "platform_capability":
        if cap in prof["platform_caps"] or prof["all_access"]:
            return {"expect": "allow", "status": 200, "reason": f"platform capability ({cap})"}
        return {"expect": "deny", "status": 403, "reason": "missing platform capability (non-revealing 403)"}

    return {"expect": "n/a", "status": None, "reason": f"non-protected class {cls}"}


def build_case_matrix(matrix: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generate the allow/deny case matrix for every protected endpoint (R3.6)."""
    cases: List[Dict[str, Any]] = []
    excluded: Dict[str, int] = {}
    for rec in matrix:
        entry = rec["authority"]
        if entry is None:
            continue
        for method, meth_entry in _effective_method_entries(rec):
            cls = meth_entry["authority_class"]
            if cls not in PROTECTED_CLASSES:
                excluded[cls] = excluded.get(cls, 0) + 1
                continue
            variants = _object_variants(meth_entry)
            endpoint_cases = []
            for actor in reg.ACTORS:
                for variant in variants:
                    outcome = expected_outcome(meth_entry, actor["id"], variant)
                    endpoint_cases.append(
                        {
                            "actor": actor["id"],
                            "actor_role": actor["role"],
                            "object": variant,
                            "object_tenant": _variant_tenant(variant),
                            "expect": outcome["expect"],
                            "status": outcome["status"],
                            "reason": outcome["reason"],
                        }
                    )
            cases.append(
                {
                    "endpoint": f"{method} {rec['path']}",
                    "path": rec["path"],
                    "method": method,
                    "authority_class": cls,
                    "capability": meth_entry.get("capability"),
                    "composed_authorities": meth_entry.get("composed_authorities") or [],
                    "tenant_object_path": meth_entry.get("tenant_object_path"),
                    "disclosure": meth_entry.get("disclosure"),
                    "state_precondition": meth_entry.get("state_precondition"),
                    "idempotency": meth_entry.get("idempotency"),
                    "audit_event": meth_entry.get("audit_event"),
                    "cases": endpoint_cases,
                }
            )
    cases.sort(key=lambda c: c["endpoint"])
    return {
        "spec_task": "2.1",
        "requirement": "R3.6",
        "actors": reg.ACTORS,
        "tenants": list(reg.TENANTS),
        "protected_endpoint_method_count": len(cases),
        "total_cases": sum(len(c["cases"]) for c in cases),
        "excluded_nonprotected_by_class": dict(sorted(excluded.items())),
        "consumption_note": (
            "Task 2.2 consumes this as the generated authority-matrix test input: "
            "for each endpoint+method, build a request as each actor against an "
            "object in tenant A (in-scope / owned), a non-owned object in tenant A, "
            "and an object in tenant B (cross-tenant id), then assert the "
            "expected allow/deny + HTTP status. Cross-tenant denials MUST be the "
            "listed 404/403 disclosure, never a leak."
        ),
        "endpoints": cases,
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


def _write_matrix_csv(path: Path, matrix: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "path", "methods", "view", "heuristic_class", "approved_class",
        "resolution_source", "weak_bucket_resolved", "class_overridden",
        "capability", "disclosure", "idempotency", "audit_event", "finding",
    ]
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for rec in matrix:
            entry = rec.get("authority") or {}
            writer.writerow(
                {
                    "path": rec["path"],
                    "methods": "|".join(rec["methods"]),
                    "view": rec["view"],
                    "heuristic_class": rec["heuristic_class"],
                    "approved_class": rec["approved_class"],
                    "resolution_source": rec["resolution_source"],
                    "weak_bucket_resolved": rec["weak_bucket_resolved"],
                    "class_overridden": rec["class_overridden"],
                    "capability": entry.get("capability"),
                    "disclosure": entry.get("disclosure"),
                    "idempotency": entry.get("idempotency"),
                    "audit_event": entry.get("audit_event"),
                    "finding": entry.get("finding"),
                }
            )


def _write_zero_report_md(path: Path, zero: Dict[str, Any]) -> None:
    lines = [
        "# Zero-Unclassified-Endpoint Report — Admissions V2 task 2.1",
        "",
        "This is the APPROVED authority-matrix gate. It is strictly stronger than "
        "the task-0.3 report: 0.3 accepted a weak `authenticated` bucket "
        "(\"authority-matrix assignment pending — task 2.1\"); this gate FAILS "
        "unless every live route resolves to a design §5.2 authority class or an "
        "explicitly-approved boundary (infra / jobs_ops), with zero routes left in "
        "the weak bucket and no registry↔route drift.",
        "",
        f"Total backend endpoints: **{zero['total_routes']}**  ",
        f"Resolved to an approved class: **{zero['resolved']}**  ",
        f"Unresolved: **{zero['unresolved_count']}**  ",
        f"Weak `authenticated` bucket remaining: **{zero['weak_bucket_remaining_count']}** (must be 0)  ",
        f"Weak-bucket endpoints resolved by this task: **{zero['weak_bucket_resolved_count']}**  ",
        f"Heuristic classes corrected by approved review: **{zero['class_overridden_count']}**  ",
        f"Stale registry entries (drift): **{len(zero['stale_registry_entries'])}** (must be 0)  ",
        "",
        f"## GATE: {'PASS' if zero['passed'] else 'FAIL'}",
        "",
        "## Approved authority-class breakdown",
        "",
        "| Approved authority class | Count | Kind |",
        "| --- | --- | --- |",
    ]
    kind = {c: "design §5.2 target-7" for c in reg.TARGET_SEVEN}
    kind.update({"infra": "approved boundary (infra/meta)", "jobs_ops": "approved boundary (separate product)"})
    for cls, count in zero["by_approved_class"].items():
        lines.append(f"| `{cls}` | {count} | {kind.get(cls, 'UNAPPROVED — gate fails')} |")
    lines += [
        "",
        f"- Endpoints in a design §5.2 target authority class: **{zero['target_seven_count']}**",
        f"- Endpoints in an approved boundary class (infra / jobs_ops): **{zero['boundary_count']}**",
        "",
    ]
    if zero["unresolved"]:
        lines += ["## Unresolved endpoints (MUST be empty — gate FAILS)", ""]
        for u in zero["unresolved"]:
            lines.append(f"- `{','.join(u['methods'])} {u['path']}` ({u['view']})")
    else:
        lines += ["## Unresolved endpoints", "", "None. Every endpoint has an approved §5.2 classification."]
    if zero["weak_bucket_remaining"]:
        lines += ["", "## Weak `authenticated` bucket remaining (MUST be empty)", ""]
        for w in zero["weak_bucket_remaining"]:
            lines.append(f"- `{','.join(w['methods'])} {w['path']}`")
    if zero["stale_registry_entries"]:
        lines += ["", "## Stale registry entries (drift — MUST be empty)", ""]
        for p in zero["stale_registry_entries"]:
            lines.append(f"- `{p}`")
    lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def generate(repo_root: Path, out_dir: Path, catalogue: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Run the full task-2.1 generation. Returns the summary dict."""
    out_dir.mkdir(parents=True, exist_ok=True)
    if catalogue is None:
        catalogue = inv.collect_backend_routes(repo_root)
    if not catalogue.get("available"):
        summary = {
            "generator": "scripts/authority_matrix_v2.py",
            "spec_task": "2.1",
            "generated_at_utc": _dt.datetime.now(_dt.timezone.utc).isoformat(),
            "django_available": False,
            "django_error": catalogue.get("error"),
            "zero_unclassified": False,
            "passed": False,
        }
        _write_json(out_dir / "authority-matrix-summary.json", summary)
        return summary

    registry = reg.get_registry()
    matrix = build_matrix(catalogue, registry)
    zero = build_zero_unclassified_report(matrix, registry)
    case_matrix = build_case_matrix(matrix)

    _write_json(out_dir / "authority-matrix.json", {
        "spec_task": "2.1",
        "generated_from": "inventory_admissions_v2.build_backend_route_catalogue + authority_matrix_registry",
        "route_count": len(matrix),
        "disclosure_policy_by_class": reg.DISCLOSURE_BY_CLASS,
        "routes": matrix,
    })
    _write_matrix_csv(out_dir / "authority-matrix.csv", matrix)
    _write_json(out_dir / "zero-unclassified-endpoint-report.json", zero)
    _write_zero_report_md(out_dir / "zero-unclassified-endpoint-report.md", zero)
    _write_json(out_dir / "authority-case-matrix.json", case_matrix)
    _write_json(out_dir / "disclosure-policy.json", {
        "spec_task": "2.1",
        "requirement": "R3.2",
        "policy_by_class": reg.DISCLOSURE_BY_CLASS,
    })

    summary = {
        "generator": "scripts/authority_matrix_v2.py",
        "spec_task": "2.1",
        "generated_at_utc": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "repo_root": str(repo_root),
        "git_commit": _git_commit(repo_root),
        "django_available": True,
        "artifacts": {
            "authority_matrix": "authority-matrix.json",
            "authority_matrix_csv": "authority-matrix.csv",
            "zero_unclassified_report": "zero-unclassified-endpoint-report.md",
            "zero_unclassified_report_json": "zero-unclassified-endpoint-report.json",
            "authority_case_matrix": "authority-case-matrix.json",
            "disclosure_policy": "disclosure-policy.json",
        },
        "counts": {
            "total_routes": zero["total_routes"],
            "target_seven": zero["target_seven_count"],
            "boundary": zero["boundary_count"],
            "weak_bucket_resolved": zero["weak_bucket_resolved_count"],
            "class_overridden": zero["class_overridden_count"],
            "protected_endpoint_methods": case_matrix["protected_endpoint_method_count"],
            "total_generated_cases": case_matrix["total_cases"],
        },
        "by_approved_class": zero["by_approved_class"],
        "zero_unclassified": zero["passed"],
        "passed": zero["passed"],
        "unresolved_count": zero["unresolved_count"],
        "weak_bucket_remaining_count": zero["weak_bucket_remaining_count"],
        "stale_registry_entries": zero["stale_registry_entries"],
    }
    _write_json(out_dir / "authority-matrix-summary.json", summary)
    return summary


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the Admissions V2 approved authority matrix (task 2.1).")
    parser.add_argument("--repo-root", type=Path, default=inv.default_repo_root())
    parser.add_argument("--out", type=Path, default=None, help="Output directory (default: <repo>/docs/v2-evidence/2.1).")
    parser.add_argument("--json", action="store_true", dest="json_flag")
    parser.add_argument("--strict", action="store_true", help="Exit 1 if Django/route walk is unavailable.")
    args = parser.parse_args(argv)

    repo_root = args.repo_root.resolve()
    out_dir = (args.out or (repo_root / "docs" / "v2-evidence" / "2.1")).resolve()

    # Enumerate the FULL surface (including the production-gated jobs-ops routes)
    # so the gate covers every backend route, mirroring the 0.3 inventory.
    import os
    os.environ["ENABLE_JOBS_OPS_ROUTES"] = "1"
    summary = generate(repo_root, out_dir)

    if args.json_flag:
        print(json.dumps(summary, indent=2))
    else:
        print("=" * 68)
        print("ADMISSIONS V2 — APPROVED AUTHORITY MATRIX (task 2.1)")
        print("=" * 68)
        print(f"Output:              {out_dir}")
        print(f"Django available:    {summary.get('django_available')}")
        if not summary.get("django_available"):
            print(f"Django error:        {summary.get('django_error')}")
        else:
            c = summary["counts"]
            print(f"Total routes:        {c['total_routes']}")
            print(f"§5.2 target-seven:   {c['target_seven']}")
            print(f"Approved boundary:   {c['boundary']}")
            print(f"Weak-bucket resolved:{c['weak_bucket_resolved']}")
            print(f"Heuristic corrected: {c['class_overridden']}")
            print(f"Protected endpoints: {c['protected_endpoint_methods']} (method-level)")
            print(f"Generated cases:     {c['total_generated_cases']}")
            print("-" * 68)
            print("Approved authority-class breakdown:")
            for cls, count in summary["by_approved_class"].items():
                print(f"  {cls:22} {count}")
            print("-" * 68)
            print(f"ZERO-UNCLASSIFIED GATE: {'PASS' if summary['passed'] else 'FAIL'} "
                  f"({summary['unresolved_count']} unresolved, "
                  f"{summary['weak_bucket_remaining_count']} weak, "
                  f"{len(summary['stale_registry_entries'])} stale)")

    if not summary.get("django_available"):
        return 1 if args.strict else 0
    return 0 if summary["passed"] else 2


if __name__ == "__main__":
    sys.exit(main())
