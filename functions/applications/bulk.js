import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';
import { AuditLogger } from '../_lib/auditLogger.js';

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
    const authContext = await getUserFromRequest(request, { requireAdmin: true });
    if (authContext.error) {
      return new Response(JSON.stringify({ success: false, error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json();
    const { action, applicationIds, status, paymentStatus } = body;
    
    if (!action || !applicationIds || !Array.isArray(applicationIds)) {
      return new Response(JSON.stringify({ success: false, error: 'action and applicationIds array are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = supabaseAdminClient;
    const auditLogger = new AuditLogger(supabase);
    
    if (action === 'update_status') {
      if (!status) {
        return new Response(JSON.stringify({ success: false, error: 'status is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Fetch current statuses for audit trail
      const { data: currentApps } = await supabase
        .from('applications')
        .select('id, status')
        .in('id', applicationIds);
      
      const { data, error } = await supabase
        .from('applications')
        .update({ status, updated_at: new Date().toISOString() })
        .in('id', applicationIds)
        .select();
      
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Audit log for bulk status update
      try {
        await auditLogger.log({
          actorId: authContext.user.id,
          action: 'bulk_update_status',
          entityType: 'applications',
          entityId: null,
          changes: {
            application_ids: applicationIds,
            new_status: status,
            previous_statuses: currentApps?.reduce((acc, app) => ({ ...acc, [app.id]: app.status }), {}),
            count: data.length
          },
          ipAddress: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent')
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError.message);
      }
      
      return new Response(JSON.stringify({ success: true, updated: data.length }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'update_payment_status') {
      if (!paymentStatus) {
        return new Response(JSON.stringify({ success: false, error: 'paymentStatus is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Fetch current payment statuses for audit trail
      const { data: currentApps } = await supabase
        .from('applications')
        .select('id, payment_status')
        .in('id', applicationIds);
      
      const { data, error } = await supabase
        .from('applications')
        .update({ payment_status: paymentStatus, updated_at: new Date().toISOString() })
        .in('id', applicationIds)
        .select();
      
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Audit log for bulk payment status update
      try {
        await auditLogger.log({
          actorId: authContext.user.id,
          action: 'bulk_update_payment_status',
          entityType: 'applications',
          entityId: null,
          changes: {
            application_ids: applicationIds,
            new_payment_status: paymentStatus,
            previous_payment_statuses: currentApps?.reduce((acc, app) => ({ ...acc, [app.id]: app.payment_status }), {}),
            count: data.length
          },
          ipAddress: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent')
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError.message);
      }
      
      return new Response(JSON.stringify({ success: true, updated: data.length }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'delete') {
      // Fetch application info before deletion for audit trail
      const { data: appsToDelete } = await supabase
        .from('applications')
        .select('id, application_number, status')
        .in('id', applicationIds);
      
      const { error } = await supabase
        .from('applications')
        .delete()
        .in('id', applicationIds);
      
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Audit log for bulk delete
      try {
        await auditLogger.log({
          actorId: authContext.user.id,
          action: 'bulk_delete',
          entityType: 'applications',
          entityId: null,
          changes: {
            deleted_application_ids: applicationIds,
            deleted_applications: appsToDelete?.map(app => ({ 
              id: app.id, 
              application_number: app.application_number,
              status: app.status 
            })),
            count: applicationIds.length
          },
          ipAddress: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent')
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError.message);
      }
      
      return new Response(JSON.stringify({ success: true, deleted: applicationIds.length }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ success: false, error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Bulk operation error:', error.message);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
