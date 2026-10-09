#!/usr/bin/env python3
"""M9 — the authority instrument for cluster `C-viewauth` and `D-allowany`.

For every view named on the command line (or, with ``--unclassified``, for every
`APIView` subclass the gate reports as unclassified), produce a **static source
authority inventory** from the live class and URL configuration:

* ``authentication_classes`` -- and whether the view *declares* them or inherits
  the DRF default. That is exactly the three-way distinction
  ``tests/unit/test_view_auth_classification.py`` classifies on:
  ``[]`` -> auth-exempt, ``[OptionalJWTCookieAuthentication]`` ->
  public-personalizable, not declared -> protected.
* ``permission_classes``.
* every authority resolution in the class's own source: ``AdminCapabilityService``,
  ``authorize_tenant_surface``, ``require_capability``,
  ``require_institution_capability``, ``resolve_scoped_application``,
  ``_get_scoped_application``, ``require_application_capability``,
  ``visible_institution_queryset``, ``AccessScopeService``,
  ``TenantScopedCapabilityMixin.get_scoped_object``, plus every literal
  ``tenant.*`` / ``platform.*`` capability string.
* whether the class is REACHABLE through the URL resolver, so an abstract base
  is distinguishable from a mounted endpoint.

This is M3 §3.1's method (``raw/30-cluster-K-real-authority.txt``) at 3.5x the
scale. It reads the live class and URLconf and follows module-local helpers to a
maximum depth of three. It is source analysis, not behavioral authorization
proof; the integration/property tests provide the behavioral proof.

    python3 raw/authority-report.py --unclassified
    python3 raw/authority-report.py --allow-any
    python3 raw/authority-report.py apps.documents.fee_admin_views.AdminFeeListView
"""

from __future__ import annotations

import importlib
import inspect
import os
import re
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ.setdefault("TESTING", "1")

import django  # noqa: E402

django.setup()

from rest_framework.views import APIView  # noqa: E402

RESOLVERS = [
    "AdminCapabilityService",
    "authorize_tenant_surface",
    "require_capability",
    "require_institution_capability",
    "resolve_scoped_application",
    "resolve_owner_or_scoped_application",
    "_get_scoped_application",
    "require_application_capability",
    "visible_institution_queryset",
    "AccessScopeService",
    "get_scoped_object",
    "get_institution_capabilities",
    "can_manage_institution",
    "can_manage_program",
    "can_manage_domain",
    "can_invite_staff",
]
CAP_RE = re.compile(r"[\"'](?:tenant|platform)\.[a-z_.]+[\"']")


def _routed_classes() -> dict[str, list[str]]:
    """Map "module.Class" -> the URL patterns that mount it."""
    from django.urls import get_resolver

    out: dict[str, list[str]] = {}

    def walk(resolver, prefix=""):
        for p in resolver.url_patterns:
            pat = prefix + str(getattr(p, "pattern", ""))
            if hasattr(p, "url_patterns"):
                walk(p, pat)
                continue
            cb = p.callback
            cls = getattr(cb, "cls", None) or getattr(cb, "view_class", None)
            if cls is not None:
                out.setdefault(f"{cls.__module__}.{cls.__name__}", []).append("/" + pat)
    walk(get_resolver())
    return out


def _load(path: str):
    mod, name = path.rsplit(".", 1)
    return getattr(importlib.import_module(mod), name)


def _names(seq) -> str:
    return "[" + ", ".join(getattr(c, "__name__", repr(c)) for c in seq) + "]"


def _own_source(cls) -> str:
    try:
        return inspect.getsource(cls)
    except (OSError, TypeError):
        return ""


HELPER_DEPTH = 3


def _module_level_helpers_called(cls, src: str) -> tuple[str, list[str]]:
    """Follow module-level helper indirection, transitively, to ``HELPER_DEPTH``.

    A view may resolve authority through a helper rather than in the class body,
    and the chain can be more than one link long:
    ``V2TenantChangeRequestDetailView.get -> _get_scoped_or_404 ->
    _scoped_queryset -> visible_institution_queryset``. A scan that stops at the
    class body reports such a view as UNGUARDED -- the exact failure mode M3
    SS3.2 guarded against when it required its two module-local wrappers to
    delegate to a canonical resolver. So follow every bare name called, resolved
    through the calling module's own namespace, as long as it is a function
    DEFINED IN ``apps.*`` (platform code only), and name the whole chain so the
    reader can audit the depth rather than trust it.
    """
    extra, names, seen = "", [], set()
    frontier = [(cls.__module__, src)]
    for _ in range(HELPER_DEPTH):
        nxt = []
        for modname, text in frontier:
            mod = sys.modules.get(modname)
            if mod is None:
                continue
            for name in sorted(set(re.findall(r"\b(_?[a-z][a-z0-9_]*)\s*\(", text))):
                fn = getattr(mod, name, None)
                if not (inspect.isfunction(fn) and fn.__module__.startswith("apps.")):
                    continue
                key = f"{fn.__module__}.{fn.__qualname__}"
                if key in seen:
                    continue
                seen.add(key)
                fsrc = _own_source(fn)
                extra += "\n" + fsrc
                names.append(
                    name if fn.__module__ == cls.__module__ else f"{name}<-{fn.__module__}"
                )
                nxt.append((fn.__module__, fsrc))
        frontier = nxt
    return extra, names


def report(path: str, routes: dict[str, list[str]]) -> None:
    try:
        cls = _load(path)
    except Exception as exc:  # pragma: no cover - reported, not raised
        print(f"### {path}\n  !! could not load: {type(exc).__name__}: {exc}\n")
        return

    declares_auth = "authentication_classes" in cls.__dict__
    src = _own_source(cls)
    # include inherited-but-local bases defined in the same app tree
    for base in cls.__mro__[1:]:
        if base is APIView or base.__module__.startswith(("rest_framework", "django", "builtins")):
            continue
        src += "\n" + _own_source(base)

    helper_src, helper_names = _module_level_helpers_called(cls, src)
    src += helper_src

    found = sorted({r for r in RESOLVERS if r in src})
    caps = sorted({m.strip("\"'") for m in CAP_RE.findall(src)})
    mounted = routes.get(path, [])
    bases = [b.__name__ for b in cls.__bases__]

    if declares_auth:
        auth = _names(cls.authentication_classes)
        bucket = "AUTH_EXEMPT" if list(cls.authentication_classes) == [] else "PUBLIC_PERSONALIZABLE?"
        auth_note = f"DECLARED {auth}"
    else:
        auth = _names(cls.authentication_classes)
        bucket = "PROTECTED"
        auth_note = f"inherited {auth}"

    print(f"### {path}")
    print(f"  bases                 : {bases}")
    print(f"  authentication_classes: {auth_note}")
    print(f"  permission_classes    : {_names(cls.permission_classes)}")
    print(f"  bucket by the gate's own rule: {bucket}")
    print(f"  required_capability attr : {getattr(cls, 'required_capability', '(unset)')}")
    print(f"  authority resolvers   : {found or '(none)'}")
    print(f"  capability literals   : {caps or '(none)'}")
    print(f"  module-local helpers followed: {helper_names or '(none)'}")
    print(f"  routed                : {mounted or '(NOT MOUNTED — abstract base or unrouted)'}")
    print()


def main() -> int:
    routes = _routed_classes()
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--unclassified" in sys.argv:
        sys.path.insert(0, "tests")
        spec = importlib.util.spec_from_file_location(
            "_vac", "tests/unit/test_view_auth_classification.py"
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        args = sorted(mod._discover_all_api_views() - mod._ALL_CLASSIFIED)
        print(f"# {len(args)} APIView subclasses the gate reports as UNCLASSIFIED\n")
    if "--allow-any" in sys.argv:
        spec = importlib.util.spec_from_file_location(
            "_pep", "tests/unit/test_public_endpoint_policy.py"
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        from apps.common.public_endpoint_policy import PUBLIC_ENDPOINT_CLASSIFICATIONS

        args = sorted(mod._allow_any_view_classes() - set(PUBLIC_ENDPOINT_CLASSIFICATIONS))
        print(f"# {len(args)} AllowAny view classes with NO public-endpoint classification\n")
    for path in args:
        report(path, routes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
