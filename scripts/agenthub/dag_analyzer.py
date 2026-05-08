"""Report git branch state for an AgentHub session.

Scans refs matching `hub/<session-id>/agent-*` and returns:
    - branch list with tip sha + ahead/behind counts vs base
    - frontier (leaves: branches with no child branches)
    - orphans (branches whose base ref is missing)

All operations are read-only (`git for-each-ref`, `git rev-list`, `git merge-base`).

CLI:
    python scripts/agenthub/dag_analyzer.py --session <id> [--base main]
    python scripts/agenthub/dag_analyzer.py --session <id> --frontier
    python scripts/agenthub/dag_analyzer.py --session <id> --format json
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional


@dataclass
class BranchInfo:
    name: str
    tip: str
    ahead: int  # commits in branch not in base
    behind: int  # commits in base not in branch
    has_children: bool
    status: str  # "leaf" | "merged" | "ancestor" | "unreachable"


def _run_git(args: List[str], cwd: Path) -> str:
    res = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )
    return res.stdout.strip()


def _list_branches(session_id: str, cwd: Path) -> Dict[str, str]:
    """Return {branch_name: tip_sha} for all refs under hub/<session-id>/."""
    prefix = f"refs/heads/hub/{session_id}/"
    out = _run_git(
        ["for-each-ref", "--format=%(refname:short) %(objectname)", prefix],
        cwd=cwd,
    )
    branches: Dict[str, str] = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            branches[parts[0]] = parts[1]
    return branches


def _ahead_behind(branch: str, base: str, cwd: Path) -> tuple[int, int]:
    out = _run_git(["rev-list", "--left-right", "--count", f"{base}...{branch}"], cwd=cwd)
    # Output is "<behind>\t<ahead>"
    parts = out.split()
    if len(parts) == 2:
        try:
            return int(parts[1]), int(parts[0])
        except ValueError:
            pass
    return (0, 0)


def _has_children(tip_sha: str, all_tips: Iterable[str], cwd: Path) -> bool:
    """True if any other branch tip has tip_sha as an ancestor."""
    for other in all_tips:
        if other == tip_sha:
            continue
        # Is tip_sha an ancestor of `other`?
        res = subprocess.run(
            ["git", "merge-base", "--is-ancestor", tip_sha, other],
            cwd=cwd,
            capture_output=True,
            check=False,
        )
        if res.returncode == 0:
            return True
    return False


def analyze(session_id: str, *, base: str = "main", cwd: Optional[Path] = None) -> Dict[str, object]:
    cwd = cwd or Path.cwd()
    branches_raw = _list_branches(session_id, cwd)
    if not branches_raw:
        return {"session_id": session_id, "base": base, "branches": [], "frontier": [], "orphans": []}

    tips = list(branches_raw.values())
    branches: List[BranchInfo] = []

    # Check if base ref exists
    base_exists = bool(_run_git(["rev-parse", "--verify", base], cwd=cwd))

    for name, tip in sorted(branches_raw.items()):
        if not base_exists:
            info = BranchInfo(
                name=name, tip=tip, ahead=0, behind=0,
                has_children=False, status="unreachable",
            )
            branches.append(info)
            continue
        ahead, behind = _ahead_behind(name, base, cwd)
        has_children = _has_children(tip, tips, cwd)

        # Is this branch an ancestor of base? (i.e. already merged)
        is_merged = (
            subprocess.run(
                ["git", "merge-base", "--is-ancestor", tip, base],
                cwd=cwd,
                capture_output=True,
                check=False,
            ).returncode == 0
        )

        if is_merged:
            status = "merged"
        elif has_children:
            status = "ancestor"
        else:
            status = "leaf"

        branches.append(
            BranchInfo(
                name=name,
                tip=tip,
                ahead=ahead,
                behind=behind,
                has_children=has_children,
                status=status,
            )
        )

    frontier = [b.name for b in branches if b.status == "leaf"]
    orphans = [b.name for b in branches if b.status == "unreachable"]

    return {
        "session_id": session_id,
        "base": base,
        "branches": [asdict(b) for b in branches],
        "frontier": frontier,
        "orphans": orphans,
    }


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AgentHub DAG analyzer (read-only git state)")
    parser.add_argument("--session", required=True, help="Session id")
    parser.add_argument("--base", default="main", help="Base branch for ahead/behind comparison")
    parser.add_argument(
        "--frontier",
        action="store_true",
        help="Only print the frontier (one branch name per line)",
    )
    parser.add_argument("--format", choices=["json", "text"], default="text")
    parser.add_argument("--cwd", help="Repository working directory (default: cwd)")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    cwd = Path(args.cwd) if args.cwd else Path.cwd()
    result = analyze(args.session, base=args.base, cwd=cwd)

    if args.frontier:
        for name in result["frontier"]:  # type: ignore[index]
            print(name)
        return 0

    if args.format == "json":
        print(json.dumps(result, indent=2))
        return 0

    # Text format
    print(f"Session: {result['session_id']}  base={result['base']}")
    print(f"Branches: {len(result['branches'])}")  # type: ignore[arg-type]
    for b in result["branches"]:  # type: ignore[union-attr]
        print(f"  {b['name']:60s}  {b['status']:10s}  +{b['ahead']}/-{b['behind']}  {b['tip'][:7]}")
    print(f"Frontier: {', '.join(result['frontier']) or '(none)'}")  # type: ignore[arg-type]
    if result["orphans"]:  # type: ignore[index]
        print(f"Orphans: {', '.join(result['orphans'])}")  # type: ignore[arg-type]
    return 0


if __name__ == "__main__":
    sys.exit(main())
