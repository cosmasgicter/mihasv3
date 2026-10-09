#!/usr/bin/env bash
# L8: does a DEFAULTED run of each affected suite still clobber another task's evidence?
#
# The point of L8 is not that a hard-coded literal is gone from the source; it is that
# running the suite the ordinary way — no env vars, no special config — leaves every
# recorded artifact byte-identical, and that the run's own output landed somewhere.
# Both halves are checked, because "nothing was written" and "nothing was written where
# it should not be" are different claims and only the second one is the fix.
#
# Known-good values, from ../L5-L6/raw/07-gate-13-1-07-check.txt:
#   0.4/playwright-report.json = 85799ced60e970fe5a0ada2870950c1747af7136dc74442eec6e2690d35a7c68  (3951 bytes)
#   2.2/authority-conformance-summary.json = db5f2873c20491527b2f4ce6b10c25ebb94c83806d5a54ddcccbb7b79ecf4de2
#   11.1-11.5 hold 7 / 10 / 10 / 16 / 20 screenshots
#
# usage:  bash docs/v2-evidence/13.6/remediation/L7-L8-L12/raw/l8-defaulted-run-probe.sh
# No `set -u`: .localtest-host-env.sh expands optional vars that may be unset.
set -o pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." || exit 1
test -f package.json || { echo "FATAL: not at the repo root"; exit 1; }

EXPECT_04=85799ced60e970fe5a0ada2870950c1747af7136dc74442eec6e2690d35a7c68
EXPECT_22=db5f2873c20491527b2f4ce6b10c25ebb94c83806d5a54ddcccbb7b79ecf4de2

# The env this probe must run WITHOUT. Unset explicitly rather than assumed unset,
# because inheriting one of them from the caller is exactly the mistake that would make
# a defaulted run look clean while writing a task directory.
unset V2_EVIDENCE_DIR V2_EVIDENCE_TASK_DIRS V2_EVIDENCE_RUN_ID

snapshot() {
  echo "## sha256 + size of the two previously-clobbered files"
  for f in docs/v2-evidence/0.4/playwright-report.json \
           docs/v2-evidence/2.2/authority-conformance-summary.json; do
    printf '%s  %s bytes  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$(stat -c%s "$f")" "$f"
  done
  echo "## 11.1-11.5 screenshot counts + newest mtime"
  for t in 11.1 11.2 11.3 11.4 11.5; do
    d="docs/v2-evidence/$t/screenshots"
    n=$(find "$d" -maxdepth 1 -name '*.png' 2>/dev/null | wc -l)
    newest=$(find "$d" -maxdepth 1 -name '*.png' -printf '%TY-%Tm-%Td %TH:%TM\n' 2>/dev/null | sort | tail -1)
    printf '%s: %s screenshots, newest %s\n' "$t" "$n" "$newest"
  done
  echo "## anything under docs/v2-evidence/ modified in the last 30 minutes, outside this batch"
  find docs/v2-evidence -type f -newermt '-30 minutes' \
       -not -path 'docs/v2-evidence/13.6/remediation/L7-L8-L12/*' 2>/dev/null | head -20
  echo "(end of newer-than list)"
}

echo "### $(date -u +%Y-%m-%dT%H:%M:%SZ) L8 - defaulted runs must not touch another task's evidence"
echo "# V2_EVIDENCE_DIR / _TASK_DIRS / _RUN_ID : all explicitly unset for this probe"
echo
echo "=============== BEFORE ==============="
snapshot

echo
echo "=============== 1. mechanism 3: the backend suite that wrote 2.2 ==============="
echo "\$ pytest tests/property/test_authority_matrix_generated.py -q   # DEFAULTED"
( cd backend && set -a && . ./.localtest-host-env.sh && set +a && export TESTING=1 \
  && .venv/bin/python3 -m pytest tests/property/test_authority_matrix_generated.py \
       -q -p no:cacheprovider -p no:randomly 2>&1 | tail -4 )
echo "run-scoped output this produced:"
find backend/test-results/v2-evidence -type f 2>/dev/null | sed 's/^/  /' | head -10
echo "  (none listed above means the suite wrote nowhere at all - which is NOT the fix)"

echo
echo "=============== 2. mechanism 1 + 2: the harness profile that wrote 0.4 and 11.x ==============="
echo "The Playwright half needs a running harness edge. What is checked without one:"
echo " - the reporter path the config RESOLVES to, and"
echo " - the screenshot directory each of the five specs RESOLVES to,"
echo "both evaluated by importing the real modules, not by reading the source."
( cd apps/admissions && bun ../../docs/v2-evidence/13.6/remediation/L7-L8-L12/raw/l8-resolve-paths.ts 2>&1 )

echo
echo "=============== AFTER ==============="
snapshot

echo
echo "=============== VERDICT ==============="
GOT_04=$(sha256sum docs/v2-evidence/0.4/playwright-report.json | cut -d' ' -f1)
GOT_22=$(sha256sum docs/v2-evidence/2.2/authority-conformance-summary.json | cut -d' ' -f1)
ok=0
[ "$GOT_04" = "$EXPECT_04" ] && echo "0.4/playwright-report.json             : UNCHANGED (matches L5-L6's recorded hash)" || { echo "0.4/playwright-report.json             : CHANGED - $GOT_04"; ok=1; }
[ "$GOT_22" = "$EXPECT_22" ] && echo "2.2/authority-conformance-summary.json : UNCHANGED (matches L5-L6's recorded hash)" || { echo "2.2/authority-conformance-summary.json : CHANGED - $GOT_22"; ok=1; }
counts=$(for t in 11.1 11.2 11.3 11.4 11.5; do find "docs/v2-evidence/$t/screenshots" -maxdepth 1 -name '*.png' | wc -l; done | paste -sd/)
[ "$counts" = "7/10/10/16/20" ] && echo "11.1-11.5 screenshots                  : UNCHANGED ($counts)" || { echo "11.1-11.5 screenshots                  : CHANGED ($counts, expected 7/10/10/16/20)"; ok=1; }
[ "$ok" = "0" ] && echo "VERDICT: PASS" || echo "VERDICT: FAIL"
exit "$ok"
