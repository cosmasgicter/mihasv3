"""Initialize an AgentHub session.

Example:
    python scripts/agenthub/hub_init.py \\
        --task "api-quick-wins" \\
        --agents 3 \\
        --eval metric \\
        --base main \\
        --allowlists '[["path/a"], ["path/b"], ["path/c"]]'

Writes:
    .agenthub/sessions/<id>/config.yaml
    .agenthub/sessions/<id>/state.json
    .agenthub/sessions/<id>/baseline/...   (copies of baseline schema/lint/scorecard)
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

# Allow running as a script from repo root
HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from session_manager import (  # noqa: E402
    Session,
    new_session_id,
    repo_root,
    sessions_dir,
)


VALID_EVAL_MODES = {"metric", "judge", "hybrid"}

# Default baseline artifacts produced during the audit
DEFAULT_BASELINE_FILES = (
    Path("/tmp/mihas_schema.yaml"),
    Path("/tmp/mihas_schema.json"),
    Path("/tmp/mihas_lint.json"),
    Path("/tmp/mihas_scorecard.json"),
)


def copy_baselines(dest: Path, extra: Optional[List[Path]] = None) -> List[str]:
    """Copy known audit baselines into the session's baseline/ dir.

    Missing files are silently skipped so sessions can bootstrap even when the
    audit venv is not available (e.g. on CI).
    """
    dest.mkdir(parents=True, exist_ok=True)
    copied: List[str] = []
    for src in list(DEFAULT_BASELINE_FILES) + (extra or []):
        if src.is_file():
            shutil.copy2(src, dest / src.name)
            copied.append(src.name)
    return copied


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Initialize an AgentHub session")
    parser.add_argument("--task", required=True, help="Session task name / description")
    parser.add_argument("--agents", type=int, required=True, help="Number of parallel agents (1..10)")
    parser.add_argument(
        "--eval",
        choices=sorted(VALID_EVAL_MODES),
        default="metric",
        help="Evaluation mode used by result_ranker.py",
    )
    parser.add_argument("--base", default="main", help="Base branch to fan out from")
    parser.add_argument(
        "--allowlists",
        help="JSON list-of-lists of file-path globs, one per agent "
        '(e.g. \'[["a/**"], ["b/**"]]\')',
    )
    parser.add_argument(
        "--session-id",
        help="Override the auto-generated session id (useful for tests). "
        "Must not collide with an existing session.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the would-be session and exit without writing anything",
    )
    return parser.parse_args(argv)


def build_config(args: argparse.Namespace) -> dict:
    if args.agents < 1 or args.agents > 10:
        raise SystemExit("--agents must be between 1 and 10")
    if args.eval not in VALID_EVAL_MODES:
        raise SystemExit(f"--eval must be one of {sorted(VALID_EVAL_MODES)}")

    allowlists: List[List[str]] = []
    if args.allowlists:
        try:
            parsed = json.loads(args.allowlists)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"--allowlists is not valid JSON: {exc}") from exc
        if not isinstance(parsed, list) or not all(isinstance(x, list) for x in parsed):
            raise SystemExit("--allowlists must be a JSON list of lists of strings")
        if len(parsed) != args.agents:
            raise SystemExit(
                f"--allowlists has {len(parsed)} entries but --agents is {args.agents}"
            )
        allowlists = [[str(p) for p in row] for row in parsed]
    else:
        allowlists = [[] for _ in range(args.agents)]

    config = {
        "task": args.task,
        "agents": args.agents,
        "eval_mode": args.eval,
        "base_branch": args.base,
        "allowlists": allowlists,
        "branch_prefix": "hub",  # branches: hub/<session-id>/agent-<N>/attempt-<M>
        "agent_ids": [f"agent-{i + 1}" for i in range(args.agents)],
    }
    return config


def create_session(
    task: str,
    agents: int,
    eval_mode: str = "metric",
    base: str = "main",
    allowlists: Optional[List[List[str]]] = None,
    session_id: Optional[str] = None,
    baseline_files: Optional[List[Path]] = None,
) -> Session:
    """Programmatic entry point (tests). Returns a saved Session."""
    sid = session_id or new_session_id()
    root = sessions_dir() / sid
    if root.exists():
        raise SystemExit(f"Session already exists: {sid}")
    config = {
        "task": task,
        "agents": agents,
        "eval_mode": eval_mode,
        "base_branch": base,
        "allowlists": allowlists or [[] for _ in range(agents)],
        "branch_prefix": "hub",
        "agent_ids": [f"agent-{i + 1}" for i in range(agents)],
    }
    state = {
        "state": "init",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "agents": [
            {"id": aid, "branch": f"hub/{sid}/{aid}/attempt-1", "status": "pending"}
            for aid in config["agent_ids"]
        ],
        "history": [],
    }
    session = Session(session_id=sid, root=root, config=config, state_data=state)
    session.save()
    copy_baselines(session.baseline_dir, baseline_files)
    return session


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    config = build_config(args)
    sid = args.session_id or new_session_id()

    if args.dry_run:
        print(f"DRY RUN — would create session {sid}")
        print(json.dumps(config, indent=2))
        return 0

    session = create_session(
        task=config["task"],
        agents=config["agents"],
        eval_mode=config["eval_mode"],
        base=config["base_branch"],
        allowlists=config["allowlists"],
        session_id=sid,
    )
    print(f"Created session: {session.session_id}")
    print(f"  config: {session.config_path}")
    print(f"  state:  {session.state_path}")
    copied = sorted(p.name for p in session.baseline_dir.iterdir())
    if copied:
        print(f"  baseline files copied: {', '.join(copied)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
