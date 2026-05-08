# AgentHub — Multi-Agent Collaboration Infrastructure

AgentHub spawns N parallel AI agents that compete on the same task in isolated git worktrees. A coordinator evaluates results by metric or judge and merges the winning branch. This directory implements the spec at `.kiro/skills/agenthub/SKILL.md`.

## Directory Layout

```
.agenthub/
├── README.md                # (tracked) this file
├── board/                   # (tracked metadata, contents gitignored)
│   ├── dispatch/            # coordinator → agents: task assignments
│   ├── progress/            # agents → coordinator: status updates
│   └── results/             # agents + coordinator: final results
├── sessions/                # (gitignored) per-session state
│   └── <session-id>/
│       ├── config.yaml      # task, agents, eval mode, allowlists
│       ├── state.json       # state machine snapshot
│       └── baseline/        # baseline schema + lint + scorecard copies
├── worktrees/               # (gitignored) one per agent per session
│   └── <session-id>/
│       └── agent-<N>/       # git worktree on branch hub/<id>/agent-<N>/attempt-1
└── archives/                # (gitignored) moved worktrees after merge
```

## Session Lifecycle

```
init → running → evaluating → merged
                            → archived  (if no winner / all failed)
```

State transitions are managed by `scripts/agenthub/session_manager.py`. Valid transitions:

| From        | To         | Trigger                                   |
|-------------|------------|-------------------------------------------|
| `init`      | `running`  | `hub_init.py --spawn` completes           |
| `running`   | `evaluating` | All agent branches have commits        |
| `evaluating`| `merged`   | Coordinator runs `git merge --no-ff`      |
| `evaluating`| `archived` | No winner, or all agents failed           |

Any other transition raises `InvalidSessionTransition`.

## Branch Naming

```
hub/<session-id>/agent-<N>/attempt-<M>
```

- `session-id`: timestamp `YYYYMMDD-HHMMSS`
- `N`: agent number (1-indexed)
- `M`: attempt number (starts at 1, incremented on retry)

Archive tags: `hub/archive/<session-id>/agent-<N>`

## Message Board

Append-only. Filenames: `{seq:03d}-{author}-{timestamp}.md`. YAML frontmatter required.

| Channel       | Writers             | Readers      |
|---------------|---------------------|--------------|
| `dispatch/`   | coordinator         | agents       |
| `progress/`   | agents              | coordinator  |
| `results/`    | agents, coordinator | all          |

## Hallucination Controls

1. **Allowlist enforcement** — `result_ranker.py --check-allowlist` fails any agent diff that touches files outside its declared allowlist.
2. **Baseline grounding** — At session init, baseline schema + lint report + scorecard are copied into `sessions/<id>/baseline/`. Agents read these directly rather than inferring from code.
3. **Verifiable delta** — Each agent declares an expected numeric delta (e.g., "drf-spectacular errors: 56 → 54"). Coordinator rejects if actual ≠ expected.
4. **Novel-import detection** — `result_ranker.py --check-imports` scans the agent's diff for imports not present in the baseline import graph.

## Scripts

| Script              | Purpose                                                    |
|---------------------|------------------------------------------------------------|
| `hub_init.py`       | Initialize session: write config, state, baseline         |
| `session_manager.py`| Session state machine + cleanup                           |
| `board_manager.py`  | Message board CRUD (channels, posts)                      |
| `dag_analyzer.py`   | Git branch state: frontier, orphans, ahead/behind         |
| `result_ranker.py`  | Rank agents by metric, judge, or hybrid                   |

## Quickstart

```bash
# Initialize a 3-agent session
python scripts/agenthub/hub_init.py \
    --task "api-quick-wins" \
    --agents 3 \
    --eval metric \
    --base main

# Check progress
python scripts/agenthub/dag_analyzer.py --session <id> --frontier

# Post result from an agent
python scripts/agenthub/board_manager.py post \
    --channel results --author agent-1 \
    --body-file /tmp/agent-1-result.md

# Rank and merge
python scripts/agenthub/result_ranker.py --session <id> --mode metric
```

## Integrity Rules

- **Append-only** — never edit or delete board posts; never rebase agent branches; never force-push
- **Disjoint allowlists** — by design, no two agents in the same phase may modify overlapping files
- **Idempotent** — running `hub_init.py` twice with the same session-id is rejected
