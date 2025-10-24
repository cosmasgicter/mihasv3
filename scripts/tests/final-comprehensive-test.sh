#!/bin/bash

# MIHAS Final Comprehensive Test
# Tests all functions with live credentials using curl

set -e

echo "🚀 MIHAS Final Comprehensive Function Test"
echo "=========================================="
echo "🌐 Base URL: https://mihasv3.pages.dev"
echo "👤 Admin: cosmas@beanola.com"
echo "📅 Started: $(date)"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TOTAL=0
PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local path="$1"
    local method="${2:-GET}"
    local description="$3"
    local auth_header="$4"
    
    echo -e "${BLUE}🧪 Testing: $method $path - $description${NC}"
    TOTAL=$((TOTAL + 1))
    
    local curl_cmd="curl -s -w 'HTTPSTATUS:%{http_code}' -X $method"
    
    if [ -n "$auth_header" ]; then
        curl_cmd="$curl_cmd -H 'Authorization: $auth_header'"
    fi
    
    if [ "$method" = "POST" ] && [[ ! "$path" =~ auth ]]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '{\"test\":true}'"
    fi
    
    curl_cmd="$curl_cmd 'https://mihasv3.pages.dev$path'"
    
    local output
    output=$(eval "$curl_cmd" 2>/dev/null || echo "HTTPSTATUS:000")
    
    local status
    status=$(echo "$output" | grep -o 'HTTPSTATUS:[0-9]*' | cut -d: -f2)
    local body
    body=$(echo "$output" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    if [ "$status" -ge 200 ] && [ "$status" -lt 400 ]; then
        PASSED=$((PASSED + 1))
        echo -e "   ${GREEN}✅ PASSED ($status) - ${#body} bytes${NC}"
    else
        FAILED=$((FAILED + 1))
        echo -e "   ${RED}❌ FAILED ($status)${NC}"
        if [ ${#body} -lt 200 ] && [ -n "$body" ]; then
            echo "   Response: ${body:0:100}..."
        fi
    fi
    echo ""
}

# Step 1: Test public endpoints
echo -e "${YELLOW}📋 STEP 1: Public Endpoints${NC}"
echo "----------------------------"

test_endpoint "/health" "GET" "System health check"
test_endpoint "/test" "GET" "Basic test endpoint"
test_endpoint "/test-live" "GET" "Live test endpoint"
test_endpoint "/catalog/programs" "GET" "Program catalog"
test_endpoint "/catalog/intakes" "GET" "Intake periods"
test_endpoint "/catalog/subjects" "GET" "Subject catalog"
test_endpoint "/analytics/telemetry" "GET" "System telemetry"

# Step 2: Get admin authentication token
echo -e "${YELLOW}📋 STEP 2: Authentication${NC}"
echo "--------------------------"

echo "🔐 Authenticating admin user..."

ADMIN_TOKEN=""
AUTH_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw" \
  -d '{"email":"cosmas@beanola.com","password":"Beanola2025"}' \
  "https://mylgegkqoddcrxtwcclb.supabase.co/auth/v1/token?grant_type=password" 2>/dev/null)

if echo "$AUTH_RESPONSE" | grep -q "access_token"; then
    ADMIN_TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    echo -e "   ${GREEN}✅ Admin authenticated successfully${NC}"
    echo "   Token: ${ADMIN_TOKEN:0:20}..."
else
    echo -e "   ${RED}❌ Admin authentication failed${NC}"
    echo "   Response: ${AUTH_RESPONSE:0:200}..."
fi

echo ""

# Step 3: Test authenticated endpoints
if [ -n "$ADMIN_TOKEN" ]; then
    echo -e "${YELLOW}📋 STEP 3: Authenticated Endpoints${NC}"
    echo "-----------------------------------"
    
    test_endpoint "/applications" "GET" "Application list" "Bearer $ADMIN_TOKEN"
    test_endpoint "/applications/details" "GET" "Application details" "Bearer $ADMIN_TOKEN"
    test_endpoint "/applications/summary" "GET" "Application summary" "Bearer $ADMIN_TOKEN"
    test_endpoint "/admin/dashboard" "GET" "Admin dashboard" "Bearer $ADMIN_TOKEN"
    test_endpoint "/admin/users" "GET" "User management" "Bearer $ADMIN_TOKEN"
    test_endpoint "/notifications" "GET" "Notifications" "Bearer $ADMIN_TOKEN"
    test_endpoint "/analytics/metrics" "GET" "Analytics metrics" "Bearer $ADMIN_TOKEN"
    
    echo -e "${YELLOW}📋 STEP 4: POST Endpoints${NC}"
    echo "-------------------------"
    
    test_endpoint "/send-email" "POST" "Email service" "Bearer $ADMIN_TOKEN"
    test_endpoint "/generate/pdf" "POST" "PDF generation" "Bearer $ADMIN_TOKEN"
    test_endpoint "/documents/upload" "POST" "Document upload" "Bearer $ADMIN_TOKEN"
    test_endpoint "/applications/generate/slip" "POST" "Generate application slip" "Bearer $ADMIN_TOKEN"
    test_endpoint "/notifications/send" "POST" "Send notification" "Bearer $ADMIN_TOKEN"
    
else
    echo -e "${RED}⚠️ STEP 3: Skipped - Admin authentication failed${NC}"
    echo ""
fi

# Step 4: Test auth endpoints (these will likely fail without proper payload)
echo -e "${YELLOW}📋 STEP 5: Auth Endpoints (Expected to fail without proper payload)${NC}"
echo "----------------------------------------------------------------"

test_endpoint "/auth/signin" "POST" "User signin"
test_endpoint "/auth/signup" "POST" "User signup"
test_endpoint "/auth/login" "POST" "User login"

# Final results
echo -e "${BLUE}📊 FINAL RESULTS:${NC}"
echo "================="
echo "⏱️  Test Duration: $(date)"
echo "📈 Total Tests: $TOTAL"
echo -e "✅ Passed: ${GREEN}$PASSED${NC}"
echo -e "❌ Failed: ${RED}$FAILED${NC}"

if [ $TOTAL -gt 0 ]; then
    SUCCESS_RATE=$(( (PASSED * 100) / TOTAL ))
    echo "📊 Success Rate: $SUCCESS_RATE%"
else
    SUCCESS_RATE=0
fi

echo ""

# Recommendations
echo -e "${BLUE}🔧 RECOMMENDATIONS:${NC}"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! System is functioning correctly.${NC}"
    echo -e "${GREEN}🚀 Ready for production use.${NC}"
elif [ -z "$ADMIN_TOKEN" ]; then
    echo -e "${RED}🔐 Fix admin authentication first - this is blocking most functionality.${NC}"
    echo -e "${YELLOW}📋 Check admin credentials and Supabase auth configuration.${NC}"
elif [ $SUCCESS_RATE -ge 70 ]; then
    echo -e "${YELLOW}⚠️ Most tests passed with some issues.${NC}"
    echo -e "${YELLOW}🔍 Review failed tests and fix before full deployment.${NC}"
else
    echo -e "${RED}❌ Significant issues detected.${NC}"
    echo -e "${RED}🛠️ Fix critical issues before deployment.${NC}"
fi

echo ""
echo -e "${BLUE}📋 NEXT STEPS:${NC}"
echo "1. Fix authentication issues if any"
echo "2. Review and fix failed endpoints"
echo "3. Commit and push changes"
echo "4. Re-run tests to verify fixes"

echo ""
echo -e "${BLUE}🎯 SYSTEM STATUS:${NC}"
if [ $SUCCESS_RATE -ge 80 ]; then
    echo -e "${GREEN}🟢 SYSTEM OPERATIONAL - Ready for production${NC}"
elif [ $SUCCESS_RATE -ge 60 ]; then
    echo -e "${YELLOW}🟡 SYSTEM FUNCTIONAL - Minor issues to address${NC}"
else
    echo -e "${RED}🔴 SYSTEM NEEDS ATTENTION - Critical issues present${NC}"
fi

# Save results to file
RESULTS_FILE="/home/cosmas/Documents/Visual Code/mihasv3/archive/test-results/final-comprehensive-test-results.txt"
{
    echo "MIHAS Final Comprehensive Test Results"
    echo "======================================"
    echo "Date: $(date)"
    echo "Total Tests: $TOTAL"
    echo "Passed: $PASSED"
    echo "Failed: $FAILED"
    echo "Success Rate: $SUCCESS_RATE%"
    echo "Admin Auth: $([ -n "$ADMIN_TOKEN" ] && echo "Success" || echo "Failed")"
} > "$RESULTS_FILE"

echo ""
echo "💾 Results saved to: $RESULTS_FILE"

# Exit with appropriate code
exit $([ $FAILED -eq 0 ] && echo 0 || echo 1)