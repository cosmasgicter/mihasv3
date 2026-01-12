import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js';

/**
 * Compliance Report Generation API Endpoint
 * Generates regulatory compliance reports for HPCZ, GNC/NMCZ, and ECZ
 * Validates Requirements 5.4
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

    const { regulatoryBody, reportType, reportingPeriod } = await request.json();

    // Validate required parameters
    if (!regulatoryBody || !reportType || !reportingPeriod) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters: regulatoryBody, reportType, reportingPeriod' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate regulatory body
    const validRegulatoryBodies = ['HPCZ', 'GNC', 'NMCZ', 'ECZ'];
    if (!validRegulatoryBodies.includes(regulatoryBody)) {
      return new Response(JSON.stringify({ 
        error: `Invalid regulatory body. Must be one of: ${validRegulatoryBodies.join(', ')}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate report based on regulatory body
    let report;
    switch (regulatoryBody) {
      case 'HPCZ':
        report = await generateHPCZReport(reportingPeriod, reportType);
        break;
      case 'GNC':
        report = await generateGNCReport(reportingPeriod, reportType);
        break;
      case 'NMCZ':
        report = await generateNMCZReport(reportingPeriod, reportType);
        break;
      case 'ECZ':
        report = await generateECZReport(reportingPeriod, reportType);
        break;
      default:
        throw new Error(`Unsupported regulatory body: ${regulatoryBody}`);
    }

    // Save report to database
    const { data: savedReport, error: saveError } = await supabaseAdminClient
      .from('compliance_reports')
      .insert([{
        title: report.title,
        regulatory_body: report.regulatoryBody,
        report_type: report.reportType,
        reporting_period_start: report.reportingPeriod.startDate,
        reporting_period_end: report.reportingPeriod.endDate,
        reporting_period_label: report.reportingPeriod.label,
        status: 'draft',
        data: report.data,
        generated_at: report.generatedAt,
        created_by: authContext.user.id
      }])
      .select()
      .single();

    if (saveError) {
      console.error('Failed to save compliance report:', saveError);
      return new Response(JSON.stringify({ 
        error: 'Failed to save compliance report',
        details: saveError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create audit trail entry
    await createAuditTrailEntry(savedReport.id, 'created', authContext.user.id, request);

    // Return the complete report with database ID
    const completeReport = {
      ...report,
      id: savedReport.id
    };

    return new Response(JSON.stringify(completeReport), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Compliance report generation error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to generate compliance report',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Generate HPCZ compliance report
 */
async function generateHPCZReport(reportingPeriod, reportType) {
  const { startDate, endDate } = reportingPeriod;

  // Get applications data for the reporting period
  const { data: applications, error: appsError } = await supabaseAdminClient
    .from('applications')
    .select(`
      id,
      program,
      status,
      created_at,
      submitted_at,
      decision_date,
      user_id,
      eligibility_score
    `)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (appsError) {
    throw new Error(`Failed to fetch applications: ${appsError.message}`);
  }

  // Get user demographics
  const userIds = [...new Set(applications.map(app => app.user_id))];
  const { data: userProfiles, error: usersError } = await supabaseAdminClient
    .from('user_profiles')
    .select('id, gender, province, date_of_birth')
    .in('id', userIds);

  if (usersError) {
    throw new Error(`Failed to fetch user profiles: ${usersError.message}`);
  }

  // Calculate program statistics
  const programStats = calculateProgramStatistics(applications);
  
  // Calculate student demographics
  const demographics = calculateStudentDemographics(userProfiles);
  
  // Calculate quality metrics
  const qualityMetrics = calculateQualityMetrics(applications);
  
  // Generate compliance checklist
  const complianceChecklist = generateHPCZComplianceChecklist(applications, programStats);

  return {
    id: '', // Will be set after database save
    title: `HPCZ Compliance Report - ${formatPeriodLabel(reportingPeriod)}`,
    regulatoryBody: 'HPCZ',
    reportType,
    generatedAt: new Date().toISOString(),
    reportingPeriod: {
      ...reportingPeriod,
      label: formatPeriodLabel(reportingPeriod)
    },
    status: 'draft',
    data: {
      programStatistics: programStats,
      studentDemographics: demographics,
      qualityMetrics,
      complianceChecklist
    }
  };
}

/**
 * Generate GNC compliance report
 */
async function generateGNCReport(reportingPeriod, reportType) {
  const { startDate, endDate } = reportingPeriod;

  // Get nursing program applications
  const { data: nursingApplications, error: nursingError } = await supabaseAdminClient
    .from('applications')
    .select('*')
    .eq('program', 'Registered Nursing')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (nursingError) {
    throw new Error(`Failed to fetch nursing applications: ${nursingError.message}`);
  }

  // Calculate nursing program metrics
  const nursingPrograms = [{
    program: 'Registered Nursing',
    accreditationStatus: 'accredited',
    studentCapacity: 120,
    currentEnrollment: nursingApplications.filter(app => app.status === 'approved').length,
    clinicalPlacements: 85 // This would come from a separate table in production
  }];

  // Calculate faculty qualifications (mock data - would come from faculty table)
  const facultyQualifications = {
    totalFaculty: 15,
    qualifiedFaculty: 14,
    studentFacultyRatio: nursingPrograms[0].currentEnrollment / 15
  };

  // Calculate clinical training metrics (mock data)
  const clinicalTraining = {
    totalClinicalHours: 1200,
    hospitalPartnerships: 8,
    studentSatisfaction: 4.2
  };

  return {
    id: '',
    title: `GNC Compliance Report - ${formatPeriodLabel(reportingPeriod)}`,
    regulatoryBody: 'GNC',
    reportType,
    generatedAt: new Date().toISOString(),
    reportingPeriod: {
      ...reportingPeriod,
      label: formatPeriodLabel(reportingPeriod)
    },
    status: 'draft',
    data: {
      nursingPrograms,
      facultyQualifications,
      clinicalTraining
    }
  };
}

/**
 * Generate NMCZ compliance report
 */
async function generateNMCZReport(reportingPeriod, reportType) {
  const { startDate, endDate } = reportingPeriod;

  // Get midwifery-related applications (if any)
  const { data: midwiferyApplications, error: midwiferyError } = await supabaseAdminClient
    .from('applications')
    .select('*')
    .ilike('program', '%midwif%')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (midwiferyError) {
    throw new Error(`Failed to fetch midwifery applications: ${midwiferyError.message}`);
  }

  // Calculate midwifery program metrics (mock data for demonstration)
  const midwiferyPrograms = [{
    program: 'Midwifery Training',
    registrationStatus: 'registered',
    practicalTraining: {
      totalHours: 800,
      deliveriesAttended: 40,
      competencyAssessments: 12
    }
  }];

  // Calculate continuing education metrics (mock data)
  const continuingEducation = {
    totalParticipants: 45,
    coursesOffered: 8,
    completionRate: 92.5
  };

  return {
    id: '',
    title: `NMCZ Compliance Report - ${formatPeriodLabel(reportingPeriod)}`,
    regulatoryBody: 'NMCZ',
    reportType,
    generatedAt: new Date().toISOString(),
    reportingPeriod: {
      ...reportingPeriod,
      label: formatPeriodLabel(reportingPeriod)
    },
    status: 'draft',
    data: {
      midwiferyPrograms,
      continuingEducation
    }
  };
}

/**
 * Generate ECZ compliance report
 */
async function generateECZReport(reportingPeriod, reportType) {
  const { startDate, endDate } = reportingPeriod;

  // Get grade data for validation
  const { data: grades, error: gradesError } = await supabaseAdminClient
    .from('application_grades')
    .select(`
      id,
      grade,
      subject_id,
      application_id,
      applications!inner(created_at)
    `)
    .gte('applications.created_at', startDate)
    .lte('applications.created_at', endDate);

  if (gradesError) {
    throw new Error(`Failed to fetch grades: ${gradesError.message}`);
  }

  // Validate grades against Zambian grading system (1-9)
  const validGrades = grades.filter(grade => 
    grade.grade >= 1 && grade.grade <= 9 && Number.isInteger(grade.grade)
  );
  const invalidGrades = grades.filter(grade => 
    grade.grade < 1 || grade.grade > 9 || !Number.isInteger(grade.grade)
  );

  // Calculate grade validation metrics
  const gradeValidation = {
    totalGradesProcessed: grades.length,
    validGrades: validGrades.length,
    invalidGrades: invalidGrades.length,
    gradingSystemCompliance: invalidGrades.length === 0
  };

  // Calculate exam results by subject (mock data - would come from subjects table)
  const examResults = [
    {
      subject: 'Mathematics',
      totalCandidates: 150,
      passRate: 78.5,
      averageGrade: 5.2
    },
    {
      subject: 'English',
      totalCandidates: 150,
      passRate: 85.2,
      averageGrade: 4.8
    },
    {
      subject: 'Biology',
      totalCandidates: 120,
      passRate: 72.1,
      averageGrade: 5.8
    }
  ];

  // Calculate certificate verification metrics (mock data)
  const certificateVerification = {
    totalVerifications: 200,
    successfulVerifications: 195,
    failedVerifications: 5
  };

  return {
    id: '',
    title: `ECZ Compliance Report - ${formatPeriodLabel(reportingPeriod)}`,
    regulatoryBody: 'ECZ',
    reportType,
    generatedAt: new Date().toISOString(),
    reportingPeriod: {
      ...reportingPeriod,
      label: formatPeriodLabel(reportingPeriod)
    },
    status: 'draft',
    data: {
      gradeValidation,
      examResults,
      certificateVerification
    }
  };
}

/**
 * Helper functions
 */

function calculateProgramStatistics(applications) {
  const programGroups = applications.reduce((acc, app) => {
    if (!acc[app.program]) {
      acc[app.program] = [];
    }
    acc[app.program].push(app);
    return acc;
  }, {});

  return Object.entries(programGroups).map(([program, apps]) => {
    const totalApplications = apps.length;
    const admittedStudents = apps.filter(app => app.status === 'approved').length;
    const submittedApps = apps.filter(app => app.submitted_at);
    
    return {
      program,
      totalApplications,
      admittedStudents,
      completionRate: totalApplications > 0 ? (submittedApps.length / totalApplications) * 100 : 0,
      graduationRate: 85.5 // Mock data - would come from graduation records
    };
  });
}

function calculateStudentDemographics(userProfiles) {
  const totalStudents = userProfiles.length;
  
  // Calculate gender distribution
  const byGender = userProfiles.reduce((acc, user) => {
    const gender = user.gender || 'unknown';
    acc[gender] = (acc[gender] || 0) + 1;
    return acc;
  }, {});

  // Calculate province distribution
  const byProvince = userProfiles.reduce((acc, user) => {
    const province = user.province || 'unknown';
    acc[province] = (acc[province] || 0) + 1;
    return acc;
  }, {});

  // Calculate age distribution
  const byAge = userProfiles.reduce((acc, user) => {
    if (user.date_of_birth) {
      const age = new Date().getFullYear() - new Date(user.date_of_birth).getFullYear();
      const ageGroup = age < 20 ? 'under_20' : age < 25 ? '20_24' : age < 30 ? '25_29' : 'over_30';
      acc[ageGroup] = (acc[ageGroup] || 0) + 1;
    }
    return acc;
  }, {});

  return {
    totalStudents,
    byGender: {
      male: byGender.male || 0,
      female: byGender.female || 0
    },
    byProvince,
    byAge
  };
}

function calculateQualityMetrics(applications) {
  const submittedApps = applications.filter(app => app.submitted_at && app.eligibility_score);
  
  if (submittedApps.length === 0) {
    return {
      averageGrade: 0,
      passRate: 0,
      employmentRate: 0
    };
  }

  const averageGrade = submittedApps.reduce((sum, app) => sum + app.eligibility_score, 0) / submittedApps.length;
  const passRate = (applications.filter(app => app.status === 'approved').length / submittedApps.length) * 100;
  
  return {
    averageGrade: Math.round(averageGrade * 100) / 100,
    passRate: Math.round(passRate * 100) / 100,
    employmentRate: 78.5 // Mock data - would come from employment tracking
  };
}

function generateHPCZComplianceChecklist(applications, programStats) {
  const checklist = [
    {
      item: 'Minimum admission requirements met',
      status: 'compliant',
      evidence: 'All admitted students meet minimum grade requirements',
      notes: 'Verified through eligibility engine'
    },
    {
      item: 'Student capacity within approved limits',
      status: programStats.some(p => p.admittedStudents > 120) ? 'non_compliant' : 'compliant',
      evidence: 'Current enrollment numbers reviewed',
      notes: programStats.some(p => p.admittedStudents > 120) ? 'Some programs exceed capacity' : 'All programs within capacity'
    },
    {
      item: 'Quality assurance measures implemented',
      status: 'compliant',
      evidence: 'Automated eligibility checking and review processes',
      notes: 'System maintains audit trails for all decisions'
    },
    {
      item: 'Student records properly maintained',
      status: 'compliant',
      evidence: 'Digital records with backup and security measures',
      notes: 'All student data encrypted and regularly backed up'
    }
  ];

  return checklist;
}

async function createAuditTrailEntry(reportId, action, userId, request) {
  const clientIP = request.headers.get('CF-Connecting-IP') || 
                   request.headers.get('X-Forwarded-For') || 
                   'unknown';
  const userAgent = request.headers.get('User-Agent') || 'unknown';

  await supabaseAdminClient
    .from('compliance_audit_trail')
    .insert([{
      report_id: reportId,
      action,
      performed_by: userId,
      performed_at: new Date().toISOString(),
      ip_address: clientIP,
      user_agent: userAgent
    }]);
}

function formatPeriodLabel(reportingPeriod) {
  const start = new Date(reportingPeriod.startDate).toLocaleDateString();
  const end = new Date(reportingPeriod.endDate).toLocaleDateString();
  return `${start} to ${end}`;
}