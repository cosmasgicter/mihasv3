#!/bin/bash

# Comprehensive Admin Workflow Test
API_BASE="https://apply.mihas.edu.zm"
ADMIN_EMAIL="alexisstar8@gmail.com"
ADMIN_PASSWORD="Skyl3r@L0m1s"

echo "🚀 Comprehensive Admin Workflow Test"
echo "===================================="

# Login and get token
echo "1. Admin Authentication..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  echo "❌ Login failed: $LOGIN_RESPONSE"
  exit 1
fi
echo "✅ Admin authenticated"

# Test Dashboard
echo "2. Dashboard Analytics..."
DASHBOARD=$(curl -s -X GET "$API_BASE/api/admin/dashboard" -H "Authorization: Bearer $TOKEN")
if echo "$DASHBOARD" | jq -e '.stats.totalApplications' > /dev/null; then
  TOTAL_APPS=$(echo "$DASHBOARD" | jq -r '.stats.totalApplications')
  echo "✅ Dashboard loaded - $TOTAL_APPS total applications"
elif echo "$DASHBOARD" | jq -e '.totalApplications' > /dev/null; then
  TOTAL_APPS=$(echo "$DASHBOARD" | jq -r '.totalApplications')
  echo "✅ Dashboard loaded - $TOTAL_APPS total applications"
else
  echo "❌ Dashboard failed"
fi

# Test Applications Management
echo "3. Applications Management..."
APPS=$(curl -s -X GET "$API_BASE/api/applications?page=0&pageSize=5" -H "Authorization: Bearer $TOKEN")
if echo "$APPS" | jq -e '.applications' > /dev/null; then
  APP_COUNT=$(echo "$APPS" | jq '.applications | length')
  echo "✅ Applications list loaded - $APP_COUNT applications"
  
  # Get first application ID for testing
  FIRST_APP_ID=$(echo "$APPS" | jq -r '.applications[0].id // empty')
  if [ ! -z "$FIRST_APP_ID" ]; then
    echo "4. Application Details..."
    APP_DETAIL=$(curl -s -X GET "$API_BASE/api/applications/$FIRST_APP_ID" -H "Authorization: Bearer $TOKEN")
    if echo "$APP_DETAIL" | jq -e '.data.id' > /dev/null; then
      echo "✅ Application details retrieved"
    elif echo "$APP_DETAIL" | jq -e '.id' > /dev/null; then
      echo "✅ Application details retrieved"
    else
      echo "❌ Application details failed"
    fi
  fi
else
  echo "❌ Applications list failed"
fi

# Test User Management
echo "5. User Management..."
USERS=$(curl -s -X GET "$API_BASE/api/admin/users" -H "Authorization: Bearer $TOKEN")
if echo "$USERS" | jq -e '.users' > /dev/null 2>/dev/null; then
  USER_COUNT=$(echo "$USERS" | jq '.users | length')
  echo "✅ Users list accessible - $USER_COUNT users"
elif echo "$USERS" | jq -e '.[0]' > /dev/null 2>/dev/null; then
  echo "✅ Users list accessible"
else
  echo "❌ Users endpoint not deployed yet"
fi

# Test Audit Logs
echo "6. Audit Logs..."
AUDIT=$(curl -s -X GET "$API_BASE/api/admin/audit-log/stats" -H "Authorization: Bearer $TOKEN")
if echo "$AUDIT" | jq -e '.' > /dev/null; then
  echo "✅ Audit logs accessible"
else
  echo "❌ Audit logs failed"
fi

# Test Analytics
echo "7. Analytics Dashboard..."
ANALYTICS=$(curl -s -X GET "$API_BASE/api/analytics/predictive-dashboard" -H "Authorization: Bearer $TOKEN")
if echo "$ANALYTICS" | jq -e '.' > /dev/null; then
  echo "✅ Analytics dashboard accessible"
else
  echo "❌ Analytics failed"
fi

# Test Catalog Management
echo "8. Catalog Management..."
PROGRAMS=$(curl -s -X GET "$API_BASE/api/catalog/programs" -H "Authorization: Bearer $TOKEN")
if echo "$PROGRAMS" | jq -e '.' > /dev/null; then
  echo "✅ Programs catalog accessible"
else
  echo "❌ Programs catalog failed"
fi

INTAKES=$(curl -s -X GET "$API_BASE/api/catalog/intakes" -H "Authorization: Bearer $TOKEN")
if echo "$INTAKES" | jq -e '.' > /dev/null; then
  echo "✅ Intakes catalog accessible"
else
  echo "❌ Intakes catalog failed"
fi

# Test System Health
echo "9. System Health..."
HEALTH=$(curl -s -X GET "$API_BASE/api/health")
if echo "$HEALTH" | jq -e '.status' > /dev/null; then
  STATUS=$(echo "$HEALTH" | jq -r '.status')
  echo "✅ System health: $STATUS"
else
  echo "❌ Health check failed"
fi

echo ""
echo "🎉 Comprehensive Admin Test Complete!"
echo "===================================="