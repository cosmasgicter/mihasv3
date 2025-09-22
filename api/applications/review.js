import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicationId, action, feedback, reviewerId } = req.body;

    if (!applicationId || !action) {
      return res.status(400).json({ error: 'Application ID and action are required' });
    }

    let status;
    switch (action) {
      case 'approve':
        status = 'approved';
        break;
      case 'reject':
        status = 'rejected';
        break;
      case 'request_changes':
        status = 'changes_requested';
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    // Update application status
    const { data, error } = await supabase
      .from('applications')
      .update({
        status: status,
        admin_feedback: feedback,
        admin_feedback_date: new Date().toISOString(),
        admin_feedback_by: reviewerId,
        reviewed_by: reviewerId,
        review_started_at: new Date().toISOString()
      })
      .eq('id', applicationId)
      .select()
      .single();

    if (error) {
      console.error('Review update error:', error);
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      message: `Application ${action}d successfully`,
      data
    });

  } catch (error) {
    console.error('Review API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}