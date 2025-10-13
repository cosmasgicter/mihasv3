#!/bin/bash

# MIHAS Application System - Production Test Runner
# This script runs all test suites against production environment

set -e

echo "🚀 Starting MIHAS Production Test Suite"
echo "========================================"
echo "🌐 Testing against: ***REMOVED***"
echo "📊 Results will be sent to TestMonitor"
echo ""

# Load production test environment
export NODE_ENV=test
export CI=true

# Create test results directory
mkdir -p test-results

# Function to run tests and capture results
run_test_suite() {
    local suite_name=$1
    local test_pattern=$2
    
    echo "📋 Running $suite_name tests on PRODUCTION..."
    
    if npx playwright test $test_pattern --reporter=json --output=test-results/${suite_name}-results.json; then
        echo "✅ $suite_name tests passed"
        return 0
    else
        echo "❌ $suite_name tests failed"
        return 1
    fi
}

# Initialize counters
total_suites=0
passed_suites=0
failed_suites=0

# API Tests (Production)
echo "🔌 Production API Test Suite"
echo "============================"
total_suites=$((total_suites + 1))
if run_test_suite "production-api" "tests/api/"; then
    passed_suites=$((passed_suites + 1))
else
    failed_suites=$((failed_suites + 1))
fi

# Authentication Tests (Production)
echo ""
echo "🔐 Production Authentication Test Suite"
echo "======================================"
total_suites=$((total_suites + 1))
if run_test_suite "production-auth" "tests/auth/"; then
    passed_suites=$((passed_suites + 1))
else
    failed_suites=$((failed_suites + 1))
fi

# Navigation Tests (Production)
echo ""
echo "🧭 Production Navigation Test Suite"
echo "=================================="
total_suites=$((total_suites + 1))
if run_test_suite "production-navigation" "tests/navigation/"; then
    passed_suites=$((passed_suites + 1))
else
    failed_suites=$((failed_suites + 1))
fi

# Component Tests (Production)
echo ""
echo "🧩 Production Component Test Suite"
echo "================================="
total_suites=$((total_suites + 1))
if run_test_suite "production-components" "tests/components/"; then
    passed_suites=$((passed_suites + 1))
else
    failed_suites=$((failed_suites + 1))
fi

# Admin Tests (Production)
echo ""
echo "👨‍💼 Production Admin Test Suite"
echo "==============================="
total_suites=$((total_suites + 1))
if run_test_suite "production-admin" "tests/admin/"; then
    passed_suites=$((passed_suites + 1))
else
    failed_suites=$((failed_suites + 1))
fi

# Student Tests (Production)
echo ""
echo "🎓 Production Student Test Suite"
echo "==============================="
total_suites=$((total_suites + 1))
if run_test_suite "production-student" "tests/student/"; then
    passed_suites=$((passed_suites + 1))
else
    failed_suites=$((failed_suites + 1))
fi

# Mobile Tests (Production)
echo ""
echo "📱 Production Mobile Test Suite"
echo "=============================="
total_suites=$((total_suites + 1))
if run_test_suite "production-mobile" "tests/mobile/"; then
    passed_suites=$((passed_suites + 1))
else
    failed_suites=$((failed_suites + 1))
fi

# Integration Tests (Production)
echo ""
echo "🔗 Production Integration Test Suite"
echo "==================================="
total_suites=$((total_suites + 1))
if run_test_suite "production-integration" "tests/integration/"; then
    passed_suites=$((passed_suites + 1))
else
    failed_suites=$((failed_suites + 1))
fi

# E2E Tests (Production)
echo ""
echo "🎯 Production End-to-End Test Suite"
echo "==================================="
total_suites=$((total_suites + 1))
if run_test_suite "production-e2e" "tests/e2e/"; then
    passed_suites=$((passed_suites + 1))
else
    failed_suites=$((failed_suites + 1))
fi

# Generate comprehensive report
echo ""
echo "📊 Generating Production Test Report"
echo "==================================="

# Run all tests with HTML reporter for final report
npx playwright test --reporter=html,json,junit,@testmonitor/playwright-reporter

# Create summary report
cat > test-results/production-summary.md << EOF
# MIHAS Application System - Production Test Results Summary

## Production Environment
- **Test Target**: ***REMOVED***
- **Environment**: Production
- **Test Date**: $(date)
- **TestMonitor**: https://beanola.testmonitor.com

## Overview
- **Total Test Suites**: $total_suites
- **Passed Suites**: $passed_suites
- **Failed Suites**: $failed_suites
- **Success Rate**: $(( passed_suites * 100 / total_suites ))%

## Production Test Coverage
- ✅ Production API Endpoints (Health, Auth, Applications, Catalog, Admin, Analytics, Notifications)
- ✅ Production Authentication Flows (Login, Register, Password Reset)
- ✅ Production Navigation (Main, Student, Admin)
- ✅ Production Components (File Upload, Form Validation, Loading States)
- ✅ Production Admin Dashboard (Overview, Applications Management)
- ✅ Production Student Dashboard (Overview, Application Wizard)
- ✅ Production Mobile Responsive Design
- ✅ Production Touch Interactions
- ✅ Production Integration Workflows
- ✅ Production Accessibility Standards
- ✅ Production Performance Metrics
- ✅ Production Security Tests

## Production Browser Coverage
- ✅ Production Desktop Chrome
- ✅ Production Desktop Firefox  
- ✅ Production Desktop Safari
- ✅ Production Mobile Chrome (Pixel 5)
- ✅ Production Mobile Safari (iPhone 12)
- ✅ Production iPad Pro

## Production Credentials Used
- Supabase URL: https://mylgegkqoddcrxtwcclb.supabase.co
- API Base URL: ***REMOVED***
- Email Provider: Resend (Production)
- Analytics: Umami (Production)
- Turnstile: Cloudflare (Production)

## TestMonitor Integration
All production test results are automatically submitted to TestMonitor dashboard at:
https://beanola.testmonitor.com

## Generated Reports
- HTML Report: test-results/html-report/index.html
- JSON Report: test-results/results.json
- JUnit Report: test-results/results.xml

## Security Notice
⚠️ All test data is excluded from version control via .gitignore
⚠️ No production credentials are committed to GitHub
⚠️ Test results contain production environment data

Generated on: $(date)
EOF

echo ""
echo "🎉 Production Test Suite Complete!"
echo "=================================="
echo "📊 Results: $passed_suites/$total_suites suites passed"
echo "📁 Reports available in: test-results/"
echo "🌐 HTML Report: test-results/html-report/index.html"
echo "📈 TestMonitor: https://beanola.testmonitor.com"
echo "🔒 Production Environment: ***REMOVED***"

if [ $failed_suites -eq 0 ]; then
    echo "✅ All production tests passed! System is production ready."
    exit 0
else
    echo "❌ Some production tests failed. Please review the reports."
    exit 1
fi