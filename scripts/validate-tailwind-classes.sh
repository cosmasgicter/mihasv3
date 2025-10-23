#!/bin/bash

# Tailwind CSS Class Validation Script
# Checks for invalid className patterns that cause build/runtime errors

echo "🔍 Validating Tailwind CSS classes..."

# Check for triple-slash opacity patterns (e.g., bg-accent/5/30)
TRIPLE_SLASH=$(grep -rn 'className.*\/[0-9][0-9]\/[0-9]' --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" src/ 2>/dev/null | grep -v "nrc_number\|placeholder\|example" | wc -l)

if [ "$TRIPLE_SLASH" -gt 0 ]; then
  echo "❌ Found $TRIPLE_SLASH invalid triple-slash opacity patterns:"
  grep -rn 'className.*\/[0-9][0-9]\/[0-9]' --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" src/ 2>/dev/null | grep -v "nrc_number\|placeholder\|example"
  exit 1
fi

# Check for quadruple-slash patterns
QUAD_SLASH=$(grep -rn 'className.*\/[0-9]*\/[0-9]*\/[0-9]' --include="*.tsx" --include="*.ts" src/ 2>/dev/null | wc -l)

if [ "$QUAD_SLASH" -gt 0 ]; then
  echo "❌ Found $QUAD_SLASH invalid quadruple-slash patterns"
  exit 1
fi

# Check for opacity values over 100
INVALID_OPACITY=$(grep -rn 'className.*\/(1[0-9][0-9]|[2-9][0-9][0-9])' --include="*.tsx" --include="*.ts" src/ 2>/dev/null | grep -v "w-\|h-\|max-w\|min-w\|space-\|gap-\|p-\|m-\|text-\|z-" | wc -l)

if [ "$INVALID_OPACITY" -gt 0 ]; then
  echo "⚠️  Warning: Found potential invalid opacity values over 100"
fi

echo "✅ All Tailwind CSS classes are valid!"
exit 0
