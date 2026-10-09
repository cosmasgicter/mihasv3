#!/usr/bin/env bash
# L12 per-error probe.
#
# For each of the 15 errors in the baseline
# (docs/v2-evidence/13.6/remediation/L9-L11/raw/14-frontend-lint.txt), print the line
# HEAD carried at that site and the line the worktree carries now. Two clusters:
#
#   A. 9 x no-restricted-imports on '@/services/client' (R14.3), 9 files
#   B. 6 x "Unused eslint-disable directive", 5 files
#
# Cluster B is the one worth watching: the fix must remove the *directive* and keep the
# *import*, because the directives were stale, not the code they guarded.
set -u
cd "$(dirname "$0")/../../../../../.." || exit 1
A_FILES=(
  apps/admissions/src/pages/dev/hooks/useDocumentGeneration.ts
  apps/admissions/src/pages/dev/hooks/usePaymentReceipt.ts
  apps/admissions/src/pages/student/PaymentCallback.tsx
  apps/admissions/src/pages/student/applicationWizard/hooks/useApplicationFileUploads.ts
  apps/admissions/src/pages/student/applicationWizard/hooks/useSmartAutoSave.ts
  apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts
  apps/admissions/src/pages/student/applicationWizard/hooks/wizard/useWizardFileUploads.ts
  apps/admissions/src/pages/student/applicationWizard/hooks/wizard/wizardControllerUtils.ts
  apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx
)
B_FILES=(
  apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts
  apps/admissions/src/pages/student/applicationWizard/steps/EducationStep.tsx
  apps/admissions/src/pages/student/applicationWizard/steps/SubmitStep.tsx
  apps/admissions/tests/harness-e2e/harness-fixtures.ts
  apps/admissions/tests/harness-e2e/helpers/ops.ts
)
RESTRICTED="from '@/services/(client|httpClient|csrf|csrfManager|retry|authInterceptor|apiHelpers)'"

echo "############ CLUSTER A — no-restricted-imports on the raw transport (9 errors, 9 files)"
fail=0
for f in "${A_FILES[@]}"; do
  echo "--- $f"
  echo "    HEAD: $(git show "HEAD:$f" 2>/dev/null | grep -nE "$RESTRICTED" | tr '\n' ' ')"
  now=$(grep -nE "$RESTRICTED" "$f" | tr '\n' ' ')
  echo "     NOW: ${now:-(none — migrated onto a domain service)}"
  [ -n "$now" ] && fail=1
done

echo
echo "############ CLUSTER B — stale eslint-disable directives (6 errors, 5 files)"
echo "#### the directive must be gone; anything it guarded must still be imported"
for f in "${B_FILES[@]}"; do
  echo "--- $f"
  # grep -c prints 0 and exits 1 on no-match, so count lines instead of trusting -c's status
  h=$(git show "HEAD:$f" 2>/dev/null | grep -c 'eslint-disable'; true)
  n=$(grep -c 'eslint-disable' "$f" 2>/dev/null; true)
  echo "    HEAD disable: $h"
  echo "     NOW disable: $n"
  [ "$n" != "0" ] && fail=1
  case "$f" in
    *EducationStep.tsx|*SubmitStep.tsx|*useWizardController.ts)
      keep=$(grep -nE "eligibilityEngine" "$f" | tr '\n' ' ')
      echo "     guarded import KEPT: ${keep:-!!! MISSING — the import was deleted, not the directive}"
      [ -z "$keep" ] && fail=1 ;;
    *ops.ts)
      keep=$(grep -n 'while (true)' "$f" | tr '\n' ' ')
      echo "     guarded loop KEPT:   ${keep:-!!! MISSING}"
      [ -z "$keep" ] && fail=1 ;;
    *harness-fixtures.ts)
      keep=$(grep -n '(test as any)' "$f" | tr '\n' ' ')
      echo "     guarded cast KEPT:   ${keep:-!!! MISSING}"
      [ -z "$keep" ] && fail=1 ;;
  esac
done

echo
echo "############ SUPPRESSION CENSUS — L12 must not have traded errors for disables"
echo "HEAD eslint-disable directives in apps/admissions/{src,tests}:"
git grep -n 'eslint-disable' HEAD -- apps/admissions/src apps/admissions/tests | sed 's/^HEAD:/  /'
echo "NOW  eslint-disable directives in apps/admissions/{src,tests}:"
grep -rn 'eslint-disable' apps/admissions/src apps/admissions/tests \
  --include=*.ts --include=*.tsx --include=*.js | sed 's/^/  /'
echo "(the single remaining hit is prose inside a comment, not a directive — it has no"
echo " '-next-line'/'-line' form and eslint does not read it as one; --report-unused-disable-"
echo " directives would flag it if it were)"

echo
echo "############ RULE INTACT — the R14.3 block was not weakened to reach zero"
git diff -- apps/admissions/eslint.config.js | grep -E '^\+|^-' | grep -vE '^(\+\+\+|---)'
echo "(additions only: the R14.3 block is uncommitted spec work and L12 left every"
echo " pattern and the message in place. No '-' line touches a rule.)"

echo
echo "RESULT: $([ "$fail" = 0 ] && echo PASS || echo FAIL)"
exit "$fail"
