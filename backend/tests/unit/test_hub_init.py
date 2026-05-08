"""Tests for hub_init.py and session_manager.py state machine."""
from __future__ import annotations

import json
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
    InvalidSessionTransition,
    Session,
    SessionNotFound,
    VALID_TRANSITIONS,
    load_session,
    new_session_id,
    transition_state,
)


@pytest.fixture
def sessions_root(tmp_path, monkeypatch):
    """Redirect sessions_dir() / worktrees_dir() / archives_dir() to a tmp repo."""
    fake_repo = tmp_path / "repo"
    (fake_repo / ".git").mkdir(parents=True)
    (fake_repo / ".agenthub" / "sessions").mkdir(parents=True)
    (fake_repo / ".agenthub" / "worktrees").mkdir(parents=True)
    (fake_repo / ".agenthub" / "archives").mkdir(parents=True)
    monkeypatch.setattr(session_manager, "repo_root", lambda: fake_repo)
    # hub_init imports sessions_dir via session_manager so its view follows the monkeypatch
    return fake_repo / ".agenthub" / "sessions"


def test_new_session_id_format():
    sid = new_session_id()
    assert len(sid) == 15  # YYYYMMDD-HHMMSS
    assert sid[8] == "-"


def test_create_session_writes_config_and_state(sessions_root):
    sess = hub_init.create_session(
        task="test-task",
        agents=2,
        eval_mode="metric",
        base="main",
        allowlists=[["a/**"], ["b/**"]],
        session_id="20260101-120000",
    )
    assert sess.config["task"] == "test-task"
    assert sess.config["agents"] == 2
    assert sess.config["allowlists"] == [["a/**"], ["b/**"]]
    assert sess.state_data["state"] == "init"
    assert len(sess.state_data["agents"]) == 2
    assert sess.state_data["agents"][0]["branch"] == "hub/20260101-120000/agent-1/attempt-1"

    # Verify written files parse cleanly
    cfg = yaml.safe_load(sess.config_path.read_text())
    assert cfg["eval_mode"] == "metric"
    state = json.loads(sess.state_path.read_text())
    assert state["state"] == "init"


def test_create_session_rejects_duplicate_id(sessions_root):
    hub_init.create_session(task="t", agents=1, session_id="dup")
    with pytest.raises(SystemExit, match="already exists"):
        hub_init.create_session(task="t", agents=1, session_id="dup")


def test_load_session_missing_raises(sessions_root):
    with pytest.raises(SessionNotFound):
        load_session("nope")


def test_load_session_roundtrip(sessions_root):
    sess = hub_init.create_session(task="t", agents=1, session_id="rt-1")
    loaded = load_session("rt-1")
    assert loaded.session_id == "rt-1"
    assert loaded.config["task"] == "t"


@pytest.mark.parametrize(
    "from_state,to_state,valid",
    [
        ("init", "running", True),
        ("init", "archived", True),
        ("init", "merged", False),
        ("running", "evaluating", True),
        ("running", "merged", False),
        ("running", "init", False),
        ("evaluating", "merged", True),
        ("evaluating", "archived", True),
        ("merged", "running", False),
        ("merged", "archived", False),
        ("archived", "merged", False),
    ],
)
def test_state_transitions(sessions_root, from_state, to_state, valid):
    sess = hub_init.create_session(task="t", agents=1, session_id=f"trans-{from_state}-{to_state}")
    # Force into from_state by walking the legal path
    for step in _shortest_path("init", from_state):
        transition_state(sess, step)
    assert sess.state == from_state

    if valid:
        transition_state(sess, to_state)
        assert sess.state == to_state
        # History is recorded
        last = sess.state_data["history"][-1]
        assert last["from"] == from_state
        assert last["to"] == to_state
    else:
        with pytest.raises(InvalidSessionTransition):
            transition_state(sess, to_state)
        # State must be unchanged on failed transition
        assert sess.state == from_state


def _shortest_path(start: str, target: str) -> list[str]:
    """Tiny BFS through VALID_TRANSITIONS. Returns the list of states to apply."""
    if start == target:
        return []
    from collections import deque

    q = deque([(start, [])])
    seen = {start}
    while q:
        node, path = q.popleft()
        for nxt in VALID_TRANSITIONS.get(node, set()):
            if nxt == target:
                return path + [nxt]
            if nxt not in seen:
                seen.add(nxt)
                q.append((nxt, path + [nxt]))
    raise AssertionError(f"No path from {start} to {target}")


def test_build_config_validates_agents_range():
    args = hub_init.parse_args(["--task", "t", "--agents", "0"])
    with pytest.raises(SystemExit, match="between 1 and 10"):
        hub_init.build_config(args)
    args = hub_init.parse_args(["--task", "t", "--agents", "11"])
    with pytest.raises(SystemExit, match="between 1 and 10"):
        hub_init.build_config(args)


def test_build_config_rejects_mismatched_allowlist_count():
    args = hub_init.parse_args(
        ["--task", "t", "--agents", "2", "--allowlists", '[["a/**"]]']
    )
    with pytest.raises(SystemExit, match="allowlists has 1 entries but --agents is 2"):
        hub_init.build_config(args)


def test_build_config_rejects_bad_json():
    args = hub_init.parse_args(
        ["--task", "t", "--agents", "1", "--allowlists", "not-json"]
    )
    with pytest.raises(SystemExit, match="not valid JSON"):
        hub_init.build_config(args)


def test_cli_dry_run(sessions_root, capsys):
    rc = hub_init.main(
        ["--task", "dry", "--agents", "1", "--eval", "judge", "--base", "main", "--dry-run"]
    )
    assert rc == 0
    out = capsys.readouterr().out
    assert "DRY RUN" in out
    # Session directory must NOT be created
    assert list(sessions_root.iterdir()) == []
