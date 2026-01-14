#!/bin/bash

# Phase 2 Performance Verification Script
# Runs performance tests and generates a report

set -e

echo "======================================================================"
echo "MIHAS Phase 2 Performance Verification"
echo "======================================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if dev server is running
echo -e "${BLUE}Checking if dev server is running...${NC}"
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Dev server is running${NC}"
else
    echo -e "${YELLOW}⚠ Dev server not detected${NC}"
    echo -e "${BLUE}Starting dev server...${NC}"
    npm run dev &
    DEV_SERVER_PID=$!
    
    # Wait for server to start
    echo "Waiting for server to start..."
    for i in {1..30}; do
        if curl -s http://localhost:5173 > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Dev server started${NC}"
            break
        fi
        sleep 1
    done
fi

echo ""
echo "======================================================================"
echo "Running Performance Tests"
echo "======================================================================"
echo ""

# Run Playwright performance tests
npx playwright test tests/performance/phase2-verification.spec.ts --reporter=list

TEST_EXIT_CODE=$?

# Kill dev server if we started it
if [ ! -z "$DEV_SERVER_PID" ]; then
    echo ""
    echo -e "${BLUE}Stopping dev server...${NC}"
    kill $DEV_SERVER_PID 2>/dev/null || true
fi

echo ""
echo "======================================================================"
echo "Performance Verification Complete"
echo "======================================================================"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ All performance tests passed!${NC}"
    echo ""
    echo "Phase 2 performance optimizations are working correctly:"
    echo "  ✓ Navigation times < 500ms"
    echo "  ✓ Track application page < 1 second"
    echo "  ✓ Code splitting is working"
    echo "  ✓ Caching is effective"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some performance tests failed${NC}"
    echo ""
    echo "Please review the test output above for details."
    echo ""
    exit 1
fi
