"""AgentHub session state machine and cleanup.

Session lifecycle:

    init -> running -> evaluating -> merged
                                  -> archived

See .agenthub/README.md for the full protocol.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml


VALID_TRANSITIONS: Dict[str, set[str]] = {
    "init": {"running", "archived"},
    "running": {"evaluating", "archived"},
    "evaluating": {"merged", "archived"},
    "merged": set(),  # terminal
    "archived": set(),  # terminal
}


class InvalidSessionTransition(RuntimeError):
    """Raised when an illegal state transition is attempted."""


class SessionNotFound(RuntimeError):
    """Raised when a session-id is not on disk."""


@dataclass
class Session:
    session_id: str
    root: Path
    config: Dict[str, Any] = field(default_factory=dict)
    state_data: Dict[str, Any] = field(default_factory=dict)

    @property
    def state(self) -> str:
        return self.state_data.get("state", "init")

    @property
    def config_path(self) -> Path:
        return self.root / "config.yaml"

    @property
    def state_path(self) -> Path:
        return self.root / "state.json"

    @property
    def baseline_dir(self) -> Path:
        return self.root / "baseline"

    def save(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.baseline_dir.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(yaml.safe_dump(self.config, sort_keys=False))
        self.state_path.write_text(json.dumps(self.state_data, indent=2, sort_keys=True))


def repo_root() -> Path:
    """Walk up from this file to the git repository root."""
    p = Path(__file__).resolve()
    for candidate in (p, *p.parents):
        if (candidate / ".git").exists():
            return candidate
    raise RuntimeError("Could not find repository root (no .git directory)")


def sessions_dir() -> Path:
    return repo_root() / ".agenthub" / "sessions"


def worktrees_dir() -> Path:
    return repo_root() / ".agenthub" / "worktrees"


def archives_dir() -> Path:
    return repo_root() / ".agenthub" / "archives"


def new_session_id(now: Optional[datetime] = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.strftime("%Y%m%d-%H%M%S")


def load_session(session_id: str) -> Session:
    """Load a session from .agenthub/sessions/<id>/."""
    root = sessions_dir() / session_id
    if not root.is_dir():
        raise SessionNotFound(session_id)
    config = yaml.safe_load(root.joinpath("config.yaml").read_text()) or {}
    state = json.loads(root.joinpath("state.json").read_text())
    return Session(session_id=session_id, root=root, config=config, state_data=state)


def transition_state(session: Session, target: str) -> Session:
    """Apply a state transition and persist. Raises on illegal transitions."""
    current = session.state
    allowed = VALID_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise InvalidSessionTransition(
            f"Cannot transition session {session.session_id} from {current!r} to {target!r}. "
            f"Allowed: {sorted(allowed) or 'none (terminal)'}"
        )
    session.state_data["state"] = target
    session.state_data.setdefault("history", []).append(
        {
            "from": current,
            "to": target,
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
    )
    session.save()
    return session


def cleanup_session(session_id: str, *, remove_branches: bool = False) -> List[str]:
    """Remove worktrees and (optionally) branches for a session. Returns actions taken."""
    actions: List[str] = []
    wt_root = worktrees_dir() / session_id
    if wt_root.is_dir():
        # Best-effort git worktree removal before rm -rf
        for child in wt_root.iterdir():
            if child.is_dir():
                subprocess.run(
                    ["git", "worktree", "remove", "--force", str(child)],
                    cwd=repo_root(),
                    check=False,
                    capture_output=True,
                )
                actions.append(f"removed worktree {child.name}")
        shutil.rmtree(wt_root, ignore_errors=True)
        actions.append(f"removed {wt_root}")

    if remove_branches:
        # Delete branches hub/<session>/agent-*
        res = subprocess.run(
            ["git", "for-each-ref", "--format=%(refname:short)", f"refs/heads/hub/{session_id}/"],
            cwd=repo_root(),
            capture_output=True,
            text=True,
            check=False,
        )
        for branch in res.stdout.splitlines():
            branch = branch.strip()
            if not branch:
                continue
            subprocess.run(
                ["git", "branch", "-D", branch],
                cwd=repo_root(),
                check=False,
                capture_output=True,
            )
            actions.append(f"deleted branch {branch}")
    return actions


def list_sessions() -> List[Session]:
    """Enumerate on-disk sessions."""
    root = sessions_dir()
    if not root.is_dir():
        return []
    out: List[Session] = []
    for child in sorted(root.iterdir()):
        if child.is_dir() and (child / "state.json").is_file():
            try:
                out.append(load_session(child.name))
            except Exception:  # noqa: BLE001 - defensive: corrupt session dirs should not crash listing
                continue
    return out


__all__ = [
    "InvalidSessionTransition",
    "SessionNotFound",
    "Session",
    "VALID_TRANSITIONS",
    "new_session_id",
    "load_session",
    "transition_state",
    "cleanup_session",
    "list_sessions",
    "repo_root",
    "sessions_dir",
    "worktrees_dir",
    "archives_dir",
]
