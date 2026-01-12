import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

/**
 * Dashboard Generation API Endpoint
 * Generates dynamic dashboards with current KPIs and real-time data
 * Validates Requirements 5.2
 */
export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    // Authenticate user
    const authContext = await getUserFromRequest(request);
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'GET') {
      // Get dashboard layout
      const url = new URL(request.url);
      const layoutId = url.searchParams.get('layoutId') || 'default';
      const includeAlerts = url.searchParams.get('includeAlerts') !== 'false';

      const dashboard = await generateDashboardLayout(layoutId, includeAlerts);
      
      return new Response(JSON.stringify(dashboard), {
        status: 200,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    if (request.method === 'POST') {
      // Generate executive summary
      const { timeRange, reportType = 'executive' } = await request.json();
      
      if (!timeRange || !timeRange.startDate || !timeRange.endDate) {
        return new Response(JSON.stringify({ error: 'Time range is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let report;
      if (reportType === 'executive') {
        report = await generateExecutiveSummary(timeRange);
      } else {
        report = await generateDashboardLayout('default', true, timeRange);
      }

      return new Response(JSON.stringify(report), {
        status: 200,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json'
        }
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Dashboard generation error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to generate dashboard',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Generate dashboard layout with widgets
 */
async function generateDashboardLayout(layoutId, includeAlerts = true, timeRange = null) {
  // Get real-time metrics
  const realTimeMetrics = await getRealTimeMetrics();
  
  // Get comprehensive metrics if time range provided
  let comprehensiveMetrics = null;
  if (timeRange) {
    comprehensiveMetrics = await getComprehensiveMetrics(timeRange);
  }

  // Generate widgets
  const widgets = [];

  // KPI Widgets
  widgets.push(
    {
      id: 'active-applications',
      title: 'Active Applications',
      type: 'kpi',
      size: 'small',
      position: { row: 0, col: 0 },
      data: {
        id: 'active-applications',
        title: 'Active Applications',
        value: realTimeMetrics.activeApplications,
        format: 'number',
        color: 'primary',
        icon: 'applications'
      },
      refreshInterval: 30,
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'today-submissions',
      title: "Today's Submissions",
      type: 'kpi',
      size: 'small',
      position: { row: 0, col: 1 },
      data: {
        id: 'today-submissions',
        title: "Today's Submissions",
        value: realTimeMetrics.todaySubmissions,
        format: 'number',
        color: 'success',
        icon: 'submit'
      },
      refreshInterval: 30,
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'pending-reviews',
      title: 'Pending Reviews',
      type: 'kpi',
      size: 'small',
      position: { row: 0, col: 2 },
      data: {
        id: 'pending-reviews',
        title: 'Pending Reviews',
        value: realTimeMetrics.pendingReviews,
        format: 'number',
        color: 'warning',
        icon: 'review'
      },
      refreshInterval: 30,
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'avg-processing-time',
      title: 'Avg Processing Time',
      type: 'kpi',
      size: 'small',
      position: { row: 0, col: 3 },
      data: {
        id: 'avg-processing-time',
        title: 'Avg Processing Time',
        value: `${realTimeMetrics.averageProcessingTime} days`,
        format: 'duration',
        color: 'info',
        icon: 'clock'
      },
      refreshInterval: 30,
      lastUpdated: new Date().toISOString()
    }
  );

  // Add comprehensive metrics widgets if available
  if (comprehensiveMetrics) {
    widgets.push(
      {
        id: 'completion-rate',
        title: 'Completion Rate',
        type: 'kpi',
        size: 'small',
        position: { row: 1, col: 0 },
        data: {
          id: 'completion-rate',
          title: 'Completion Rate',
          value: comprehensiveMetrics.applicationMetrics.completionRate,
          format: 'percentage',
          color: 'success',
          icon: 'check'
        },
        refreshInterval: 300,
        lastUpdated: new Date().toISOString()
      },
      {
        id: 'approval-rate',
        title: 'Approval Rate',
        type: 'kpi',
        size: 'small',
        position: { row: 1, col: 1 },
        data: {
          id: 'approval-rate',
          title: 'Approval Rate',
          value: comprehensiveMetrics.applicationMetrics.approvalRate,
          format: 'percentage',
          color: 'primary',
          icon: 'approve'
        },
        refreshInterval: 300,
        lastUpdated: new Date().toISOString()
      }
    );

    // Add chart widgets
    if (comprehensiveMetrics.timeSeriesData.applications.length > 0) {
      widgets.push({
        id: 'applications-timeline',
        title: 'Applications Over Time',
        type: 'chart',
        size: 'large',
        position: { row: 2, col: 0 },
        data: {
          id: 'applications-timeline',
          title: 'Applications Over Time',
          type: 'line',
          data: comprehensiveMetrics.timeSeriesData.applications.map(point => ({
            x: new Date(point.timestamp).toLocaleDateString(),
            y: point.value,
            label: `${point.value} applications`
          })),
          xAxisLabel: 'Date',
          yAxisLabel: 'Applications',
          showLegend: false
        },
        refreshInterval: 300,
        lastUpdated: new Date().toISOString()
      });
    }

    // Program distribution chart
    if (comprehensiveMetrics.programMetrics.length > 0) {
      widgets.push({
        id: 'program-distribution',
        title: 'Applications by Program',
        type: 'chart',
        size: 'medium',
        position: { row: 2, col: 2 },
        data: {
          id: 'program-distribution',
          title: 'Applications by Program',
          type: 'pie',
          data: comprehensiveMetrics.programMetrics.map(program => ({
            x: program.programName,
            y: program.totalApplications,
            label: `${program.programName}: ${program.totalApplications}`
          })),
          showLegend: true
        },
        refreshInterval: 300,
        lastUpdated: new Date().toISOString()
      });
    }
  }

  // Add alert widgets if requested
  if (includeAlerts) {
    const alerts = await generateAlerts(realTimeMetrics);
    alerts.forEach((alert, index) => {
      widgets.push({
        id: `alert-${index}`,
        title: alert.title,
        type: 'alert',
        size: 'medium',
        position: { row: 3 + Math.floor(index / 2), col: index % 2 },
        data: alert,
        refreshInterval: 60,
        lastUpdated: new Date().toISOString()
      });
    });
  }

  return {
    id: layoutId,
    name: 'MIHAS Analytics Dashboard',
    description: 'Real-time analytics and metrics for the MIHAS application system',
    widgets,
    refreshInterval: 30,
    autoRefresh: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Generate executive summary report
 */
async function generateExecutiveSummary(timeRange) {
  const comprehensiveMetrics = await getComprehensiveMetrics(timeRange);
  const realTimeMetrics = await getRealTimeMetrics();

  // Calculate system health
  const systemHealth = calculateSystemHealth(comprehensiveMetrics, realTimeMetrics);

  // Generate key metrics
  const keyMetrics = [
    {
      id: 'total-applications',
      title: 'Total Applications',
      value: comprehensiveMetrics.applicationMetrics.totalApplications,
      format: 'number',
      color: 'primary'
    },
    {
      id: 'completion-rate',
      title: 'Completion Rate',
      value: comprehensiveMetrics.applicationMetrics.completionRate,
      format: 'percentage',
      color: 'success'
    },
    {
      id: 'approval-rate',
      title: 'Approval Rate',
      value: comprehensiveMetrics.applicationMetrics.approvalRate,
      format: 'percentage',
      color: 'info'
    },
    {
      id: 'avg-processing-time',
      title: 'Avg Processing Time',
      value: comprehensiveMetrics.processingTimeMetrics.averageOverallProcessing,
      format: 'duration',
      color: 'warning'
    }
  ];

  // Calculate trends
  const trends = {
    applications: calculateTrend(comprehensiveMetrics.timeSeriesData.applications),
    approvals: calculateTrend(comprehensiveMetrics.timeSeriesData.approvals),
    processingTime: calculateTrend(comprehensiveMetrics.timeSeriesData.processingTimes)
  };

  // Generate recommendations
  const recommendations = generateRecommendations(comprehensiveMetrics, realTimeMetrics);

  // Get alerts
  const alerts = await generateAlerts(realTimeMetrics);

  return {
    id: `exec-summary-${Date.now()}`,
    title: 'MIHAS System Executive Summary',
    generatedAt: new Date().toISOString(),
    timeRange: {
      startDate: timeRange.startDate,
      endDate: timeRange.endDate,
      label: formatTimeRangeLabel(timeRange)
    },
    summary: {
      totalApplications: comprehensiveMetrics.applicationMetrics.totalApplications,
      completionRate: comprehensiveMetrics.applicationMetrics.completionRate,
      approvalRate: comprehensiveMetrics.applicationMetrics.approvalRate,
      averageProcessingTime: comprehensiveMetrics.processingTimeMetrics.averageOverallProcessing,
      systemHealth
    },
    keyMetrics,
    trends,
    recommendations,
    alerts
  };
}

/**
 * Get real-time metrics (reuse from realtime-metrics.js logic)
 */
async function getRealTimeMetrics() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // Get active applications
  const { data: activeApplications } = await supabaseAdminClient
    .from('applications')
    .select('id')
    .in('status', ['draft', 'submitted', 'under_review']);

  // Get today's submissions
  const { data: todaySubmissions } = await supabaseAdminClient
    .from('applications')
    .select('id')
    .not('submitted_at', 'is', null)
    .gte('submitted_at', todayStart.toISOString())
    .lt('submitted_at', todayEnd.toISOString());

  // Get pending reviews
  const { data: pendingReviews } = await supabaseAdminClient
    .from('applications')
    .select('id')
    .eq('status', 'submitted')
    .is('reviewed_at', null);

  // Calculate average processing time
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { data: recentDecisions } = await supabaseAdminClient
    .from('applications')
    .select('submitted_at, decision_date')
    .not('submitted_at', 'is', null)
    .not('decision_date', 'is', null)
    .gte('decision_date', thirtyDaysAgo.toISOString());

  let averageProcessingTime = 0;
  if (recentDecisions && recentDecisions.length > 0) {
    const totalProcessingTime = recentDecisions.reduce((sum, app) => {
      const submitted = new Date(app.submitted_at);
      const decided = new Date(app.decision_date);
      return sum + (decided.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24);
    }, 0);
    averageProcessingTime = totalProcessingTime / recentDecisions.length;
  }

  // Calculate system load
  const { data: recentActivity } = await supabaseAdminClient
    .from('applications')
    .select('id')
    .gte('updated_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString());

  const systemLoad = Math.min(100, ((recentActivity?.length || 0) / 10) * 100);

  return {
    activeApplications: activeApplications?.length || 0,
    todaySubmissions: todaySubmissions?.length || 0,
    pendingReviews: pendingReviews?.length || 0,
    averageProcessingTime: Math.round(averageProcessingTime * 10) / 10,
    systemLoad: Math.round(systemLoad)
  };
}

/**
 * Get comprehensive metrics (simplified version)
 */
async function getComprehensiveMetrics(timeRange) {
  // This would call the comprehensive-metrics endpoint internally
  // For now, return a simplified version
  const { data: applications } = await supabaseAdminClient
    .from('applications')
    .select('*')
    .gte('created_at', timeRange.startDate)
    .lte('created_at', timeRange.endDate);

  const totalApplications = applications?.length || 0;
  const completedApplications = applications?.filter(app => app.submitted_at).length || 0;
  const approvedApplications = applications?.filter(app => app.status === 'approved').length || 0;

  return {
    applicationMetrics: {
      totalApplications,
      completedApplications,
      approvedApplications,
      completionRate: totalApplications > 0 ? (completedApplications / totalApplications) * 100 : 0,
      approvalRate: completedApplications > 0 ? (approvedApplications / completedApplications) * 100 : 0
    },
    processingTimeMetrics: {
      averageOverallProcessing: 5.2 // Placeholder
    },
    timeSeriesData: {
      applications: [],
      approvals: [],
      processingTimes: []
    },
    programMetrics: []
  };
}

/**
 * Generate system alerts
 */
async function generateAlerts(realTimeMetrics) {
  const alerts = [];

  if (realTimeMetrics.pendingReviews > 50) {
    alerts.push({
      id: 'high-pending-reviews',
      title: 'High Pending Reviews',
      message: `${realTimeMetrics.pendingReviews} applications are pending review. Consider allocating more review resources.`,
      severity: 'warning',
      timestamp: new Date().toISOString(),
      actionable: true,
      actionUrl: '/admin/applications?status=submitted'
    });
  }

  if (realTimeMetrics.systemLoad > 80) {
    alerts.push({
      id: 'high-system-load',
      title: 'High System Load',
      message: `System load is at ${realTimeMetrics.systemLoad}%. Monitor performance closely.`,
      severity: 'error',
      timestamp: new Date().toISOString(),
      actionable: true,
      actionUrl: '/admin/system-health'
    });
  }

  if (realTimeMetrics.averageProcessingTime > 7) {
    alerts.push({
      id: 'slow-processing',
      title: 'Slow Processing Times',
      message: `Average processing time is ${realTimeMetrics.averageProcessingTime} days. Review workflow efficiency.`,
      severity: 'warning',
      timestamp: new Date().toISOString(),
      actionable: true,
      actionUrl: '/admin/workflow-analysis'
    });
  }

  return alerts;
}

/**
 * Calculate system health score
 */
function calculateSystemHealth(metrics, realTimeMetrics) {
  let score = 100;

  if (metrics.applicationMetrics.completionRate < 80) score -= 20;
  else if (metrics.applicationMetrics.completionRate < 90) score -= 10;

  if (realTimeMetrics.averageProcessingTime > 10) score -= 30;
  else if (realTimeMetrics.averageProcessingTime > 7) score -= 15;

  if (realTimeMetrics.systemLoad > 90) score -= 25;
  else if (realTimeMetrics.systemLoad > 80) score -= 10;

  if (realTimeMetrics.pendingReviews > 100) score -= 20;
  else if (realTimeMetrics.pendingReviews > 50) score -= 10;

  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  return 'poor';
}

/**
 * Calculate trend from time series data
 */
function calculateTrend(timeSeriesData) {
  if (timeSeriesData.length < 2) return 'stable';

  const recent = timeSeriesData.slice(-5);
  const older = timeSeriesData.slice(-10, -5);

  if (recent.length === 0 || older.length === 0) return 'stable';

  const recentAvg = recent.reduce((sum, point) => sum + point.value, 0) / recent.length;
  const olderAvg = older.reduce((sum, point) => sum + point.value, 0) / older.length;

  const change = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (change > 5) return 'up';
  if (change < -5) return 'down';
  return 'stable';
}

/**
 * Generate recommendations
 */
function generateRecommendations(metrics, realTimeMetrics) {
  const recommendations = [];

  if (metrics.applicationMetrics.completionRate < 80) {
    recommendations.push('Consider improving the application process to increase completion rates');
  }

  if (realTimeMetrics.averageProcessingTime > 7) {
    recommendations.push('Review and optimize the application review workflow to reduce processing times');
  }

  if (realTimeMetrics.pendingReviews > 50) {
    recommendations.push('Allocate additional resources to application review to reduce backlog');
  }

  return recommendations;
}

/**
 * Format time range label
 */
function formatTimeRangeLabel(timeRange) {
  const start = new Date(timeRange.startDate).toLocaleDateString();
  const end = new Date(timeRange.endDate).toLocaleDateString();
  return `${start} - ${end}`;
}