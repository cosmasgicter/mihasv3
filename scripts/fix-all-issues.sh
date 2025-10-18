#!/bin/bash

echo "🔧 MIHAS V3 - Comprehensive Fix Script"
echo "======================================"

# Fix 1: Remove PageLayout/PageContent wrappers from authenticated pages
echo "✓ Removing PageLayout/PageContent from authenticated pages..."
for file in src/pages/student/ApplicationStatus.tsx src/pages/student/Settings.tsx src/pages/admin/Settings.tsx; do
  if [ -f "$file" ]; then
    sed -i 's/<PageLayout[^>]*>//g' "$file"
    sed -i 's/<\/PageLayout>//g' "$file"
    sed -i 's/<PageContent[^>]*>/  <div className="safe-area-bottom py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">/g' "$file"
    sed -i 's/<\/PageContent>/<\/div>/g' "$file"
  fi
done

# Fix 2: Remove emojis from UI text
echo "✓ Removing emojis from UI..."
find src -type f -name "*.tsx" -exec sed -i \
  -e 's/🎓/<GraduationCap className="w-5 h-5" \/>/g' \
  -e 's/👋//g' \
  -e 's/📋/<FileText className="w-5 h-5" \/>/g' \
  -e 's/🎯/<Target className="w-5 h-5" \/>/g' \
  -e 's/✨/<Sparkles className="w-5 h-5" \/>/g' \
  -e 's/🚀/<Rocket className="w-5 h-5" \/>/g' \
  -e 's/📊/<BarChart3 className="w-5 h-5" \/>/g' \
  -e 's/💡/<Lightbulb className="w-5 h-5" \/>/g' \
  -e 's/🔔/<Bell className="w-5 h-5" \/>/g' \
  -e 's/⚡/<Zap className="w-5 h-5" \/>/g' \
  -e 's/👨🎓/<User className="w-5 h-5" \/>/g' \
  -e 's/📈/<TrendingUp className="w-5 h-5" \/>/g' \
  -e 's/🎉/<PartyPopper className="w-5 h-5" \/>/g' \
  -e 's/💼/<Briefcase className="w-5 h-5" \/>/g' \
  -e 's/🏆/<Trophy className="w-5 h-5" \/>/g' \
  -e 's/📝/<FileEdit className="w-5 h-5" \/>/g' \
  -e 's/🌟/<Star className="w-5 h-5" \/>/g' \
  -e 's/⭐/<Star className="w-5 h-5" \/>/g' \
  -e 's/📅/<Calendar className="w-5 h-5" \/>/g' \
  -e 's/🔍/<Search className="w-5 h-5" \/>/g' \
  -e 's/👤/<User className="w-5 h-5" \/>/g' \
  -e 's/📞/<Phone className="w-5 h-5" \/>/g' \
  -e 's/💳/<CreditCard className="w-5 h-5" \/>/g' \
  {} \;

# Fix 3: Fix inconsistent gradients
echo "✓ Standardizing gradient patterns..."
find src -type f -name "*.tsx" -exec sed -i \
  -e 's/from-red-500 to-red-600/from-red-600 to-red-700/g' \
  -e 's/from-green-400 to-green-600/from-green-500 to-green-600/g' \
  -e 's/from-amber-500 to-amber-600/from-amber-600 to-amber-700/g' \
  {} \;

# Fix 4: Add dark mode to common patterns (basic)
echo "✓ Adding dark mode classes..."
find src/pages src/components -type f -name "*.tsx" -exec sed -i \
  -e 's/className="\([^"]*\)bg-white\([^"]*\)"/className="\1bg-white dark:bg-gray-800\2"/g' \
  -e 's/className="\([^"]*\)text-gray-900\([^"]*\)"/className="\1text-gray-900 dark:text-gray-100\2"/g' \
  -e 's/className="\([^"]*\)border-gray-200\([^"]*\)"/className="\1border-gray-200 dark:border-gray-700\2"/g' \
  {} \; 2>/dev/null || true

echo "✅ All fixes applied!"
echo ""
echo "Next steps:"
echo "1. Run: npm run dev"
echo "2. Check for TypeScript errors"
echo "3. Test navigation on mobile and desktop"
