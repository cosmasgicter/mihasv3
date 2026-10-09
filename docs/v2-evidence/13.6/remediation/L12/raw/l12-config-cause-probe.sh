#!/usr/bin/env bash
# Why were 6 of the 15 errors "Unused eslint-disable directive"?
#
# A stale directive is not a typo — each one did something when it was written. This asks
# ESLint itself (`--print-config`) for the effective config at each site, because that
# resolved config is the only thing `--report-unused-disable-directives` compares a
# directive against. The three sub-causes are therefore measured, not reasoned about.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../../../../../../apps/admissions" || exit 1
PROBE="$HERE/l12_effective_config.py"
E="bun x eslint"

show() { $E --print-config "$1" 2>/dev/null | python3 "$PROBE" "$1"; }

echo "##################################################################"
echo "# B1 — 3 stale directives for no-restricted-imports on '@/lib/eligibilityEngine'"
echo "#      useWizardController.ts:14 · EducationStep.tsx:13 · SubmitStep.tsx:36"
echo "#"
echo "# CLAIM: flat config REPLACES a rule's options, it does not merge them. The R14.3"
echo "# block comes after the migratedModuleFiles block and also matches 'src/pages/**',"
echo "# so for these three files the effective no-restricted-imports carries the R14.3"
echo "# transport patterns and NOT the eligibilityEngine pattern the directives named."
echo "# A directive for a pattern that is not in the effective config can never be used."
echo "##################################################################"
echo
show src/pages/student/applicationWizard/hooks/useWizardController.ts
echo
show src/pages/student/applicationWizard/steps/EducationStep.tsx
echo
echo "#### CONTROL — a migratedModuleFiles file that is NOT under src/pages, so no R14.3"
echo "#### override applies and the eligibilityEngine pattern IS effective there:"
echo
show src/hooks/queries/useApplicationQueries.ts

echo
echo "##################################################################"
echo "# B2 — 2 stale directives for @typescript-eslint/no-explicit-any"
echo "#      tests/harness-e2e/harness-fixtures.ts:161,163"
echo "# CLAIM: the plugin is registered but this rule is never enabled, so a disable for"
echo "#        it is unused by construction — at every line of every file."
echo "##################################################################"
echo
show tests/harness-e2e/harness-fixtures.ts
echo "    grep for the rule name in eslint.config.js:"
grep -n "no-explicit-any" eslint.config.js || echo "      (not mentioned anywhere — never enabled)"

echo
echo "##################################################################"
echo "# B3 — 1 stale directive for no-constant-condition"
echo "#      tests/harness-e2e/helpers/ops.ts:320, guarding 'while (true)'"
echo "# CLAIM: the rule is not enabled here either. (Even if it were, its own default"
echo "#        checkLoops:'allExceptWhileTrue' permits while(true) — so the directive"
echo "#        was unnecessary under both readings.)"
echo "##################################################################"
echo
show tests/harness-e2e/helpers/ops.ts
echo "    grep for the rule name in eslint.config.js:"
grep -n "no-constant-condition" eslint.config.js || echo "      (not mentioned anywhere — never enabled)"

echo
echo "##################################################################"
echo "# A — the nine cluster-A errors were real violations, not config noise"
echo "##################################################################"
echo "    Above, for both src/pages files: '@/services/client in the effective patterns? True'."
echo "    And the directive report is part of the gate command itself, not an extra flag:"
grep -n '"lint"' package.json
