#!/bin/bash

echo "🎨 MIHAS V3 - Dark Mode Color Fix"
echo "=================================="

# Fix colored text elements
echo "✓ Adding dark mode to colored text..."
find src/pages src/components -type f -name "*.tsx" -exec sed -i \
  -e 's/text-blue-600\([^"]*\)"/text-blue-600 dark:text-blue-400\1"/g' \
  -e 's/text-blue-700\([^"]*\)"/text-blue-700 dark:text-blue-300\1"/g' \
  -e 's/text-blue-800\([^"]*\)"/text-blue-800 dark:text-blue-200\1"/g' \
  -e 's/text-purple-600\([^"]*\)"/text-purple-600 dark:text-purple-400\1"/g' \
  -e 's/text-purple-700\([^"]*\)"/text-purple-700 dark:text-purple-300\1"/g' \
  -e 's/text-green-600\([^"]*\)"/text-green-600 dark:text-green-400\1"/g' \
  -e 's/text-green-700\([^"]*\)"/text-green-700 dark:text-green-300\1"/g' \
  -e 's/text-red-600\([^"]*\)"/text-red-600 dark:text-red-400\1"/g' \
  -e 's/text-red-700\([^"]*\)"/text-red-700 dark:text-red-300\1"/g' \
  -e 's/text-amber-600\([^"]*\)"/text-amber-600 dark:text-amber-400\1"/g' \
  -e 's/text-amber-700\([^"]*\)"/text-amber-700 dark:text-amber-300\1"/g' \
  -e 's/text-yellow-600\([^"]*\)"/text-yellow-600 dark:text-yellow-400\1"/g' \
  {} \; 2>/dev/null || true

# Fix colored backgrounds
echo "✓ Adding dark mode to colored backgrounds..."
find src/pages src/components -type f -name "*.tsx" -exec sed -i \
  -e 's/bg-blue-50\([^"]*\)"/bg-blue-50 dark:bg-blue-950\/30\1"/g' \
  -e 's/bg-blue-100\([^"]*\)"/bg-blue-100 dark:bg-blue-900\/30\1"/g' \
  -e 's/bg-green-50\([^"]*\)"/bg-green-50 dark:bg-green-950\/30\1"/g' \
  -e 's/bg-green-100\([^"]*\)"/bg-green-100 dark:bg-green-900\/30\1"/g' \
  -e 's/bg-red-50\([^"]*\)"/bg-red-50 dark:bg-red-950\/30\1"/g' \
  -e 's/bg-red-100\([^"]*\)"/bg-red-100 dark:bg-red-900\/30\1"/g' \
  -e 's/bg-amber-50\([^"]*\)"/bg-amber-50 dark:bg-amber-950\/30\1"/g' \
  -e 's/bg-amber-100\([^"]*\)"/bg-amber-100 dark:bg-amber-900\/30\1"/g' \
  -e 's/bg-purple-50\([^"]*\)"/bg-purple-50 dark:bg-purple-950\/30\1"/g' \
  -e 's/bg-purple-100\([^"]*\)"/bg-purple-100 dark:bg-purple-900\/30\1"/g' \
  -e 's/bg-yellow-50\([^"]*\)"/bg-yellow-50 dark:bg-yellow-950\/30\1"/g' \
  {} \; 2>/dev/null || true

# Fix colored borders
echo "✓ Adding dark mode to colored borders..."
find src/pages src/components -type f -name "*.tsx" -exec sed -i \
  -e 's/border-blue-200\([^"]*\)"/border-blue-200 dark:border-blue-800\1"/g' \
  -e 's/border-blue-300\([^"]*\)"/border-blue-300 dark:border-blue-700\1"/g' \
  -e 's/border-green-200\([^"]*\)"/border-green-200 dark:border-green-800\1"/g' \
  -e 's/border-green-300\([^"]*\)"/border-green-300 dark:border-green-700\1"/g' \
  -e 's/border-red-200\([^"]*\)"/border-red-200 dark:border-red-800\1"/g' \
  -e 's/border-red-300\([^"]*\)"/border-red-300 dark:border-red-700\1"/g' \
  -e 's/border-amber-200\([^"]*\)"/border-amber-200 dark:border-amber-800\1"/g' \
  -e 's/border-purple-200\([^"]*\)"/border-purple-200 dark:border-purple-800\1"/g' \
  {} \; 2>/dev/null || true

# Clean up duplicates
echo "✓ Cleaning up duplicates..."
find src/pages src/components -type f -name "*.tsx" -exec sed -i \
  -e 's/dark:text-\([a-z]*-[0-9]*\) dark:text-\1/dark:text-\1/g' \
  -e 's/dark:bg-\([a-z]*-[0-9]*\) dark:bg-\1/dark:bg-\1/g' \
  -e 's/dark:border-\([a-z]*-[0-9]*\) dark:border-\1/dark:border-\1/g' \
  {} \; 2>/dev/null || true

echo "✅ Color fixes applied!"
