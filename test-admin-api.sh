#!/bin/bash

echo "=== Testing Admin API Endpoints ==="
echo ""

# Get token
echo "1. Getting JWT token..."
RESPONSE=$(curl -s -X POST https://apply.mihas.edu.zm/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cosmas@beanola.com","password":"Beanola2025"}')

TOKEN=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['session']['access_token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token"
  exit 1
fi

echo "✅ Token obtained"
echo ""

# Test dashboard
echo "2. Testing /admin/dashboard..."
DASH_RESPONSE=$(curl -s https://apply.mihas.edu.zm/admin/dashboard \
  -H "Authorization: Bearer $TOKEN")
echo "$DASH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$DASH_RESPONSE"
echo ""

# Test users
echo "3. Testing /admin/users..."
USERS_RESPONSE=$(curl -s https://apply.mihas.edu.zm/admin/users \
  -H "Authorization: Bearer $TOKEN")
echo "$USERS_RESPONSE" | python3 -m json.tool 2>/dev/null | head -30 || echo "$USERS_RESPONSE"
echo ""

# Test programs
echo "4. Testing /catalog/programs..."
PROGRAMS_RESPONSE=$(curl -s https://apply.mihas.edu.zm/catalog/programs)
echo "$PROGRAMS_RESPONSE" | python3 -m json.tool 2>/dev/null | head -20 || echo "$PROGRAMS_RESPONSE"
echo ""

echo "=== Test Complete ==="
