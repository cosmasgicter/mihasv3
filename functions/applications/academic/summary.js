import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  try {
    const authContext = await getUserFromRequest(request);
    if (authContext.error || !authContext.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = supabaseAdminClient;
    const url = new URL(request.url);
    const applicationId = url.searchParams.get('application_id');
    const userId = url.searchParams.get('user_id');

    // Build query based on user role and parameters
    let query = supabase
      .from('applications')
      .select(`
        id,
        application_number,
        full_name,
        program,
        institution,
        status,
        result_slip_url,
        created_at,
        application_grades (
          id,
          subject,
          grade,
          points
        )
      `);

    // Filter based on user role
    if (!authContext.isAdmin) {
      query = query.eq('user_id', authContext.user.id);
    } else if (userId) {
      query = query.eq('user_id', userId);
    }

    if (applicationId) {
      query = query.eq('id', applicationId);
    }

    const { data: applications, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate academic summary statistics
    const summary = {
      totalApplications: applications.length,
      applicationsWithGrades: applications.filter(app => app.application_grades?.length > 0).length,
      applicationsWithResultSlips: applications.filter(app => app.result_slip_url).length,
      programDistribution: {},
      gradeStatistics: {
        totalSubjects: 0,
        averagePoints: 0,
        gradeDistribution: {}
      }
    };

    // Calculate program distribution
    applications.forEach(app => {
      const program = app.program || 'Unknown';
      summary.programDistribution[program] = (summary.programDistribution[program] || 0) + 1;
    });

    // Calculate grade statistics
    let totalPoints = 0;
    let totalSubjects = 0;
    const gradeDistribution = {};

    applications.forEach(app => {
      if (app.application_grades) {
        app.application_grades.forEach(grade => {
          totalSubjects++;
          if (grade.points) {
            totalPoints += grade.points;
          }
          const gradeValue = grade.grade || 'Unknown';
          gradeDistribution[gradeValue] = (gradeDistribution[gradeValue] || 0) + 1;
        });
      }
    });

    summary.gradeStatistics.totalSubjects = totalSubjects;
    summary.gradeStatistics.averagePoints = totalSubjects > 0 ? Math.round((totalPoints / totalSubjects) * 100) / 100 : 0;
    summary.gradeStatistics.gradeDistribution = gradeDistribution;

    return new Response(JSON.stringify({
      success: true,
      summary,
      applications: applications.map(app => ({
        id: app.id,
        application_number: app.application_number,
        full_name: app.full_name,
        program: app.program,
        institution: app.institution,
        status: app.status,
        hasResultSlip: !!app.result_slip_url,
        gradeCount: app.application_grades?.length || 0,
        averagePoints: app.application_grades?.length > 0 
          ? Math.round((app.application_grades.reduce((sum, g) => sum + (g.points || 0), 0) / app.application_grades.length) * 100) / 100
          : 0,
        created_at: app.created_at
      }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Academic summary error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  return new Response(null, { status: 204, headers: corsHeaders });
}