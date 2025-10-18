#!/bin/bash

echo "🌙 MIHAS V3 - Dark Mode Legibility Fix"
echo "======================================"

# Fix 1: Show ThemeToggle on mobile
echo "✓ Making ThemeToggle visible on mobile..."
sed -i 's/className="hidden md:block">/className="">/g' src/components/navigation/Header.tsx

# Fix 2: Add dark mode to text colors
echo "✓ Adding dark mode to text colors..."
find src/pages src/components -type f -name "*.tsx" -exec sed -i \
  -e 's/className="\([^"]*\)text-gray-900\([^"]*\)"/className="\1text-gray-900 dark:text-gray-100\2"/g' \
  -e 's/className="\([^"]*\)text-gray-800\([^"]*\)"/className="\1text-gray-800 dark:text-gray-200\2"/g' \
  -e 's/className="\([^"]*\)text-gray-700\([^"]*\)"/className="\1text-gray-700 dark:text-gray-300\2"/g' \
  -e 's/className="\([^"]*\)text-gray-600\([^"]*\)"/className="\1text-gray-600 dark:text-gray-400\2"/g' \
  -e 's/className="\([^"]*\)text-gray-500\([^"]*\)"/className="\1text-gray-500 dark:text-gray-500\2"/g' \
  {} \; 2>/dev/null || true

# Fix 3: Add dark mode to backgrounds
echo "✓ Adding dark mode to backgrounds..."
find src/pages src/components -type f -name "*.tsx" -exec sed -i \
  -e 's/className="\([^"]*\)bg-white\([^"]*\)"/className="\1bg-white dark:bg-gray-800\2"/g' \
  -e 's/className="\([^"]*\)bg-gray-50\([^"]*\)"/className="\1bg-gray-50 dark:bg-gray-900\2"/g' \
  -e 's/className="\([^"]*\)bg-gray-100\([^"]*\)"/className="\1bg-gray-100 dark:bg-gray-800\2"/g' \
  {} \; 2>/dev/null || true

# Fix 4: Add dark mode to borders
echo "✓ Adding dark mode to borders..."
find src/pages src/components -type f -name "*.tsx" -exec sed -i \
  -e 's/className="\([^"]*\)border-gray-200\([^"]*\)"/className="\1border-gray-200 dark:border-gray-700\2"/g' \
  -e 's/className="\([^"]*\)border-gray-300\([^"]*\)"/className="\1border-gray-300 dark:border-gray-600\2"/g' \
  {} \; 2>/dev/null || true

# Fix 5: Clean up duplicate dark mode classes
echo "✓ Cleaning up duplicates..."
find src/pages src/components -type f -name "*.tsx" -exec sed -i \
  -e 's/dark:bg-gray-800 dark:bg-gray-800/dark:bg-gray-800/g' \
  -e 's/dark:text-gray-100 dark:text-gray-100/dark:text-gray-100/g' \
  -e 's/dark:border-gray-700 dark:border-gray-700/dark:border-gray-700/g' \
  {} \; 2>/dev/null || true

echo "✅ Dark mode fixes applied!"
echo ""
echo "Verification:"
echo "- Text without dark mode: $(grep -r 'text-gray-[0-9]' src/pages src/components --include='*.tsx' | grep -v 'dark:' | wc -l)"
echo "- Backgrounds without dark mode: $(grep -r 'bg-white\|bg-gray-50\|bg-gray-100' src/pages src/components --include='*.tsx' | grep -v 'dark:' | wc -l)"
echo "- Borders without dark mode: $(grep -r 'border-gray-[0-9]' src/pages src/components --include='*.tsx' | grep -v 'dark:' | wc -l)"
