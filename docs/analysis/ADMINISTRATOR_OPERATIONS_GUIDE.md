# MIHAS System Analysis - Administrator Operations Guide

## Overview

This guide provides step-by-step instructions for system administrators and operators to use the MIHAS System Analysis and Enhancement framework effectively.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [System Health Dashboard](#system-health-dashboard)
3. [Security Management](#security-management)
4. [Performance Optimization](#performance-optimization)
5. [Incident Response](#incident-response)
6. [Maintenance Tasks](#maintenance-tasks)
7. [Reporting](#reporting)

## Daily Operations

### Morning Health Check

**Time Required**: 5-10 minutes

1. **Access the System Health Dashboard**
   - Navigate to `/admin/system-health`
   - Review the overall health status badge
   - Check for any critical alerts

2. **Review Key Metrics**
   - Security: Check for new vulnerabilities
   - Performance: Review average response times
   - Database: Check for schema issues

3. **Address Critical Issues**
   - If critical issues are present, follow the remediation steps provided
   - Document any actions taken

### Continuous Monitoring

The system automatically monitors:
- Security vulnerabilities (scanned every 24 hours)
- Performance metrics (collected every 30 seconds)
- System alerts (real-time)

**Auto-refresh**: The dashboard auto-refreshes every 30 seconds when enabled.

## System Health Dashboard

### Accessing the Dashboard

1. Log in as an administrator
2. Navigate to **Admin** → **System Health** or go directly to `/admin/system-health`

### Dashboard Sections

#### 1. Overall Health Status

**Indicators**:
- 🟢 **Healthy**: No critical issues, system operating normally
- 🟡 **Warning**: Some issues detected, monitoring recommended
- 🔴 **Critical**: Critical issues requiring immediate attention

#### 2. Security Status Card

**Metrics**:
- Total Vulnerabilities: Count of all detected security issues
- Critical Issues: Count of critical security vulnerabilities

**Actions**:
- If critical count > 0: Click "View Security Report" for details
- Review remediation steps for each vulnerability
- Apply fixes following the security management procedures

#### 3. Performance Status Card

**Metrics**:
- Active Alerts: Number of performance issues
- Avg Response Time: Average API response time in milliseconds

**Thresholds**:
- ✅ Good: < 500ms
- ⚠️ Warning: 500-1000ms
- 🔴 Critical: > 1000ms

**Actions**:
- If response time > 1000ms: Click "View Performance Report"
- Review slow endpoints
- Apply optimization recommendations

#### 4. Database Status Card

**Metrics**:
- Total Issues: Schema redundancies and integrity issues
- High Priority: Issues requiring immediate attention

**Actions**:
- Review schema optimization recommendations
- Plan database maintenance windows
- Apply optimizations during low-traffic periods

#### 5. Recent Alerts Section

**Alert Types**:
- 🔴 Critical: Requires immediate action
- 🟡 Warning: Monitor and plan remediation

**Information Displayed**:
- Alert message
- Affected endpoint (if applicable)
- Timestamp

#### 6. Actionable Insights Section

Provides specific, prioritized recommendations:
- Security actions required
- Performance optimizations
- Database improvements

### Dashboard Actions

#### Refresh Button
- Manually refresh all dashboard data
- Use when you want the latest information immediately

#### Run Full Analysis Button
- Triggers a comprehensive system analysis
- Scans security, performance, and database
- Takes 1-2 minutes to complete
- Use when investigating issues or after making changes

#### Export Report Button
- Downloads a Markdown report of current system status
- Includes all metrics and recommendations
- Use for compliance documentation or sharing with team

#### Auto-refresh Toggle
- Enables/disables automatic 30-second refresh
- Keep enabled for real-time monitoring
- Disable to reduce server load during investigations

## Security Management

### Responding to Security Vulnerabilities

#### Step 1: Identify the Vulnerability

1. Check the Security Status card for critical count
2. Click "View Security Report" (or run full analysis)
3. Review the vulnerability details:
   - Type (Security Definer View, Mutable Search Path, etc.)
   - Severity (ERROR, WARN, INFO)
   - Affected entity name
   - Description

#### Step 2: Review Remediation Steps

Each vulnerability includes specific remediation steps. Example:

**Security Definer View**:
```sql
-- Step 1: Review the necessity of SECURITY DEFINER
-- Step 2: Change to SECURITY INVOKER if possible
ALTER VIEW schema_name.view_name SET security_invoker = true;

-- Step 3: Test all dependent queries
-- Step 4: Ensure RLS policies cover underlying tables
```

#### Step 3: Plan the Fix

1. **Assess Impact**: Determine if the fix requires downtime
2. **Schedule**: Plan the fix during a maintenance window if needed
3. **Backup**: Ensure recent backups are available
4. **Test**: Prepare a test environment

#### Step 4: Apply the Fix

1. **Staging First**: Apply the fix in staging environment
2. **Test Thoroughly**: Verify all functionality works
3. **Production**: Apply to production during maintenance window
4. **Verify**: Run security scan to confirm vulnerability is resolved

#### Step 5: Document

1. Record the vulnerability ID
2. Document the fix applied
3. Note the date and time
4. Update compliance records

### Security Vulnerability Types

#### 1. Security Definer Views (Critical)

**What it is**: Views that bypass Row Level Security

**Risk**: Unauthorized data access

**Fix Time**: 30 minutes per view

**Requires Downtime**: Yes (brief)

**Remediation**:
```sql
ALTER VIEW view_name SET security_invoker = true;
```

#### 2. Mutable Search Path Functions (Critical)

**What it is**: Functions vulnerable to search path manipulation

**Risk**: SQL injection, privilege escalation

**Fix Time**: 15 minutes per function

**Requires Downtime**: Yes (brief)

**Remediation**:
```sql
CREATE OR REPLACE FUNCTION function_name()
...
SET search_path = schema_name, pg_temp
...
```

#### 3. Overly Permissive RLS Policies (Critical)

**What it is**: RLS policies that allow all access

**Risk**: Unauthorized data access

**Fix Time**: 45 minutes per policy

**Requires Downtime**: No

**Remediation**:
```sql
DROP POLICY policy_name ON table_name;
CREATE POLICY policy_name ON table_name
  USING (auth.uid() = user_id);
```

#### 4. Disabled Password Protection (Warning)

**What it is**: Leaked password protection not enabled

**Risk**: Users can use compromised passwords

**Fix Time**: 5 minutes

**Requires Downtime**: No

**Remediation**:
1. Go to Supabase Dashboard → Authentication → Settings
2. Enable "Prevent sign-ups with leaked passwords"

## Performance Optimization

### Identifying Performance Issues

1. **Check Performance Status Card**
   - Review average response time
   - Check active alerts count

2. **Run Full Analysis**
   - Click "Run Full Analysis" button
   - Wait for completion (1-2 minutes)
   - Review performance report

3. **Identify Slow Endpoints**
   - Look for endpoints with response time > 1000ms
   - Note the frequency of slow responses

### Optimization Strategies

#### 1. Database Query Optimization

**Symptoms**:
- High response times on specific endpoints
- Database CPU usage spikes

**Actions**:
1. Identify slow queries in performance report
2. Review query execution plans
3. Add appropriate indexes
4. Optimize query structure

**Example**:
```sql
-- Add index for frequently queried column
CREATE INDEX idx_applications_user_id ON applications(user_id);

-- Update table statistics
ANALYZE applications;
```

#### 2. API Endpoint Optimization

**Symptoms**:
- Slow response times across multiple endpoints
- High error rates

**Actions**:
1. Review endpoint implementation
2. Add caching where appropriate
3. Optimize data fetching
4. Reduce payload size

#### 3. Resource Scaling

**Symptoms**:
- Consistently high response times
- Resource utilization > 80%

**Actions**:
1. Review current resource allocation
2. Consider vertical scaling (more CPU/RAM)
3. Consider horizontal scaling (more instances)
4. Implement load balancing

### Performance Monitoring Best Practices

1. **Set Baselines**: Establish normal performance metrics
2. **Monitor Trends**: Watch for gradual degradation
3. **Alert Thresholds**: Configure appropriate alert levels
4. **Regular Reviews**: Weekly performance report reviews

## Incident Response

### Critical System Alert

**When**: System health status shows "Critical"

**Response Time**: Immediate (within 15 minutes)

**Steps**:

1. **Assess the Situation**
   - Review the System Health Dashboard
   - Identify the critical issue(s)
   - Determine impact on users

2. **Notify Stakeholders**
   - Alert technical team
   - Notify management if user-facing
   - Prepare status update

3. **Immediate Actions**
   - If security issue: Review and apply emergency fixes
   - If performance issue: Scale resources if possible
   - If database issue: Check for data corruption

4. **Remediation**
   - Follow specific remediation steps
   - Test fixes in staging if time permits
   - Apply fixes to production
   - Verify resolution

5. **Post-Incident**
   - Document the incident
   - Update runbooks
   - Schedule post-mortem review

### Warning System Alert

**When**: System health status shows "Warning"

**Response Time**: Within 4 hours

**Steps**:

1. **Review the Alert**
   - Check Recent Alerts section
   - Understand the warning details

2. **Plan Remediation**
   - Schedule fix during next maintenance window
   - Prepare necessary resources
   - Test fixes in staging

3. **Monitor**
   - Watch for escalation to critical
   - Track frequency of warnings

4. **Apply Fix**
   - During scheduled maintenance
   - Verify resolution
   - Document actions taken

## Maintenance Tasks

### Daily Tasks

- [ ] Review System Health Dashboard
- [ ] Check for critical alerts
- [ ] Review security vulnerability count
- [ ] Monitor average response times

### Weekly Tasks

- [ ] Export system health report
- [ ] Review performance trends
- [ ] Check for new security vulnerabilities
- [ ] Review database optimization recommendations
- [ ] Update documentation with any changes

### Monthly Tasks

- [ ] Comprehensive security audit
- [ ] Performance baseline review
- [ ] Database maintenance (vacuum, analyze)
- [ ] Review and update alert thresholds
- [ ] Compliance report generation
- [ ] Team training on new features

### Quarterly Tasks

- [ ] Full system analysis and optimization
- [ ] Security policy review
- [ ] Disaster recovery testing
- [ ] Capacity planning review
- [ ] Update operational procedures

## Reporting

### Daily Status Report

**Purpose**: Quick health check summary

**Contents**:
- Overall health status
- Critical issues count
- Key metrics (security, performance, database)
- Actions taken

**Distribution**: Technical team

### Weekly Performance Report

**Purpose**: Track performance trends

**Contents**:
- Average response times
- Error rates
- Slow endpoints
- Optimization recommendations
- Actions taken

**Distribution**: Technical team, management

### Monthly Security Report

**Purpose**: Security posture assessment

**Contents**:
- Vulnerabilities detected and resolved
- Security scan results
- Compliance status
- Remediation actions
- Recommendations

**Distribution**: Security team, management, compliance

### Quarterly Executive Summary

**Purpose**: High-level system health overview

**Contents**:
- System health trends
- Major incidents and resolutions
- Performance improvements
- Security enhancements
- Future recommendations

**Distribution**: Executive team, stakeholders

### Generating Reports

**From Dashboard**:
1. Click "Export Report" button
2. Save the Markdown file
3. Convert to PDF if needed for distribution

**Programmatically**:
```typescript
import { AnalysisOrchestrator } from '@/analysis/AnalysisOrchestrator';

const orchestrator = new AnalysisOrchestrator();
const report = orchestrator.exportResults('markdown');
// Save report to file
```

## Emergency Contacts

### Critical Issues
- **Security Vulnerabilities**: security@mihas.edu.zm
- **System Outages**: ops@mihas.edu.zm
- **Database Issues**: dba@mihas.edu.zm

### Escalation Path
1. System Administrator (First Response)
2. Technical Lead (Within 30 minutes)
3. CTO (Critical issues only)

## Additional Resources

- [System Analysis Guide](./SYSTEM_ANALYSIS_GUIDE.md)
- [API Reference](./SYSTEM_ANALYSIS_GUIDE.md#api-reference)
- [Design Document](../../.kiro/specs/mihas-system-analysis/design.md)
- [Requirements Document](../../.kiro/specs/mihas-system-analysis/requirements.md)

## Appendix: Quick Reference Commands

### Check System Health
```typescript
const orchestrator = new AnalysisOrchestrator();
const health = await orchestrator.getDashboardData();
console.log(health.system_health);
```

### Run Security Scan
```typescript
const analyzer = new SecurityAnalyzer();
const result = await analyzer.performSecurityAnalysis();
```

### Export Report
```typescript
const report = orchestrator.exportResults('markdown');
```

### Start Monitoring
```typescript
orchestrator.startContinuousMonitoring();
```

---

**Document Version**: 1.0.0  
**Last Updated**: January 14, 2025  
**Maintained By**: MIHAS Technical Team
