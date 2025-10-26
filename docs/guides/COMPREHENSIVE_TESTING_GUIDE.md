# MIHAS Comprehensive Testing Guide

## 🎯 Overview

This guide provides instructions for running comprehensive tests on all 58+ functions in the MIHAS system using live credentials and Supabase MCP integration.

## 📋 Test Credentials

- **Admin**: `cosmas@beanola.com` / `Beanola2025`
- **Student**: `cosmaskanchepa8@gmail.com` / `TestPassword123!`
- **Live System**: `https://mihasv3.pages.dev`
- **Supabase**: `https://mylgegkqoddcrxtwcclb.supabase.co`

## 🚀 Quick Start

### Run All Tests (Recommended)

```bash
# Navigate to project root
cd /home/cosmas/Documents/Visual\ Code/mihasv3

# Run comprehensive test suite
./scripts/tests/run-comprehensive-tests.sh
```

### Run Individual Tests

```bash
# Basic function testing
node scripts/tests/comprehensive-live-function-test.js

# Implementation analysis
node scripts/tests/comprehensive-implementation-test.js

# MCP-integrated testing
node scripts/tests/mcp-integrated-test.js
```

## 📊 Test Phases

### Phase 1: Basic Function Testing
- **Purpose**: Test all function endpoints with live credentials
- **Coverage**: 58+ functions across all categories
- **Authentication**: Uses both admin and student tokens
- **Output**: `comprehensive-live-test-results.json`

**Functions Tested**:
- ✅ Authentication (signin, signup, login, register)
- ✅ Applications (CRUD operations, reviews, documents)
- ✅ Admin functions (dashboard, user management, audit)
- ✅ API endpoints (notifications, sessions, workflows)
- ✅ Analytics (metrics, telemetry, predictive)
- ✅ Catalog (programs, intakes, subjects)
- ✅ Documents (upload, PDF generation)
- ✅ Notifications (send, preferences, multi-channel)
- ✅ Interview scheduling
- ✅ Payments and receipts
- ✅ Email services
- ✅ Push notifications
- ✅ Cron jobs and cleanup

### Phase 2: Implementation Analysis
- **Purpose**: Analyze function implementations and code quality
- **Coverage**: Code quality metrics, security analysis
- **Output**: `comprehensive-implementation-test-results.json`

**Analysis Includes**:
- 🔍 Error handling coverage
- 🛡️ Input validation presence
- 🔐 Authentication implementation
- 📝 Logging and monitoring
- 🌐 CORS configuration
- ⚡ Rate limiting
- 📊 Code quality scores
- 💾 Database integration

### Phase 3: MCP-Integrated Testing
- **Purpose**: Test with Supabase MCP for issue resolution
- **Coverage**: Critical and high-priority functions
- **Output**: `mcp-integrated-test-results.json`

**Features**:
- 🔧 Automatic issue detection and fixing
- 🏥 Database health checks
- 📋 Table structure verification
- 🛡️ RLS policy validation
- 🔄 Retry logic with fixes
- 📊 Priority-based testing

## 📈 Test Results

### Success Metrics
- **Function Endpoint Tests**: HTTP status codes, response validation
- **Implementation Quality**: Code quality scores (0-100)
- **MCP Integration**: Auto-fix success rate
- **Overall Success Rate**: Combined metric

### Report Files
```
archive/test-results/
├── comprehensive-live-test-results.json
├── comprehensive-implementation-test-results.json
├── mcp-integrated-test-results.json
├── implementation-test-summary.md
└── consolidated_test_report_YYYYMMDD_HHMMSS.md
```

## 🔧 Troubleshooting

### Common Issues

#### Authentication Failures
```bash
# Check Supabase connection
curl -H "apikey: YOUR_KEY" https://mylgegkqoddcrxtwcclb.supabase.co/rest/v1/

# Reset admin password if needed
node scripts/setup/reset-admin-password.js
```

#### Function Not Found (404)
- Check function exists in `/functions` directory
- Verify Cloudflare Pages routing
- Check `_routes.json` configuration

#### Server Errors (500)
- Review function implementation
- Check database connections
- Verify environment variables

#### Database Issues
- Run MCP health checks
- Verify table structures
- Check RLS policies

### Debug Mode

Enable verbose logging:
```bash
DEBUG=1 ./scripts/tests/run-comprehensive-tests.sh
```

## 📋 Pre-Test Checklist

- [ ] Cloudflare Pages deployment is up-to-date
- [ ] Supabase database is accessible
- [ ] Admin credentials are valid
- [ ] Student test account exists
- [ ] Environment variables are set
- [ ] Network connectivity is stable

## 🚀 Deployment Workflow

### After Testing

1. **If All Tests Pass**:
   ```bash
   git add .
   git commit -m "All tests passing - ready for production"
   git push origin main
   ```

2. **If Tests Fail**:
   - Review test reports
   - Fix identified issues
   - Re-run tests
   - Deploy only after all tests pass

### Continuous Testing

Set up automated testing:
```bash
# Add to GitHub Actions or cron job
0 */6 * * * cd /path/to/mihasv3 && ./scripts/tests/run-comprehensive-tests.sh
```

## 📊 Expected Results

### Healthy System Metrics
- **Function Success Rate**: >95%
- **Critical Functions**: 100% success
- **Implementation Quality**: >70 average score
- **MCP Auto-fixes**: <10% of functions need fixes

### Function Categories
- **Core (Auth, Health)**: Must be 100%
- **Applications**: Should be >95%
- **Admin Functions**: Should be >90%
- **Analytics**: Can be >80%
- **Utilities**: Can be >75%

## 🔍 Detailed Function List

### Critical Functions (Must Work)
1. `/health` - System health check
2. `/auth/signin` - User authentication
3. `/auth/signup` - User registration
4. `/applications` - Application management
5. `/admin/dashboard` - Admin interface

### High Priority Functions
6. `/applications/details` - Application details
7. `/applications/summary` - Application summary
8. `/admin/users` - User management
9. `/catalog/programs` - Program catalog
10. `/notifications` - Notification system

### Medium Priority Functions
11. `/documents/upload` - File uploads
12. `/generate/pdf` - PDF generation
13. `/send-email` - Email service
14. `/analytics/metrics` - Analytics
15. `/interview/schedule` - Interview scheduling

### Low Priority Functions
16. `/debug/test` - Debug utilities
17. `/cron/cleanup-sessions` - Maintenance
18. `/push/subscriptions` - Push notifications
19. `/api/ai/predict` - AI features
20. `/analytics/telemetry` - Telemetry

## 🎯 Success Criteria

### Ready for Production
- ✅ All critical functions working (100%)
- ✅ High priority functions >95% success
- ✅ No security vulnerabilities
- ✅ Database connections stable
- ✅ Authentication working properly

### Needs Attention
- ⚠️ Critical functions failing
- ⚠️ High priority functions <90% success
- ⚠️ Security issues detected
- ⚠️ Database connection problems

## 📞 Support

If tests fail consistently:

1. **Check System Status**: Verify Cloudflare and Supabase status
2. **Review Logs**: Check detailed error messages
3. **Database Health**: Run MCP diagnostics
4. **Network Issues**: Test connectivity
5. **Code Issues**: Review recent changes

## 🔄 Continuous Improvement

### Test Enhancement
- Add more edge cases
- Improve error detection
- Enhance MCP integration
- Add performance metrics

### Monitoring Integration
- Set up alerts for test failures
- Track success rates over time
- Monitor function performance
- Automate issue resolution

---

**Version**: 1.0  
**Last Updated**: 2025-01-23  
**Maintainer**: MIHAS Development Team