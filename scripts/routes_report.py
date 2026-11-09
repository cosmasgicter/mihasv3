#!/usr/bin/env python3
"""Routes-versus-callers report (platform-simplification task 3.1, Requirements 2.1-2.3, 2.5).

For every mounted backend route it answers one question: does anything outside
the backend call it? Each route gets exactly one class, in this order of
precedence:

``caller``     a first-party frontend source names the route (an ambiguous
               dynamic path counts, so a false positive never hides a caller)
``consumer``   listed in ``scripts/route-consumers.json`` (a real outside
               consumer: a webhook, the schema endpoints, ...)
``gated``      mounted only when ``ENABLE_JOBS_OPS_ROUTES`` is on
``baselined``  listed in ``scripts/routes-report-baseline.json`` with a reason
``offender``   none of the above; the job fails

The job also fails on a stale baseline entry (its route is gone, or has gained a
stronger class) and on an invalid or stale consumer entry.

The URL surface comes from ``build_backend_route_catalogue()`` in
``scripts/inventory_admissions_v2.py``, built once per flag state. The flag is
read at import time by ``config/urls.py``, so each build reloads the URLconf
modules inside ``override_settings`` and clears the URL caches.

Callers: string and template literals in production frontend sources. Admissions
literals without a version prefix are v1 (the client prefixes ``/api/v1``); a
literal that starts with ``/api/vN/`` is vN. Unprefixed literals are read only
from the API-facing directories (services, hooks, lib, stores, contexts) so a
page link such as ``/student/payment`` is not mistaken for an API call. Jobs-ops
passes full paths, so only versioned literals count there. Tests, generated
files and dev previews are excluded, as in ``scripts/v1_surface_telemetry.py``.

Usage (from the repository root, with the backend environment variables set):

    python3 scripts/routes_report.py [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = REPO_ROOT / "scripts"
CONSUMERS_FILE = SCRIPTS / "route-consumers.json"
BASELINE_FILE = SCRIPTS / "routes-report-baseline.json"

#: Frontend source roots and whether unprefixed literals are API calls there.
CALLER_ROOTS: tuple[tuple[str, bool], ...] = (
    ("apps/admissions/src", True),
    ("apps/jobs-ops/src", False),
)
#: Directories of the admissions app whose unprefixed literals are API paths.
API_DIRS = ("services", "hooks", "lib", "stores", "contexts")
_EXCLUDED_MARKERS = ("/tests/", "/__fixtures__/", "/generated/", "/pages/dev/")
_EXCLUDED_SUFFIXES = (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", ".d.ts")
_SOURCE_SUFFIXES = (".ts", ".tsx")

CLASSES = ("caller", "consumer", "gated", "baselined", "offender")
WILDCARD = "*"
_EXPR = "\x00"

RouteKey = tuple[str, tuple[str, ...]]  # (version, segments)


# --------------------------------------------------------------------------- #
# Normalisation
# --------------------------------------------------------------------------- #
_DJANGO_CONVERTER = re.compile(r"<(?:[A-Za-z_][A-Za-z0-9_]*:)?[A-Za-z_][A-Za-z0-9_]*>")
_REGEX_GROUP = re.compile(r"\(\?P<[^>]+>[^)]*\)")
_FORMAT_SUFFIX = re.compile(r"\\\.\(\?P<format>[^)]*\)")


def normalise_route(path: str) -> RouteKey | None:
    """Return ``(version, segments)`` for a mounted path, or None if unversioned.

    Django converters and regex groups become a wildcard segment. Unversioned
    mounts (health checks, the Django admin) return None: they are not part of
    the ``/api/vN`` contract this report reconciles.
    """
    text = _FORMAT_SUFFIX.sub("", path)
    text = _DJANGO_CONVERTER.sub(WILDCARD, text)
    text = _REGEX_GROUP.sub(WILDCARD, text)
    text = text.replace("^", "").replace("$", "")
    segments = [s for s in text.split("/") if s]
    if len(segments) >= 2 and segments[0] == "api" and re.fullmatch(r"v\d+", segments[1]):
        return segments[1], tuple(segments[2:])
    return None


def display_route(key: RouteKey) -> str:
    """Stable string form used in the baseline and consumer files."""
    version, segments = key
    tail = "/".join(segments)
    return f"/api/{version}/{tail}/" if tail else f"/api/{version}/"


def parse_display_route(route: str) -> RouteKey | None:
    return normalise_route(route.replace("{}", WILDCARD))


def segments_match(route: tuple[str, ...], caller: tuple[str, ...]) -> bool:
    """Segment-by-segment comparison; a wildcard on either side matches any."""
    if len(route) != len(caller):
        return False
    return all(r == c or r == WILDCARD or c == WILDCARD for r, c in zip(route, caller))


# --------------------------------------------------------------------------- #
# Caller extraction
# --------------------------------------------------------------------------- #
_LITERAL = re.compile(r"'((?:\\.|[^'\\\n])*)'|\"((?:\\.|[^\"\\\n])*)\"|`((?:\\.|[^`\\])*)`")
_TEMPLATE_EXPR = re.compile(r"\$\{(?:[^{}]|\{[^{}]*\})*\}")
_PATHISH = re.compile(rf"^/[A-Za-z0-9_\-./{_EXPR}]*$")


def _strip_comments(source: str) -> str:
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)
    return "\n".join(
        "" if line.lstrip().startswith("//") else line for line in source.splitlines()
    )


def literal_to_callers(text: str, *, versioned_only: bool) -> set[RouteKey]:
    """Turn one string/template literal into caller keys (possibly none).

    A trailing ``${...}`` after a slash is ambiguous: it is a path id
    (``/applications/${id}``) or a query string
    (``/admin/audit-logs/${buildQueryString(p)}``). Both readings are returned,
    so the report errs toward finding a caller.
    """
    text = _TEMPLATE_EXPR.sub(_EXPR, text.strip()).split("?", 1)[0]
    variants = {text}
    if text.endswith("/" + _EXPR):
        variants.add(text[: -len(_EXPR)])
    found: set[RouteKey] = set()
    for variant in variants:
        if variant.startswith(_EXPR + "/"):
            variant = variant[1:]
        if not _PATHISH.match(variant):
            continue
        segments = [WILDCARD if _EXPR in s else s for s in variant.split("/") if s]
        if not segments:
            continue
        if len(segments) >= 2 and segments[0] == "api" and re.fullmatch(r"v\d+", segments[1]):
            version, rest = segments[1], tuple(segments[2:])
        elif versioned_only:
            continue
        else:
            version, rest = "v1", tuple(segments)
        if not rest or all(s == WILDCARD for s in rest):
            continue
        found.add((version, rest))
    return found


_PATH_CONSTANT = re.compile(
    r"(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*(['\"`])(/[^'\"`$]*)\2"
)


def extract_callers(source: str, *, accept_unprefixed: bool) -> set[RouteKey]:
    """Literal paths in one file; a ``${CONSTANT}`` defined as a path in the same
    file is substituted first (``${SAVED_FILTERS_ENDPOINT}${id}/``)."""
    text = _strip_comments(source)
    constants = {m.group(1): m.group(3) for m in _PATH_CONSTANT.finditer(text)}
    found: set[RouteKey] = set()
    for m in _LITERAL.finditer(text):
        body = next(g for g in m.groups() if g is not None)
        for name, value in constants.items():
            body = body.replace("${" + name + "}", value)
        found |= literal_to_callers(body, versioned_only=not accept_unprefixed)
    return found


def _is_excluded(rel: str) -> bool:
    return any(mark in rel for mark in _EXCLUDED_MARKERS) or rel.endswith(_EXCLUDED_SUFFIXES)


def scan_callers(repo_root: Path = REPO_ROOT) -> dict[RouteKey, set[str]]:
    callers: dict[RouteKey, set[str]] = {}
    for root_rel, unprefixed_in_api_dirs in CALLER_ROOTS:
        root = repo_root / root_rel
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*")):
            if path.suffix not in _SOURCE_SUFFIXES or not path.is_file():
                continue
            rel = "/" + path.relative_to(repo_root).as_posix()
            if _is_excluded(rel):
                continue
            first = path.relative_to(root).parts[0]
            accept = unprefixed_in_api_dirs and first in API_DIRS
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for key in extract_callers(text, accept_unprefixed=accept):
                callers.setdefault(key, set()).add(rel.lstrip("/"))
    return callers


# --------------------------------------------------------------------------- #
# Classification (pure)
# --------------------------------------------------------------------------- #
@dataclass
class Entry:
    route: str
    reason: str = ""
    decision: str | None = None


@dataclass
class Report:
    classes: dict[str, str] = field(default_factory=dict)  # display route -> class
    callers: dict[str, list[str]] = field(default_factory=dict)
    offenders: list[str] = field(default_factory=list)
    stale_baseline: list[str] = field(default_factory=list)
    invalid_consumers: list[str] = field(default_factory=list)
    invalid_baseline: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not (
            self.offenders
            or self.stale_baseline
            or self.invalid_consumers
            or self.invalid_baseline
        )


def _find_callers(key: RouteKey, callers: dict[RouteKey, Iterable[str]]) -> list[str]:
    files: set[str] = set()
    for (version, segs), where in callers.items():
        if version == key[0] and segments_match(key[1], segs):
            files.update(where)
    return sorted(files)


def _matches_any(key: RouteKey, others: Iterable[RouteKey]) -> bool:
    return any(o[0] == key[0] and segments_match(key[1], o[1]) for o in others)


def classify(
    routes: Iterable[RouteKey],
    gated: Iterable[RouteKey],
    callers: dict[RouteKey, Iterable[str]],
    consumers: Iterable[dict[str, Any]],
    baseline: Iterable[dict[str, Any]],
) -> Report:
    """Give every route exactly one class and check the lists that feed it."""
    report = Report()
    route_set = set(routes)
    gated_set = set(gated)

    consumer_keys: list[RouteKey] = []
    for entry in consumers:
        problem = _invalid_consumer(entry, route_set)
        if problem:
            report.invalid_consumers.append(problem)
            continue
        consumer_keys.append(parse_display_route(entry["route"]))  # type: ignore[arg-type]

    baseline_keys: dict[RouteKey, dict[str, Any]] = {}
    for entry in baseline:
        key = parse_display_route(str(entry.get("route", ""))) if isinstance(entry, dict) else None
        reason = entry.get("reason") if isinstance(entry, dict) else None
        if key is None or not isinstance(reason, str) or not reason.strip():
            report.invalid_baseline.append(
                f"baseline entry needs a mounted /api/vN/ route and a non-empty reason: {entry!r}"
            )
            continue
        baseline_keys[key] = entry

    chosen: dict[RouteKey, str] = {}
    for key in sorted(route_set):
        found = _find_callers(key, callers)
        if found:
            cls = "caller"
            report.callers[display_route(key)] = found
        elif _matches_any(key, consumer_keys):
            cls = "consumer"
        elif key in gated_set:
            cls = "gated"
        elif key in baseline_keys:
            cls = "baselined"
        else:
            cls = "offender"
            report.offenders.append(display_route(key))
        chosen[key] = cls
        report.classes[display_route(key)] = cls

    for key, entry in baseline_keys.items():
        cls = chosen.get(key)
        if cls is None:
            report.stale_baseline.append(f"{entry['route']}: route is no longer mounted")
        elif cls != "baselined":
            report.stale_baseline.append(f"{entry['route']}: now classified {cls}, remove the entry")
    return report


def _invalid_consumer(entry: Any, routes: set[RouteKey]) -> str | None:
    if not isinstance(entry, dict):
        return f"consumer entry is not an object: {entry!r}"
    for name in ("route", "consumer", "owner", "reason"):
        value = entry.get(name)
        if not isinstance(value, str) or not value.strip():
            return f"consumer entry needs a non-empty {name!r}: {entry!r}"
    key = parse_display_route(entry["route"])
    if key is None:
        return f"consumer route is not an /api/vN/ path: {entry['route']}"
    if not _matches_any(key, routes):
        return f"consumer route is not mounted (stale): {entry['route']}"
    return None


# --------------------------------------------------------------------------- #
# Backend route enumeration
# --------------------------------------------------------------------------- #
_URLCONF_MODULES = ("apps.common.email_urls", "apps.documents.urls", "config.urls")


def _catalogue_keys(flag: bool, repo_root: Path) -> set[RouteKey]:
    import importlib

    from django.test import override_settings
    from django.urls import clear_url_caches

    sys.path.insert(0, str(SCRIPTS))
    from inventory_admissions_v2 import build_backend_route_catalogue  # type: ignore

    with override_settings(ENABLE_JOBS_OPS_ROUTES=flag):
        for name in _URLCONF_MODULES:
            importlib.reload(importlib.import_module(name))
        clear_url_caches()
        catalogue = build_backend_route_catalogue(repo_root)
    keys: set[RouteKey] = set()
    for record in catalogue["routes"]:
        key = normalise_route(record["path"])
        if key:
            keys.add(key)
    return keys


def setup_django(repo_root: Path = REPO_ROOT) -> None:
    backend = str(repo_root / "backend")
    if backend not in sys.path:
        sys.path.insert(0, backend)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    os.environ.setdefault("TESTING", "1")
    import django

    django.setup()


def collect_route_sets(repo_root: Path = REPO_ROOT) -> tuple[set[RouteKey], set[RouteKey]]:
    """Return ``(all_routes, gated_routes)``: the flag-on surface and what only it adds."""
    setup_django(repo_root)
    try:
        off = _catalogue_keys(False, repo_root)
        on = _catalogue_keys(True, repo_root)
    finally:
        # Leave the process on the settings default for any later caller.
        from django.conf import settings
        from django.urls import clear_url_caches
        import importlib

        for name in _URLCONF_MODULES:
            importlib.reload(importlib.import_module(name))
        clear_url_caches()
        _ = settings
    return on | off, on - off


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _load_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["entries"] if isinstance(data, dict) else data


def build_report(repo_root: Path = REPO_ROOT) -> tuple[Report, dict[str, Any]]:
    routes, gated = collect_route_sets(repo_root)
    callers = scan_callers(repo_root)
    report = classify(
        routes,
        gated,
        callers,
        _load_list(CONSUMERS_FILE),
        _load_list(BASELINE_FILE),
    )
    payload = {
        "route_count": len(routes),
        "classes": report.classes,
        "callers": report.callers,
        "offenders": report.offenders,
        "stale_baseline": report.stale_baseline,
        "invalid_consumers": report.invalid_consumers,
        "invalid_baseline": report.invalid_baseline,
    }
    return report, payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--json", help="write the full report to this path")
    parser.add_argument("--write-baseline", action="store_true", help="print offenders as baseline entries")
    args = parser.parse_args(argv)

    report, payload = build_report()
    counts = {c: 0 for c in CLASSES}
    for cls in report.classes.values():
        counts[cls] += 1
    print(f"routes: {len(report.classes)}  " + "  ".join(f"{c}={n}" for c, n in counts.items()))
    for title, items in (
        ("OFFENDERS (no caller, consumer, gate or baseline entry)", report.offenders),
        ("STALE BASELINE", report.stale_baseline),
        ("INVALID CONSUMERS", report.invalid_consumers),
        ("INVALID BASELINE", report.invalid_baseline),
    ):
        if items:
            print(f"\n{title}:")
            for item in items:
                print(f"  {item}")
    if args.write_baseline:
        print(json.dumps([{"route": r, "reason": "TODO"} for r in report.offenders], indent=2))
    if args.json:
        Path(args.json).write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
