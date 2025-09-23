import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';
import { withNetlifyHandler } from '../_lib/netlifyHandler.js';

const supabase = supabaseAdminClient;

async function ensureApplicationAccess(req, applicationId) {
  const authContext = await getUserFromRequest(req);
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401;
    return { error: authContext.error, status };
  }

  if (authContext.isAdmin) {
    return { authContext };
  }

  const { data, error } = await supabase
    .from('applications_new')
    .select('id, user_id')
    .eq('id', applicationId)
    .maybeSingle();

  if (error) {
    return { error: error.message, status: 400 };
  }

  if (!data) {
    return { error: 'Application not found', status: 404 };
  }

  if (data.user_id !== authContext.user.id) {
    return { error: 'Access denied', status: 403 };
  }

  return { authContext };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    const { error: authError, status: authStatus } = await ensureApplicationAccess(req, id);
    if (authError) {
      return res.status(authStatus).json({ error: authError });
    }

    // Get application details
    const { data: application, error } = await supabase
      .from('applications_new')
      .select(`
        *,
        application_documents(id, document_type, file_url, verification_status),
        application_grades(id, subject, grade, points)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(404).json({ error: 'Application not found' });
    }

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    return res.status(200).json({
      success: true,
      data: application
    });

  } catch (error) {
    console.error('Application details error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
