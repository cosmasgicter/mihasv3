import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';
import { AuditLogger } from '../_lib/auditLogger.js';

async function fetchApplicationDetails(id, includeParam, supabase) {
  const { data: application, error } = await supabase
    .from('applications')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!application) return null;

  const result = { ...application };
  const includes = includeParam ? String(includeParam).split(',') : ['grades', 'documents', 'statusHistory'];

  if (includes.includes('grades')) {
    const { data: grades } = await supabase
      .from('application_grades')
      .select('id, grade, subject_id')
      .eq('application_id', id);
    
    let subjectNames = {};
    if (grades?.length > 0) {
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id, name')
        .in('id', [...new Set(grades.map(g => g.subject_id))]);
      subjectNames = subjects?.reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {}) || {};
    }
    
    result.grades = (grades || []).map(g => ({ ...g, subject_name: subjectNames[g.subject_id] || 'Unknown' }));
  }

  if (includes.includes('documents')) {
    const { data: documents } = await supabase
      .from('application_documents')
      .select('*')
      .eq('application_id', id);
    result.documents = documents || [];
  }

  if (includes.includes('statusHistory')) {
    const { data: statusHistory } = await supabase
      .from('application_status_history')
      .select('*')
      .eq('application_id', id)
      .order('created_at', { ascending: false });
    result.statusHistory = statusHistory || [];
  }

  return result;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  const include = url.searchParams.get('include');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  if (request.method === 'GET') {
    try {
      const authContext = await getUserFromRequest(request);
      if (authContext.error) {
        return new Response(JSON.stringify({ error: authContext.error }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const supabase = supabaseAdminClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
      
      // Check access
      if (!authContext.isAdmin) {
        const { data: app } = await supabase
          .from('applications')
          .select('user_id')
          .eq('id', id)
          .single();
        
        if (!app || app.user_id !== authContext.user.id) {
          return new Response(JSON.stringify({ error: 'Access denied' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
      
      const data = await fetchApplicationDetails(id, include, supabase);
      if (!data) {
        return new Response(JSON.stringify({ error: 'Application not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({
        success: true,
        data,
        application: data,
        grades: data.grades || [],
        documents: data.documents || [],
        statusHistory: data.statusHistory || []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  if (request.method === 'DELETE') {
    try {
      const authContext = await getUserFromRequest(request);
      if (authContext.error || !authContext.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const supabase = supabaseAdminClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data: app } = await supabase
        .from('applications')
        .select('user_id')
        .eq('id', id)
        .single();
      
      if (!app || (app.user_id !== authContext.user.id && !authContext.isAdmin)) {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  if (request.method === 'PUT' || request.method === 'PATCH') {
    try {
      const authContext = await getUserFromRequest(request);
      if (authContext.error || !authContext.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json();
      
      const supabase = supabaseAdminClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY);
      // Check ownership
      const { data: app } = await supabase
        .from('applications')
        .select('user_id')
        .eq('id', id)
        .single();
      
      if (!app || (app.user_id !== authContext.user.id && !authContext.isAdmin)) {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Handle PATCH actions
      if (request.method === 'PATCH' && body.action) {
        const { action, ...payload } = body;
        
        if (action === 'update_status') {
          const { status, notes } = payload;
          const { data, error } = await supabase
            .from('applications')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
          
          if (!error && notes) {
            await supabase.from('application_status_history').insert({
              application_id: id,
              status,
              changed_by: authContext.user.id,
              notes,
              created_at: new Date().toISOString()
            });
          }
          
          // Send notification to student
          if (!error && data) {
            const notificationTitles = {
              'approved': '🎉 Application Approved!',
              'rejected': '❌ Application Status Update',
              'under_review': '👀 Application Under Review',
              'pending_documents': '📄 Documents Required'
            };
            
            const notificationContents = {
              'approved': `Congratulations! Your application #${data.application_number} for ${data.program} has been approved. Welcome to our institution!`,
              'rejected': `Your application #${data.application_number} for ${data.program} has been reviewed. Please check your email for detailed feedback.`,
              'under_review': `Your application #${data.application_number} for ${data.program} is currently being reviewed by our admissions team.`,
              'pending_documents': `Your application #${data.application_number} requires additional documents. Please upload them to continue processing.`
            };
            
            const notificationTypes = {
              'approved': 'success',
              'rejected': 'error',
              'under_review': 'info',
              'pending_documents': 'warning'
            };
            
            const title = notificationTitles[status] || '📋 Application Status Update';
            const content = notificationContents[status] || `Your application #${data.application_number} status has been updated to ${status}.`;
            const type = notificationTypes[status] || 'info';
            
            // In-app notification
            await supabase.from('in_app_notifications').insert({
              user_id: data.user_id,
              title,
              content,
              type,
              action_url: `/student/application/${id}`,
              read: false
            });
            
            // Email notification (if configured)
            if (data.email && context.env.RESEND_API_KEY) {
              const { sendEmail } = await import('../_lib/emailService.js');
              await sendEmail({
                to: data.email,
                subject: title,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};">${title}</h2>
                    <p style="color: #374151; line-height: 1.6;">${content}</p>
                    ${notes ? `<div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;"><p style="margin: 0; color: #374151;"><strong>Note:</strong> ${notes}</p></div>` : ''}
                    <a href="${context.env.VITE_APP_URL || 'https://mihas.edu.zm'}/student/application/${id}" 
                       style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                      View Application
                    </a>
                    <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                    <p style="color: #6b7280; font-size: 12px;">MIHAS Application System</p>
                  </div>
                `
              });
            }
          }
          
          if (error) throw new Error(error.message);
          
          // Audit log
          if (!error && data) {
            const auditLogger = new AuditLogger(supabaseAdminClient);
            await auditLogger.logApplicationAction(
              authContext.user.id,
              `update_status_${status}`,
              id,
              { old_status: app.status, new_status: status, notes },
              request
            );
          }
          
          // Execute workflows
          if (!error && data) {
            const { executeWorkflows } = await import('../_lib/workflowEngine.js');
            await executeWorkflows('status_changed', data);
          }
          
          return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if (action === 'update_payment_status') {
          const { paymentStatus, verificationNotes } = payload;
          const updateData = { 
            payment_status: paymentStatus, 
            updated_at: new Date().toISOString(),
            payment_verified_by: authContext.user.id
          };
          if (paymentStatus === 'verified') {
            updateData.payment_verified_at = new Date().toISOString();
          }
          
          const { data, error } = await supabase
            .from('applications')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
          
          // Send notification to student
          if (!error && data) {
            const paymentNotifications = {
              'verified': {
                title: '✅ Payment Verified',
                content: `Your payment of K${data.amount || 153} for application #${data.application_number} has been verified. You can now download your payment receipt from your application details.`,
                type: 'success'
              },
              'rejected': {
                title: '❌ Payment Verification Failed',
                content: `Your payment for application #${data.application_number} could not be verified. Please contact admissions or resubmit proof of payment.`,
                type: 'error'
              },
              'pending_review': {
                title: '⏳ Payment Under Review',
                content: `Your payment for application #${data.application_number} is being reviewed. You will be notified once verification is complete.`,
                type: 'info'
              }
            };
            
            const notification = paymentNotifications[paymentStatus];
            if (notification) {
              // In-app notification
              await supabase.from('in_app_notifications').insert({
                user_id: data.user_id,
                title: notification.title,
                content: notification.content,
                type: notification.type,
                action_url: `/student/application/${id}`,
                read: false
              });
              
              // Email notification (if configured)
              if (data.email && context.env.RESEND_API_KEY) {
                const { sendEmail } = await import('../_lib/emailService.js');
                await sendEmail({
                  to: data.email,
                  subject: notification.title,
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2 style="color: ${notification.type === 'success' ? '#10b981' : notification.type === 'error' ? '#ef4444' : '#3b82f6'};">${notification.title}</h2>
                      <p style="color: #374151; line-height: 1.6;">${notification.content}</p>
                      <a href="${context.env.VITE_APP_URL || 'https://mihas.edu.zm'}/student/application/${id}" 
                         style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                        View Application
                      </a>
                      <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                      <p style="color: #6b7280; font-size: 12px;">MIHAS Application System</p>
                    </div>
                  `
                });
              }
            }
          }
          
          if (error) throw new Error(error.message);
          return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if (action === 'sync_grades') {
          const { grades } = payload;
          if (!Array.isArray(grades)) {
            throw new Error('Grades must be an array');
          }
          
          // Delete existing grades
          await supabase
            .from('application_grades')
            .delete()
            .eq('application_id', id);
          
          // Insert new grades
          if (grades.length > 0) {
            const gradesData = grades.map(g => ({
              application_id: id,
              subject_id: g.subject_id,
              grade: g.grade
            }));
            
            const { error: insertError } = await supabase
              .from('application_grades')
              .insert(gradesData);
            
            if (insertError) throw new Error(insertError.message);
          }
          
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Regular update
      const { data, error } = await supabase
        .from('applications')
        .update(body)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
