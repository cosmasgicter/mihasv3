"""Tests for dag_analyzer.py using real git repos via tmp_path fixtures."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "scripts" / "agenthub"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import dag_analyzer  # noqa: E402
from dag_analyzer import analyze  # noqa: E402


def _run(args, cwd):
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True)


@pytest.fixture
def git_repo(tmp_path):
    repo = tmp_path / "r"
    repo.mkdir()
    _run(["git", "init", "-q", "-b", "main"], cwd=repo)
    _run(["git", "config", "user.email", "test@example.com"], cwd=repo)
    _run(["git", "config", "user.name", "Test"], cwd=repo)
    (repo / "README.md").write_text("root\n")
    _run(["git", "add", "."], cwd=repo)
    _run(["git", "commit", "-q", "-m", "root"], cwd=repo)
    return repo


def _branch_from(repo, branch: str, base: str = "main", file: str = "f.txt", body: str = "x"):
    _run(["git", "checkout", "-q", "-b", branch, base], cwd=repo)
    (repo / file).write_text(body)
    _run(["git", "add", "."], cwd=repo)
    _run(["git", "commit", "-q", "-m", f"on {branch}"], cwd=repo)
    _run(["git", "checkout", "-q", base], cwd=repo)


def test_analyze_no_branches(git_repo):
    result = analyze("nope", base="main", cwd=git_repo)
    assert result["branches"] == []
    assert result["frontier"] == []


def test_analyze_single_leaf_branch(git_repo):
    _branch_from(git_repo, "hub/s1/agent-1/attempt-1", body="a")
    result = analyze("s1", base="main", cwd=git_repo)
    assert len(result["branches"]) == 1
    b = result["branches"][0]
    assert b["name"] == "hub/s1/agent-1/attempt-1"
    assert b["status"] == "leaf"
    assert b["ahead"] == 1
    assert b["behind"] == 0
    assert result["frontier"] == ["hub/s1/agent-1/attempt-1"]


def test_analyze_multiple_parallel_leaves(git_repo):
    _branch_from(git_repo, "hub/s1/agent-1/attempt-1", file="a.txt", body="a")
    _branch_from(git_repo, "hub/s1/agent-2/attempt-1", file="b.txt", body="b")
    _branch_from(git_repo, "hub/s1/agent-3/attempt-1", file="c.txt", body="c")
    result = analyze("s1", base="main", cwd=git_repo)
    assert len(result["branches"]) == 3
    assert all(b["status"] == "leaf" for b in result["branches"])
    assert set(result["frontier"]) == {
        "hub/s1/agent-1/attempt-1",
        "hub/s1/agent-2/attempt-1",
        "hub/s1/agent-3/attempt-1",
    }


def test_analyze_ancestor_detection(git_repo):
    """A branch that is a parent of another branch is not a leaf."""
    _branch_from(git_repo, "hub/s1/agent-1/attempt-1", file="a.txt", body="a")
    # attempt-2 branches off attempt-1 (so attempt-1 is an ancestor)
    _run(
        ["git", "checkout", "-q", "-b", "hub/s1/agent-1/attempt-2", "hub/s1/agent-1/attempt-1"],
        cwd=git_repo,
    )
    (git_repo / "a2.txt").write_text("a2")
    _run(["git", "add", "."], cwd=git_repo)
    _run(["git", "commit", "-q", "-m", "attempt-2"], cwd=git_repo)
    _run(["git", "checkout", "-q", "main"], cwd=git_repo)

    result = analyze("s1", base="main", cwd=git_repo)
    by_name = {b["name"]: b for b in result["branches"]}
    assert by_name["hub/s1/agent-1/attempt-1"]["status"] == "ancestor"
    assert by_name["hub/s1/agent-1/attempt-2"]["status"] == "leaf"
    assert result["frontier"] == ["hub/s1/agent-1/attempt-2"]


def test_analyze_merged_branch(git_repo):
    """A branch whose tip is an ancestor of base is marked merged."""
    _branch_from(git_repo, "hub/s1/agent-1/attempt-1", file="a.txt", body="a")
    _run(["git", "merge", "--no-ff", "-m", "merge", "hub/s1/agent-1/attempt-1"], cwd=git_repo)
    result = analyze("s1", base="main", cwd=git_repo)
    assert result["branches"][0]["status"] == "merged"
    assert result["frontier"] == []  # no leaves now


def test_analyze_ignores_unrelated_branches(git_repo):
    _branch_from(git_repo, "hub/s1/agent-1/attempt-1", file="a.txt", body="a")
    _branch_from(git_repo, "hub/other-session/agent-1/attempt-1", file="x.txt", body="x")
    _branch_from(git_repo, "feature/unrelated", file="y.txt", body="y")
    result = analyze("s1", base="main", cwd=git_repo)
    assert len(result["branches"]) == 1
    assert result["branches"][0]["name"] == "hub/s1/agent-1/attempt-1"


def test_cli_frontier_mode(git_repo, capsys):
    _branch_from(git_repo, "hub/s1/agent-1/attempt-1", body="a")
    _branch_from(git_repo, "hub/s1/agent-2/attempt-1", file="b.txt", body="b")
    rc = dag_analyzer.main(["--session", "s1", "--frontier", "--cwd", str(git_repo)])
    assert rc == 0
    out = capsys.readouterr().out
    lines = [l for l in out.splitlines() if l]
    assert set(lines) == {"hub/s1/agent-1/attempt-1", "hub/s1/agent-2/attempt-1"}


def test_cli_json_mode(git_repo, capsys):
    _branch_from(git_repo, "hub/s1/agent-1/attempt-1", body="a")
    rc = dag_analyzer.main(["--session", "s1", "--format", "json", "--cwd", str(git_repo)])
    assert rc == 0
    import json as _json
    data = _json.loads(capsys.readouterr().out)
    assert data["session_id"] == "s1"
    assert len(data["branches"]) == 1
