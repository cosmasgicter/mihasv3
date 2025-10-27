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

  // Always fetch grades
  if (true) {
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
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  const { request } = context;
  const url = new URL(request.url);
  // Extract ID from URL path - handle both /applications/[id] and /student/application/[id]
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1] || context.params?.id;
  const include = url.searchParams.get('include');
  
  if (!id || id === 'applications') {
    return new Response(JSON.stringify({ error: 'Application ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
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
      
      const supabase = supabaseAdminClient;
      
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

      const supabase = supabaseAdminClient;
      const { data: app, error: fetchError } = await supabase
        .from('applications')
        .select('user_id, status')
        .eq('id', id)
        .maybeSingle();
      
      if (fetchError) {
        return new Response(JSON.stringify({ error: fetchError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (!app) {
        return new Response(JSON.stringify({ error: 'Application not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (app.user_id !== authContext.user.id && !authContext.isAdmin) {
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
      
      const supabase = supabaseAdminClient;
      // Check ownership
      const { data: app } = await supabase
        .from('applications')
        .select('user_id, status, payment_status')
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
          
          // Validate status value
          const validStatuses = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'pending_documents'];
          if (!validStatuses.includes(status)) {
            return new Response(JSON.stringify({ 
              error: 'Invalid status value',
              details: `Status must be one of: ${validStatuses.join(', ')}` 
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          // Prevent approval without verified payment
          if (status === 'approved' && app.payment_status !== 'verified') {
            return new Response(JSON.stringify({ 
              error: 'Cannot approve application without verified payment',
              details: 'Payment must be verified before approving the application'
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const { data, error } = await supabase
            .from('applications')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
          
          if (error) {
            console.error('Status update error:', error);
            throw new Error(error.message);
          }
          
          if (notes) {
            await supabase.from('application_status_history').insert({
              application_id: id,
              status,
              changed_by: authContext.user.id,
              notes,
              created_at: new Date().toISOString()
            });
          }
          
          // Send notification to student
          if (data) {
            const notificationTitles = {
              'submitted': '✅ Application Submitted Successfully',
              'approved': '🎉 Application Approved!',
              'rejected': '❌ Application Status Update',
              'under_review': '👀 Application Under Review',
              'pending_documents': '📄 Documents Required'
            };
            
            const notificationContents = {
              'submitted': `Your application #${data.application_number} for ${data.program} has been submitted successfully and is under review.`,
              'approved': `Congratulations! Your application #${data.application_number} for ${data.program} has been approved. Welcome to our institution!`,
              'rejected': `Your application #${data.application_number} for ${data.program} has been reviewed. Please check your email for detailed feedback.`,
              'under_review': `Your application #${data.application_number} for ${data.program} is currently being reviewed by our admissions team.`,
              'pending_documents': `Your application #${data.application_number} requires additional documents. Please upload them to continue processing.`
            };
            
            const notificationTypes = {
              'submitted': 'success',
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
            
            // Queue email notification
            if (data.email) {
              const { queueEmail } = await import('../_lib/emailQueue.js');
              const { getApplicationStatusEmail } = await import('../_lib/emailTemplates.js');
              
              await queueEmail({
                to: data.email,
                subject: title,
                html: getApplicationStatusEmail({
                  status,
                  applicationNumber: data.application_number,
                  program: data.program,
                  studentName: data.full_name,
                  notes,
                  appUrl: `${context.env.VITE_APP_URL || 'https://apply.mihas.edu.zm'}/student/application/${id}`
                }),
                priority: status === 'approved' ? 'high' : 'normal'
              }).catch(err => console.error('Email queue error:', err));
            }
          }
          
          // Audit log
          try {
            const auditLogger = new AuditLogger(supabase);
            await auditLogger.logApplicationAction(
              authContext.user.id,
              `update_status_${status}`,
              id,
              { old_status: app.status, new_status: status, notes },
              request
            );
          } catch (auditError) {
            console.error('Audit log error:', auditError);
          }
          
          // Execute workflows
          try {
            const { executeWorkflows } = await import('../_lib/workflowEngine.js');
            await executeWorkflows('status_changed', data);
          } catch (workflowError) {
            console.error('Workflow execution error:', workflowError);
          }
          
          return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if (action === 'update_payment_status') {
          const { paymentStatus, verificationNotes } = payload;
          
          // Validate payment status value
          const validPaymentStatuses = ['pending_review', 'verified', 'rejected'];
          if (!validPaymentStatuses.includes(paymentStatus)) {
            return new Response(JSON.stringify({ 
              error: 'Invalid payment status value',
              details: `Payment status must be one of: ${validPaymentStatuses.join(', ')}` 
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
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
          
          if (error) {
            console.error('Payment status update error:', error);
            throw new Error(error.message);
          }
          
          // Audit log for payment verification
          try {
            const auditLogger = new AuditLogger(supabase);
            await auditLogger.logApplicationAction(
              authContext.user.id,
              `payment_${paymentStatus}`,
              id,
              { 
                old_payment_status: app.payment_status, 
                new_payment_status: paymentStatus, 
                verification_notes: verificationNotes 
              },
              request
            );
          } catch (auditError) {
            console.error('Audit log error:', auditError);
          }
          
          // Send notification to student
          if (data) {
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
              try {
                await supabase.from('in_app_notifications').insert({
                  user_id: data.user_id,
                  title: notification.title,
                  content: notification.content,
                  type: notification.type,
                  action_url: `/student/application/${id}`,
                  read: false
                });
              } catch (notifError) {
                console.error('Notification insert error:', notifError);
              }
              
              // Queue email notification
              if (data.email) {
                const { queueEmail } = await import('../_lib/emailQueue.js');
                const { getPaymentStatusEmail } = await import('../_lib/emailTemplates.js');
                
                await queueEmail({
                  to: data.email,
                  subject: notification.title,
                  html: getPaymentStatusEmail({
                    status: paymentStatus,
                    applicationNumber: data.application_number,
                    amount: data.amount,
                    studentName: data.full_name,
                    appUrl: `${context.env.VITE_APP_URL || 'https://apply.mihas.edu.zm'}/student/application/${id}`
                  }),
                  priority: paymentStatus === 'verified' ? 'high' : 'normal'
                }).catch(err => console.error('Email queue error:', err));
              }
            }
          }
          
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
