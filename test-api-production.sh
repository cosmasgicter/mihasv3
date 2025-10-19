#!/bin/bash

BASE_URL="https://apply.mihas.edu.zm"
ADMIN_EMAIL="cosmas@beanola.com"
ADMIN_PASS="Beanola2025"
STUDENT_EMAIL="cosmaskanchepa8@gmail.com"
STUDENT_PASS="Beanola2025"

echo "=== MIHAS API Production Test ==="
echo ""

# Get admin token
echo "1. Testing Admin Login..."
ADMIN_TOKEN=$(curl -s -X POST "https://mylgegkqoddcrxtwcclb.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" | jq -r '.access_token')

if [ "$ADMIN_TOKEN" = "null" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Admin login failed"
  exit 1
fi
echo "✅ Admin login successful"

# Get student token
echo "2. Testing Student Login..."
STUDENT_TOKEN=$(curl -s -X POST "https://mylgegkqoddcrxtwcclb.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASS\"}" | jq -r '.access_token')

if [ "$STUDENT_TOKEN" = "null" ] || [ -z "$STUDENT_TOKEN" ]; then
  echo "❌ Student login failed"
  exit 1
fi
echo "✅ Student login successful"

# Test endpoints
echo ""
echo "=== Testing API Endpoints ==="

# Applications
echo "3. GET /applications (student mine=true)"
RESULT=$(curl -s "$BASE_URL/applications?mine=true" -H "Authorization: Bearer $STUDENT_TOKEN")
COUNT=$(echo $RESULT | jq -r '.totalCount // "error"')
if [ "$COUNT" = "error" ]; then
  echo "❌ /applications - $(echo $RESULT | jq -r '.error')"
else
  echo "✅ /applications - $COUNT applications"
fi

# Applications (admin)
echo "4. GET /applications (admin all)"
RESULT=$(curl -s "$BASE_URL/applications?pageSize=5" -H "Authorization: Bearer $ADMIN_TOKEN")
COUNT=$(echo $RESULT | jq -r '.totalCount // "error"')
if [ "$COUNT" = "error" ]; then
  echo "❌ /applications (admin) - $(echo $RESULT | jq -r '.error')"
else
  echo "✅ /applications (admin) - $COUNT total applications"
fi

# Catalog - Programs
echo "5. GET /catalog/programs"
RESULT=$(curl -s "$BASE_URL/catalog/programs")
COUNT=$(echo $RESULT | jq -r 'length // "error"')
if [ "$COUNT" = "error" ]; then
  echo "❌ /catalog/programs - $(echo $RESULT | jq -r '.error // "failed"')"
else
  echo "✅ /catalog/programs - $COUNT programs"
fi

# Catalog - Intakes
echo "6. GET /catalog/intakes"
RESULT=$(curl -s "$BASE_URL/catalog/intakes")
COUNT=$(echo $RESULT | jq -r 'length // "error"')
if [ "$COUNT" = "error" ]; then
  echo "❌ /catalog/intakes - $(echo $RESULT | jq -r '.error // "failed"')"
else
  echo "✅ /catalog/intakes - $COUNT intakes"
fi

# Analytics - Telemetry
echo "7. POST /analytics/telemetry"
RESULT=$(curl -s -X POST "$BASE_URL/analytics/telemetry" \
  -H "Content-Type: application/json" \
  -d '{"event":"test","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}')
SUCCESS=$(echo $RESULT | jq -r '.success // "error"')
if [ "$SUCCESS" = "true" ]; then
  echo "✅ /analytics/telemetry"
else
  echo "❌ /analytics/telemetry - $(echo $RESULT | jq -r '.error // "failed"')"
fi

# Health
echo "8. GET /health"
RESULT=$(curl -s "$BASE_URL/health")
STATUS=$(echo $RESULT | jq -r '.status // "error"')
if [ "$STATUS" = "ok" ]; then
  echo "✅ /health"
else
  echo "❌ /health - $STATUS"
fi

# Admin Dashboard
echo "9. GET /admin/dashboard"
RESULT=$(curl -s "$BASE_URL/admin/dashboard" -H "Authorization: Bearer $ADMIN_TOKEN")
HAS_STATS=$(echo $RESULT | jq -r 'has("stats") // false')
if [ "$HAS_STATS" = "true" ]; then
  echo "✅ /admin/dashboard"
else
  echo "❌ /admin/dashboard - $(echo $RESULT | jq -r '.error // "no stats"')"
fi

echo ""
echo "=== Test Complete ==="
