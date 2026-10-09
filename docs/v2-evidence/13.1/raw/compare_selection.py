#!/usr/bin/env python3
"""Set-difference: full backend tree non-passing vs the 52-file selection's known 33.

The 52-file selection is the population every task from 12.1 to 12.5 measured.
Anything outside it has never been catalogued by this spec.
"""
import json, re, collections, sys

rows = json.load(open('docs/v2-evidence/13.1/raw/backend-full-failures.json'))
known = [l.strip() for l in open('docs/v2-evidence/13.1/raw/known-33.txt') if l.strip()]

def keyof(module, name):
    # collapse parametrisation so a parametrised id matches its base name
    return (module, re.sub(r'\[.*\]$', '', name))

known_keys = set()
for nid in known:
    mod, _, rest = nid.partition('::')
    name = rest.split('::')[-1]
    known_keys.add(keyof(mod, name))

sel_files = {l.strip() for l in open('docs/v2-evidence/13.1/raw/backend-selection-52.txt') if l.strip()}

in_sel, outside = [], []
for r in rows:
    (in_sel if r['module'] in sel_files else outside).append(r)

print("BACKEND: the whole tree vs the 52-file selection every prior task ran")
print(f"  full tree            : 5419 collected · 5133 passed · 106 failed · 73 errored · 104 skipped")
print(f"  52-file selection    : 33 failed · 809 passed · 0 errored   (reproduces 12.5 exactly)")
print()
print(f"  non-passing inside the 52-file selection : {len(in_sel)}")
print(f"  non-passing OUTSIDE it (never catalogued): {len(outside)}")
print()
matched = sum(1 for r in in_sel if keyof(r['module'], r['name']) in known_keys)
print(f"  of the {len(in_sel)} inside, matched by name to 12.5's recorded 33: {matched}")
unmatched = [r for r in in_sel if keyof(r['module'], r['name']) not in known_keys]
if unmatched:
    print(f"  inside-selection but NOT in 12.5's list ({len(unmatched)}):")
    for r in unmatched:
        print(f"     [{r['kind'][:4]}] {r['module']}::{r['name']}")
print()
print("=== the never-catalogued population, by owning test module ===")
for m, n in collections.Counter(r['module'] for r in outside).most_common():
    kinds = collections.Counter(r['kind'] for r in outside if r['module'] == m)
    print(f"{n:5d}  {m}   ({', '.join(f'{v} {k}' for k,v in kinds.items())})")
print()
print("=== the never-catalogued population, every test ===")
for r in sorted(outside, key=lambda r: (r['module'], r['name'])):
    print(f"[{r['kind'][:4]}] {r['module']}::{r['name']}")
    print(f"        {r['message'][:200]}")
json.dump({'inside_selection': in_sel, 'outside_selection': outside},
          open('docs/v2-evidence/13.1/raw/backend-new-vs-known.json', 'w'), indent=1)
