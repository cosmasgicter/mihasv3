#!/bin/bash

# MIHAS Admin API Test Script for Ubuntu
# Usage: ./test-admin-apis.sh

API_BASE="https://mihasv3.pages.dev"
ADMIN_EMAIL="alexisstar8@gmail.com"
ADMIN_PASSWORD="Skyl3r@L0m1s"

echo "🔧 Testing MIHAS Admin APIs..."

# Test 1: Admin Login
echo "1. Testing admin login..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
  TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
  echo "✅ Admin login successful"
else
  echo "❌ Admin login failed: $LOGIN_RESPONSE"
  exit 1
fi

# Test 2: Admin Dashboard
echo "2. Testing admin dashboard..."
DASHBOARD_RESPONSE=$(curl -s -X GET "$API_BASE/api/admin/dashboard" \
  -H "Authorization: Bearer $TOKEN")

if echo "$DASHBOARD_RESPONSE" | grep -q "totalApplications"; then
  echo "✅ Admin dashboard accessible"
else
  echo "❌ Admin dashboard failed: $DASHBOARD_RESPONSE"
fi

# Test 3: Applications List
echo "3. Testing applications list..."
APPS_RESPONSE=$(curl -s -X GET "$API_BASE/api/applications" \
  -H "Authorization: Bearer $TOKEN")

if echo "$APPS_RESPONSE" | grep -q "applications"; then
  echo "✅ Applications list accessible"
else
  echo "❌ Applications list failed: $APPS_RESPONSE"
fi

echo "🎉 Admin API tests completed!"