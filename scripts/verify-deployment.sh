#!/bin/bash

# Cloudflare Pages Deployment Verification Script
# Run this after deploying to verify everything is working

set -e

echo "=================================="
echo "Cloudflare Deployment Verification"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${VITE_APP_BASE_URL:-https://mihasv3.pages.dev}"

echo "Testing deployment at: $BASE_URL"
echo ""

# Function to test endpoint
test_endpoint() {
    local name=$1
    local path=$2
    local expected_status=$3
    
    echo -n "Testing $name... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path" || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $response)"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $response, expected $expected_status)"
        return 1
    fi
}

# Track results
passed=0
failed=0

# Test critical endpoints
echo "Testing Critical Endpoints:"
echo "----------------------------"

if test_endpoint "Homepage" "/" "200"; then
    ((passed++))
else
    ((failed++))
fi

if test_endpoint "Health Check" "/health" "200"; then
    ((passed++))
else
    ((failed++))
fi

if test_endpoint "Manifest" "/manifest.json" "200"; then
    ((passed++))
else
    ((failed++))
fi

if test_endpoint "Service Worker" "/sw.js" "200"; then
    ((passed++))
else
    ((failed++))
fi

if test_endpoint "Robots.txt" "/robots.txt" "200"; then
    ((passed++))
else
    ((failed++))
fi

echo ""
echo "Testing Static Assets:"
echo "----------------------"

if test_endpoint "Favicon" "/favicon.ico" "200"; then
    ((passed++))
else
    ((failed++))
fi

echo ""
echo "Results:"
echo "--------"
echo -e "Passed: ${GREEN}$passed${NC}"
echo -e "Failed: ${RED}$failed${NC}"
echo ""

# Check for Cloudflare headers
echo "Checking Cloudflare Integration:"
echo "--------------------------------"

cf_ray=$(curl -s -I "$BASE_URL" | grep -i "cf-ray" || echo "")
if [ -n "$cf_ray" ]; then
    echo -e "${GREEN}✓${NC} Cloudflare CDN detected"
    echo "  $cf_ray"
else
    echo -e "${YELLOW}⚠${NC} Cloudflare CDN not detected"
fi

echo ""

# Run Node.js tests if available
if command -v node &> /dev/null; then
    echo "Running Detailed Tests:"
    echo "-----------------------"
    
    if [ -f "scripts/test-cloudflare-deployment.js" ]; then
        node scripts/test-cloudflare-deployment.js
    else
        echo -e "${YELLOW}⚠${NC} Detailed test script not found"
    fi
fi

# Exit with appropriate code
if [ $failed -gt 0 ]; then
    echo ""
    echo -e "${RED}Deployment verification FAILED${NC}"
    exit 1
else
    echo ""
    echo -e "${GREEN}Deployment verification PASSED${NC}"
    exit 0
fi
