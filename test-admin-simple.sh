#!/bin/bash

# Get token
TOKEN=$(curl -s -X POST "https://3876503d.mihas-v3.pages.dev/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"cosmas@beanola.com","password":"Beanola2025"}' | \
  python3 -c "import sys, json; print(json.load(sys.stdin)['session']['access_token'])")

echo "Token: ${TOKEN:0:50}..."
echo ""

# Test applications endpoint (should work for any authenticated user)
echo "Testing /applications..."
curl -s "https://3876503d.mihas-v3.pages.dev/applications" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

# Test admin dashboard
echo "Testing /admin/dashboard..."
curl -s "https://3876503d.mihas-v3.pages.dev/admin/dashboard" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

# Test admin users
echo "Testing /admin/users..."
curl -s "https://3876503d.mihas-v3.pages.dev/admin/users" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
