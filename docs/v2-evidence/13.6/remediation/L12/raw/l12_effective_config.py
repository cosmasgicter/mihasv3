"""Read `eslint --print-config <file>` on stdin and report the facts L12's causes rest on.

Usage: bun x eslint --print-config <file> | python3 l12_effective_config.py <label>

Prints the effective `no-restricted-imports` patterns, whether the two rules the stale
directives named are enabled at all, and the full set of rules this config turns on.
Nothing is inferred from the config *source*: this is ESLint's own resolved answer for
that file, which is the only thing `--report-unused-disable-directives` compares against.
"""

import json
import sys

label = sys.argv[1] if len(sys.argv) > 1 else "(file)"
cfg = json.load(sys.stdin)
rules = cfg.get("rules", {})


def severity(name):
    entry = rules.get(name)
    if entry is None:
        return None
    return entry[0] if isinstance(entry, list) else entry


print(f"    file: {label}")

nri = rules.get("no-restricted-imports")
if nri is None:
    print("    no-restricted-imports: OFF")
    groups = []
else:
    sev = nri[0]
    opts = nri[1] if len(nri) > 1 else {}
    groups = [g for p in opts.get("patterns", []) for g in p.get("group", [])]
    print(f"    no-restricted-imports: severity {sev}, {len(opts.get('patterns', []))} pattern group(s)")
    for p in opts.get("patterns", []):
        print(f"      group: {p.get('group')}")

has_elig = any("eligibilityEngine" in g for g in groups)
has_client = any(g == "@/services/client" for g in groups)
print(f"    -> '@/lib/eligibilityEngine' in the effective patterns? {has_elig}")
print(f"    -> '@/services/client'       in the effective patterns? {has_client}")

for name in ("@typescript-eslint/no-explicit-any", "no-constant-condition"):
    sev = severity(name)
    state = "OFF (not enabled -> any disable for it is unused)" if sev in (None, 0, "off") else f"ON ({sev})"
    print(f"    {name}: {state}")

on = sorted(k for k, v in rules.items() if (v[0] if isinstance(v, list) else v) not in (0, "off"))
print(f"    rules ON for this file ({len(on)}): {on}")
print(f"    @typescript-eslint plugin registered? {'@typescript-eslint' in cfg.get('plugins', [])}")
