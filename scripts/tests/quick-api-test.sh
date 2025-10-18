#!/bin/bash

# Quick MIHAS API Test Script
# Tests core functionality with curl commands

set -e

BASE_URL="https://apply.mihas.edu.zm/.netlify/functions"
STUDENT_EMAIL="cosmaskanchepa8@gmail.com"
STUDENT_PASSWORD="Beanola2025"
ADMIN_EMAIL="cosmas@beanola.com"
ADMIN_PASSWORD="Beanola2025"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 MIHAS API Quick Test${NC}"
echo "Base URL: $BASE_URL"
echo "=================================="

# Test 1: Basic connectivity
echo -e "\n${BLUE}1. Testing basic connectivity...${NC}"
if curl -s -f "$BASE_URL/test" > /dev/null; then
    echo -e "${GREEN}✅ Test endpoint working${NC}"
else
    echo -e "${RED}❌ Test endpoint failed${NC}"
fi

# Test 2: Student authentication
echo -e "\n${BLUE}2. Testing student authentication...${NC}"
STUDENT_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASSWORD\"}" \
    "$BASE_URL/auth-login")

if echo "$STUDENT_RESPONSE" | grep -q "access_token"; then
    echo -e "${GREEN}✅ Student authentication successful${NC}"
    STUDENT_TOKEN=$(echo "$STUDENT_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
else
    echo -e "${RED}❌ Student authentication failed${NC}"
    STUDENT_TOKEN=""
fi

# Test 3: Admin authentication
echo -e "\n${BLUE}3. Testing admin authentication...${NC}"
ADMIN_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    "$BASE_URL/auth-login")

if echo "$ADMIN_RESPONSE" | grep -q "access_token"; then
    echo -e "${GREEN}✅ Admin authentication successful${NC}"
    ADMIN_TOKEN=$(echo "$ADMIN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
else
    echo -e "${RED}❌ Admin authentication failed${NC}"
    ADMIN_TOKEN=""
fi

# Test 4: Catalog endpoints
echo -e "\n${BLUE}4. Testing catalog endpoints...${NC}"

# Programs
PROGRAMS_RESPONSE=$(curl -s "$BASE_URL/catalog-programs")
if echo "$PROGRAMS_RESPONSE" | grep -q "programs"; then
    PROGRAM_COUNT=$(echo "$PROGRAMS_RESPONSE" | grep -o '"programs":\[.*\]' | grep -o '{"id"' | wc -l)
    echo -e "${GREEN}✅ Programs endpoint: $PROGRAM_COUNT programs found${NC}"
else
    echo -e "${RED}❌ Programs endpoint failed${NC}"
fi

# Subjects
SUBJECTS_RESPONSE=$(curl -s "$BASE_URL/catalog-subjects")
if echo "$SUBJECTS_RESPONSE" | grep -q "subjects"; then
    SUBJECT_COUNT=$(echo "$SUBJECTS_RESPONSE" | grep -o '"subjects":\[.*\]' | grep -o '{"id"' | wc -l)
    echo -e "${GREEN}✅ Subjects endpoint: $SUBJECT_COUNT subjects found${NC}"
else
    echo -e "${RED}❌ Subjects endpoint failed${NC}"
fi

# Intakes
INTAKES_RESPONSE=$(curl -s "$BASE_URL/catalog-intakes")
if echo "$INTAKES_RESPONSE" | grep -q "intakes"; then
    INTAKE_COUNT=$(echo "$INTAKES_RESPONSE" | grep -o '"intakes":\[.*\]' | grep -o '{"id"' | wc -l)
    echo -e "${GREEN}✅ Intakes endpoint: $INTAKE_COUNT intakes found${NC}"
else
    echo -e "${RED}❌ Intakes endpoint failed${NC}"
fi

# Test 5: Student applications
if [ ! -z "$STUDENT_TOKEN" ]; then
    echo -e "\n${BLUE}5. Testing student applications...${NC}"
    STUDENT_APPS_RESPONSE=$(curl -s -H "Authorization: Bearer $STUDENT_TOKEN" \
        "$BASE_URL/applications")
    
    if echo "$STUDENT_APPS_RESPONSE" | grep -q -E '(\[|\{)'; then
        echo -e "${GREEN}✅ Student applications retrieved${NC}"
    else
        echo -e "${RED}❌ Student applications failed${NC}"
    fi
else
    echo -e "\n${RED}5. Skipping student applications (no token)${NC}"
fi

# Test 6: Admin dashboard
if [ ! -z "$ADMIN_TOKEN" ]; then
    echo -e "\n${BLUE}6. Testing admin dashboard...${NC}"
    ADMIN_DASHBOARD_RESPONSE=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
        "$BASE_URL/admin-dashboard")
    
    if echo "$ADMIN_DASHBOARD_RESPONSE" | grep -q -E '(\[|\{)'; then
        echo -e "${GREEN}✅ Admin dashboard loaded${NC}"
    else
        echo -e "${RED}❌ Admin dashboard failed${NC}"
    fi
else
    echo -e "\n${RED}6. Skipping admin dashboard (no token)${NC}"
fi

# Test 7: Admin applications
if [ ! -z "$ADMIN_TOKEN" ]; then
    echo -e "\n${BLUE}7. Testing admin applications view...${NC}"
    ADMIN_APPS_RESPONSE=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
        "$BASE_URL/applications")
    
    if echo "$ADMIN_APPS_RESPONSE" | grep -q -E '(\[|\{)'; then
        echo -e "${GREEN}✅ Admin applications view working${NC}"
    else
        echo -e "${RED}❌ Admin applications view failed${NC}"
    fi
else
    echo -e "\n${RED}7. Skipping admin applications (no token)${NC}"
fi

echo -e "\n${BLUE}=================================="
echo -e "🎯 Quick test completed!"
echo -e "For detailed testing, run: node test-live-apis-fixed.js${NC}"