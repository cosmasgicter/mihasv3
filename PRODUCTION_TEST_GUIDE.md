# MIHAS Production Test Guide

## 🎯 Production Testing Overview

This guide covers running comprehensive tests against the production MIHAS application system with automatic TestMonitor integration and no GitHub dependencies.

## 🔧 Configuration

### Environment Variables
Production tests use `.env.production.test` with:
- Production Supabase credentials
- Production API endpoints
- TestMonitor configuration
- Real user credentials for testing

### Key Features
- ✅ Tests run against production environment
- ✅ Automatic TestMonitor submission
- ✅ No GitHub integration
- ✅ Real credential testing
- ✅ Comprehensive coverage

## 🚀 Running Production Tests

### Quick Start
```bash
# Run all production tests
./run-production-tests.sh
```

### Individual Test Suites
```bash
# Production authentication tests
npm run test:production:auth

# Full production test suite
npm run test:production:full

# Specific test categories
npm run test:production
npm run test:unit:coverage
```

## 📊 Test Categories

### 1. Authentication Tests (`tests/production-auth.spec.ts`)
- Admin login with production credentials
- Student login with production credentials
- API authentication validation
- Session persistence testing

### 2. API Tests (`tests/api/`)
- All production API endpoints
- Health checks
- Data retrieval tests
- Error handling validation

### 3. Navigation Tests (`tests/navigation/`)
- All route navigation
- Protected route access
- Role-based redirects
- 404 handling

### 4. Mobile Tests (`tests/mobile/`)
- Responsive design validation
- Touch target compliance
- Mobile navigation
- Cross-device compatibility

### 5. Dashboard Tests (`tests/dashboards/`)
- Student dashboard functionality
- Admin dashboard features
- Real-time updates
- Data visualization

### 6. Component Tests (`tests/components/`)
- UI component functionality
- Form validation
- File upload systems
- Interactive elements

### 7. Security Tests (`tests/integration/security.spec.ts`)
- XSS protection
- CSRF validation
- Authentication bypass attempts
- Input sanitization

### 8. Performance Tests (`tests/integration/performance.spec.ts`)
- Page load times
- API response times
- Core Web Vitals
- Resource optimization

### 9. Master Test Suite (`tests/master-test-suite.spec.ts`)
- Overall system health
- Critical user journeys
- Production readiness validation

## 🔐 Production Credentials

### Test Accounts
- **Admin**: `admin@mihas.edu.zm` / `ProductionAdmin2024!`
- **Student**: `student@mihas.edu.zm` / `ProductionStudent2024!`

### API Endpoints
- **Base URL**: `https://apply.mihas.edu.zm`
- **API URL**: `https://apply.mihas.edu.zm/.netlify/functions`

## 📈 TestMonitor Integration

### Automatic Submission
Tests automatically submit results to TestMonitor:
- **Domain**: `beanola.testmonitor.com`
- **Token**: `In78BvhEih3287tzTriGrALF1sv38hqb`

### Result Files
- Playwright: `test-results/production-results.xml`
- Unit Tests: `coverage/junit.xml`
- Reports: `test-results/production-report-*.json`

## 🚫 GitHub Integration Disabled

Production tests explicitly disable:
- GitHub Actions
- CI environment variables
- Git hooks
- Workflow triggers

## 📋 Test Execution Flow

1. **Environment Setup**
   - Load production environment variables
   - Disable GitHub integration
   - Verify production endpoints

2. **Test Execution**
   - Run authentication tests
   - Execute API validation
   - Perform navigation testing
   - Validate mobile experience
   - Test dashboard functionality
   - Check component behavior
   - Verify security measures
   - Measure performance
   - Run master validation

3. **Result Submission**
   - Automatic TestMonitor submission
   - Generate production reports
   - Create execution summary

## 🎯 Success Criteria

### Production Ready Indicators
- ✅ All authentication flows work
- ✅ API endpoints respond correctly
- ✅ Navigation functions properly
- ✅ Mobile experience is optimal
- ✅ Dashboards load and function
- ✅ Components work as expected
- ✅ Security measures are active
- ✅ Performance meets standards
- ✅ Overall system health is good

### Failure Handling
- Failed tests are logged with details
- TestMonitor receives all results
- Production reports include failure analysis
- Exit codes indicate overall status

## 🔍 Monitoring & Reports

### Real-time Monitoring
- Console output with color coding
- Progress indicators for each test suite
- Immediate pass/fail feedback

### Generated Reports
- JSON reports with detailed metrics
- TestMonitor dashboard integration
- Historical test result tracking

## 🛠 Troubleshooting

### Common Issues
1. **Network Connectivity**: Verify production endpoints are accessible
2. **Credentials**: Ensure test accounts are active and passwords are current
3. **Browser Dependencies**: Run `npx playwright install --with-deps`
4. **Environment Variables**: Check `.env.production.test` configuration

### Debug Commands
```bash
# Run with debug output
DEBUG=* npm run test:production:auth

# Run specific test with UI
npx playwright test tests/production-auth.spec.ts --ui --config=playwright.config.production.ts

# Check environment configuration
cat .env.production.test
```

## 📞 Support

For production testing issues:
1. Check test execution logs
2. Verify TestMonitor submission
3. Review production reports
4. Contact system administrators if needed

---

**Version**: 2.0.0 Production  
**Last Updated**: 2025-01-23  
**Environment**: Production Ready