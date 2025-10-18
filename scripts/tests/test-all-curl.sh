#!/bin/bash

BASE_URL="https://apply.mihas.edu.zm"
SUPABASE_URL="https://mylgegkqoddcrxtwcclb.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw"

echo "=========================================="
echo "MIHAS Application System - Comprehensive Curl Test"
echo "=========================================="
echo ""

# 1. Health Check
echo "1. Testing Health Endpoint..."
curl -s -w "\nStatus: %{http_code}\n" "$BASE_URL/.netlify/functions/health"
echo ""

# 2. Supabase Connection
echo "2. Testing Supabase Connection..."
curl -s -w "\nStatus: %{http_code}\n" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  "$SUPABASE_URL/rest/v1/"
echo ""

# 3. Catalog - Programs
echo "3. Testing Catalog Programs..."
curl -s -w "\nStatus: %{http_code}\n" "$BASE_URL/.netlify/functions/catalog-programs"
echo ""

# 4. Catalog - Intakes
echo "4. Testing Catalog Intakes..."
curl -s -w "\nStatus: %{http_code}\n" "$BASE_URL/.netlify/functions/catalog-intakes"
echo ""

# 5. Catalog - Subjects
echo "5. Testing Catalog Subjects..."
curl -s -w "\nStatus: %{http_code}\n" "$BASE_URL/.netlify/functions/catalog-subjects"
echo ""

# 6. Auth - Register (Test)
echo "6. Testing Auth Register..."
curl -s -w "\nStatus: %{http_code}\n" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!@#","fullName":"Test User"}' \
  "$BASE_URL/.netlify/functions/auth-register"
echo ""

# 7. Auth - Login (Test)
echo "7. Testing Auth Login..."
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"student@mihas.edu.zm","password":"Student123!"}' \
  "$BASE_URL/.netlify/functions/auth-login")
HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')
echo "$BODY"
echo "Status: $HTTP_CODE"
TOKEN=$(echo "$BODY" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
echo ""

# 8. Applications - List (requires auth)
if [ -n "$TOKEN" ]; then
  echo "8. Testing Applications List (Authenticated)..."
  curl -s -w "\nStatus: %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/.netlify/functions/applications"
  echo ""
else
  echo "8. Skipping Applications List (No token)"
  echo ""
fi

# 9. Admin Dashboard (requires admin auth)
echo "9. Testing Admin Dashboard..."
curl -s -w "\nStatus: %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/.netlify/functions/admin-dashboard"
echo ""

# 10. Analytics Metrics
echo "10. Testing Analytics Metrics..."
curl -s -w "\nStatus: %{http_code}\n" "$BASE_URL/.netlify/functions/analytics-metrics"
echo ""

# 11. Notifications Preferences
if [ -n "$TOKEN" ]; then
  echo "11. Testing Notifications Preferences..."
  curl -s -w "\nStatus: %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/.netlify/functions/notifications-preferences"
  echo ""
else
  echo "11. Skipping Notifications (No token)"
  echo ""
fi

# 12. Application Summary
if [ -n "$TOKEN" ]; then
  echo "12. Testing Application Summary..."
  curl -s -w "\nStatus: %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/.netlify/functions/applications-summary"
  echo ""
else
  echo "12. Skipping Application Summary (No token)"
  echo ""
fi

# 13. Admin Users
if [ -n "$TOKEN" ]; then
  echo "13. Testing Admin Users..."
  curl -s -w "\nStatus: %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/.netlify/functions/admin-users"
  echo ""
else
  echo "13. Skipping Admin Users (No token)"
  echo ""
fi

# 14. Test Document Upload Endpoint
echo "14. Testing Document Upload Endpoint..."
curl -s -w "\nStatus: %{http_code}\n" \
  -X POST \
  "$BASE_URL/.netlify/functions/documents-upload"
echo ""

# 15. Test Email Queue Status
if [ -n "$TOKEN" ]; then
  echo "15. Testing Email Queue Status..."
  curl -s -w "\nStatus: %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/.netlify/functions/admin-email-queue-status"
  echo ""
else
  echo "15. Skipping Email Queue (No token)"
  echo ""
fi

echo "=========================================="
echo "Test Complete"
echo "=========================================="
