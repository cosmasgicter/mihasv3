#!/usr/bin/env bash
# L8: prove the drift guard DISCRIMINATES rather than assuming it does.
#
# A guard that passes on the fixed tree tells you nothing until you have watched it
# fail on the broken one. This restores the exact literal L8 removed, at a real write
# site in one of the five screenshot specs, runs the guard, and then puts the file back
# and verifies it byte-identical by sha256 (the shape L10 used for its date guard).
#
# It also checks the guard's own blind spot in the other direction: the docblocks quote
# the old literal on purpose, and the guard must NOT fire on prose.
#
# usage:  bash docs/v2-evidence/13.6/remediation/L7-L8-L12/raw/l8-guard-discriminates.sh
# No `set -u`: .localtest-host-env.sh expands optional vars that may be unset.
set -o pipefail
# Six levels: raw -> L7-L8-L12 -> remediation -> 13.6 -> v2-evidence -> docs -> repo
# root. The first version of this line used five and every step reported "No such file
# or directory" — the same off-by-one L5-L6 hit inside the batch that filed it (§8.4),
# which is why the check below refuses to call two empty hashes equal.
cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." || exit 1
test -f package.json || { echo "FATAL: not at the repo root"; exit 1; }

SPEC=apps/admissions/tests/harness-e2e/required/student-dashboard-task-first.spec.ts
GUARD=tests/unit/test_evidence_dir_convention_l8.py

echo "### $(date -u +%Y-%m-%dT%H:%M:%SZ) L8 - does the drift guard discriminate?"
echo "# probe file : $SPEC"
echo "# guard      : backend/$GUARD"
echo

BEFORE=$(sha256sum "$SPEC" | cut -c1-16)
echo "sha256[0:16] before : $BEFORE"
cp "$SPEC" /tmp/l8-spec-backup.ts

echo
echo "--- 0. the guard on the tree as it stands (must PASS) ---"
( cd backend && set -a && . ./.localtest-host-env.sh && set +a && export TESTING=1 \
  && .venv/bin/python3 -m pytest "$GUARD" -q -p no:cacheprovider -p no:randomly 2>&1 | tail -3 )

echo
echo "--- 1. restore the literal L8 removed, at the real write site ---"
python3 - "$SPEC" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
src = p.read_text(encoding="utf-8")
new = "const SHOT_DIR = join(evidenceDir('11.1'), 'screenshots');"
old = (
    "const SHOT_DIR = join(\n"
    "  dirname(fileURLToPath(import.meta.url)),\n"
    "  '../../../../../docs/v2-evidence/11.1/screenshots',\n"
    ");"
)
assert src.count(new) == 1, "write site not found in its post-L8 shape"
p.write_text(src.replace(new, old), encoding="utf-8")
print("write site reverted to the pre-L8 literal")
PY

echo
echo "--- 2. the guard on the reverted tree (must FAIL, and name the task) ---"
( cd backend && set -a && . ./.localtest-host-env.sh && set +a && export TESTING=1 \
  && .venv/bin/python3 -m pytest "$GUARD" -q -p no:cacheprovider -p no:randomly 2>&1 \
  | grep -E "GATE-13.1-07|failed|passed" | head -8 )

echo
echo "--- 3. restore, and verify byte-identical ---"
cp /tmp/l8-spec-backup.ts "$SPEC"
AFTER=$(sha256sum "$SPEC" | cut -c1-16)
echo "sha256[0:16] after  : $AFTER"
if [ -z "$BEFORE" ] || [ -z "$AFTER" ]; then
  echo "RESTORED: UNKNOWN - a hash is empty, so this probe proved nothing"
elif [ "$BEFORE" = "$AFTER" ]; then
  echo "RESTORED: byte-identical"
else
  echo "RESTORED: MISMATCH - INVESTIGATE"
fi
rm -f /tmp/l8-spec-backup.ts

echo
echo "--- 4. the guard again (must PASS), and the prose blind spot check ---"
( cd backend && set -a && . ./.localtest-host-env.sh && set +a && export TESTING=1 \
  && .venv/bin/python3 -m pytest "$GUARD" -q -p no:cacheprovider -p no:randomly 2>&1 | tail -3 )
echo "docblock lines still quoting the old literal (must be > 0 - the guard ignores prose):"
grep -c "docs/v2-evidence/11.1/screenshots" "$SPEC"
