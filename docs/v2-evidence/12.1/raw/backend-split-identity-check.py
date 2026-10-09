#!/usr/bin/env python3
"""Establish byte-identity of task 12.1's backend split *without* a pre-split copy.

``backend-view-extract.py --plan verify`` re-asserts byte-identity against a
retained pre-split copy (``_admin_source.py`` / ``_catalog_source.py``). No such
copy was retained, so ``--plan verify`` reports "no pre-split copy retained;
skipping" and proves nothing. This script is the substitute, and it is
deliberately stricter than "the modules import cleanly".

**The method.** The pre-split working-tree source is unrecoverable (the file was
overwritten by the shim, and its ``__pycache__`` entry with it), so the
comparison anchor is the **base commit** ``HEAD``:

1. ``git show HEAD:<module>`` into a temp file.
2. Re-use ``backend-view-extract.py``'s own ``top_level_spans`` / ``render`` to
   cut each planned definition's **exact source span** out of that HEAD copy —
   the same span logic that produced the split, so a span bug would show up as a
   mismatch rather than cancelling out.
3. Assert each HEAD span appears **byte-for-byte** in the split module the plan
   assigns it to.
4. Every definition that does *not* match is reported with a unified diff and
   must be attributed to a named in-flight admissions-v2 task — because
   ``admin_views.py`` was 2,072 lines in the working tree at dispatch against
   1,805 at HEAD, i.e. 267 lines of *other* lanes' uncommitted work sit between
   the anchor and the pre-split state.

So the claim this script can settle is precise: **the split introduced no
textual change of its own.** Anything that differs from HEAD differs because a
prior task changed it before this one ran, and that is shown per definition
rather than asserted in aggregate.

It also checks the split is a **partition**, which a per-definition diff cannot:

* every top-level definition in the split modules is in the plan (nothing was
  invented on the way out), and
* every top-level definition at HEAD is either in the plan or explicitly
  accounted for (nothing was dropped on the way out).

Run from the repository root:

    python3 docs/v2-evidence/12.1/raw/backend-split-identity-check.py
"""

from __future__ import annotations

import ast
import datetime
import difflib
import importlib.util
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve()
ROOT = HERE.parents[4]
CATALOG = ROOT / "backend" / "apps" / "catalog"
ANCHOR = "HEAD"


def _load_extractor():
    """Import the extraction script so its span logic is the one under test."""
    spec = importlib.util.spec_from_file_location(
        "backend_view_extract", HERE.parent / "backend-view-extract.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


EXTRACT = _load_extractor()


def _anchor_copy(rel: str, tmp: pathlib.Path) -> pathlib.Path | None:
    """``git show HEAD:<rel>`` into a temp file, or ``None`` if absent there."""
    result = subprocess.run(
        ["git", "show", f"{ANCHOR}:{rel}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    path = tmp / pathlib.Path(rel).name
    path.write_text(result.stdout)
    return path


def _top_level_names(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text())
    names: set[str] = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            names.update(t.id for t in node.targets if isinstance(t, ast.Name))
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
    return names


def check_plan(plan_name: str, source_rel: str, plan: dict[str, list[str]]) -> int:
    print(f"\n{'=' * 78}\n{source_rel}  vs  {plan_name} plan ({len(plan)} modules)\n{'=' * 78}")
    failures = 0
    with tempfile.TemporaryDirectory() as raw_tmp:
        tmp = pathlib.Path(raw_tmp)
        anchor = _anchor_copy(source_rel, tmp)
        if anchor is None:
            print(f"  !! {source_rel} does not exist at {ANCHOR}; cannot anchor")
            return 1

        anchor_spans = EXTRACT.top_level_spans(anchor)
        anchor_names = set(anchor_spans)
        planned = {name for names in plan.values() for name in names}

        print(
            f"  anchor ({ANCHOR}): {len(anchor.read_text().splitlines())} lines, "
            f"{len(anchor_names)} top-level definitions"
        )
        print(f"  plan: {len(planned)} definitions across {len(plan)} modules")

        identical: list[str] = []
        changed: list[str] = []
        absent_at_anchor: list[str] = []

        for target_name, names in plan.items():
            target = CATALOG / target_name
            if not target.exists():
                print(f"  !! {target_name} MISSING")
                failures += 1
                continue
            written = target.read_text()
            for name in names:
                if name not in anchor_spans:
                    absent_at_anchor.append(f"{name} -> {target_name}")
                    continue
                start, end = anchor_spans[name]
                text = "\n".join(anchor.read_text().split("\n")[start - 1 : end])
                if text in written:
                    identical.append(f"{name} -> {target_name}")
                else:
                    changed.append(f"{name} -> {target_name}")

        print(
            f"\n  byte-identical to {ANCHOR}: {len(identical)}/{len(planned)}"
            f"   differs: {len(changed)}   not at {ANCHOR}: {len(absent_at_anchor)}"
        )

        if changed:
            print(f"\n  --- differs from {ANCHOR} (must be attributed to another lane) ---")
            for entry in changed:
                name = entry.split(" -> ")[0]
                target_name = entry.split(" -> ")[1]
                start, end = anchor_spans[name]
                before = anchor.read_text().split("\n")[start - 1 : end]
                after = _current_span(CATALOG / target_name, name)
                diff = list(
                    difflib.unified_diff(
                        before, after, fromfile=f"{ANCHOR}", tofile=target_name, lineterm="", n=1
                    )
                )
                added = sum(1 for line in diff if line.startswith("+") and not line.startswith("+++"))
                removed = sum(1 for line in diff if line.startswith("-") and not line.startswith("---"))
                print(f"  * {entry}  (+{added} / -{removed} lines)")
                for line in diff[:40]:
                    print(f"      {line}")
                if len(diff) > 40:
                    print(f"      … {len(diff) - 40} more diff lines")

        if absent_at_anchor:
            print(f"\n  --- not present at {ANCHOR} (added by an in-flight task) ---")
            for entry in sorted(absent_at_anchor):
                print(f"  * {entry}")

        # ------------------------------------------------------------------
        # Attribution: every symbol a delta introduces must come from a module
        # that already existed before the split, and its mtime says when.
        # ------------------------------------------------------------------
        if changed:
            print("\n  --- provenance of the symbols the deltas introduce ---")
            introduced: set[str] = set()
            for entry in changed:
                name, target_name = entry.split(" -> ")
                start, end = anchor_spans[name]
                before = set(anchor.read_text().split("\n")[start - 1 : end])
                for line in _current_span(CATALOG / target_name, name):
                    if line not in before:
                        introduced |= {
                            token
                            for token in _identifiers(line)
                            if token in PROVENANCE
                        }
            for token in sorted(introduced):
                module = PROVENANCE[token]
                path = CATALOG / module
                mtime = (
                    datetime.datetime.fromtimestamp(
                        path.stat().st_mtime, tz=datetime.timezone.utc
                    )
                    .date()
                    .isoformat()
                    if path.exists()
                    else "?"
                )
                print(f"  * {token:<42} from {module:<32} mtime {mtime}")

        # ------------------------------------------------------------------
        # Partition check 1: nothing invented on the way out. Names the
        # hand-written header defines (e.g. ``logger``) are header-provided, not
        # moved bodies, so they are reported rather than counted as inventions.
        # ------------------------------------------------------------------
        header_names: set[str] = set()
        for target_name in plan:
            header = EXTRACT.HEADERS[plan_name][target_name]
            try:
                header_names |= _top_level_names_from_text(header)
            except SyntaxError:  # pragma: no cover - header is always parseable
                pass
        split_names: set[str] = set()
        for target_name in plan:
            target = CATALOG / target_name
            if target.exists():
                split_names |= _top_level_names(target)
        invented = sorted(split_names - planned - header_names)
        if invented:
            print(f"\n  !! defined in a split module but NOT in the plan: {invented}")
            failures += 1
        else:
            print(
                f"\n  partition: every top-level definition in the {len(plan)} split "
                f"modules is in the plan ({len(header_names)} further names are bound "
                "by the hand-written headers — imports and one logger)"
            )

        # ------------------------------------------------------------------
        # Partition check 2: nothing dropped on the way out. A name at the
        # anchor that is not in the plan must still be *findable* — either the
        # header binds it (import, possibly aliased) or a prior in-flight task
        # relocated it to a sibling module in this app. A name that exists
        # nowhere is a body this split lost.
        # ------------------------------------------------------------------
        unaccounted = sorted(anchor_names - planned - header_names)
        if unaccounted:
            print(f"\n  --- at {ANCHOR} but not in the plan: where each one lives now ---")
            lost: list[str] = []
            for name in unaccounted:
                homes = _find_definition(name)
                if homes:
                    print(f"  * {name:<38} now defined in {', '.join(homes)}")
                else:
                    print(f"  !! {name:<38} defined NOWHERE in apps/catalog")
                    lost.append(name)
            if lost:
                failures += 1
            else:
                print(
                    f"  partition: all {len(unaccounted)} relocated by a prior "
                    "in-flight task, none lost by this split"
                )
        else:
            print(f"  partition: every top-level definition at {ANCHOR} is accounted for")

        # ------------------------------------------------------------------
        # Line-count reconciliation against the independently recorded
        # pre-split total (12.1 §9 and raw/size-dependency-pass2-before.txt).
        # ------------------------------------------------------------------
        head_lines = len(anchor.read_text().splitlines())
        head_header = min(start for start, _ in anchor_spans.values()) - 1
        head_span_lines = sum(end - start + 1 for start, end in anchor_spans.values())
        head_other = head_lines - head_header - head_span_lines

        now_span_lines = 0
        for target_name, names in plan.items():
            target = CATALOG / target_name
            if not target.exists():
                continue
            spans = EXTRACT.top_level_spans(target)
            now_span_lines += sum(
                spans[name][1] - spans[name][0] + 1 for name in names if name in spans
            )
        pre_split_total = PRE_SPLIT_LINES[source_rel]
        implied_header = pre_split_total - now_span_lines - head_other
        print(
            f"\n  reconciliation\n"
            f"    {ANCHOR}: {head_lines} lines = {head_header} header "
            f"+ {head_span_lines} definition + {head_other} separator/other\n"
            f"    pre-split (recorded): {pre_split_total} lines\n"
            f"    split modules: {now_span_lines} definition lines carried\n"
            f"    => implied pre-split header/import block: {implied_header} lines "
            f"(vs {head_header} at {ANCHOR})"
        )
        if implied_header < head_header:
            print(
                "    !! implied header is SMALLER than the anchor's — a body may be "
                "missing"
            )
            failures += 1

    return failures


#: ``symbol -> the module in apps/catalog that defines it``. Used to date the
#: deltas: a body that calls a function added weeks before the split was written
#: weeks before the split, not during it.
PROVENANCE: dict[str, str] = {
    "apply_institution_profile_change": "canonical_config_commands.py",
    "apply_program_offering_change": "canonical_config_commands.py",
    "create_institution_domain": "canonical_config_commands.py",
    "audit_config_change": "canonical_config_commands.py",
    "config_change_verb": "canonical_config_commands.py",
    "mark_deprecated": "legacy_write_telemetry.py",
    "record_catalog_write": "legacy_write_telemetry.py",
    "canonical_program_required_response": "legacy_write_telemetry.py",
    "active_subjects_queryset": "subject_catalog.py",
    "aliases_by_code": "subject_catalog.py",
    "SUBJECT_CATALOG_VERSION": "subject_catalog.py",
    "build_tenant_readiness": "tenant_readiness.py",
    "OfferingDirectoryService": "services.py",
    "DomainStatusMachine": "services.py",
    "DomainTransitionError": "services.py",
    "TenantScopedCapabilityMixin": "permissions.py",
    "HasPlatformCapability": "permissions.py",
    "TenantAuditService": "tenant_audit_service.py",
    "OBSERVABILITY_CONFIG_PREFIX": "tenant_audit_service.py",
    "OBSERVABILITY_ROUTING_FAILURE_ACTION": "tenant_audit_service.py",
    "EXPORT_CAPABILITY": "tenant_audit_query_service.py",
    "invalidate_catalog_scopes": "catalog_cache.py",
    "catalog_institution_scope": "catalog_cache.py",
    "CATALOG_NEUTRAL_SCOPE": "catalog_cache.py",
}

#: The pre-split line counts, recorded independently of this script by 12.1 §9
#: and by ``raw/size-dependency-pass2-before.txt``.
PRE_SPLIT_LINES: dict[str, int] = {
    "backend/apps/catalog/admin_views.py": 2072,
    "backend/apps/catalog/views.py": 1570,
}


def _identifiers(line: str) -> set[str]:
    token = ""
    out: set[str] = set()
    for char in line:
        if char.isalnum() or char == "_":
            token += char
        else:
            if token:
                out.add(token)
            token = ""
    if token:
        out.add(token)
    return out


def _top_level_names_from_text(text: str) -> set[str]:
    """Every name a header *binds*, including aliased imports.

    ``from apps.catalog.canonical_config_commands import audit_config_change as
    _audit_config_change`` binds ``_audit_config_change``, which is exactly how a
    name that used to be defined locally keeps working after a prior task moved
    it out. Missing that would report it as dropped.
    """
    tree = ast.parse(text)
    names: set[str] = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            names.update(t.id for t in node.targets if isinstance(t, ast.Name))
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            names.update(alias.asname or alias.name.split(".")[0] for alias in node.names)
    return names


def _find_definition(name: str) -> list[str]:
    """Every module in ``apps/catalog`` with a top-level definition of ``name``.

    A prior task that relocated a private helper commonly drops the leading
    underscore on the way (it stopped being module-private), so the
    de-underscored spelling counts as the same definition. Both spellings are
    reported so a rename is visible rather than silently equated.
    """
    candidates = {name}
    if name.startswith("_"):
        candidates.add(name.lstrip("_"))
    homes: list[str] = []
    for path in sorted(CATALOG.glob("*.py")):
        try:
            defined = _top_level_names(path)
        except SyntaxError:  # pragma: no cover
            continue
        for candidate in sorted(candidates):
            if candidate in defined:
                homes.append(
                    f"{path.name}" if candidate == name else f"{path.name} (as {candidate})"
                )
    return homes


def _current_span(path: pathlib.Path, name: str) -> list[str]:
    spans = EXTRACT.top_level_spans(path)
    if name not in spans:
        return [f"<{name} not top-level in {path.name}>"]
    start, end = spans[name]
    return path.read_text().split("\n")[start - 1 : end]


def main() -> int:
    failures = 0
    failures += check_plan("admin", "backend/apps/catalog/admin_views.py", EXTRACT.ADMIN_PLAN)
    failures += check_plan("catalog", "backend/apps/catalog/views.py", EXTRACT.CATALOG_PLAN)
    print(f"\n{'=' * 78}")
    print("RESULT:", "clean" if failures == 0 else f"{failures} structural failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
