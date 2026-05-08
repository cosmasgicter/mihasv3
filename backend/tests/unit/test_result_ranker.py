"""Tests for result_ranker.py (metric ranking + allowlist + novel-import detection)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "scripts" / "agenthub"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import result_ranker  # noqa: E402
from result_ranker import (  # noqa: E402
    _extract_metric,
    check_allowlist,
    detect_novel_imports,
)


# ---------- metric extraction ----------

def test_extract_metric_from_json_flat():
    assert _extract_metric('{"p50_ms": 123.4}', "p50_ms") == 123.4


def test_extract_metric_from_json_nested():
    assert _extract_metric('{"results": {"p50_ms": 7.5}}', "results.p50_ms") == 7.5


def test_extract_metric_regex_fallback():
    assert _extract_metric("Test complete. p50_ms: 42", "p50_ms") == 42.0
    assert _extract_metric("p50_ms=3.14", "p50_ms") == 3.14


def test_extract_metric_missing_returns_none():
    assert _extract_metric("nothing here", "p50_ms") is None


# ---------- allowlist ----------

def test_allowlist_exact_match():
    assert check_allowlist(["a/b.py"], ["a/b.py"]) == []


def test_allowlist_glob_match():
    assert check_allowlist(["apps/x/views.py", "apps/x/urls.py"], ["apps/x/*.py"]) == []


def test_allowlist_violations_detected():
    files = ["apps/x/views.py", "apps/y/secrets.py"]
    allowlist = ["apps/x/*.py"]
    violations = check_allowlist(files, allowlist)
    assert violations == ["apps/y/secrets.py"]


def test_allowlist_empty_means_no_files_allowed():
    assert check_allowlist(["any.py"], []) == ["any.py"]


def test_allowlist_deep_glob():
    assert check_allowlist(["a/b/c/d.py"], ["a/**"]) == []


# ---------- novel imports ----------

def test_novel_imports_detects_new_third_party():
    diff = """
+import sketchy_library
+from another_sketch import thing
"""
    baseline = {"os", "sys", "pathlib"}
    novel = detect_novel_imports(diff, baseline)
    assert "sketchy_library" in novel
    assert "another_sketch" in novel


def test_novel_imports_ignores_known_prefixes():
    diff = """
+import django.contrib.auth
+from rest_framework import serializers
+from apps.common import utils
"""
    novel = detect_novel_imports(diff, baseline_imports=set())
    assert novel == []


def test_novel_imports_ignores_existing_baseline():
    diff = "+import celery\n"
    novel = detect_novel_imports(diff, baseline_imports={"celery"})
    assert novel == []


def test_novel_imports_handles_empty_diff():
    assert detect_novel_imports("", baseline_imports=set()) == []


def test_novel_imports_strips_submodule():
    diff = "+import sketchy.submodule\n"
    novel = detect_novel_imports(diff, baseline_imports=set())
    assert novel == ["sketchy"]


# ---------- allowlist CLI integration (uses real git worktrees) ----------

@pytest.fixture
def session_with_worktrees(tmp_path, monkeypatch):
    """Build a fake repo with real branches under hub/<session-id>/agent-<N>/..."""
    repo = tmp_path / "r"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "t@t"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    (repo / ".gitignore").write_text(".agenthub/\n")
    (repo / "apps").mkdir()
    (repo / "apps" / "x.py").write_text("# base\n")
    (repo / "apps" / "y.py").write_text("# base\n")
    subprocess.run(["git", "add", "."], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "base"], cwd=repo, check=True)

    # Agent 1: modifies apps/x.py (within allowlist)
    subprocess.run(["git", "checkout", "-q", "-b", "hub/s1/agent-1/attempt-1"], cwd=repo, check=True)
    (repo / "apps" / "x.py").write_text("# agent-1 edit\n")
    subprocess.run(["git", "add", "."], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "agent-1"], cwd=repo, check=True)
    subprocess.run(["git", "checkout", "-q", "main"], cwd=repo, check=True)

    # Agent 2: modifies apps/y.py (OUTSIDE allowlist — violation)
    subprocess.run(["git", "checkout", "-q", "-b", "hub/s1/agent-2/attempt-1"], cwd=repo, check=True)
    (repo / "apps" / "y.py").write_text("# agent-2 edit\n")
    subprocess.run(["git", "add", "."], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "agent-2"], cwd=repo, check=True)
    subprocess.run(["git", "checkout", "-q", "main"], cwd=repo, check=True)

    # Write session files
    sessions_dir = repo / ".agenthub" / "sessions" / "s1"
    sessions_dir.mkdir(parents=True)
    (sessions_dir / "baseline").mkdir()
    import yaml as _yaml
    (sessions_dir / "config.yaml").write_text(
        _yaml.safe_dump({
            "task": "t",
            "agents": 2,
            "eval_mode": "metric",
            "base_branch": "main",
            "branch_prefix": "hub",
            "agent_ids": ["agent-1", "agent-2"],
            "allowlists": [["apps/x.py"], ["apps/x.py"]],  # agent-2 will violate
        })
    )
    (sessions_dir / "state.json").write_text(
        json.dumps({
            "state": "running",
            "agents": [
                {"id": "agent-1", "branch": "hub/s1/agent-1/attempt-1", "status": "pending"},
                {"id": "agent-2", "branch": "hub/s1/agent-2/attempt-1", "status": "pending"},
            ],
        })
    )
    monkeypatch.chdir(repo)
    # Patch session_manager.repo_root to point at our fake repo
    import session_manager
    monkeypatch.setattr(session_manager, "repo_root", lambda: repo)
    return repo


def test_cli_check_allowlist_flags_violation(session_with_worktrees, capsys):
    rc = result_ranker.main(["--session", "s1", "--check-allowlist", "--format", "json"])
    assert rc == 1  # Non-zero because agent-2 violated
    out = capsys.readouterr().out
    data = json.loads(out)
    assert data["agent-1"] == []
    assert data["agent-2"] == ["apps/y.py"]


def test_cli_check_imports_detects_novel(session_with_worktrees, capsys, monkeypatch):
    # Amend agent-2 to introduce a novel import
    subprocess.run(
        ["git", "checkout", "-q", "hub/s1/agent-2/attempt-1"],
        cwd=session_with_worktrees, check=True,
    )
    (session_with_worktrees / "apps" / "y.py").write_text("import somethingrandom\n")
    subprocess.run(["git", "add", "."], cwd=session_with_worktrees, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "add-novel"], cwd=session_with_worktrees, check=True)
    subprocess.run(["git", "checkout", "-q", "main"], cwd=session_with_worktrees, check=True)

    rc = result_ranker.main(["--session", "s1", "--check-imports", "--format", "json"])
    assert rc == 1  # Non-zero because novel import found
    out = capsys.readouterr().out
    data = json.loads(out)
    assert "somethingrandom" in data.get("agent-2", [])
