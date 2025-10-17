#!/bin/bash

# Mobile Navigation Fixes Verification Script
# MIHAS Application System V2

echo "🔍 MIHAS Mobile Navigation Fixes Verification"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0
WARN=0

# Function to check file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} File exists: $1"
        ((PASS++))
        return 0
    else
        echo -e "${RED}✗${NC} File missing: $1"
        ((FAIL++))
        return 1
    fi
}

# Function to check file content
check_content() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Found in $1: $2"
        ((PASS++))
        return 0
    else
        echo -e "${RED}✗${NC} Not found in $1: $2"
        ((FAIL++))
        return 1
    fi
}

# Function to check file doesn't exist
check_not_exists() {
    if [ ! -f "$1" ]; then
        echo -e "${GREEN}✓${NC} File correctly removed: $1"
        ((PASS++))
        return 0
    else
        echo -e "${YELLOW}⚠${NC} File still exists (should be removed): $1"
        ((WARN++))
        return 1
    fi
}

echo "📁 Phase 1: File Structure Verification"
echo "----------------------------------------"

# Check modified files exist
check_file "src/styles/mobile-enhancements.css"
check_file "src/components/ui/AuthenticatedNavigation.tsx"
check_file "src/components/ui/AdminNavigation.tsx"
check_file "src/components/ui/MobileNavigation.tsx"
check_file "src/hooks/use-mobile.ts"

# Check duplicate removed
check_not_exists "src/hooks/use-mobile.tsx"

echo ""
echo "🎨 Phase 2: CSS Fixes Verification"
echo "-----------------------------------"

# Check CSS fixes
check_content "src/styles/mobile-enhancements.css" "background-color: #ffffff !important"
check_content "src/styles/mobile-enhancements.css" "opacity: 1 !important"
check_content "src/styles/mobile-enhancements.css" "visibility: visible !important"
check_content "src/styles/mobile-enhancements.css" "z-index: 9999 !important"
check_content "src/styles/mobile-enhancements.css" "min-height: 56px !important"

echo ""
echo "⚛️  Phase 3: Component Fixes Verification"
echo "------------------------------------------"

# Check AuthenticatedNavigation fixes
check_content "src/components/ui/AuthenticatedNavigation.tsx" "backgroundColor: '#ffffff'"
check_content "src/components/ui/AuthenticatedNavigation.tsx" "zIndex: 9999"

# Check AdminNavigation fixes
check_content "src/components/ui/AdminNavigation.tsx" "backgroundColor: '#ffffff'"
check_content "src/components/ui/AdminNavigation.tsx" "zIndex: 9999"

# Check MobileNavigation fixes
check_content "src/components/ui/MobileNavigation.tsx" "backgroundColor: '#1f2937'"
check_content "src/components/ui/MobileNavigation.tsx" "zIndex: 9999"

echo ""
echo "🔧 Phase 4: Hook Consolidation Verification"
echo "--------------------------------------------"

# Check use-mobile hook improvements
check_content "src/hooks/use-mobile.ts" "useIsMobile"
check_content "src/hooks/use-mobile.ts" "useIsTablet"
check_content "src/hooks/use-mobile.ts" "useViewportSize"
check_content "src/hooks/use-mobile.ts" "matchMedia"

echo ""
echo "📚 Phase 5: Documentation Verification"
echo "---------------------------------------"

check_file "MOBILE_NAVIGATION_AUDIT_PHASE1.md"
check_file "COMPREHENSIVE_AUDIT_PHASE2.md"
check_file "AUDIT_FIXES_SUMMARY.md"
check_file "test-mobile-navigation.html"

echo ""
echo "🔍 Phase 6: TypeScript Compilation Check"
echo "-----------------------------------------"

if command -v npm &> /dev/null; then
    echo "Running TypeScript compilation check..."
    if npm run build > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} TypeScript compilation successful"
        ((PASS++))
    else
        echo -e "${RED}✗${NC} TypeScript compilation failed"
        echo "Run 'npm run build' for details"
        ((FAIL++))
    fi
else
    echo -e "${YELLOW}⚠${NC} npm not found, skipping compilation check"
    ((WARN++))
fi

echo ""
echo "📊 Verification Summary"
echo "======================="
echo -e "${GREEN}Passed:${NC} $PASS"
echo -e "${RED}Failed:${NC} $FAIL"
echo -e "${YELLOW}Warnings:${NC} $WARN"
echo ""

# Calculate percentage
TOTAL=$((PASS + FAIL))
if [ $TOTAL -gt 0 ]; then
    PERCENTAGE=$((PASS * 100 / TOTAL))
    echo "Success Rate: $PERCENTAGE%"
    echo ""
fi

# Final verdict
if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ All critical checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start development server: npm run dev"
    echo "2. Open test suite: open test-mobile-navigation.html"
    echo "3. Test with credentials:"
    echo "   - Student: cosmaskanchepa8@gmail.com / Beanola2025"
    echo "   - Admin: cosmas@beanola.com / Beanola2025"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some checks failed!${NC}"
    echo ""
    echo "Please review the failed checks above and fix the issues."
    echo ""
    exit 1
fi
