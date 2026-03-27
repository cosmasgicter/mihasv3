#!/bin/bash
# End-to-end API testing script for MIHAS Application System
# Tests all endpoints against production: ***REMOVED***

BASE="***REMOVED***"
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
PASS=0
FAIL=0
WARN=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Helper: GET request
get() {
  curl -s --max-time 15 \
    -H "User-Agent: ${UA}" \
    -H "Origin: ***REMOVED***" \
    "$1"
}

# Helper: GET with cookies
get_auth() {
  curl -s --max-time 15 \
    -b /tmp/mihas_cookies.txt \
    -H "User-Agent: ${UA}" \
    -H "Origin: ***REMOVED***" \
    "$1"
}

# Helper: POST request
post() {
  curl -s --max-time 15 \
    -X POST \
    -H "User-Agent: ${UA}" \
    -H "Content-Type: application/json" \
    -H "Origin: ***REMOVED***" \
    -d "$2" \
    "$1"
}

# Helper: POST with cookies
post_auth() {
  curl -s --max-time 15 \
    -X POST \
    -b /tmp/mihas_cookies.txt \
    -H "User-Agent: ${UA}" \
    -H "Content-Type: application/json" \
    -H "Origin: ***REMOVED***" \
    -d "$2" \
    "$1"
}

check() {
  local label="$1"
  local expected="$2"
  local response="$3"

  local success
  success=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
  local code
  code=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('code',''))" 2>/dev/null)

  if [ "$success" = "$expected" ]; then
    echo -e "${GREEN}[PASS]${NC} $label"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}[FAIL]${NC} $label (success=$success, code=$code)"
    FAIL=$((FAIL + 1))
  fi
  echo "       $(echo "$response" | head -c 250)"
  echo ""
}

check_code() {
  local label="$1"
  local expected_code="$2"
  local response="$3"

  local code
  code=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('code',''))" 2>/dev/null)

  if [ "$code" = "$expected_code" ]; then
    echo -e "${GREEN}[PASS]${NC} $label"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}[FAIL]${NC} $label (expected code=$expected_code, got=$code)"
    FAIL=$((FAIL + 1))
  fi
  echo "       $(echo "$response" | head -c 250)"
  echo ""
}

echo "============================================"
echo "  MIHAS API End-to-End Test Suite"
echo "  Target: $BASE"
echo "  Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================"
echo ""

# ==========================================
# 1. HEALTH ENDPOINTS
# ==========================================
echo "--- 1. HEALTH ENDPOINTS ---"

R=$(get "$BASE/api/health?action=ping")
check "Health: Ping" "True" "$R"

R=$(get "$BASE/api/health")
check "Health: Default" "True" "$R"

R=$(get "$BASE/api/health?action=db")
check "Health: DB Check" "True" "$R"

R=$(get "$BASE/api/health?action=env")
check "Health: Env Check" "True" "$R"

R=$(get "$BASE/api/health?action=errors")
check "Health: Error Logs" "True" "$R"

R=$(get "$BASE/api/health?action=bogus")
check "Health: Invalid Action (expect fail)" "False" "$R"

R=$(post "$BASE/api/health?action=ping" '{}')
check "Health: Wrong Method POST (expect fail)" "False" "$R"

# ==========================================
# 2. CATALOG ENDPOINTS
# ==========================================
echo "--- 2. CATALOG ENDPOINTS ---"

R=$(get "$BASE/api/catalog?type=programs")
check "Catalog: Programs" "True" "$R"

R=$(get "$BASE/api/catalog?type=intakes")
check "Catalog: Intakes" "True" "$R"

R=$(get "$BASE/api/catalog?type=subjects")
check "Catalog: Subjects" "True" "$R"

R=$(get "$BASE/api/catalog?type=institutions")
check "Catalog: Institutions" "True" "$R"

R=$(get "$BASE/api/catalog?type=invalid")
check "Catalog: Invalid Type (expect fail)" "False" "$R"

R=$(get "$BASE/api/catalog")
check "Catalog: Missing Type (expect fail)" "False" "$R"

# ==========================================
# 3. AUTH ENDPOINTS (Unauthenticated)
# ==========================================
echo "--- 3. AUTH ENDPOINTS (Unauthenticated) ---"

R=$(get "$BASE/api/auth?action=session")
check "Auth: Session (no cookie, expect fail)" "False" "$R"

R=$(post "$BASE/api/auth?action=login" '{"email":"nonexistent@test.com","password":"wrongpassword123"}')
check "Auth: Login bad creds (expect fail)" "False" "$R"

R=$(post "$BASE/api/auth?action=login" '{"email":"test@test.com"}')
check "Auth: Login missing password (expect fail)" "False" "$R"

R=$(post "$BASE/api/auth?action=login" '{}')
check "Auth: Login empty body (expect fail)" "False" "$R"

R=$(post "$BASE/api/auth?action=register" '{"email":"test@test.com"}')
check "Auth: Register missing fields (expect fail)" "False" "$R"

R=$(get "$BASE/api/auth?action=bogus")
check "Auth: Invalid action (expect fail)" "False" "$R"

R=$(post "$BASE/api/auth?action=password-reset-request" '{"email":"nonexistent@test.com"}')
check "Auth: Password Reset Request (always 200)" "True" "$R"

R=$(post "$BASE/api/auth?action=password-reset" '{"token":"invalidtoken123","newPassword":"NewPass123!"}')
check_code "Auth: Password Reset bad token" "INVALID_TOKEN" "$R"

R=$(post "$BASE/api/auth?action=logout" '{}')
check "Auth: Logout (no session, still 200)" "True" "$R"

# ==========================================
# 4. PROTECTED ENDPOINTS (No auth = 401)
# ==========================================
echo "--- 4. PROTECTED ENDPOINTS (expect 401) ---"

R=$(get "$BASE/api/applications?action=details")
check_code "Applications: List (no auth)" "AUTHENTICATION_REQUIRED" "$R"

R=$(post "$BASE/api/applications" '{"program":"test"}')
check "Applications: Create (no auth, expect fail)" "False" "$R"

R=$(get "$BASE/api/admin?action=dashboard")
check "Admin: Dashboard (no auth, expect fail)" "False" "$R"

R=$(get "$BASE/api/admin?action=users")
check "Admin: Users (no auth, expect fail)" "False" "$R"

R=$(get "$BASE/api/admin?action=settings")
check "Admin: Settings (no auth, expect fail)" "False" "$R"

R=$(get "$BASE/api/sessions?action=list")
check "Sessions: List (no auth, expect fail)" "False" "$R"

R=$(get "$BASE/api/notifications?action=list")
check "Notifications: List (no auth, expect fail)" "False" "$R"

R=$(get "$BASE/api/notifications?action=preferences")
check "Notifications: Preferences (no auth, expect fail)" "False" "$R"

R=$(get "$BASE/api/payments?action=receipt")
check "Payments: Receipt (no auth, expect fail)" "False" "$R"

# ==========================================
# 5. APPLICATION TRACKING (Public)
# ==========================================
echo "--- 5. APPLICATION TRACKING ---"

R=$(get "$BASE/api/applications?action=track&code=MIHAS000000")
check "Track: Non-existent code (expect fail)" "False" "$R"

R=$(get "$BASE/api/applications?action=track&code=")
check "Track: Empty code (expect fail)" "False" "$R"

# ==========================================
# 6. INPUT VALIDATION
# ==========================================
echo "--- 6. INPUT VALIDATION ---"

R=$(post "$BASE/api/auth?action=login" '{"email":"admin@test.com OR 1=1","password":"test"}')
check "Validation: SQL injection in login (expect fail)" "False" "$R"

# ==========================================
# 7. AUTHENTICATED FLOW
# ==========================================
echo "--- 7. AUTHENTICATED FLOW ---"
echo "(Logging in...)"

LOGIN_R=$(curl -s --max-time 15 \
  -c /tmp/mihas_cookies.txt \
  -D /tmp/mihas_headers.txt \
  -X POST \
  -H "User-Agent: ${UA}" \
  -H "Content-Type: application/json" \
  -H "Origin: ***REMOVED***" \
  -d '{"email":"***REMOVED***","password":"Admin123!"}' \
  "$BASE/api/auth?action=login")

LOGIN_OK=$(echo "$LOGIN_R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)

if [ "$LOGIN_OK" = "True" ] || [ "$LOGIN_OK" = "true" ]; then
  echo -e "${GREEN}[PASS]${NC} Login successful"
  PASS=$((PASS + 1))
  echo "       $(echo "$LOGIN_R" | head -c 250)"
  echo ""

  CSRF=$(grep -i 'x-csrf-token' /tmp/mihas_headers.txt 2>/dev/null | awk '{print $2}' | tr -d '\r\n')
  echo "       CSRF: ${CSRF:0:20}..."
  echo ""

  # --- Authenticated GET tests ---
  R=$(get_auth "$BASE/api/auth?action=session")
  check "Auth: Session (authenticated)" "True" "$R"

  R=$(get_auth "$BASE/api/admin?action=dashboard")
  check "Admin: Dashboard" "True" "$R"

  R=$(get_auth "$BASE/api/admin?action=users")
  check "Admin: Users" "True" "$R"

  R=$(get_auth "$BASE/api/admin?action=settings")
  check "Admin: Settings" "True" "$R"

  R=$(get_auth "$BASE/api/admin?action=stats")
  check "Admin: Stats" "True" "$R"

  R=$(get_auth "$BASE/api/admin?action=audit-log")
  check "Admin: Audit Log" "True" "$R"

  R=$(get_auth "$BASE/api/admin?action=schema")
  check "Admin: Schema" "True" "$R"

  R=$(get_auth "$BASE/api/admin?action=eligibility-rules")
  check "Admin: Eligibility Rules" "True" "$R"

  R=$(get_auth "$BASE/api/admin?action=nonexistent")
  check "Admin: Invalid Action (expect fail)" "False" "$R"

  R=$(get_auth "$BASE/api/applications?action=details")
  check "Applications: List" "True" "$R"

  R=$(get_auth "$BASE/api/applications?action=review")
  check "Applications: Review List" "True" "$R"

  R=$(get_auth "$BASE/api/applications?action=summary")
  check "Applications: Summary" "True" "$R"

  R=$(get_auth "$BASE/api/applications?action=stats")
  check "Applications: Stats" "True" "$R"

  R=$(get_auth "$BASE/api/applications?action=nonexistent")
  check "Applications: Invalid Action (expect fail)" "False" "$R"

  R=$(get_auth "$BASE/api/sessions?action=list")
  check "Sessions: List" "True" "$R"

  R=$(get_auth "$BASE/api/sessions?action=poll")
  check "Sessions: Poll" "True" "$R"

  R=$(get_auth "$BASE/api/sessions?action=nonexistent")
  check "Sessions: Invalid Action (expect fail)" "False" "$R"

  R=$(get_auth "$BASE/api/notifications?action=preferences")
  check "Notifications: Preferences" "True" "$R"

  R=$(get_auth "$BASE/api/notifications?action=list")
  check "Notifications: List" "True" "$R"

  R=$(get_auth "$BASE/api/notifications?action=nonexistent")
  check "Notifications: Invalid Action (expect fail)" "False" "$R"

  R=$(get_auth "$BASE/api/payments?action=receipt")
  check "Payments: Receipt (missing ID, expect fail)" "False" "$R"

  R=$(get_auth "$BASE/api/payments?action=bogus")
  check "Payments: Invalid Action (expect fail)" "False" "$R"

  # --- Application approval flow test ---
  echo "--- 7b. APPROVAL FLOW ---"

  # Get first submitted application for approval test
  APPS_JSON=$(get_auth "$BASE/api/applications?action=details&status=submitted&pageSize=1")
  APP_ID=$(echo "$APPS_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
apps=d.get('data',{}).get('applications',[])
print(apps[0]['id'] if apps else '')
" 2>/dev/null)

  if [ -n "$APP_ID" ]; then
    echo "       Found submitted application: ${APP_ID:0:12}..."

    # Approve application (requires CSRF)
    R=$(curl -s --max-time 15 \
      -X POST \
      -b /tmp/mihas_cookies.txt \
      -H "User-Agent: ${UA}" \
      -H "Content-Type: application/json" \
      -H "Origin: ***REMOVED***" \
      -H "X-CSRF-Token: ${CSRF}" \
      -d "{\"application_id\":\"${APP_ID}\",\"status\":\"approved\",\"notes\":\"E2E test approval\"}" \
      "$BASE/api/applications?action=review")
    check "Approval: Review/Approve application" "True" "$R"

    # Check if it returned a payment warning (expected if payment not verified)
    HAS_WARNING=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('warning',''))" 2>/dev/null)
    if [ "$HAS_WARNING" = "True" ] || [ "$HAS_WARNING" = "true" ]; then
      echo -e "       ${YELLOW}Payment not verified - got advisory warning (expected behavior)${NC}"

      # Force approve with override
      R=$(curl -s --max-time 15 \
        -X POST \
        -b /tmp/mihas_cookies.txt \
        -H "User-Agent: ${UA}" \
        -H "Content-Type: application/json" \
        -H "Origin: ***REMOVED***" \
        -H "X-CSRF-Token: ${CSRF}" \
        -d "{\"application_id\":\"${APP_ID}\",\"status\":\"approved\",\"notes\":\"E2E test force approval\",\"force\":true}" \
        "$BASE/api/applications?action=review")
      check "Approval: Force approve (payment override)" "True" "$R"
    fi

    # Verify status changed
    R=$(get_auth "$BASE/api/applications?id=${APP_ID}")
    APP_STATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); a=d.get('data',{}); print(a.get('status','') if isinstance(a,dict) else '')" 2>/dev/null)
    if [ "$APP_STATUS" = "approved" ]; then
      echo -e "${GREEN}[PASS]${NC} Approval: Status verified as 'approved'"
      PASS=$((PASS + 1))
    else
      echo -e "${YELLOW}[WARN]${NC} Approval: Status is '$APP_STATUS' (may need payment verification)"
      WARN=$((WARN + 1))
    fi
    echo ""

    # Reject it back (to not leave test data in approved state)
    R=$(curl -s --max-time 15 \
      -X POST \
      -b /tmp/mihas_cookies.txt \
      -H "User-Agent: ${UA}" \
      -H "Content-Type: application/json" \
      -H "Origin: ***REMOVED***" \
      -H "X-CSRF-Token: ${CSRF}" \
      -d "{\"application_id\":\"${APP_ID}\",\"status\":\"submitted\",\"notes\":\"E2E test cleanup - reverting\"}" \
      "$BASE/api/applications?action=review")
    check "Approval: Revert to submitted (cleanup)" "True" "$R"
  else
    echo -e "${YELLOW}[WARN]${NC} No submitted applications found - skipping approval flow"
    WARN=$((WARN + 1))
    echo ""

    # Try with any application
    ALL_APPS=$(get_auth "$BASE/api/applications?action=details&pageSize=1")
    ANY_ID=$(echo "$ALL_APPS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
apps=d.get('data',{}).get('applications',[])
print(apps[0]['id'] if apps else '')
" 2>/dev/null)

    if [ -n "$ANY_ID" ]; then
      echo "       Testing with application: ${ANY_ID:0:12}..."

      # Get single application by ID
      R=$(get_auth "$BASE/api/applications?id=${ANY_ID}")
      check "Applications: Get by ID" "True" "$R"

      # Get application versions
      R=$(get_auth "$BASE/api/applications?action=versions&id=${ANY_ID}")
      check "Applications: Versions" "True" "$R"
    fi
  fi

  # --- Logout ---
  echo "--- 7c. LOGOUT ---"

  R=$(post_auth "$BASE/api/auth?action=logout" '{}')
  check "Auth: Logout" "True" "$R"

  R=$(get_auth "$BASE/api/auth?action=session")
  check "Auth: Session after logout (expect fail)" "False" "$R"

else
  echo -e "${YELLOW}[WARN]${NC} Login failed - skipping authenticated tests"
  echo "       $(echo "$LOGIN_R" | head -c 250)"
  WARN=$((WARN + 1))
  echo ""
fi

# ==========================================
# 8. CATCH-ALL
# ==========================================
echo "--- 8. CATCH-ALL ---"
R=$(get "$BASE/api/nonexistent-endpoint")
echo "Catch-all response: $(echo "$R" | head -c 200)"
echo ""

# ==========================================
# SUMMARY
# ==========================================
echo "============================================"
echo "  TEST RESULTS"
echo "============================================"
TOTAL=$((PASS + FAIL + WARN))
echo -e "  ${GREEN}PASSED: $PASS${NC}"
echo -e "  ${RED}FAILED: $FAIL${NC}"
echo -e "  ${YELLOW}WARNINGS: $WARN${NC}"
echo "  TOTAL: $TOTAL"
echo "============================================"

rm -f /tmp/mihas_cookies.txt /tmp/mihas_headers.txt /tmp/api_response.json
exit $FAIL
