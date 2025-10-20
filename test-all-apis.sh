#!/bin/bash

echo "=========================================="
echo "MIHAS API Complete Test Suite"
echo "=========================================="
echo ""

# Admin credentials
ADMIN_EMAIL="cosmas@beanola.com"
ADMIN_PASS="Beanola2025"

# Student credentials
STUDENT_EMAIL="cosmaskanchepa8@gmail.com"
STUDENT_PASS="Beanola2025"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

test_endpoint() {
    local name=$1
    local url=$2
    local token=$3
    local expected=$4
    
    if [ -z "$token" ]; then
        response=$(curl -s "$url")
    else
        response=$(curl -s "$url" -H "Authorization: Bearer $token")
    fi
    
    if echo "$response" | grep -q "$expected"; then
        echo -e "${GREEN}✅ $name${NC}"
    else
        echo -e "${RED}❌ $name${NC}"
        echo "   Response: $response" | head -c 200
    fi
}

# 1. PUBLIC ENDPOINTS
echo "=== PUBLIC ENDPOINTS ==="
test_endpoint "Health Check" "***REMOVED***/health" "" "ok"
test_endpoint "Programs Catalog" "***REMOVED***/catalog/programs" "" "Nursing"
test_endpoint "Intakes Catalog" "***REMOVED***/catalog/intakes" "" "2025"
echo ""

# 2. AUTHENTICATION
echo "=== AUTHENTICATION ==="
ADMIN_TOKEN=$(curl -s -X POST ***REMOVED***/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['session']['access_token'])" 2>/dev/null)

if [ -n "$ADMIN_TOKEN" ]; then
    echo -e "${GREEN}✅ Admin Login${NC}"
else
    echo -e "${RED}❌ Admin Login${NC}"
fi

STUDENT_TOKEN=$(curl -s -X POST ***REMOVED***/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASS\"}" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['session']['access_token'])" 2>/dev/null)

if [ -n "$STUDENT_TOKEN" ]; then
    echo -e "${GREEN}✅ Student Login${NC}"
else
    echo -e "${RED}❌ Student Login${NC}"
fi
echo ""

# 3. ADMIN ENDPOINTS
echo "=== ADMIN ENDPOINTS ==="
test_endpoint "Admin Dashboard" "***REMOVED***/admin/dashboard" "$ADMIN_TOKEN" "stats"
test_endpoint "Admin Users" "***REMOVED***/admin/users" "$ADMIN_TOKEN" "data"
test_endpoint "Admin Applications" "***REMOVED***/applications" "$ADMIN_TOKEN" "applications"
echo ""

# 4. STUDENT ENDPOINTS
echo "=== STUDENT ENDPOINTS ==="
test_endpoint "Student Applications" "***REMOVED***/applications" "$STUDENT_TOKEN" "applications"
test_endpoint "Student Notifications" "***REMOVED***/notifications" "$STUDENT_TOKEN" "notifications"
echo ""

# 5. CATALOG ENDPOINTS (with auth)
echo "=== CATALOG ENDPOINTS (Authenticated) ==="
test_endpoint "Programs (Auth)" "***REMOVED***/catalog/programs" "$STUDENT_TOKEN" "Nursing"
test_endpoint "Intakes (Auth)" "***REMOVED***/catalog/intakes" "$STUDENT_TOKEN" "2025"
test_endpoint "Subjects" "***REMOVED***/catalog/subjects" "$STUDENT_TOKEN" "subject"
echo ""

# 6. DETAILED RESULTS
echo "=== DETAILED RESULTS ==="
echo "Admin Dashboard:"
curl -s "***REMOVED***/admin/dashboard" -H "Authorization: Bearer $ADMIN_TOKEN" | \
  python3 -c "import sys,json; r=json.load(sys.stdin); print(f\"  Apps: {r['stats']['totalApplications']}, Programs: {r['stats']['totalPrograms']}, Users: {r['stats']['totalStudents']}\")" 2>/dev/null

echo "Admin Users:"
curl -s "***REMOVED***/admin/users" -H "Authorization: Bearer $ADMIN_TOKEN" | \
  python3 -c "import sys,json; r=json.load(sys.stdin); print(f\"  Total: {len(r['data'])} users\")" 2>/dev/null

echo "Programs:"
curl -s "***REMOVED***/catalog/programs" | \
  python3 -c "import sys,json; r=json.load(sys.stdin); print(f\"  Total: {len(r)} programs\")" 2>/dev/null

echo "Intakes:"
curl -s "***REMOVED***/catalog/intakes" | \
  python3 -c "import sys,json; r=json.load(sys.stdin); print(f\"  Total: {len(r)} intakes\")" 2>/dev/null

echo ""
echo "=========================================="
echo "Test Suite Complete"
echo "=========================================="
