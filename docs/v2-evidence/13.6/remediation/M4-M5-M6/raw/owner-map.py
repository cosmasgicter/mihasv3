#!/usr/bin/env python3
"""M6's ownership-assignment instrument.

Derives the {requirement -> dotted GATE finding ids} map from findings.md's OWN
`Owner requirement(s)` column, rather than from anything typed by hand, so the
`_Findings:` lines added to requirements.md and the register cannot disagree by
transcription. Every id is emitted under EVERY top-level requirement its column
names — multi-ownership is already the register's convention (TEN-08 is owned by
R4, R5 and R15; STU-10 by R5, R9, R13 and R16).

    python3 raw/owner-map.py             # the map + the audit table
    python3 raw/owner-map.py --check     # non-zero if requirements.md disagrees
"""
from __future__ import annotations
import pathlib, re, sys

sys.path.insert(0, "scripts")
import validate_spec_governance as vsg  # noqa: E402  (the one id grammar)

SPEC = pathlib.Path(".kiro/specs/admissions-v2-canonical-rebuild")
DOTTED_ROW = re.compile(r"^\|\s*(GATE-\d+\.\d+-\d+)\s*\|")
REQ_TOKEN = re.compile(r"(?<![A-Za-z0-9])R(\d+)(?![0-9])")
REQ_HEADING = re.compile(r"^#{2,4}\s+(R\d+)\.\s")


def register() -> list[tuple[str, list[str], str]]:
    """[(finding_id, [owner requirement ids], raw owner cell)] in file order."""
    out = []
    for line in (SPEC / "findings.md").read_text().splitlines():
        m = DOTTED_ROW.match(line)
        if not m:
            continue
        cells = [c.strip() for c in line.split("|")]
        # | id | severity | observed | owner requirement(s) | owning lane | state |
        owner_cell = cells[4] if len(cells) > 4 else ""
        reqs = sorted({f"R{n}" for n in REQ_TOKEN.findall(owner_cell)}, key=lambda r: int(r[1:]))
        out.append((m.group(1), reqs, owner_cell))
    return out


def current_findings_lines() -> dict[str, set[str]]:
    """{requirement id -> ids already on its _Findings: line}."""
    cur, req = {}, None
    for line in (SPEC / "requirements.md").read_text().splitlines():
        h = REQ_HEADING.match(line)
        if h:
            req = h.group(1)
            cur.setdefault(req, set())
        elif "Findings:" in line and req:
            # Use the VALIDATOR's own id regex, not a second spelling of it. The first
            # draft of this instrument spelled its own, put the plain alternative
            # first, and duly reported 6 ids as "missing" that were present — it had
            # matched `GATE-13.3-16` as `GATE-13`. That is precisely the ordering trap
            # the comment on _FINDING_ID_BODY warns about, reproduced here by accident
            # within an hour of writing that comment. Recorded rather than silently
            # fixed: it is the strongest available evidence that the ordering matters.
            cur[req] |= set(vsg._FINDING_ID_RE.findall(line))
    return cur


def main() -> int:
    rows = register()
    by_req: dict[str, list[str]] = {}
    for fid, reqs, _ in rows:
        for r in reqs:
            by_req.setdefault(r, []).append(fid)

    print(f"# dotted GATE findings in findings.md: {len(rows)}")
    print(f"# distinct owner requirements named:   {len(by_req)}")
    print()
    print("| finding | owner requirement(s) from findings.md's own column |")
    print("|---|---|")
    for fid, reqs, cell in rows:
        print(f"| `{fid}` | {', '.join(reqs) or '**NONE — rule 3 would fire**'} |")
    print()
    print("## per-requirement additions, in requirement order")
    for r in sorted(by_req, key=lambda x: int(x[1:])):
        print(f"{r}: {len(by_req[r])}  {', '.join(by_req[r])}")
    unowned = [fid for fid, reqs, _ in rows if not reqs]
    print(f"\nfindings whose column names no requirement: {len(unowned)} {unowned}")

    if "--check" in sys.argv:
        cur = current_findings_lines()
        missing = []
        for r, ids in by_req.items():
            for fid in ids:
                if fid not in cur.get(r, set()):
                    missing.append((r, fid))
        print(f"\n--check: requirements.md is missing {len(missing)} (requirement, finding) pair(s)")
        for r, fid in missing:
            print(f"  {r} is missing {fid}")
        return 1 if missing else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
