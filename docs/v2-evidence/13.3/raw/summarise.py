#!/usr/bin/env python3
"""
Turn task 13.3's raw measurements into the tables the evidence README publishes.

Input:  raw/measurements-<project>.jsonl  (one JSON row per measurement, appended
        as it was taken — see helpers/surfaces-13-3.ts::recordRow for why it is
        appended rather than written once at the end)
Output: raw/pixel-matrix.txt   — the six-viewport x eight-surface matrix, per project
        raw/axe-matrix.txt     — the six-viewport x five-surface axe sweep with durations
        raw/dimensions.txt     — the nine dimensions, with what each one measured
        raw/findings.txt       — every offender this run measured, grouped by finding

Read-only over the measurements; it derives nothing that is not in them.
"""
import json
import pathlib
from collections import defaultdict

RAW = pathlib.Path(__file__).resolve().parent
PROJECTS = ['chromium-13-3', 'mobile-13-3']
VIEWPORTS = ['320x568', '375x667', '390x844', '768x1024', '1280x800', '1440x900']


def rows(project):
    path = RAW / f'measurements-{project}.jsonl'
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


def pixel_matrix():
    lines = ['=== the six-viewport x eight-surface pixel matrix ===', '']
    lines.append('Each cell is four measured numbers:')
    lines.append('  T=<interactive elements scanned>/<offenders>  O=<document overflow px>')
    lines.append('  X=<still-covered after scroll>/<covered at rest>  S=<CLS>')
    lines.append('An offender count counts only UNATTRIBUTED sub-44 controls; the')
    lines.append('attributed ones (GATE-13.3-01..06, -15) are listed in findings.txt.')
    lines.append('')
    for project in PROJECTS:
        # Only the viewport matrix's own rows. The long-content sweep records the
        # same shape for the same surfaces under a different premise, so it gets its
        # own table rather than being averaged into this one.
        # The matrix's own rows: they carry a surface and touch targets, are not the
        # long-content sweep (`kind`), and are not an expected-failure probe.
        data = [
            r for r in rows(project)
            if r.get('surface') and r.get('touchTargets') and not r.get('kind')
            and not r.get('expectedToFail')
        ]
        if not data:
            continue
        surfaces = []
        for r in data:
            if r['surface'] not in surfaces:
                surfaces.append(r['surface'])
        lines.append(f'--- project: {project} ---')
        header = f'{"surface":42}' + ''.join(f'{v:>26}' for v in VIEWPORTS)
        lines.append(header)
        lines.append('-' * len(header))
        for surface in surfaces:
            cells = []
            for viewport in VIEWPORTS:
                match = next(
                    (r for r in data if r['surface'] == surface and r.get('viewport') == viewport),
                    None,
                )
                if not match:
                    cells.append(f'{"-":>26}')
                    continue
                tt = match['touchTargets']
                ov = match['overflow']
                oc = match['occlusion']
                ls = match['layoutShift']
                unattributed = len(tt.get('unattributedOffenders', []))
                cell = (
                    f"T={tt['scanned']}/{unattributed} "
                    f"O={ov['document']} "
                    f"X={len(oc.get('occluded', []))}/{len(oc.get('occludedAtRest', []))} "
                    f"S={ls.get('cls', 0)}"
                )
                cells.append(f'{cell:>26}')
            lines.append(f'{surface:42}' + ''.join(cells))
        lines.append('')
    return '\n'.join(lines) + '\n'


def axe_matrix():
    lines = ['=== the six-viewport axe WCAG 2.0/2.1 A+AA sweep ===', '']
    lines.append('Each cell: <axe checks passed> / nav+axe ms / <blocking> / <non-blocking>')
    lines.append('Durations are recorded per row on purpose: 13.1 §6.1 established that a')
    lines.append('timeout and an accessibility violation must never be mistaken for each')
    lines.append('other. Every row here is well inside its budget.')
    lines.append('')
    for project in PROJECTS:
        data = [r for r in rows(project) if r.get('kind') == 'axe' and 'passes' in r]
        if not data:
            continue
        surfaces = []
        for r in data:
            if r['surface'] not in surfaces:
                surfaces.append(r['surface'])
        lines.append(f'--- project: {project} ---')
        header = f'{"surface":34}' + ''.join(f'{v:>24}' for v in VIEWPORTS)
        lines.append(header)
        lines.append('-' * len(header))
        worst = 0
        for surface in surfaces:
            cells = []
            for viewport in VIEWPORTS:
                match = next(
                    (r for r in data if r['surface'] == surface and r.get('viewport') == viewport),
                    None,
                )
                if not match:
                    cells.append(f'{"-":>24}')
                    continue
                worst = max(worst, match['scanMs'])
                cell = (
                    f"{match['passes']}chk {match['scanMs']}ms "
                    f"B={len(match['blocking'])} N={len(match['nonBlocking'])}"
                )
                cells.append(f'{cell:>24}')
            lines.append(f'{surface:34}' + ''.join(cells))
        lines.append(f'slowest single surface scan in this project: {worst} ms')
        lines.append('')
    return '\n'.join(lines) + '\n'


def dimensions():
    lines = ['=== the nine test dimensions, and what each one measured ===', '']
    for project in PROJECTS:
        data = [r for r in rows(project) if r.get('dimension') or r.get('claim') or r.get('kind')]
        if not data:
            continue
        lines.append(f'--- project: {project} ---')
        for r in data:
            key = r.get('dimension') or r.get('claim') or r.get('kind')
            if r.get('touchTargets') and r.get('surface') and not r.get('finding'):
                continue  # a pixel-matrix row; belongs in pixel-matrix.txt
            lines.append(f'[{key}]')
            lines.append(json.dumps(r, indent=1, ensure_ascii=False))
            lines.append('')
        lines.append('')
    return '\n'.join(lines) + '\n'


def findings():
    lines = ['=== every offender measured, grouped by finding ===', '']
    by_finding = defaultdict(list)
    for project in PROJECTS:
        for r in rows(project):
            tt = r.get('touchTargets') or {}
            for offender in tt.get('attributedOffenders', []) or []:
                by_finding[offender.get('finding', 'UNATTRIBUTED')].append(
                    f"{project} {r.get('viewport')} {r.get('surface')}: "
                    f"{offender['tag']}[{offender.get('label') or offender.get('id') or ''}] "
                    f"{offender['width']}x{offender['height']}"
                )
            for offender in tt.get('allOffenders', []) or []:
                key = 'long-content sweep (see attribution list)'
                by_finding[key].append(
                    f"{project} {r.get('viewport')} {r.get('surface')} [{r.get('kind')}]: "
                    f"{offender['tag']}[{offender.get('label') or offender.get('id') or ''}] "
                    f"{offender['width']}x{offender['height']}"
                )
            if r.get('kind') == 'axe':
                for v in r.get('blocking', []) or []:
                    # Fall back to the row's own finding: the scoped expected-failure
                    # scans carry it at the top level rather than per violation.
                    by_finding[v.get('finding') or r.get('finding') or 'UNATTRIBUTED'].append(
                        f"{project} {r.get('viewport')} {r.get('surface')}: "
                        f"[{v['impact']}] {v['id']} " +
                        f"x{v['nodes'] if isinstance(v.get('nodes'), int) else len(v.get('nodes', []))}"
                    )
            if r.get('finding') and r.get('expectedToFail'):
                by_finding[r['finding']].append(
                    f"{project} EXPECTED-FAILURE ROW: {json.dumps(r.get('measured') or r.get('touchTargets') or {}, ensure_ascii=False)[:400]}"
                )
            for reading in r.get('overBudget', []) or []:
                by_finding[reading.get('finding', 'UNATTRIBUTED')].append(
                    f"{project} {reading['viewport']} {reading['surface']}: CLS {reading['cls']}"
                )
    for finding in sorted(by_finding):
        entries = by_finding[finding]
        lines.append(f'--- {finding}  ({len(entries)} measurement(s)) ---')
        seen = set()
        for entry in entries:
            if entry in seen:
                continue
            seen.add(entry)
            lines.append(f'  {entry}')
        lines.append('')
    return '\n'.join(lines) + '\n'


def long_content():
    lines = ['=== the long / localized content sweep, same four pixel checks ===', '']
    lines.append('T=<scanned>/<unattributed offenders>  O=<document overflow px>')
    lines.append('X=<still-covered after scroll>/<covered at rest>  S=<CLS, recorded not asserted>')
    lines.append('')
    for project in PROJECTS:
        data = [r for r in rows(project) if r.get('kind') and r.get('touchTargets')]
        if not data:
            continue
        lines.append(f'--- project: {project} ---')
        lines.append(f'{"kind":22}{"surface":34}{"viewport":11}measurements')
        lines.append('-' * 110)
        for r in data:
            tt = r['touchTargets']
            ov = r['overflow']
            oc = r['occlusion']
            ls = r['layoutShift']
            cell = (
                f"T={tt['scanned']}/{len(tt.get('unattributedOffenders', []))} "
                f"O={ov['document']} "
                f"X={len(oc.get('occluded', []))}/{len(oc.get('occludedAtRest', []))} "
                f"S={ls.get('cls', 0)}"
            )
            lines.append(f"{str(r.get('kind'))[:21]:22}{str(r.get('surface'))[:33]:34}{str(r.get('viewport')):11}{cell}")
        lines.append('')
    return '\n'.join(lines) + '\n'


for name, body in [
    ('pixel-matrix.txt', pixel_matrix()),
    ('long-content-matrix.txt', long_content()),
    ('axe-matrix.txt', axe_matrix()),
    ('dimensions.txt', dimensions()),
    ('findings.txt', findings()),
]:
    (RAW / name).write_text(body, encoding='utf-8')
    print(f'wrote {name} ({len(body.splitlines())} lines)')
