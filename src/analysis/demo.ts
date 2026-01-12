/**
 * MIHAS Analysis Infrastructure Demo
 * 
 * Demonstrates the comprehensive analysis capabilities
 * Requirements: 1.1, 1.2, 1.3, 2.1, 8.1
 */

import { AnalysisOrchestrator } from './AnalysisOrchestrator';

/**
 * Demo function to showcase the analysis infrastructure
 */
export async function runAnalysisDemo(): Promise<void> {
  console.log('🚀 MIHAS Analysis Infrastructure Demo');
  console.log('=====================================');

  try {
    // Initialize the analysis orchestrator
    const orchestrator = new AnalysisOrchestrator({
      security_scan_enabled: true,
      schema_analysis_enabled: true,
      performance_monitoring_enabled: true,
      api_analysis_enabled: true,
      scan_interval_hours: 24,
      alert_thresholds: {
        critical_vulnerabilities: 1,
        performance_degradation_percent: 20,
        error_rate_percent: 5
      }
    });

    console.log('✅ Analysis orchestrator initialized');

    // Run comprehensive analysis
    console.log('\n🔍 Running comprehensive system analysis...');
    const analysisResults = await orchestrator.runComprehensiveAnalysis();

    console.log('\n📊 Analysis Results Summary:');
    console.log(`- Security vulnerabilities found: ${analysisResults.securityResults.metadata?.total_vulnerabilities || 0}`);
    console.log(`- Critical security issues: ${analysisResults.securityResults.metadata?.critical_count || 0}`);
    console.log(`- Schema redundancies found: ${analysisResults.schemaResults.metadata?.total_redundancies || 0}`);
    console.log(`- Performance alerts: ${analysisResults.performanceResults.metadata?.alert_count || 0}`);

    // Display report summary
    console.log('\n📋 Report Summary:');
    console.log(`- Total issues: ${analysisResults.report.summary.total_issues}`);
    console.log(`- Critical issues: ${analysisResults.report.summary.critical_issues}`);
    console.log(`- Resolved issues: ${analysisResults.report.summary.resolved_issues}`);
    console.log(`- Pending issues: ${analysisResults.report.summary.pending_issues}`);

    // Run property-based tests
    console.log('\n🧪 Running property-based tests...');
    await orchestrator.runPropertyTests();

    // Get dashboard data
    console.log('\n📈 Dashboard Data:');
    const dashboardData = await orchestrator.getDashboardData();
    console.log(`- System health: ${dashboardData.system_health}`);
    console.log(`- Security summary: ${JSON.stringify(dashboardData.security_summary)}`);
    console.log(`- Performance summary: ${JSON.stringify(dashboardData.performance_summary)}`);

    // Start continuous monitoring (for demo, we'll stop it immediately)
    console.log('\n🔄 Testing continuous monitoring...');
    orchestrator.startContinuousMonitoring();
    
    // Wait a moment to show monitoring is active
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    orchestrator.stopContinuousMonitoring();
    console.log('✅ Continuous monitoring test completed');

    // Export results
    console.log('\n📤 Exporting results...');
    const jsonExport = orchestrator.exportResults('json');
    const markdownExport = orchestrator.exportResults('markdown');
    
    console.log(`- JSON export size: ${jsonExport.length} characters`);
    console.log(`- Markdown export size: ${markdownExport.length} characters`);

    console.log('\n✅ Analysis infrastructure demo completed successfully!');
    console.log('\n🎯 Key Features Demonstrated:');
    console.log('  ✓ Security vulnerability detection');
    console.log('  ✓ Database schema analysis');
    console.log('  ✓ Performance monitoring');
    console.log('  ✓ Property-based testing');
    console.log('  ✓ Comprehensive reporting');
    console.log('  ✓ Continuous monitoring');
    console.log('  ✓ Dashboard integration');
    console.log('  ✓ Data export capabilities');

  } catch (error) {
    console.error('❌ Analysis demo failed:', error);
    throw error;
  }
}

/**
 * Run security-focused analysis demo
 */
export async function runSecurityAnalysisDemo(): Promise<void> {
  console.log('🔒 Security Analysis Demo');
  console.log('========================');

  const orchestrator = new AnalysisOrchestrator();
  
  try {
    const { securityResults, report } = await orchestrator.runSecurityAnalysis();
    
    console.log('🔍 Security Analysis Results:');
    console.log(`- Total vulnerabilities: ${securityResults.metadata?.total_vulnerabilities || 0}`);
    console.log(`- Critical vulnerabilities: ${securityResults.metadata?.critical_count || 0}`);
    console.log(`- Warning vulnerabilities: ${securityResults.metadata?.warning_count || 0}`);
    
    const vulnerabilities = securityResults.results?.vulnerabilities || [];
    
    if (vulnerabilities.length > 0) {
      console.log('\n🚨 Detected Vulnerabilities:');
      vulnerabilities.forEach((vuln, index) => {
        console.log(`${index + 1}. ${vuln.entity_name} (${vuln.type})`);
        console.log(`   Severity: ${vuln.severity}`);
        console.log(`   Description: ${vuln.description}`);
        console.log(`   Remediation steps: ${vuln.remediation_steps.length}`);
      });
    }

    console.log('\n✅ Security analysis demo completed');
    
  } catch (error) {
    console.error('❌ Security analysis demo failed:', error);
    throw error;
  }
}

/**
 * Run performance monitoring demo
 */
export async function runPerformanceMonitoringDemo(): Promise<void> {
  console.log('⚡ Performance Monitoring Demo');
  console.log('=============================');

  const orchestrator = new AnalysisOrchestrator();
  
  try {
    const { performanceResults, report } = await orchestrator.runPerformanceAnalysis();
    
    console.log('📊 Performance Analysis Results:');
    console.log(`- Total metrics collected: ${performanceResults.metadata?.total_metrics || 0}`);
    console.log(`- Active alerts: ${performanceResults.metadata?.alert_count || 0}`);
    console.log(`- Monitoring status: ${performanceResults.metadata?.monitoring_active ? 'Active' : 'Inactive'}`);
    
    const metrics = performanceResults.results?.metrics || [];
    
    if (metrics.length > 0) {
      console.log('\n📈 Recent Performance Metrics:');
      metrics.slice(0, 5).forEach((metric, index) => {
        console.log(`${index + 1}. ${metric.metric_name}: ${metric.value} ${metric.unit}`);
        if (metric.endpoint) {
          console.log(`   Endpoint: ${metric.endpoint}`);
        }
      });
    }

    console.log('\n✅ Performance monitoring demo completed');
    
  } catch (error) {
    console.error('❌ Performance monitoring demo failed:', error);
    throw error;
  }
}

// Export demo functions for use in development
if (typeof window !== 'undefined') {
  (window as any).mihasAnalysisDemo = {
    runAnalysisDemo,
    runSecurityAnalysisDemo,
    runPerformanceMonitoringDemo
  };
}