"""Tests for AgentHub directory layout integrity.

Asserts the canonical structure from `.kiro/skills/agenthub/SKILL.md` exists
and the gitignore rules preserve tracked metadata while ignoring session state.
"""

from __future__ import annotations

import os
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
AGENTHUB_ROOT = REPO_ROOT / ".agenthub"


def test_agenthub_root_exists():
    assert AGENTHUB_ROOT.is_dir(), f"Missing {AGENTHUB_ROOT}"


def test_agenthub_readme_tracked():
    readme = AGENTHUB_ROOT / "README.md"
    assert readme.is_file(), "AgentHub README.md must exist"
    content = readme.read_text()
    assert "Directory Layout" in content
    assert "Session Lifecycle" in content
    assert "Branch Naming" in content
    assert "Message Board" in content


def test_agenthub_board_channels_exist():
    for channel in ("dispatch", "progress", "results"):
        path = AGENTHUB_ROOT / "board" / channel
        assert path.is_dir(), f"Missing board channel: {channel}"
        gitkeep = path / ".gitkeep"
        assert gitkeep.is_file(), f"Missing .gitkeep in {path}"


def test_agenthub_state_dirs_exist():
    for name in ("sessions", "worktrees", "archives"):
        path = AGENTHUB_ROOT / name
        assert path.is_dir(), f"Missing {name}/"


def test_agenthub_gitignore_correct():
    gi = AGENTHUB_ROOT / ".gitignore"
    assert gi.is_file()
    content = gi.read_text()
    # Session state and worktrees must be ignored
    assert "sessions/" in content
    assert "worktrees/" in content
    assert "archives/" in content
    # .gitkeep files must be preserved
    assert "!board/dispatch/.gitkeep" in content
    assert "!board/progress/.gitkeep" in content
    assert "!board/results/.gitkeep" in content


def test_scripts_agenthub_dir_exists():
    scripts_dir = REPO_ROOT / "scripts" / "agenthub"
    assert scripts_dir.is_dir(), "scripts/agenthub/ must exist"
