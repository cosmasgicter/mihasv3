#!/usr/bin/env python3
"""CI governance script: detect circular imports between Django app packages.

Uses AST parsing to build a directed import graph between top-level packages
under ``apps.*`` and reports any cycles found via DFS.

Exit codes:
    0 — no circular imports detected
    1 — one or more circular import cycles found

Files that fail AST parsing are logged as warnings but do not fail the check.
"""

import ast
import os
import sys
from collections import defaultdict
from pathlib import Path


def _top_level_package(module_path: str) -> str | None:
    """Extract the top-level app package from a dotted module path.

    Example: ``apps.applications.views`` → ``apps.applications``
    Returns ``None`` if the path doesn't start with ``apps.``.
    """
    parts = module_path.split(".")
    if len(parts) >= 2 and parts[0] == "apps":
        return f"apps.{parts[1]}"
    return None


def _extract_imports(filepath: Path) -> set[str]:
    """Return the set of top-level app packages imported by *filepath*."""
    try:
        source = filepath.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(filepath))
    except (SyntaxError, UnicodeDecodeError) as exc:
        print(f"WARNING: skipping {filepath} — {exc}", file=sys.stderr)
        return set()

    targets: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                pkg = _top_level_package(alias.name)
                if pkg:
                    targets.add(pkg)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                pkg = _top_level_package(node.module)
                if pkg:
                    targets.add(pkg)
    return targets


def build_import_graph(apps_dir: Path) -> dict[str, set[str]]:
    """Walk all ``.py`` files under *apps_dir* and build a package-level graph."""
    graph: dict[str, set[str]] = defaultdict(set)

    for root, _dirs, files in os.walk(apps_dir):
        root_path = Path(root)
        # Determine which top-level package this file belongs to
        try:
            rel = root_path.relative_to(apps_dir)
        except ValueError:
            continue
        parts = rel.parts
        if not parts:
            continue
        source_pkg = f"apps.{parts[0]}"

        for fname in files:
            if not fname.endswith(".py"):
                continue
            filepath = root_path / fname
            imported_pkgs = _extract_imports(filepath)
            for target_pkg in imported_pkgs:
                if target_pkg != source_pkg:
                    graph[source_pkg].add(target_pkg)

    return graph


def find_cycles(graph: dict[str, set[str]]) -> list[list[str]]:
    """Return all elementary cycles in *graph* using DFS."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {node: WHITE for node in graph}
    # Also include nodes that only appear as targets
    for targets in graph.values():
        for t in targets:
            if t not in color:
                color[t] = WHITE

    path: list[str] = []
    cycles: list[list[str]] = []

    def dfs(node: str) -> None:
        color[node] = GRAY
        path.append(node)
        for neighbour in graph.get(node, set()):
            if color[neighbour] == GRAY:
                # Found a cycle — extract it from path
                idx = path.index(neighbour)
                cycle = path[idx:] + [neighbour]
                cycles.append(cycle)
            elif color[neighbour] == WHITE:
                dfs(neighbour)
        path.pop()
        color[node] = BLACK

    for node in sorted(color):
        if color[node] == WHITE:
            dfs(node)

    return cycles


def main() -> int:
    # Resolve apps directory relative to this script's location (backend/scripts/)
    script_dir = Path(__file__).resolve().parent
    backend_dir = script_dir.parent
    apps_dir = backend_dir / "apps"

    if not apps_dir.is_dir():
        print(f"ERROR: apps directory not found at {apps_dir}", file=sys.stderr)
        return 1

    graph = build_import_graph(apps_dir)

    # Print the import graph for visibility
    print("Import graph (package → dependencies):")
    for pkg in sorted(graph):
        deps = sorted(graph[pkg])
        if deps:
            print(f"  {pkg} → {', '.join(deps)}")

    cycles = find_cycles(graph)

    if not cycles:
        print("\n✅ No circular imports detected between app packages.")
        return 0

    # Deduplicate cycles (normalize by sorting the rotation)
    seen: set[tuple[str, ...]] = set()
    unique_cycles: list[list[str]] = []
    for cycle in cycles:
        # Normalize: rotate so smallest element is first
        core = cycle[:-1]  # remove the repeated tail
        if not core:
            continue
        min_idx = core.index(min(core))
        normalized = tuple(core[min_idx:] + core[:min_idx])
        if normalized not in seen:
            seen.add(normalized)
            unique_cycles.append(cycle)

    print(f"\n❌ Found {len(unique_cycles)} circular import cycle(s):\n")
    for i, cycle in enumerate(unique_cycles, 1):
        print(f"  {i}. {' → '.join(cycle)}")

    return 1


if __name__ == "__main__":
    sys.exit(main())
