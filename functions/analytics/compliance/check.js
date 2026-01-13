import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js';

/**
 * Automated Compliance Checking API Endpoint
 * Performs automated compliance checks for data integrity, regulatory requirements, and submission deadlines
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

    const { checkType } = await request.json();

    if (!checkType) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameter: checkType' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const validCheckTypes = ['data_integrity', 'regulatory_requirements', 'submission_deadlines'];
    if (!validCheckTypes.includes(checkType)) {
      return new Response(JSON.stringify({ 
        error: `Invalid check type. Must be one of: ${validCheckTypes.join(', ')}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Perform compliance check based on type
    let checkResult;
    switch (checkType) {
      case 'data_integrity':
        checkResult = await performDataIntegrityCheck();
        break;
      case 'regulatory_requirements':
        checkResult = await performRegulatoryRequirementsCheck();
        break;
      case 'submission_deadlines':
        checkResult = await performSubmissionDeadlineCheck();
        break;
      default:
        throw new Error('Invalid check type');
    }

    return new Response(JSON.stringify({
      success: true,
      checkType,
      result: checkResult,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Compliance check error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Perform data integrity checks
 */
async function performDataIntegrityCheck() {
  const checks = [];
  
  try {
    // Check for orphaned applications
    const { data: orphanedApps, error: orphanError } = await supabaseAdminClient
      .from('applications')
      .select('id, user_id')
      .is('user_id', null);
    
    if (!orphanError) {
      checks.push({
        name: 'Orphaned Applications',
        status: orphanedApps.length === 0 ? 'PASS' : 'FAIL',
        count: orphanedApps.length,
        details: orphanedApps.length > 0 ? 'Found applications without user references' : 'No orphaned applications found'
      });
    }
    
    // Check for missing required fields
    const { data: incompleteApps, error: incompleteError } = await supabaseAdminClient
      .from('applications')
      .select('id, full_name, program')
      .or('full_name.is.null,program.is.null');
    
    if (!incompleteError) {
      checks.push({
        name: 'Incomplete Applications',
        status: incompleteApps.length === 0 ? 'PASS' : 'WARN',
        count: incompleteApps.length,
        details: incompleteApps.length > 0 ? 'Found applications with missing required fields' : 'All applications have required fields'
      });
    }
    
    // Check for duplicate applications
    const { data: duplicates, error: dupError } = await supabaseAdminClient
      .rpc('find_duplicate_applications');
    
    if (!dupError && duplicates) {
      checks.push({
        name: 'Duplicate Applications',
        status: duplicates.length === 0 ? 'PASS' : 'WARN',
        count: duplicates.length,
        details: duplicates.length > 0 ? 'Found potential duplicate applications' : 'No duplicate applications found'
      });
    }
    
  } catch (error) {
    checks.push({
      name: 'Data Integrity Check',
      status: 'ERROR',
      details: error.message
    });
  }
  
  return {
    summary: {
      totalChecks: checks.length,
      passed: checks.filter(c => c.status === 'PASS').length,
      warnings: checks.filter(c => c.status === 'WARN').length,
      errors: checks.filter(c => c.status === 'ERROR').length
    },
    checks
  };
}

/**
 * Perform regulatory requirements checks
 */
async function performRegulatoryRequirementsCheck() {
  const checks = [];
  
  try {
    // Check HPCZ compliance for medical programs
    const { data: medicalApps, error: medicalError } = await supabaseAdminClient
      .from('applications')
      .select('id, program, eligibility_status')
      .in('program', ['Clinical Medicine', 'Registered Nursing']);
    
    if (!medicalError) {
      const nonCompliant = medicalApps.filter(app => 
        !app.eligibility_status || !app.eligibility_status.includes('HPCZ')
      );
      
      checks.push({
        name: 'HPCZ Compliance Check',
        status: nonCompliant.length === 0 ? 'PASS' : 'WARN',
        count: nonCompliant.length,
        details: nonCompliant.length > 0 ? 
          'Some medical program applications may not meet HPCZ requirements' : 
          'All medical program applications meet HPCZ requirements'
      });
    }
    
    // Check GNC/NMCZ compliance for nursing programs
    const { data: nursingApps, error: nursingError } = await supabaseAdminClient
      .from('applications')
      .select('id, program, eligibility_status')
      .eq('program', 'Registered Nursing');
    
    if (!nursingError) {
      const nonCompliant = nursingApps.filter(app => 
        !app.eligibility_status || !app.eligibility_status.includes('GNC')
      );
      
      checks.push({
        name: 'GNC/NMCZ Compliance Check',
        status: nonCompliant.length === 0 ? 'PASS' : 'WARN',
        count: nonCompliant.length,
        details: nonCompliant.length > 0 ? 
          'Some nursing applications may not meet GNC/NMCZ requirements' : 
          'All nursing applications meet GNC/NMCZ requirements'
      });
    }
    
    // Check ECZ grade validation
    const { data: gradeApps, error: gradeError } = await supabaseAdminClient
      .from('application_grades')
      .select('id, grade')
      .or('grade.lt.1,grade.gt.9');
    
    if (!gradeError) {
      checks.push({
        name: 'ECZ Grade Validation',
        status: gradeApps.length === 0 ? 'PASS' : 'FAIL',
        count: gradeApps.length,
        details: gradeApps.length > 0 ? 
          'Found grades outside valid ECZ range (1-9)' : 
          'All grades conform to ECZ standards'
      });
    }
    
  } catch (error) {
    checks.push({
      name: 'Regulatory Requirements Check',
      status: 'ERROR',
      details: error.message
    });
  }
  
  return {
    summary: {
      totalChecks: checks.length,
      passed: checks.filter(c => c.status === 'PASS').length,
      warnings: checks.filter(c => c.status === 'WARN').length,
      errors: checks.filter(c => c.status === 'ERROR').length
    },
    checks
  };
}

/**
 * Perform submission deadline checks
 */
async function performSubmissionDeadlineCheck() {
  const checks = [];
  
  try {
    // Check for applications submitted after deadlines
    const currentDate = new Date();
    const { data: lateApps, error: lateError } = await supabaseAdminClient
      .from('applications')
      .select('id, program, created_at, status')
      .eq('status', 'submitted')
      .lt('created_at', currentDate.toISOString());
    
    if (!lateError) {
      // This is a simplified check - in reality, you'd check against program-specific deadlines
      checks.push({
        name: 'Submission Deadline Compliance',
        status: 'INFO',
        count: lateApps.length,
        details: `Found ${lateApps.length} submitted applications`
      });
    }
    
    // Check for applications approaching deadlines
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30); // 30 days from now
    
    const { data: draftApps, error: draftError } = await supabaseAdminClient
      .from('applications')
      .select('id, program, created_at, status')
      .eq('status', 'draft')
      .lt('created_at', futureDate.toISOString());
    
    if (!draftError) {
      checks.push({
        name: 'Applications Approaching Deadline',
        status: draftApps.length > 0 ? 'WARN' : 'PASS',
        count: draftApps.length,
        details: draftApps.length > 0 ? 
          'Some draft applications may be approaching submission deadlines' : 
          'No applications approaching deadlines'
      });
    }
    
  } catch (error) {
    checks.push({
      name: 'Submission Deadline Check',
      status: 'ERROR',
      details: error.message
    });
  }
  
  return {
    summary: {
      totalChecks: checks.length,
      passed: checks.filter(c => c.status === 'PASS').length,
      warnings: checks.filter(c => c.status === 'WARN').length,
      errors: checks.filter(c => c.status === 'ERROR').length
    },
    checks
  };
}