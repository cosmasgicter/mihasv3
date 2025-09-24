#!/bin/bash

# MIHAS API Testing Script using curl
# Tests all API endpoints with both student and admin credentials

set -e

# Configuration
BASE_URL="http://localhost:8888/.netlify/functions"
STUDENT_EMAIL="cosmaskanchepa8@gmail.com"
STUDENT_PASSWORD="Beanola2025"
ADMIN_EMAIL="cosmas@beanola.com"
ADMIN_PASSWORD="Beanola2025"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    ((PASSED_TESTS++))
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((FAILED_TESTS++))
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local headers="$5"
    local expected_status="$6"
    
    ((TOTAL_TESTS++))
    log_info "Testing: $name"
    
    local curl_cmd="curl -s -w '%{http_code}' -X $method"
    
    if [ ! -z "$headers" ]; then
        curl_cmd="$curl_cmd $headers"
    fi
    
    if [ ! -z "$data" ]; then
        curl_cmd="$curl_cmd -d '$data'"
    fi
    
    curl_cmd="$curl_cmd '$BASE_URL$endpoint'"
    
    local response=$(eval $curl_cmd)
    local status_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$status_code" = "$expected_status" ]; then
        log_success "$name - Status: $status_code"
        if [ ! -z "$body" ] && [ "$body" != "null" ]; then
            echo "Response: ${body:0:200}..."
        fi
    else
        log_error "$name - Expected: $expected_status, Got: $status_code"
        if [ ! -z "$body" ]; then
            echo "Response: $body"
        fi
    fi
    
    echo "---"
}

# Authentication function
authenticate() {
    local email="$1"
    local password="$2"
    local user_type="$3"
    
    log_info "Authenticating $user_type: $email"
    
    local auth_data="{\"email\":\"$email\",\"password\":\"$password\"}"
    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$auth_data" \
        "$BASE_URL/auth-login")
    
    local token=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    
    if [ ! -z "$token" ]; then
        log_success "$user_type authentication successful"
        echo "$token"
    else
        log_error "$user_type authentication failed"
        echo "Response: $response"
        echo ""
    fi
}

# Main testing function
run_tests() {
    log_info "Starting MIHAS API Testing..."
    log_info "Base URL: $BASE_URL"
    echo "=================================="
    
    # Test 1: Health Check
    test_endpoint "Health Check" "GET" "/health" "" "" "200"
    
    # Test 2: Test Endpoint
    test_endpoint "Test Endpoint" "GET" "/test" "" "" "200"
    
    # Test 3: Student Authentication
    STUDENT_TOKEN=$(authenticate "$STUDENT_EMAIL" "$STUDENT_PASSWORD" "Student")
    
    # Test 4: Admin Authentication
    ADMIN_TOKEN=$(authenticate "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "Admin")
    
    # Test 5: Get Programs (Public)
    test_endpoint "Get Programs" "GET" "/catalog-programs" "" "" "200"
    
    # Test 6: Get Subjects (Public)
    test_endpoint "Get Subjects" "GET" "/catalog-subjects" "" "" "200"
    
    # Test 7: Get Intakes (Public)
    test_endpoint "Get Intakes" "GET" "/catalog-intakes" "" "" "200"
    
    # Test 8: Student Applications
    if [ ! -z "$STUDENT_TOKEN" ]; then
        test_endpoint "Student Applications" "GET" "/applications" "" "-H 'Authorization: Bearer $STUDENT_TOKEN'" "200"
    else
        log_warning "Skipping Student Applications - No token"
        ((TOTAL_TESTS++))
    fi
    
    # Test 9: Admin Applications
    if [ ! -z "$ADMIN_TOKEN" ]; then
        test_endpoint "Admin Applications" "GET" "/applications" "" "-H 'Authorization: Bearer $ADMIN_TOKEN'" "200"
    else
        log_warning "Skipping Admin Applications - No token"
        ((TOTAL_TESTS++))
    fi
    
    # Test 10: Admin Dashboard
    if [ ! -z "$ADMIN_TOKEN" ]; then
        test_endpoint "Admin Dashboard" "GET" "/admin-dashboard" "" "-H 'Authorization: Bearer $ADMIN_TOKEN'" "200"
    else
        log_warning "Skipping Admin Dashboard - No token"
        ((TOTAL_TESTS++))
    fi
    
    # Test 11: Analytics Telemetry
    if [ ! -z "$ADMIN_TOKEN" ]; then
        test_endpoint "Analytics Telemetry" "GET" "/analytics-telemetry" "" "-H 'Authorization: Bearer $ADMIN_TOKEN'" "200"
    else
        log_warning "Skipping Analytics Telemetry - No token"
        ((TOTAL_TESTS++))
    fi
    
    # Test 12: User Consents
    if [ ! -z "$STUDENT_TOKEN" ]; then
        test_endpoint "User Consents" "GET" "/user-consents" "" "-H 'Authorization: Bearer $STUDENT_TOKEN'" "200"
    else
        log_warning "Skipping User Consents - No token"
        ((TOTAL_TESTS++))
    fi
    
    # Test 13: Push Subscriptions
    if [ ! -z "$STUDENT_TOKEN" ]; then
        test_endpoint "Push Subscriptions" "GET" "/push-subscriptions" "" "-H 'Authorization: Bearer $STUDENT_TOKEN'" "200"
    else
        log_warning "Skipping Push Subscriptions - No token"
        ((TOTAL_TESTS++))
    fi
    
    # Test 14: Audit Log Stats
    if [ ! -z "$ADMIN_TOKEN" ]; then
        test_endpoint "Audit Log Stats" "GET" "/admin-audit-log-stats" "" "-H 'Authorization: Bearer $ADMIN_TOKEN'" "200"
    else
        log_warning "Skipping Audit Log Stats - No token"
        ((TOTAL_TESTS++))
    fi
    
    # Test 15: Send Notification
    if [ ! -z "$STUDENT_TOKEN" ]; then
        local notification_data="{\"type\":\"test\",\"message\":\"API test notification\",\"recipient\":\"$STUDENT_EMAIL\"}"
        test_endpoint "Send Notification" "POST" "/notifications-send" "$notification_data" "-H 'Content-Type: application/json' -H 'Authorization: Bearer $STUDENT_TOKEN'" "200"
    else
        log_warning "Skipping Send Notification - No token"
        ((TOTAL_TESTS++))
    fi
    
    # Summary
    echo "=================================="
    log_info "TEST SUMMARY"
    log_info "Total Tests: $TOTAL_TESTS"
    log_success "Passed: $PASSED_TESTS"
    log_error "Failed: $FAILED_TESTS"
    
    local success_rate=$(( (PASSED_TESTS * 100) / TOTAL_TESTS ))
    log_info "Success Rate: ${success_rate}%"
    
    if [ $FAILED_TESTS -gt 0 ]; then
        exit 1
    else
        log_success "All tests passed!"
        exit 0
    fi
}

# Check if curl is available
if ! command -v curl &> /dev/null; then
    log_error "curl is required but not installed"
    exit 1
fi

# Run the tests
run_tests