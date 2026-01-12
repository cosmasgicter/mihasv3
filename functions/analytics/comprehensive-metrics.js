import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

/**
 * Comprehensive Metrics API Endpoint
 * Calculates application completion rates, processing times, and success metrics
 * Validates Requirements 5.1
 */
export async function onRequestPost(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    // Parse request body
    const { timeRange, programs, includeTimeSeries = true, includeProcessingTimes = true } = await request.json();
    
    if (!timeRange || !timeRange.startDate || !timeRange.endDate) {
      return new Response(JSON.stringify({ error: 'Time range is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const startTime = Date.now();

    // Build base query for applications within time range
    let applicationsQuery = supabaseAdminClient
      .from('applications')
      .select(`
        id,
        application_number,
        program,
        status,
        payment_status,
        created_at,
        updated_at,
        submitted_at,
        reviewed_at,
        decision_date
      `)
      .gte('created_at', timeRange.startDate)
      .lte('created_at', timeRange.endDate);

    // Filter by programs if specified
    if (programs && programs.length > 0) {
      applicationsQuery = applicationsQuery.in('program', programs);
    }

    const { data: applications, error: applicationsError } = await applicationsQuery;
    
    if (applicationsError) {
      return new Response(JSON.stringify({ error: applicationsError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate application metrics
    const totalApplications = applications.length;
    const completedApplications = applications.filter(app => app.submitted_at).length;
    const pendingApplications = applications.filter(app => app.status === 'draft' || app.status === 'submitted').length;
    const approvedApplications = applications.filter(app => app.status === 'approved').length;
    const rejectedApplications = applications.filter(app => app.status === 'rejected').length;

    const applicationMetrics = {
      totalApplications,
      completedApplications,
      pendingApplications,
      approvedApplications,
      rejectedApplications,
      completionRate: totalApplications > 0 ? (completedApplications / totalApplications) * 100 : 0,
      approvalRate: completedApplications > 0 ? (approvedApplications / completedApplications) * 100 : 0,
      rejectionRate: completedApplications > 0 ? (rejectedApplications / completedApplications) * 100 : 0
    };

    // Calculate program-specific metrics
    const programGroups = applications.reduce((acc, app) => {
      if (!acc[app.program]) {
        acc[app.program] = [];
      }
      acc[app.program].push(app);
      return acc;
    }, {});

    const programMetrics = Object.entries(programGroups).map(([programName, programApps]) => {
      const total = programApps.length;
      const completed = programApps.filter(app => app.submitted_at).length;
      const approved = programApps.filter(app => app.status === 'approved').length;
      const rejected = programApps.filter(app => app.status === 'rejected').length;
      
      // Calculate average processing time for completed applications
      const completedWithDecision = programApps.filter(app => app.submitted_at && app.decision_date);
      const avgProcessingTime = completedWithDecision.length > 0 
        ? completedWithDecision.reduce((sum, app) => {
            const submittedAt = new Date(app.submitted_at);
            const decisionDate = new Date(app.decision_date);
            return sum + (decisionDate.getTime() - submittedAt.getTime()) / (1000 * 60 * 60 * 24); // days
          }, 0) / completedWithDecision.length
        : 0;

      return {
        programId: programName,
        programName,
        totalApplications: total,
        completedApplications: completed,
        approvedApplications: approved,
        rejectedApplications: rejected,
        completionRate: total > 0 ? (completed / total) * 100 : 0,
        approvalRate: completed > 0 ? (approved / completed) * 100 : 0,
        averageProcessingTime: avgProcessingTime
      };
    });

    // Calculate processing time metrics
    let processingTimeMetrics = {
      averageSubmissionToReview: 0,
      averageReviewToDecision: 0,
      averageOverallProcessing: 0,
      medianProcessingTime: 0,
      percentile95ProcessingTime: 0
    };

    if (includeProcessingTimes) {
      const submittedApps = applications.filter(app => app.submitted_at);
      const reviewedApps = submittedApps.filter(app => app.reviewed_at);
      const decidedApps = reviewedApps.filter(app => app.decision_date);

      if (reviewedApps.length > 0) {
        const submissionToReviewTimes = reviewedApps.map(app => {
          const submitted = new Date(app.submitted_at);
          const reviewed = new Date(app.reviewed_at);
          return (reviewed.getTime() - submitted.getTime()) / (1000 * 60 * 60); // hours
        });

        processingTimeMetrics.averageSubmissionToReview = 
          submissionToReviewTimes.reduce((sum, time) => sum + time, 0) / submissionToReviewTimes.length;
      }

      if (decidedApps.length > 0) {
        const reviewToDecisionTimes = decidedApps.map(app => {
          const reviewed = new Date(app.reviewed_at);
          const decided = new Date(app.decision_date);
          return (decided.getTime() - reviewed.getTime()) / (1000 * 60 * 60); // hours
        });

        const overallProcessingTimes = decidedApps.map(app => {
          const submitted = new Date(app.submitted_at);
          const decided = new Date(app.decision_date);
          return (decided.getTime() - submitted.getTime()) / (1000 * 60 * 60); // hours
        });

        processingTimeMetrics.averageReviewToDecision = 
          reviewToDecisionTimes.reduce((sum, time) => sum + time, 0) / reviewToDecisionTimes.length;
        
        processingTimeMetrics.averageOverallProcessing = 
          overallProcessingTimes.reduce((sum, time) => sum + time, 0) / overallProcessingTimes.length;

        // Calculate median and 95th percentile
        const sortedTimes = [...overallProcessingTimes].sort((a, b) => a - b);
        const medianIndex = Math.floor(sortedTimes.length / 2);
        processingTimeMetrics.medianProcessingTime = sortedTimes[medianIndex] || 0;
        
        const p95Index = Math.floor(sortedTimes.length * 0.95);
        processingTimeMetrics.percentile95ProcessingTime = sortedTimes[p95Index] || 0;
      }
    }

    // Calculate conversion metrics
    const { data: userProfiles, error: profilesError } = await supabaseAdminClient
      .from('user_profiles')
      .select('id, created_at')
      .gte('created_at', timeRange.startDate)
      .lte('created_at', timeRange.endDate);

    const totalRegistrations = userProfiles?.length || 0;
    const usersWithApplications = new Set(applications.map(app => app.user_id)).size;
    
    const conversionMetrics = {
      registrationToApplication: totalRegistrations > 0 ? (usersWithApplications / totalRegistrations) * 100 : 0,
      applicationToSubmission: totalApplications > 0 ? (completedApplications / totalApplications) * 100 : 0,
      submissionToApproval: completedApplications > 0 ? (approvedApplications / completedApplications) * 100 : 0,
      overallConversionRate: totalRegistrations > 0 ? (approvedApplications / totalRegistrations) * 100 : 0
    };

    // Generate time series data if requested
    let timeSeriesData = {
      applications: [],
      approvals: [],
      processingTimes: []
    };

    if (includeTimeSeries) {
      // Group applications by time granularity
      const granularity = timeRange.granularity || 'day';
      const timeGroups = {};

      applications.forEach(app => {
        const date = new Date(app.created_at);
        let timeKey;
        
        switch (granularity) {
          case 'hour':
            timeKey = date.toISOString().substring(0, 13) + ':00:00.000Z';
            break;
          case 'day':
            timeKey = date.toISOString().substring(0, 10) + 'T00:00:00.000Z';
            break;
          case 'week':
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            timeKey = weekStart.toISOString().substring(0, 10) + 'T00:00:00.000Z';
            break;
          case 'month':
            timeKey = date.toISOString().substring(0, 7) + '-01T00:00:00.000Z';
            break;
          default:
            timeKey = date.toISOString().substring(0, 10) + 'T00:00:00.000Z';
        }

        if (!timeGroups[timeKey]) {
          timeGroups[timeKey] = { applications: 0, approvals: 0, processingTimes: [] };
        }
        
        timeGroups[timeKey].applications++;
        
        if (app.status === 'approved') {
          timeGroups[timeKey].approvals++;
        }
        
        if (app.submitted_at && app.decision_date) {
          const processingTime = (new Date(app.decision_date).getTime() - new Date(app.submitted_at).getTime()) / (1000 * 60 * 60);
          timeGroups[timeKey].processingTimes.push(processingTime);
        }
      });

      timeSeriesData = {
        applications: Object.entries(timeGroups).map(([timestamp, data]) => ({
          timestamp,
          value: data.applications
        })),
        approvals: Object.entries(timeGroups).map(([timestamp, data]) => ({
          timestamp,
          value: data.approvals
        })),
        processingTimes: Object.entries(timeGroups).map(([timestamp, data]) => ({
          timestamp,
          value: data.processingTimes.length > 0 
            ? data.processingTimes.reduce((sum, time) => sum + time, 0) / data.processingTimes.length 
            : 0
        }))
      };
    }

    const calculationTime = Date.now() - startTime;

    const comprehensiveMetrics = {
      applicationMetrics,
      programMetrics,
      processingTimeMetrics,
      conversionMetrics,
      timeSeriesData,
      generatedAt: new Date().toISOString(),
      timeRange
    };

    return new Response(JSON.stringify(comprehensiveMetrics), {
      status: 200,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'X-Calculation-Time': calculationTime.toString()
      }
    });

  } catch (error) {
    console.error('Comprehensive metrics calculation error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to calculate comprehensive metrics',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}