#!/usr/bin/env python3
"""Parse a pytest JUnit XML into a machine-readable failure/error inventory.

JUnit from this pytest build carries no @file, so the dotted @classname is used
as the owning module (that is the test file path with dots).
"""
import sys, json, collections, xml.etree.ElementTree as ET

path, outjson = sys.argv[1], sys.argv[2]
root = ET.parse(path).getroot()
suite = root if root.tag == 'testsuite' else root.find('testsuite')

def modfile(classname: str) -> str:
    parts = classname.split('.')
    # trailing Test* class names are not part of the path
    while parts and parts[-1][:1].isupper():
        parts.pop()
    return '/'.join(parts) + '.py' if parts else '<unknown>'

rows = []
for tc in suite.iter('testcase'):
    f, e = tc.find('failure'), tc.find('error')
    node = f if f is not None else e
    if node is None:
        continue
    cls = tc.get('classname') or ''
    rows.append({
        'kind': 'failure' if f is not None else 'error',
        'module': modfile(cls),
        'classname': cls,
        'name': tc.get('name') or '',
        'message': (node.get('message') or '').strip().replace('\n', ' ')[:400],
    })

nf = sum(1 for r in rows if r['kind'] == 'failure')
ne = sum(1 for r in rows if r['kind'] == 'error')
print(f"FULL BACKEND TREE — failures: {nf}   errors: {ne}   (total non-passing: {nf+ne})")
print()
for kind in ('error', 'failure'):
    sel = [r for r in rows if r['kind'] == kind]
    print(f"=== {kind.upper()}S grouped by owning test module ({len(sel)}) ===")
    for m, n in collections.Counter(r['module'] for r in sel).most_common():
        print(f"{n:5d}  {m}")
    print()
print("=== ERROR message classes ===")
for m, n in collections.Counter(r['message'][:120] for r in rows if r['kind'] == 'error').most_common():
    print(f"{n:5d}  {m}")
print()
print("=== every non-passing test: module :: name -> message ===")
for r in sorted(rows, key=lambda r: (r['module'], r['name'])):
    print(f"[{r['kind'][:4]}] {r['module']}::{r['name']}")
    print(f"        {r['message'][:230]}")
json.dump(rows, open(outjson, 'w'), indent=1)
