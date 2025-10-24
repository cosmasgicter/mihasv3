#!/bin/bash

# Get token
TOKEN=$(curl -s -X POST -H "Content-Type: application/json" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw" -d '{"email":"cosmas@beanola.com","password":"Beanola2025"}' "https://mylgegkqoddcrxtwcclb.supabase.co/auth/v1/token?grant_type=password" | jq -r '.access_token')

echo "🧪 Testing Individual Functions with Real Data"
echo "=============================================="
echo ""

# Test 1: auth/signin
echo "1. Testing /auth/signin"
curl -s -X POST https://mihasv3.pages.dev/auth/signin -H "Content-Type: application/json" -d '{"email":"cosmas@beanola.com","password":"Beanola2025"}' | jq
echo ""

# Test 2: send-email
echo "2. Testing /send-email"
curl -s -X POST https://mihasv3.pages.dev/send-email -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"to":"cosmas@beanola.com","subject":"Test","body":"Test message"}' | jq
echo ""

# Test 3: Get first application ID
echo "3. Getting application ID"
APP_ID=$(curl -s https://mihasv3.pages.dev/applications -H "Authorization: Bearer $TOKEN" | jq -r '.applications[0].id // empty')
echo "Application ID: $APP_ID"
echo ""

# Test 4: generate/pdf with real app ID
if [ -n "$APP_ID" ]; then
  echo "4. Testing /generate/pdf"
  curl -s -X POST https://mihasv3.pages.dev/generate/pdf -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"applicationId\":\"$APP_ID\"}" | jq
  echo ""
fi

# Test 5: applications/generate/slip
if [ -n "$APP_ID" ]; then
  echo "5. Testing /applications/generate/slip"
  curl -s -X POST https://mihasv3.pages.dev/applications/generate/slip -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"applicationId\":\"$APP_ID\"}" | jq
  echo ""
fi

# Test 6: Get user ID
echo "6. Getting user ID"
USER_ID=$(curl -s https://mylgegkqoddcrxtwcclb.supabase.co/auth/v1/user -H "Authorization: Bearer $TOKEN" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw" | jq -r '.id // empty')
echo "User ID: $USER_ID"
echo ""

# Test 7: notifications/send
if [ -n "$USER_ID" ]; then
  echo "7. Testing /notifications/send"
  curl -s -X POST https://mihasv3.pages.dev/notifications/send -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"user_id\":\"$USER_ID\",\"title\":\"Test\",\"message\":\"Test notification\"}" | jq
  echo ""
fi

# Test 8: auth/signup with new user
echo "8. Testing /auth/signup"
curl -s -X POST https://mihasv3.pages.dev/auth/signup -H "Content-Type: application/json" -d '{"email":"test'$(date +%s)'@test.com","password":"Test123!","firstName":"Test","lastName":"User"}' | jq
echo ""

# Test 9: auth/login
echo "9. Testing /auth/login"
curl -s -X POST https://mihasv3.pages.dev/auth/login -H "Content-Type: application/json" -d '{"email":"cosmas@beanola.com","password":"Beanola2025"}' | jq
echo ""

echo "✅ Individual function testing complete"
