#!/bin/bash

# MIHAS V3 - Redesign Verification Script
# Run this before deployment to verify all fixes are in place

echo "🔍 MIHAS V3 Redesign Verification"
echo "=================================="
echo ""

ERRORS=0

# Check 1: Theme default
echo "✓ Checking theme default..."
if grep -q 'defaultTheme="light"' src/App.tsx; then
    echo "  ✅ Theme defaults to light mode"
else
    echo "  ❌ Theme default not set to light"
    ERRORS=$((ERRORS + 1))
fi

# Check 2: No deprecated props
echo "✓ Checking for deprecated props..."
DEPRECATED=$(grep -r "magnetic\|glow" src/pages/*.tsx src/pages/student/*.tsx src/pages/admin/*.tsx 2>/dev/null | wc -l)
if [ "$DEPRECATED" -eq 0 ]; then
    echo "  ✅ No deprecated props found"
else
    echo "  ❌ Found $DEPRECATED deprecated props"
    ERRORS=$((ERRORS + 1))
fi

# Check 3: Routes exist
echo "✓ Checking routes..."
ROUTES=$(grep -E "student/status|student/profile|student/settings|admin/dashboard|admin/profile" src/routes/config.tsx | wc -l)
if [ "$ROUTES" -eq 5 ]; then
    echo "  ✅ All 5 new routes configured"
else
    echo "  ❌ Missing routes (found $ROUTES, expected 5)"
    ERRORS=$((ERRORS + 1))
fi

# Check 4: Welcome message format
echo "✓ Checking welcome messages..."
if grep -q 'Welcome back, ${firstName}' src/pages/student/Dashboard.tsx; then
    echo "  ✅ Student dashboard welcome message correct"
else
    echo "  ⚠️  Student dashboard welcome message may need review"
fi

if grep -q "Welcome back," src/pages/admin/Dashboard.tsx; then
    echo "  ✅ Admin dashboard welcome message correct"
else
    echo "  ⚠️  Admin dashboard welcome message may need review"
fi

# Check 5: Color system
echo "✓ Checking color system..."
if grep -q "from-gray-50 via-blue-50 to-purple-50" src/pages/LandingPage.tsx; then
    echo "  ✅ Landing page uses new color system"
else
    echo "  ❌ Landing page color system not updated"
    ERRORS=$((ERRORS + 1))
fi

# Check 6: Dark mode support
echo "✓ Checking dark mode..."
DARK_MODE=$(grep -c "dark:" src/pages/LandingPage.tsx src/pages/student/Dashboard.tsx src/pages/admin/Dashboard.tsx 2>/dev/null)
if [ "$DARK_MODE" -gt 10 ]; then
    echo "  ✅ Dark mode classes found ($DARK_MODE instances)"
else
    echo "  ⚠️  Limited dark mode support ($DARK_MODE instances)"
fi

# Check 7: Skeleton loaders
echo "✓ Checking skeleton loaders..."
if grep -q "dark:bg-gray-800" src/components/student/StudentDashboardSkeleton.tsx; then
    echo "  ✅ Skeleton loaders have dark mode"
else
    echo "  ❌ Skeleton loaders missing dark mode"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "=================================="
if [ "$ERRORS" -eq 0 ]; then
    echo "✅ ALL CHECKS PASSED - READY FOR DEPLOYMENT"
    exit 0
else
    echo "❌ $ERRORS ERRORS FOUND - FIX BEFORE DEPLOYMENT"
    exit 1
fi
