import json, glob, os, collections
BASE='docs/v2-evidence/13.6/remediation/L5-L6/raw'
OLD='docs/v2-evidence/13.3/raw'
def rows(d):
    out=[]
    for f in sorted(glob.glob(os.path.join(d,'measurements-*.jsonl'))):
        for line in open(f):
            line=line.strip()
            if line: out.append(json.loads(line))
    return out
new=rows(BASE); old=rows(OLD)
print("rows: after=%d  before(13.3)=%d" % (len(new), len(old)))

def matrix(rs):
    m={}
    for r in rs:
        if 'touchTargets' in r and 'overflow' in r and 'occlusion' in r:
            m[(r['project'].replace('-13-3','').replace('-13-6-L5-L6',''), r['viewport'], r['surface'])]=r
    return m
mn, mo = matrix(new), matrix(old)
print("\n=== SMALLEST TOUCH TARGET, per viewport (all surfaces, both profiles) ===")
print(f"{'viewport':<12}{'before minW':>12}{'before minH':>12}{'after minW':>12}{'after minH':>12}{'after offenders':>17}")
for vp in ['320x568','375x667','390x844','768x1024','1280x800','1440x900']:
    def agg(m):
        ws=[v['touchTargets']['minWidth'] for k,v in m.items() if k[1]==vp and v['touchTargets']['minWidth'] is not None]
        hs=[v['touchTargets']['minHeight'] for k,v in m.items() if k[1]==vp and v['touchTargets']['minHeight'] is not None]
        off=sum(len(v['touchTargets'].get('offenders',[])) for k,v in m.items() if k[1]==vp)
        return (min(ws) if ws else None, min(hs) if hs else None, off)
    bw,bh,bo = agg(mo); aw,ah,ao = agg(mn)
    print(f"{vp:<12}{str(bw):>12}{str(bh):>12}{str(aw):>12}{str(ah):>12}{ao:>17}")

print("\n=== TOTAL sub-44 offenders across the whole matrix ===")
for name,m in (('before (13.3)',mo),('after  (13.6 L5-L6)',mn)):
    tot=0; names=collections.Counter()
    for k,v in m.items():
        for o in v['touchTargets'].get('offenders',[]):
            tot+=1; names[o.get('label') or o.get('id') or '(unnamed)']+=1
    print(f"{name}: {tot} offender measurements; distinct controls: {len(names)}")
    for lbl,c in names.most_common(12): print(f"    {c:>4}  {lbl}")

print("\n=== DASHBOARD CLS ===")
for name, rs in (('before (13.3)', old), ('after  (13.6)', new)):
    got={}
    for r in rs:
        if 'readings' in r:
            for rd in r['readings']:
                if rd['surface']=='/student/dashboard':
                    got.setdefault(rd['viewport'],[]).append(rd['cls'])
    print(' ', name, {k: got[k] for k in ['320x568','375x667','390x844','768x1024','1280x800','1440x900'] if k in got})

print("\n=== AXE blocking violations ===")
for name, rs in (('before (13.3)', old), ('after  (13.6)', new)):
    tot=collections.Counter(); rowsn=0
    for r in rs:
        if r.get('kind')=='axe':
            rowsn+=1
            for v in (r.get('blocking') or []):
                n=v.get('nodes',1)
                tot[v.get('id','?')] += (len(n) if isinstance(n,list) else n)
            for v in (r.get('violations') or []):
                n=v.get('nodes',1)
                tot[v.get('id','?')] += (len(n) if isinstance(n,list) else n)
    print(f"  {name}: axe rows={rowsn} blocking node-count by rule: {dict(tot)}")

print("\n=== GATE-13.3-16 occlusion of the primary next action, unscrolled at 320x568 ===")
for name, rs in (('before (13.3)', old), ('after  (13.6)', new)):
    for r in rs:
        if r.get('finding')=='GATE-13.3-16' or (r.get('measured') and isinstance(r['measured'],dict) and 'overlappingBars' in r.get('measured',{})):
            m=r.get('measured') or {}
            bars=m.get('overlappingBars')
            print(f"  {name} [{r['project']}] top={m.get('top')} bottom={m.get('bottom')} h={m.get('height')} vh={m.get('viewportHeight')} bars={bars}")

print("\n=== FONT CHAIN in the browser ===")
for name, rs in (('before (13.3)', old), ('after  (13.6)', new)):
    for r in rs:
        if r.get('kind')=='font fallback chain':
            print(f"  {name} [{r['project']}] rendered {r.get('renderedCount')} of {r.get('declaredCount')}: {r.get('renderedFamilies')}")

print("\n=== HEADING STRUCTURE ===")
for name, rs in (('before (13.3)', old), ('after  (13.6)', new)):
    for r in rs:
        if r.get('dimension')=='screen-reader semantics':
            print(f"  {name} [{r['project']}] {r['surface']}: h1={r.get('h1Count')} beforeH1={r.get('headingsBeforeH1')} skips={r.get('skippedLevels')}")

print("\n=== /student/status (no id) ===")
for name, rs in (('before (13.3)', old), ('after  (13.6)', new)):
    for r in rs:
        if r.get('surface')=='/student/status (no id)':
            print(f"  {name} [{r['project']}] owned={r.get('applicationsOwnedByThisStudent')} rendered={json.dumps(r.get('rendered'))[:260]}")
            print(f"      sub44 offenders on this surface: {r['touchTargets'].get('offenders')}")

print("\n=== OVERFLOW / OCCLUSION totals (all 96 cells) ===")
for name,m in (('before (13.3)',mo),('after  (13.6)',mn)):
    doc=sum(1 for v in m.values() if v['overflow']['document']>0)
    clip=sum(len(v['overflow'].get('clippedCommands',[])) for v in m.values())
    def n(x): return len(x) if isinstance(x,list) else x
    occ=sum(n(v['occlusion']['occluded']) for v in m.values())
    rest=sum(n(v['occlusion']['occludedAtRest']) for v in m.values())
    print(f"  {name}: cells={len(m)}  cells with doc overflow>0={doc}  clipped commands={clip}  still-occluded={occ}  occluded-at-rest={rest}")
