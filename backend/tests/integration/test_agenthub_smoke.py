"""End-to-end smoke test for AgentHub.

Exercises the full pipeline with a trivial task (two agents, each writes a
haiku to HAIKU.md, coordinator evaluates by metric = line count, merges the
winner, archives the loser). No real network/LLM calls.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "scripts" / "agenthub"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import hub_init  # noqa: E402
import session_manager  # noqa: E402
from session_manager import (  # noqa: E402
    load_session,
    transition_state,
)


def _git(args, cwd, check=True):
    res = subprocess.run(args, cwd=cwd, check=check, capture_output=True, text=True)
    return res


@pytest.fixture
def fake_repo(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(["git", "init", "-q", "-b", "main"], cwd=repo)
    _git(["git", "config", "user.email", "t@t"], cwd=repo)
    _git(["git", "config", "user.name", "t"], cwd=repo)
    (repo / ".gitignore").write_text(".agenthub/\n")
    (repo / "README.md").write_text("# root\n")
    _git(["git", "add", "."], cwd=repo)
    _git(["git", "commit", "-q", "-m", "root"], cwd=repo)
    monkeypatch.setattr(session_manager, "repo_root", lambda: repo)
    # create the .agenthub dirs
    for sub in ("sessions", "worktrees", "archives"):
        (repo / ".agenthub" / sub).mkdir(parents=True, exist_ok=True)
    return repo


def _make_worktree(repo: Path, session_id: str, agent_id: str) -> Path:
    """Create a git worktree for an agent and return its path."""
    wt_root = repo / ".agenthub" / "worktrees" / session_id / agent_id
    branch = f"hub/{session_id}/{agent_id}/attempt-1"
    wt_root.parent.mkdir(parents=True, exist_ok=True)
    _git(["git", "worktree", "add", "-b", branch, str(wt_root), "main"], cwd=repo)
    return wt_root


def test_smoke_end_to_end_two_agents_merge_winner(fake_repo):
    """
    Full AgentHub lifecycle:
      init → worktrees → agents commit → transition → rank → merge winner → archive loser.
    """
    repo = fake_repo
    sid = "smoke-001"

    # 1. Initialize session
    session = hub_init.create_session(
        task="write-haiku",
        agents=2,
        eval_mode="metric",
        base="main",
        allowlists=[["HAIKU.md"], ["HAIKU.md"]],
        session_id=sid,
    )
    assert session.state == "init"
    assert (repo / ".agenthub" / "sessions" / sid / "config.yaml").is_file()

    # 2. Create worktrees for both agents
    wt1 = _make_worktree(repo, sid, "agent-1")
    wt2 = _make_worktree(repo, sid, "agent-2")

    # 3. Each agent writes a haiku (different line counts on purpose)
    (wt1 / "HAIKU.md").write_text("Agent one haiku\nShort verse on a rainy day\nFin\n")
    _git(["git", "add", "."], cwd=wt1)
    _git(["git", "commit", "-q", "-m", "haiku"], cwd=wt1)

    (wt2 / "HAIKU.md").write_text("Agent two\nLonger\nVerses\nMany\nLines\nIndeed\n")
    _git(["git", "add", "."], cwd=wt2)
    _git(["git", "commit", "-q", "-m", "longer haiku"], cwd=wt2)

    # 4. Transition session state: init → running → evaluating
    transition_state(session, "running")
    transition_state(session, "evaluating")
    assert session.state == "evaluating"

    # 5. Evaluate by line count (fewer lines wins — classic haiku density)
    counts = {}
    for agent_id, wt in [("agent-1", wt1), ("agent-2", wt2)]:
        text = (wt / "HAIKU.md").read_text()
        counts[agent_id] = text.count("\n")
    winner = min(counts, key=counts.get)
    loser = "agent-1" if winner == "agent-2" else "agent-2"
    assert winner == "agent-1"  # agent-1 wrote 3 lines vs agent-2's 6

    # 6. Merge winner into main
    winner_branch = f"hub/{sid}/{winner}/attempt-1"
    loser_branch = f"hub/{sid}/{loser}/attempt-1"
    _git(["git", "merge", "--no-ff", "-m", f"merge {winner_branch}", winner_branch], cwd=repo)

    # 7. Archive loser via tag
    _git(["git", "tag", f"hub/archive/{sid}/{loser}", loser_branch], cwd=repo)

    # 8. Transition session to merged
    transition_state(session, "merged")
    assert session.state == "merged"

    # Verify all expected artifacts exist
    assert (repo / "HAIKU.md").read_text().startswith("Agent one haiku")
    # Merge commit is on main
    log = _git(["git", "log", "--oneline", "main"], cwd=repo).stdout
    assert "merge hub/" in log
    # Archive tag exists
    tags = _git(["git", "tag", "--list", f"hub/archive/{sid}/{loser}"], cwd=repo).stdout
    assert f"hub/archive/{sid}/{loser}" in tags
    # Session state reflects merge
    reloaded = load_session(sid)
    assert reloaded.state == "merged"
    # History is preserved
    history = reloaded.state_data["history"]
    assert [h["to"] for h in history] == ["running", "evaluating", "merged"]
