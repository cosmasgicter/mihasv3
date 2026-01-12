import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

/**
 * Event Tracking API Endpoint
 * Tracks application events for metrics calculation
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
    const eventData = await request.json();
    
    const { 
      applicationId, 
      eventType, 
      programId, 
      userId, 
      timestamp, 
      metadata = {} 
    } = eventData;

    // Validate required fields
    if (!applicationId || !eventType || !programId || !userId) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: applicationId, eventType, programId, userId' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate event type
    const validEventTypes = ['created', 'submitted', 'reviewed', 'approved', 'rejected'];
    if (!validEventTypes.includes(eventType)) {
      return new Response(JSON.stringify({ 
        error: `Invalid event type. Must be one of: ${validEventTypes.join(', ')}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create analytics event record
    const analyticsEvent = {
      application_id: applicationId,
      event_type: eventType,
      program_id: programId,
      user_id: userId,
      event_timestamp: timestamp || new Date().toISOString(),
      metadata: metadata,
      created_at: new Date().toISOString(),
      created_by: authContext.user.id
    };

    // Insert into analytics_events table
    const { data, error } = await supabaseAdminClient
      .from('analytics_events')
      .insert([analyticsEvent])
      .select();

    if (error) {
      console.error('Failed to insert analytics event:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to track event',
        details: error.message 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update application status if this is a status-changing event
    if (['submitted', 'reviewed', 'approved', 'rejected'].includes(eventType)) {
      const updateData = {};
      
      switch (eventType) {
        case 'submitted':
          updateData.submitted_at = analyticsEvent.event_timestamp;
          updateData.status = 'submitted';
          break;
        case 'reviewed':
          updateData.reviewed_at = analyticsEvent.event_timestamp;
          updateData.status = 'under_review';
          break;
        case 'approved':
          updateData.decision_date = analyticsEvent.event_timestamp;
          updateData.status = 'approved';
          break;
        case 'rejected':
          updateData.decision_date = analyticsEvent.event_timestamp;
          updateData.status = 'rejected';
          break;
      }

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabaseAdminClient
          .from('applications')
          .update(updateData)
          .eq('id', applicationId);

        if (updateError) {
          console.error('Failed to update application status:', updateError);
          // Don't fail the request, just log the error
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      eventId: data[0]?.id,
      message: 'Event tracked successfully'
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Event tracking error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to track event',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}