"""AgentHub append-only message board.

Channels live under .agenthub/board/{dispatch,progress,results}/.
Posts are markdown files with YAML frontmatter; filenames are monotonically
numbered per channel: {seq:03d}-{author}-{timestamp}.md. Neither the filenames
nor the contents are ever edited — the board is immutable.

CLI:
    python scripts/agenthub/board_manager.py post --channel progress \\
        --author agent-1 --body "Started task"
    python scripts/agenthub/board_manager.py list --channel progress
    python scripts/agenthub/board_manager.py read --channel progress --seq 1
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional

import yaml


VALID_CHANNELS = ("dispatch", "progress", "results")

# agent-1, agent-12, coordinator, or the literal string "coordinator"
AUTHOR_RE = re.compile(r"^(agent-\d+|coordinator)$")
# YYYYMMDDTHHMMSSZ (no colons in filenames)
TS_FMT_FILE = "%Y%m%dT%H%M%SZ"


class BoardError(RuntimeError):
    """Raised for invalid posts or malformed frontmatter."""


@dataclass
class Post:
    path: Path
    seq: int
    author: str
    timestamp: str
    channel: str
    parent: Optional[str]
    body: str
    raw_frontmatter: dict

    @property
    def filename(self) -> str:
        return self.path.name


def _repo_root() -> Path:
    p = Path(__file__).resolve()
    for candidate in (p, *p.parents):
        if (candidate / ".git").exists():
            return candidate
    raise RuntimeError("Could not find repository root (no .git directory)")


def _board_dir(channel: str, repo: Optional[Path] = None) -> Path:
    if channel not in VALID_CHANNELS:
        raise BoardError(f"Unknown channel: {channel!r}. Valid: {VALID_CHANNELS}")
    root = repo or _repo_root()
    return root / ".agenthub" / "board" / channel


def _next_seq(channel_dir: Path) -> int:
    if not channel_dir.is_dir():
        return 1
    nums: List[int] = []
    for child in channel_dir.iterdir():
        if child.suffix != ".md" or child.name == ".gitkeep":
            continue
        parts = child.name.split("-", 1)
        if parts and parts[0].isdigit():
            nums.append(int(parts[0]))
    return (max(nums) + 1) if nums else 1


def _serialize_post(
    *,
    channel: str,
    author: str,
    body: str,
    parent: Optional[str] = None,
    now: Optional[datetime] = None,
) -> str:
    now = now or datetime.now(timezone.utc)
    frontmatter = {
        "author": author,
        "timestamp": now.isoformat(timespec="seconds"),
        "channel": channel,
        "parent": parent,
    }
    return (
        "---\n"
        + yaml.safe_dump(frontmatter, sort_keys=False).rstrip()
        + "\n---\n\n"
        + body.rstrip()
        + "\n"
    )


def _parse_post(path: Path) -> Post:
    text = path.read_text()
    if not text.startswith("---\n"):
        raise BoardError(f"{path}: missing YAML frontmatter")
    try:
        _, raw_fm, body = text.split("---\n", 2)
    except ValueError as exc:
        raise BoardError(f"{path}: malformed frontmatter delimiters") from exc
    try:
        fm = yaml.safe_load(raw_fm) or {}
    except yaml.YAMLError as exc:
        raise BoardError(f"{path}: invalid YAML frontmatter: {exc}") from exc
    if not isinstance(fm, dict):
        raise BoardError(f"{path}: frontmatter must be a mapping")
    for required in ("author", "timestamp", "channel"):
        if required not in fm:
            raise BoardError(f"{path}: frontmatter missing required key {required!r}")

    # filename pattern: {seq:03d}-{author}-{timestamp}.md
    stem = path.stem
    parts = stem.split("-", 2)
    if len(parts) < 3 or not parts[0].isdigit():
        raise BoardError(f"{path}: filename does not match {{seq}}-{{author}}-{{timestamp}}.md")
    seq = int(parts[0])
    return Post(
        path=path,
        seq=seq,
        author=str(fm.get("author")),
        timestamp=str(fm.get("timestamp")),
        channel=str(fm.get("channel")),
        parent=fm.get("parent"),
        body=body.lstrip("\n"),
        raw_frontmatter=fm,
    )


def post(
    *,
    channel: str,
    author: str,
    body: str,
    parent: Optional[str] = None,
    now: Optional[datetime] = None,
    repo: Optional[Path] = None,
) -> Post:
    """Write a new post. Never overwrites."""
    if not AUTHOR_RE.match(author):
        raise BoardError(
            f"Invalid author {author!r}. Must match {AUTHOR_RE.pattern}"
        )
    if not body.strip():
        raise BoardError("Post body must not be empty")

    channel_dir = _board_dir(channel, repo)
    channel_dir.mkdir(parents=True, exist_ok=True)
    seq = _next_seq(channel_dir)
    now = now or datetime.now(timezone.utc)
    filename = f"{seq:03d}-{author}-{now.strftime(TS_FMT_FILE)}.md"
    path = channel_dir / filename
    if path.exists():
        raise BoardError(f"Refusing to overwrite existing post: {path}")
    path.write_text(_serialize_post(channel=channel, author=author, body=body, parent=parent, now=now))
    return _parse_post(path)


def list_posts(channel: str, *, repo: Optional[Path] = None) -> List[Post]:
    """Return all posts in a channel, sorted by sequence number."""
    channel_dir = _board_dir(channel, repo)
    if not channel_dir.is_dir():
        return []
    posts: List[Post] = []
    for child in sorted(channel_dir.iterdir(), key=lambda p: p.name):
        if child.suffix != ".md" or child.name == ".gitkeep":
            continue
        posts.append(_parse_post(child))
    return sorted(posts, key=lambda p: p.seq)


def read_post(channel: str, seq: int, *, repo: Optional[Path] = None) -> Post:
    """Read a specific post by sequence number."""
    for p in list_posts(channel, repo=repo):
        if p.seq == seq:
            return p
    raise BoardError(f"No post with seq={seq} in channel {channel!r}")


# ------- CLI -------


def _cmd_post(args: argparse.Namespace) -> int:
    body = args.body
    if args.body_file:
        body = Path(args.body_file).read_text()
    if not body:
        print("--body or --body-file required", file=sys.stderr)
        return 2
    p = post(channel=args.channel, author=args.author, body=body, parent=args.parent)
    print(f"Posted: {p.path}")
    return 0


def _cmd_list(args: argparse.Namespace) -> int:
    for p in list_posts(args.channel):
        print(f"[{p.seq:03d}] {p.author} @ {p.timestamp} -> {p.filename}")
    return 0


def _cmd_read(args: argparse.Namespace) -> int:
    p = read_post(args.channel, args.seq)
    print(p.path.read_text())
    return 0


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AgentHub message board")
    sub = parser.add_subparsers(dest="command", required=True)

    p_post = sub.add_parser("post")
    p_post.add_argument("--channel", required=True, choices=VALID_CHANNELS)
    p_post.add_argument("--author", required=True, help="agent-N or coordinator")
    p_post.add_argument("--body", help="post body")
    p_post.add_argument("--body-file", help="read body from file")
    p_post.add_argument("--parent", help="optional parent post filename")
    p_post.set_defaults(func=_cmd_post)

    p_list = sub.add_parser("list")
    p_list.add_argument("--channel", required=True, choices=VALID_CHANNELS)
    p_list.set_defaults(func=_cmd_list)

    p_read = sub.add_parser("read")
    p_read.add_argument("--channel", required=True, choices=VALID_CHANNELS)
    p_read.add_argument("--seq", type=int, required=True)
    p_read.set_defaults(func=_cmd_read)

    return parser.parse_args(list(argv) if argv is not None else None)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    try:
        return int(args.func(args))
    except BoardError as exc:
        print(f"board error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
