"""Rank AgentHub agents by metric, judge, or hybrid evaluation.

Responsibilities:
    - `rank_by_metric()`: run eval command per worktree, parse JSON metric, sort
    - `rank_by_judge()`: collect git diffs + result summaries for coordinator review
    - `rank_hybrid()`: metric first; if top within 10%, defer to judge
    - `check_allowlist()`: fail any diff that touches files outside agent's allowlist
    - `detect_novel_imports()`: flag imports in diff that don't exist in baseline

CLI:
    python scripts/agenthub/result_ranker.py --session <id> --mode metric \\
        --eval-cmd "pytest bench.py --json" --metric p50_ms --direction lower
    python scripts/agenthub/result_ranker.py --session <id> --check-allowlist
    python scripts/agenthub/result_ranker.py --session <id> --check-imports
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

# Allow running as a script
HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import session_manager  # noqa: E402
from session_manager import load_session  # noqa: E402


def repo_root() -> Path:
    return session_manager.repo_root()


def worktrees_dir() -> Path:
    return session_manager.worktrees_dir()


IMPORT_RE = re.compile(
    r"^\+\s*(?:from\s+([a-zA-Z_][\w.]*)\s+import\s+|import\s+([a-zA-Z_][\w.]*))",
    re.MULTILINE,
)

# Allow anything on the standard library + common third-party modules present in the
# baseline repo. Additional names come from scanning existing imports in the tree.
ALWAYS_KNOWN_PREFIXES = (
    "__future__", "typing", "dataclasses", "pathlib", "datetime", "json",
    "os", "sys", "re", "subprocess", "collections", "functools", "itertools",
    "hashlib", "io", "logging", "uuid", "enum", "decimal",
    "django", "rest_framework", "drf_spectacular", "celery", "redis",
    "apps", "config", "scripts", "tests",
    "pytest", "hypothesis", "yaml",
)


@dataclass
class AgentRanking:
    agent_id: str
    branch: str
    worktree: Path
    metric: Optional[float] = None
    score: Optional[float] = None
    reasons: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


def _worktree_for(session_id: str, agent_id: str) -> Path:
    return worktrees_dir() / session_id / agent_id


def _branch_for(session_id: str, agent_id: str, attempt: int = 1) -> str:
    return f"hub/{session_id}/{agent_id}/attempt-{attempt}"


def _run(cmd: List[str], cwd: Path, check: bool = False, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, check=check, capture_output=capture, text=True)


# ---------- Allowlist enforcement ----------

def _changed_files(branch: str, base: str, cwd: Path) -> List[str]:
    res = _run(["git", "diff", "--name-only", f"{base}...{branch}"], cwd=cwd)
    return [line.strip() for line in res.stdout.splitlines() if line.strip()]


def check_allowlist(files: List[str], allowlist: List[str]) -> List[str]:
    """Return the list of files that are OUTSIDE the allowlist."""
    if not allowlist:
        # Empty allowlist means "no files allowed". Anything changed is a violation.
        return list(files)
    violations: List[str] = []
    for f in files:
        if not any(fnmatch.fnmatch(f, pat) for pat in allowlist):
            violations.append(f)
    return violations


# ---------- Novel-import detection ----------

def _baseline_imports(repo: Path) -> set[str]:
    """Cheap import scan: every `import foo` and `from foo import` top-level name."""
    seen: set[str] = set()
    for path in repo.rglob("*.py"):
        # Skip .agenthub worktrees
        if ".agenthub/worktrees" in str(path) or ".git" in path.parts:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for m in re.finditer(
            r"^(?:from\s+([a-zA-Z_][\w.]*)\s+import\s+|import\s+([a-zA-Z_][\w.]*))",
            text,
            re.MULTILINE,
        ):
            name = m.group(1) or m.group(2)
            if name:
                seen.add(name.split(".")[0])
    return seen


def detect_novel_imports(
    diff_text: str, baseline_imports: set[str], known_prefixes: tuple = ALWAYS_KNOWN_PREFIXES
) -> List[str]:
    """Return a list of imported top-level names introduced by the diff that are not
    present in the baseline's import set or in the always-known allowlist."""
    novel: set[str] = set()
    for m in IMPORT_RE.finditer(diff_text):
        name = (m.group(1) or m.group(2) or "").split(".")[0]
        if not name:
            continue
        if name in baseline_imports:
            continue
        if any(name == prefix or name.startswith(prefix + ".") for prefix in known_prefixes):
            continue
        novel.add(name)
    return sorted(novel)


# ---------- Metric evaluation ----------

def _extract_metric(output: str, metric: str) -> Optional[float]:
    """Extract a metric from CLI output. Tries JSON first; falls back to regex."""
    try:
        data = json.loads(output)
        return float(_dig(data, metric))
    except (ValueError, KeyError, TypeError):
        pass
    # Fallback: look for "metric: <number>" or "metric=<number>"
    m = re.search(rf"{re.escape(metric)}\s*[:=]\s*([0-9.+-eE]+)", output)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None


def _dig(data, path: str):
    """`foo.bar.baz` -> data['foo']['bar']['baz']."""
    cur = data
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            raise KeyError(path)
    return cur


def rank_by_metric(
    *,
    session_id: str,
    eval_cmd: List[str],
    metric: str,
    direction: str = "lower",
    cwd: Optional[Path] = None,
) -> List[AgentRanking]:
    """Run eval_cmd in each agent's worktree, extract metric, sort."""
    if direction not in ("lower", "higher"):
        raise ValueError("direction must be 'lower' or 'higher'")
    session = load_session(session_id)
    results: List[AgentRanking] = []
    for agent in session.state_data.get("agents", []):
        agent_id = agent["id"]
        branch = agent["branch"]
        wt = _worktree_for(session_id, agent_id)
        ranking = AgentRanking(agent_id=agent_id, branch=branch, worktree=wt)
        if not wt.is_dir():
            ranking.errors.append("worktree missing")
            results.append(ranking)
            continue
        res = _run(eval_cmd, cwd=wt)
        value = _extract_metric(res.stdout, metric)
        if value is None:
            ranking.errors.append(f"metric {metric!r} not found in eval output")
        ranking.metric = value
        results.append(ranking)

    # Rank: smaller score = better rank index
    scored = [r for r in results if r.metric is not None]
    failed = [r for r in results if r.metric is None]
    scored.sort(key=lambda r: r.metric, reverse=(direction == "higher"))
    for idx, r in enumerate(scored):
        r.score = float(idx + 1)
    for r in failed:
        r.score = float("inf")
    return scored + failed


# ---------- Judge evaluation (structured diffs for coordinator review) ----------

def collect_diffs_for_judge(session_id: str, base: str = "main") -> List[Dict[str, object]]:
    """Return per-agent diffs + summaries for LLM-judge ranking (external)."""
    session = load_session(session_id)
    cwd = repo_root()
    out: List[Dict[str, object]] = []
    for agent in session.state_data.get("agents", []):
        branch = agent["branch"]
        files = _changed_files(branch, base, cwd)
        res = _run(["git", "diff", "--stat", f"{base}...{branch}"], cwd=cwd)
        stat = res.stdout.strip()
        diff = _run(["git", "diff", f"{base}...{branch}"], cwd=cwd).stdout
        out.append(
            {
                "agent_id": agent["id"],
                "branch": branch,
                "changed_files": files,
                "diffstat": stat,
                "diff_bytes": len(diff),
            }
        )
    return out


# ---------- CLI ----------

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rank AgentHub agents")
    parser.add_argument("--session", required=True)
    parser.add_argument("--mode", choices=["metric", "judge", "hybrid"], default="metric")
    parser.add_argument("--eval-cmd", help="Command to run (space-separated) in each worktree")
    parser.add_argument("--metric", help="JSON key path or stdout label to extract")
    parser.add_argument("--direction", choices=["lower", "higher"], default="lower")
    parser.add_argument("--base", default="main")
    parser.add_argument("--check-allowlist", action="store_true")
    parser.add_argument("--check-imports", action="store_true")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    return parser.parse_args(argv)


def _cmd_check_allowlist(args: argparse.Namespace) -> int:
    session = load_session(args.session)
    allowlists = session.config.get("allowlists", [])
    agent_ids = session.config.get("agent_ids", [])
    if not agent_ids:
        print("No agents configured", file=sys.stderr)
        return 1
    cwd = repo_root()
    any_violations = False
    report: Dict[str, List[str]] = {}
    for agent_id, allowlist in zip(agent_ids, allowlists):
        branch = _branch_for(args.session, agent_id)
        files = _changed_files(branch, args.base, cwd)
        violations = check_allowlist(files, allowlist)
        report[agent_id] = violations
        if violations:
            any_violations = True
    if args.format == "json":
        print(json.dumps(report, indent=2))
    else:
        for agent_id, violations in report.items():
            if violations:
                print(f"{agent_id}: {len(violations)} violation(s)")
                for v in violations:
                    print(f"  - {v}")
            else:
                print(f"{agent_id}: OK")
    return 1 if any_violations else 0


def _cmd_check_imports(args: argparse.Namespace) -> int:
    session = load_session(args.session)
    cwd = repo_root()
    baseline = _baseline_imports(cwd)
    agent_ids = session.config.get("agent_ids", [])
    any_novel = False
    report: Dict[str, List[str]] = {}
    for agent_id in agent_ids:
        branch = _branch_for(args.session, agent_id)
        res = _run(["git", "diff", f"{args.base}...{branch}"], cwd=cwd)
        novel = detect_novel_imports(res.stdout, baseline)
        report[agent_id] = novel
        if novel:
            any_novel = True
    if args.format == "json":
        print(json.dumps(report, indent=2))
    else:
        for agent_id, novel in report.items():
            if novel:
                print(f"{agent_id}: novel imports: {', '.join(novel)}")
            else:
                print(f"{agent_id}: OK")
    return 1 if any_novel else 0


def _cmd_rank(args: argparse.Namespace) -> int:
    if args.mode == "metric":
        if not args.eval_cmd or not args.metric:
            print("--mode metric requires --eval-cmd and --metric", file=sys.stderr)
            return 2
        cmd_parts = args.eval_cmd.split()
        results = rank_by_metric(
            session_id=args.session,
            eval_cmd=cmd_parts,
            metric=args.metric,
            direction=args.direction,
        )
    elif args.mode == "judge":
        results = []  # Judge mode emits data for external ranking
    else:  # hybrid
        # Metric first; within-10% ties would normally be sent to judge.
        # For now we just call metric and note that judge is deferred.
        if not args.eval_cmd or not args.metric:
            print("--mode hybrid requires --eval-cmd and --metric", file=sys.stderr)
            return 2
        cmd_parts = args.eval_cmd.split()
        results = rank_by_metric(
            session_id=args.session,
            eval_cmd=cmd_parts,
            metric=args.metric,
            direction=args.direction,
        )

    if args.mode == "judge":
        diffs = collect_diffs_for_judge(args.session, base=args.base)
        if args.format == "json":
            print(json.dumps(diffs, indent=2, default=str))
        else:
            for d in diffs:
                print(f"{d['agent_id']:12s}  files={len(d['changed_files'])}  bytes={d['diff_bytes']}")
        return 0

    if args.format == "json":
        print(json.dumps([asdict(r) | {"worktree": str(r.worktree)} for r in results], indent=2))
    else:
        for r in results:
            print(f"{r.agent_id:12s}  metric={r.metric}  score={r.score}  errors={r.errors}")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    if args.check_allowlist:
        return _cmd_check_allowlist(args)
    if args.check_imports:
        return _cmd_check_imports(args)
    return _cmd_rank(args)


if __name__ == "__main__":
    sys.exit(main())
