"""Count R9.2 rollback-lint violations per failing test and per owning file.

Reason this instrument exists: test_rollback_safe_operations.py contains TWO
failing tests and each prints its own violation list, so a naive
``grep -c`` over the whole pytest output double-counts and reports 27 where
13.4 §6.1 and L2-L3 §4 both report 26. The deterministic every-file audit
(``test_every_discovered_rollback_file_is_individually_safe``) is the one whose
count is comparable; the hypothesis-driven property deliberately SHRINKS its
draw to the smallest offending subset, so its list is shorter by design.

usage:  pytest tests/property/test_rollback_safe_operations.py -q \
            -p no:cacheprovider -p no:randomly > out.txt 2>&1
        python3 l7-rollback-lint-count.py out.txt
"""
import re
import sys
from collections import Counter

path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/l7lint.txt"
txt = open(path).read()
parts = re.split(r"\n_{5,} (\S+) _{5,}\n", txt)
print("failing sections:", parts[1::2])
for name, body in zip(parts[1::2], parts[2::2]):
    lines = [l for l in body.splitlines() if re.search(r"^E\s+- \S+_rollback\.sql:", l)]
    counts = Counter(re.search(r"- (\S+_rollback\.sql):", l).group(1) for l in lines)
    print("")
    print(f"{name}: {len(lines)} violation lines across {len(counts)} files")
    for fname, n in sorted(counts.items()):
        print(f"   {n:>2}  {fname}")
print("")
print("L7 filename occurrences anywhere in output:",
      txt.count("2026_08_14_01_neutral_platform_communication_templates"))
print("tail:", txt.strip().splitlines()[-1])
