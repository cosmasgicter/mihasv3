#!/usr/bin/env bash
set -euo pipefail

# Guardrail: migrated runtime modules must not add new direct Supabase runtime usage.
# Historical legacy modules are excluded and tracked in docs/migration/runtime-supabase-inventory.md.
TARGETS=(
  "src/pages/student/applicationWizard"
  "src/pages/student/ApplicationWizard.tsx"
  "src/pages/student/ApplicationStatus.tsx"
  "src/pages/student/Dashboard.tsx"
  "src/hooks/queries"
  "src/services"
  "src/components/student/NotificationPreferences.tsx"
  "src/pages/admin/Dashboard.tsx"
  "src/pages/admin/Applications.tsx"
  "src/pages/admin/ApplicationsAdmin.tsx"
  "src/pages/admin/SystemHealthDashboard.tsx"
  "src/pages/admin/EnhancedDashboard.tsx"
)

PATTERN="(from ['\"]@supabase/supabase-js['\"]|\\bsupabase\\.|VITE_SUPABASE_|supabaseClient|deprecated Supabase stub|Stub supabase object)"

violations=0
for path in "${TARGETS[@]}"; do
  if [[ -e "$path" ]]; then
    if rg -n "$PATTERN" "$path"; then
      violations=1
    fi
  fi
done

if [[ "$violations" -ne 0 ]]; then
  echo "❌ Supabase runtime guard failed: migrated modules contain direct Supabase/stub usage."
  exit 1
fi

echo "✅ Supabase runtime guard passed for migrated modules."
