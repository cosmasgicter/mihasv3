"""Tests for board_manager.py (append-only AgentHub message board)."""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "scripts" / "agenthub"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import board_manager  # noqa: E402
from board_manager import BoardError, VALID_CHANNELS, list_posts, post, read_post  # noqa: E402


@pytest.fixture
def fake_repo(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    (repo / ".git").mkdir(parents=True)
    (repo / ".agenthub" / "board" / "dispatch").mkdir(parents=True)
    (repo / ".agenthub" / "board" / "progress").mkdir(parents=True)
    (repo / ".agenthub" / "board" / "results").mkdir(parents=True)
    monkeypatch.setattr(board_manager, "_repo_root", lambda: repo)
    return repo


def test_post_creates_file_with_frontmatter(fake_repo):
    now = datetime(2026, 5, 8, 12, 0, 0, tzinfo=timezone.utc)
    p = post(channel="progress", author="agent-1", body="Hello", now=now)
    assert p.path.is_file()
    assert p.seq == 1
    assert p.filename == "001-agent-1-20260508T120000Z.md"
    assert p.channel == "progress"
    assert p.author == "agent-1"
    assert p.body.strip() == "Hello"
    # File content roundtrips
    content = p.path.read_text()
    assert content.startswith("---\n")
    assert "author: agent-1" in content
    assert "channel: progress" in content


def test_post_increments_seq(fake_repo):
    post(channel="progress", author="agent-1", body="one")
    p2 = post(channel="progress", author="agent-2", body="two")
    p3 = post(channel="progress", author="agent-1", body="three")
    assert (p2.seq, p3.seq) == (2, 3)


def test_post_rejects_empty_body(fake_repo):
    with pytest.raises(BoardError, match="must not be empty"):
        post(channel="progress", author="agent-1", body="   ")


@pytest.mark.parametrize("bad_author", ["agent", "Agent-1", "agent-1a", "1-agent", ""])
def test_post_rejects_bad_author(fake_repo, bad_author):
    with pytest.raises(BoardError, match="Invalid author"):
        post(channel="progress", author=bad_author, body="x")


def test_post_rejects_unknown_channel(fake_repo):
    with pytest.raises(BoardError, match="Unknown channel"):
        post(channel="banter", author="agent-1", body="x")


def test_post_never_overwrites_same_filename(fake_repo):
    """Even if a post-file of the same name somehow exists, we refuse to overwrite."""
    now = datetime(2026, 5, 8, 12, 0, 0, tzinfo=timezone.utc)
    post(channel="progress", author="agent-1", body="first", now=now)
    # Manually recreate a collision: write a file with seq=1 filename
    collision = fake_repo / ".agenthub" / "board" / "progress" / "001-agent-2-20260508T130000Z.md"
    collision.write_text("---\nauthor: agent-2\ntimestamp: x\nchannel: progress\n---\n\nbody\n")
    # Next post should still succeed because _next_seq returns max+1
    p2 = post(channel="progress", author="agent-1", body="second", now=now)
    assert p2.seq == 2


def test_list_posts_returns_sorted(fake_repo):
    post(channel="results", author="agent-2", body="b")
    post(channel="results", author="agent-1", body="a")
    post(channel="results", author="agent-3", body="c")
    posts = list_posts("results")
    assert [p.seq for p in posts] == [1, 2, 3]
    assert [p.author for p in posts] == ["agent-2", "agent-1", "agent-3"]


def test_list_posts_empty_channel(fake_repo):
    assert list_posts("dispatch") == []


def test_read_post(fake_repo):
    post(channel="progress", author="agent-1", body="first")
    p = post(channel="progress", author="agent-2", body="second payload\nmulti-line\n")
    read = read_post("progress", p.seq)
    assert read.body.strip() == "second payload\nmulti-line"


def test_read_post_missing(fake_repo):
    with pytest.raises(BoardError, match="No post with seq=99"):
        read_post("progress", 99)


def test_malformed_frontmatter_rejected(fake_repo):
    bad = fake_repo / ".agenthub" / "board" / "progress" / "001-agent-1-20260508T120000Z.md"
    bad.write_text("this is not yaml\nno frontmatter at all\n")
    with pytest.raises(BoardError, match="missing YAML frontmatter"):
        list_posts("progress")


def test_missing_required_frontmatter_key_rejected(fake_repo):
    bad = fake_repo / ".agenthub" / "board" / "progress" / "001-agent-1-20260508T120000Z.md"
    bad.write_text("---\nauthor: agent-1\n---\n\nbody\n")
    with pytest.raises(BoardError, match="missing required key"):
        list_posts("progress")


def test_cli_post_and_list(fake_repo, capsys):
    rc = board_manager.main(
        ["post", "--channel", "progress", "--author", "agent-1", "--body", "hello via CLI"]
    )
    assert rc == 0
    out = capsys.readouterr().out
    assert "Posted:" in out

    rc = board_manager.main(["list", "--channel", "progress"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "[001] agent-1" in out


def test_cli_post_body_file(fake_repo, capsys, tmp_path):
    body_path = tmp_path / "body.txt"
    body_path.write_text("from a file\n")
    rc = board_manager.main(
        [
            "post",
            "--channel",
            "progress",
            "--author",
            "coordinator",
            "--body-file",
            str(body_path),
        ]
    )
    assert rc == 0


def test_valid_channels_exported():
    assert "dispatch" in VALID_CHANNELS
    assert "progress" in VALID_CHANNELS
    assert "results" in VALID_CHANNELS
