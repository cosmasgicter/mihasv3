# MIHAS System Analysis & Enhancement Guide

## Overview

This guide provides comprehensive documentation for the MIHAS System Analysis and Enhancement framework. The framework provides automated security scanning, performance monitoring, schema optimization, and integrated remediation capabilities.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Getting Started](#getting-started)
4. [Security Analysis](#security-analysis)
5. [Performance Monitoring](#performance-monitoring)
6. [Database Schema Analysis](#database-schema-analysis)
7. [System Integration](#system-integration)
8. [System Health Dashboard](#system-health-dashboard)
9. [API Reference](#api-reference)
10. [Best Practices](#best-practices)

## Architecture Overview

The MIHAS Analysis Framework consists of several integrated components:

```
┌─────────────────────────────────────────────────────────────┐
│                   Analysis Orchestrator                      │
│  (Coordinates all analysis components)                      │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌──────▼──────┐  ┌────────▼────────┐
│    Security    │  │ Performance │  │  Schema         │
│    Analyzer    │  │  Monitor    │  │  Analyzer       │
└────────────────┘  └─────────────┘  └─────────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                ┌───────────▼───────────┐
                │  System Integrator    │
                │  (Remediation Engine) │
                └───────────────────────┘
                            │
                ┌───────────▼───────────┐
                │ Notification System   │
                │ (Multi-channel)       │
                └───────────────────────┘
```

## Core Components

### 1. Analysis Orchestrator

The central coordinator for all analysis operations.

**Location**: `src/analysis/AnalysisOrchestrator.ts`

**Key Features**:
- Coordinates security, performance, and schema analysis
- Generates comprehensive reports
- Manages continuous monitoring
- Triggers critical alerts

**Usage**:
```typescript
import { AnalysisOrchestrator } from '@/analysis/AnalysisOrchestrator';

const orchestrator = new AnalysisOrchestrator({
  security_scan_enabled: true,
  schema_analysis_enabled: true,
  performance_monitoring_enabled: true,
  scan_interval_hours: 24
});

// Run comprehensive analysis
const results = await orchestrator.runComprehensiveAnalysis();

// Get dashboard data
const dashboardData = await orchestrator.getDashboardData();

// Start continuous monitoring
orchestrator.startContinuousMonitoring();
```

### 2. Security Analyzer

Detects and reports security vulnerabilities in the database and application.

**Location**: `src/analysis/security/SecurityAnalyzer.ts`

**Detects**:
- Security Definer Views (12 found)
- Mutable Search Path Functions (70+ found)
- Overly Permissive RLS Policies (13 found)
- Disabled Password Protection

**Usage**:
```typescript
import { SecurityAnalyzer } from '@/analysis/security/SecurityAnalyzer';

const analyzer = new SecurityAnalyzer();
const result = await analyzer.performSecurityAnalysis();

// Get vulnerabilities
const vulnerabilities = analyzer.getVulnerabilities();

// Generate remediation steps
const steps = analyzer.generateRemediationSteps(vulnerabilityId);
```

### 3. Performance Monitor

Tracks system performance metrics and identifies bottlenecks.

**Location**: `src/analysis/performance/PerformanceMonitor.ts`

**Monitors**:
- API response times
- Error rates
- Resource utilization
- Database query performance

**Usage**:
```typescript
import { PerformanceMonitor } from '@/analysis/performance/PerformanceMonitor';

const monitor = new PerformanceMonitor();

// Start monitoring
monitor.startMonitoring(30000); // 30 second intervals

// Get recent metrics
const metrics = monitor.getRecentMetrics(100);

// Stop monitoring
monitor.stopMonitoring();
```

### 4. Schema Analyzer

Analyzes database schema for redundancies and optimization opportunities.

**Location**: `src/analysis/database/SchemaAnalyzer.ts`

**Analyzes**:
- Duplicate tables and structures
- Orphaned records
- Missing indexes
- Foreign key constraints

**Usage**:
```typescript
import { SchemaAnalyzer } from '@/analysis/database/SchemaAnalyzer';

const analyzer = new SchemaAnalyzer();
const result = await analyzer.performSchemaAnalysis();
```

### 5. System Integrator

Connects all components and provides integrated remediation.

**Location**: `src/analysis/integration/SystemIntegrator.ts`

**Features**:
- Security remediation automation
- Performance optimization recommendations
- Notification system integration
- Integrated health checks

**Usage**:
```typescript
import { SystemIntegrator } from '@/analysis/integration/SystemIntegrator';

const integrator = new SystemIntegrator({
  auto_remediation_enabled: false, // Safety first
  notification_integration_enabled: true,
  performance_optimization_enabled: true
});

// Integrate security remediation
const securityResult = await integrator.integrateSecurityRemediation();

// Integrate performance optimization
const perfResult = await integrator.integratePerformanceOptimization();

// Run integrated health check
const healthCheck = await integrator.runIntegratedHealthCheck();
```

## Getting Started

### Installation

The analysis framework is already integrated into the MIHAS system. No additional installation required.

### Basic Usage

1. **Run a Quick Security Scan**:
```typescript
import { SecurityAnalyzer } from '@/analysis/security/SecurityAnalyzer';

const analyzer = new SecurityAnalyzer();
const result = await analyzer.performSecurityAnalysis();

console.log(`Found ${result.results.vulnerabilities.length} vulnerabilities`);
```

2. **Check System Health**:
```typescript
import { AnalysisOrchestrator } from '@/analysis/AnalysisOrchestrator';

const orchestrator = new AnalysisOrchestrator();
const health = await orchestrator.getDashboardData();

console.log(`System health: ${health.system_health}`);
```

3. **Access the Dashboard**:
Navigate to `/admin/system-health` in your browser to view the comprehensive system health dashboard.

## Security Analysis

### Vulnerability Types

#### 1. Security Definer Views

**Risk Level**: Critical

**Description**: Views that execute with creator privileges instead of user privileges, bypassing Row Level Security.

**Detection**: Automatically scanned by SecurityAnalyzer

**Remediation**:
```sql
-- Change from SECURITY DEFINER to SECURITY INVOKER
ALTER VIEW schema_name.view_name SET security_invoker = true;
```

#### 2. Mutable Search Path Functions

**Risk Level**: Critical

**Description**: Functions without explicit search_path settings are vulnerable to search path manipulation attacks.

**Detection**: Analyzed by FunctionSearchPathAnalyzer

**Remediation**:
```sql
-- Add explicit search_path to function
CREATE OR REPLACE FUNCTION schema_name.function_name()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = schema_name, pg_temp
AS $$
BEGIN
  -- Function body
END;
$$;
```

#### 3. Overly Permissive RLS Policies

**Risk Level**: Critical

**Description**: RLS policies using `USING (true)` or `WITH CHECK (true)` effectively disable row-level security.

**Detection**: Automatically scanned by SecurityAnalyzer

**Remediation**:
```sql
-- Replace permissive policy with specific conditions
DROP POLICY IF EXISTS policy_name ON table_name;

CREATE POLICY policy_name ON table_name
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Running Security Scans

**Manual Scan**:
```typescript
const analyzer = new SecurityAnalyzer();
const result = await analyzer.performSecurityAnalysis();
```

**Scheduled Scans**:
```typescript
const orchestrator = new AnalysisOrchestrator({
  scan_interval_hours: 24 // Daily scans
});
orchestrator.startContinuousMonitoring();
```

## Performance Monitoring

### Metrics Tracked

1. **Response Times**: API endpoint response times
2. **Error Rates**: Percentage of failed requests
3. **Resource Utilization**: CPU, memory, database connections
4. **Query Performance**: Slow query detection

### Setting Up Monitoring

```typescript
import { PerformanceMonitor } from '@/analysis/performance/PerformanceMonitor';

const monitor = new PerformanceMonitor();

// Start monitoring with 30-second intervals
monitor.startMonitoring(30000);

// Get recent metrics
const metrics = monitor.getRecentMetrics(100);

// Filter by metric type
const responseTimes = metrics.filter(m => m.metric_type === 'response_time');
```

### Performance Thresholds

Default thresholds can be configured:

```typescript
const orchestrator = new AnalysisOrchestrator({
  alert_thresholds: {
    critical_vulnerabilities: 1,
    performance_degradation_percent: 20,
    error_rate_percent: 5
  }
});
```

## Database Schema Analysis

### Analysis Types

1. **Redundancy Detection**: Identifies duplicate tables and structures
2. **Data Integrity**: Finds orphaned records and constraint violations
3. **Performance Optimization**: Recommends indexes and query improvements

### Running Schema Analysis

```typescript
import { SchemaAnalyzer } from '@/analysis/database/SchemaAnalyzer';

const analyzer = new SchemaAnalyzer();
const result = await analyzer.performSchemaAnalysis();

// Access results
const redundancies = result.results.redundancies;
const integrityIssues = result.results.integrity_issues;
```

## System Integration

### Integrated Health Checks

The System Integrator provides unified health checks across all components:

```typescript
import { SystemIntegrator } from '@/analysis/integration/SystemIntegrator';

const integrator = new SystemIntegrator();
const health = await integrator.runIntegratedHealthCheck();

console.log(`Overall Health: ${health.overall_health}`);
console.log(`Critical Issues: ${health.critical_issues}`);
console.log(`Recommendations:`, health.recommendations);
```

### Notification Integration

The system automatically notifies administrators of critical issues:

```typescript
// Notifications are sent automatically for critical issues
// Manual notification:
await integrator.notifyAdministrators(
  'System Alert',
  'Critical issue detected',
  'critical'
);
```

## System Health Dashboard

### Accessing the Dashboard

Navigate to `/admin/system-health` in your browser.

### Dashboard Features

1. **Overall Health Status**: Visual indicator of system health
2. **Security Metrics**: Vulnerability counts and severity
3. **Performance Metrics**: Response times and active alerts
4. **Database Metrics**: Schema issues and optimization opportunities
5. **Recent Alerts**: Timeline of system alerts
6. **Actionable Insights**: Specific recommendations for improvements

### Dashboard Actions

- **Refresh**: Manually refresh dashboard data
- **Run Full Analysis**: Trigger comprehensive system analysis
- **Export Report**: Download analysis report in Markdown format
- **Auto-refresh**: Toggle automatic 30-second refresh

## API Reference

### AnalysisOrchestrator

```typescript
class AnalysisOrchestrator {
  constructor(config?: Partial<AnalysisConfig>)
  
  // Run comprehensive analysis
  runComprehensiveAnalysis(): Promise<AnalysisResults>
  
  // Run security-focused analysis
  runSecurityAnalysis(): Promise<SecurityResults>
  
  // Run performance analysis
  runPerformanceAnalysis(): Promise<PerformanceResults>
  
  // Get dashboard data
  getDashboardData(): Promise<DashboardData>
  
  // Start continuous monitoring
  startContinuousMonitoring(): void
  
  // Stop continuous monitoring
  stopContinuousMonitoring(): void
  
  // Export results
  exportResults(format: 'json' | 'markdown'): string
}
```

### SecurityAnalyzer

```typescript
class SecurityAnalyzer {
  constructor()
  
  // Perform security analysis
  performSecurityAnalysis(): Promise<AnalysisResult>
  
  // Get all vulnerabilities
  getVulnerabilities(): SecurityVulnerability[]
  
  // Generate remediation steps
  generateRemediationSteps(vulnerabilityId: string): RemediationStep[]
}
```

### SystemIntegrator

```typescript
class SystemIntegrator {
  constructor(config?: Partial<IntegrationConfig>)
  
  // Integrate security remediation
  integrateSecurityRemediation(): Promise<RemediationResults>
  
  // Integrate performance optimization
  integratePerformanceOptimization(): Promise<OptimizationResults>
  
  // Integrate notification system
  integrateNotificationSystem(): Promise<NotificationStatus>
  
  // Run integrated health check
  runIntegratedHealthCheck(): Promise<HealthCheckResults>
  
  // Notify administrators
  notifyAdministrators(title: string, message: string, severity: string): Promise<boolean>
}
```

## Best Practices

### 1. Regular Security Scans

Run security scans at least daily:

```typescript
const orchestrator = new AnalysisOrchestrator({
  scan_interval_hours: 24
});
orchestrator.startContinuousMonitoring();
```

### 2. Monitor Performance Continuously

Keep performance monitoring active:

```typescript
const monitor = new PerformanceMonitor();
monitor.startMonitoring(30000); // 30 seconds
```

### 3. Review Dashboard Regularly

Check the System Health Dashboard daily for:
- New security vulnerabilities
- Performance degradation
- System alerts

### 4. Act on Critical Issues Immediately

When critical issues are detected:
1. Review the specific vulnerability or issue
2. Follow the provided remediation steps
3. Test changes in a staging environment
4. Apply fixes to production
5. Verify the issue is resolved

### 5. Export Reports for Compliance

Regularly export analysis reports for:
- Compliance audits
- Security reviews
- Performance tracking
- Historical analysis

```typescript
const report = orchestrator.exportResults('markdown');
// Save report for compliance records
```

### 6. Configure Appropriate Thresholds

Adjust alert thresholds based on your system requirements:

```typescript
const orchestrator = new AnalysisOrchestrator({
  alert_thresholds: {
    critical_vulnerabilities: 1,      // Alert on any critical vulnerability
    performance_degradation_percent: 20, // Alert on 20% performance drop
    error_rate_percent: 5             // Alert on 5% error rate
  }
});
```

### 7. Test Remediation in Staging

Always test security fixes and optimizations in a staging environment before applying to production.

### 8. Document Changes

Keep a log of all security fixes and optimizations applied to the system.

## Troubleshooting

### Issue: Security scan fails

**Solution**: Check Supabase credentials in environment variables:
```
VITE_SUPABASE_URL=your-url
VITE_SUPABASE_ANON_KEY=your-key
```

### Issue: Dashboard not loading

**Solution**: Ensure the analysis orchestrator is initialized and has completed at least one scan.

### Issue: Notifications not sending

**Solution**: Verify notification integration is enabled:
```typescript
const integrator = new SystemIntegrator({
  notification_integration_enabled: true
});
```

### Issue: Performance monitoring shows no data

**Solution**: Start the performance monitor:
```typescript
const monitor = new PerformanceMonitor();
monitor.startMonitoring(30000);
```

## Support

For additional support or questions:
- Review the inline code documentation
- Check the test files for usage examples
- Consult the design document at `.kiro/specs/mihas-system-analysis/design.md`

## Version History

- **v1.0.0** (2025-01-14): Initial release with security analysis, performance monitoring, and system integration
