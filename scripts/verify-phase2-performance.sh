#!/bin/bash

# Phase 2 Performance Checkpoint Verification Script
# This script runs all performance tests to verify Phase 2 optimizations

set -e

echo "🚀 Phase 2 Performance Checkpoint Verification"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test and track results
run_test() {
    local test_name=$1
    local test_command=$2
    
    echo -e "${YELLOW}Running: ${test_name}${NC}"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ PASSED: ${test_name}${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAILED: ${test_name}${NC}"
        ((TESTS_FAILED++))
    fi
    echo ""
}

# Check if dev server is running
echo "Checking if dev server is running..."
if curl -s http://localhost:5173/ > /dev/null; then
    echo -e "${GREEN}✅ Dev server is running${NC}"
else
    echo -e "${RED}❌ Dev server is not running${NC}"
    echo "Please start the dev server with: npm run dev"
    exit 1
fi
echo ""

# 1. Run Playwright performance tests
echo "📊 Test 1: Navigation Performance Tests"
echo "----------------------------------------"
run_test "Navigation times < 500ms" \
    "npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g 'Navigation times' --reporter=line"

echo "📊 Test 2: Login Performance Test"
echo "----------------------------------------"
run_test "Login < 2 seconds" \
    "npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g 'Login flow' --reporter=line"

echo "📊 Test 3: Track Application Page Performance"
echo "----------------------------------------"
run_test "Track application page < 1 second" \
    "npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g 'Track application page' --reporter=line"

echo "📊 Test 4: Core Web Vitals"
echo "----------------------------------------"
run_test "Core Web Vitals check" \
    "npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g 'Core Web Vitals' --reporter=line"

echo "📊 Test 5: Code Splitting Verification"
echo "----------------------------------------"
run_test "Bundle size optimization" \
    "npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g 'Bundle size' --reporter=line"

echo "📊 Test 6: React Query Caching"
echo "----------------------------------------"
run_test "Caching reduces redundant requests" \
    "npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g 'caching' --reporter=line"

echo "📊 Test 7: Service Worker"
echo "----------------------------------------"
run_test "Service worker active" \
    "npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g 'Service worker' --reporter=line"

# 2. Run Lighthouse audit (if lighthouse is installed)
echo "📊 Test 8: Lighthouse Performance Audit"
echo "----------------------------------------"
if command -v lighthouse &> /dev/null; then
    run_test "Lighthouse score > 90" \
        "node scripts/lighthouse-audit.js"
else
    echo -e "${YELLOW}⚠️  Lighthouse not installed, skipping full audit${NC}"
    echo "   Install with: npm install -g lighthouse"
    run_test "Lighthouse metrics check" \
        "npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g 'Lighthouse' --reporter=line"
fi

# Summary
echo ""
echo "=============================================="
echo "📈 VERIFICATION SUMMARY"
echo "=============================================="
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All Phase 2 performance requirements verified!${NC}"
    echo ""
    echo "✅ Navigation times < 500ms"
    echo "✅ Login < 2 seconds"
    echo "✅ Track application page < 1 second"
    echo "✅ Lighthouse score > 90 (or metrics meet targets)"
    echo ""
    echo "Phase 2 checkpoint: PASSED ✅"
    exit 0
else
    echo -e "${RED}⚠️  Some performance requirements not met${NC}"
    echo ""
    echo "Please review the failed tests above and:"
    echo "1. Check if optimizations are properly implemented"
    echo "2. Verify code splitting is working"
    echo "3. Ensure React Query caching is configured"
    echo "4. Review bundle sizes and lazy loading"
    echo ""
    echo "Phase 2 checkpoint: FAILED ❌"
    exit 1
fi
