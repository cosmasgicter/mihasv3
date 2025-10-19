#!/bin/bash

# MIHAS V3 - Admin Endpoints Test Suite
# Tests all admin-specific functionality

BASE_URL="https://3876503d.mihas-v3.pages.dev"
ADMIN_EMAIL="cosmas@beanola.com"
ADMIN_PASSWORD="Beanola2025"
STUDENT_EMAIL="cosmaskanchepa8@gmail.com"
STUDENT_PASSWORD="Beanola2025"

echo "=========================================="
echo "MIHAS V3 - ADMIN ENDPOINTS TEST"
echo "=========================================="
echo ""

# Login as Admin
echo "1. Admin Login..."
ADMIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
echo "Admin Token: ${ADMIN_TOKEN:0:50}..."
echo ""

# Login as Student
echo "2. Student Login..."
STUDENT_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASSWORD\"}")
STUDENT_TOKEN=$(echo $STUDENT_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
echo "Student Token: ${STUDENT_TOKEN:0:50}..."
echo ""

# Admin Dashboard
echo "3. Admin Dashboard Stats..."
curl -s -X GET "$BASE_URL/admin/dashboard" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
echo ""

# Admin - Get All Applications
echo "4. Admin - Get All Applications..."
curl -s -X GET "$BASE_URL/applications?limit=5" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data[] | {id, student_name, program_name, status}'
echo ""

# Admin - Get Pending Applications
echo "5. Admin - Get Pending Applications..."
curl -s -X GET "$BASE_URL/applications?status=submitted&limit=3" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data[] | {id, student_name, status}'
echo ""

# Admin - Get Application Details
echo "6. Admin - Get Application Details (ID: 1)..."
curl -s -X GET "$BASE_URL/applications/1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '{id, student_name, status, grades: .grades | length, documents: .documents | length}'
echo ""

# Admin - Review Application (Approve)
echo "7. Admin - Review Application (Approve ID: 1)..."
curl -s -X POST "$BASE_URL/applications/review" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"application_id":1,"action":"approve","comments":"Application meets all requirements"}' | jq '.'
echo ""

# Admin - Review Application (Reject)
echo "8. Admin - Review Application (Reject ID: 2)..."
curl -s -X POST "$BASE_URL/applications/review" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"application_id":2,"action":"reject","comments":"Missing required documents"}' | jq '.'
echo ""

# Admin - Bulk Status Update
echo "9. Admin - Bulk Status Update..."
curl -s -X POST "$BASE_URL/applications/bulk" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"update_status","application_ids":[3,4],"status":"under_review"}' | jq '.'
echo ""

# Admin - Bulk Payment Status Update
echo "10. Admin - Bulk Payment Status Update..."
curl -s -X POST "$BASE_URL/applications/bulk" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"update_payment","application_ids":[1,2],"payment_status":"paid"}' | jq '.'
echo ""

# Admin - Send Notification
echo "11. Admin - Send Notification to User..."
curl -s -X POST "$BASE_URL/notifications/send" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"d4e5f6a7-b8c9-4d5e-a6b7-c8d9e0f1a2b3","title":"Application Update","message":"Your application has been reviewed","type":"application"}' | jq '.'
echo ""

# Admin - Get All Users
echo "12. Admin - Get All Users..."
curl -s -X GET "$BASE_URL/admin/users?limit=5" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data[] | {id, email, role, created_at}'
echo ""

# Admin - Analytics Overview
echo "13. Admin - Analytics Overview..."
curl -s -X GET "$BASE_URL/analytics/overview" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
echo ""

# Admin - Application Trends
echo "14. Admin - Application Trends..."
curl -s -X GET "$BASE_URL/analytics/trends?period=30" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
echo ""

# Admin - Program Statistics
echo "15. Admin - Program Statistics..."
curl -s -X GET "$BASE_URL/analytics/programs" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
echo ""

# Student - Try Admin Dashboard (Should Fail)
echo "16. Student - Try Admin Dashboard (Should Fail)..."
curl -s -X GET "$BASE_URL/admin/dashboard" \
  -H "Authorization: Bearer $STUDENT_TOKEN" | jq '.'
echo ""

# Student - Try Review Application (Should Fail)
echo "17. Student - Try Review Application (Should Fail)..."
curl -s -X POST "$BASE_URL/applications/review" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"application_id":1,"action":"approve","comments":"Test"}' | jq '.'
echo ""

# Student - Get Own Applications Only
echo "18. Student - Get Own Applications..."
curl -s -X GET "$BASE_URL/applications" \
  -H "Authorization: Bearer $STUDENT_TOKEN" | jq '.data[] | {id, student_name, status}'
echo ""

# Admin - Export Applications (CSV)
echo "19. Admin - Export Applications..."
curl -s -X GET "$BASE_URL/admin/export?format=csv&status=all" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | head -n 5
echo ""

# Admin - System Health
echo "20. Admin - System Health..."
curl -s -X GET "$BASE_URL/health" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
echo ""

echo "=========================================="
echo "ADMIN TESTS COMPLETE"
echo "=========================================="
