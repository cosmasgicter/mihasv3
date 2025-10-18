import { createClient } from '@supabase/supabase-js';
import { withNetlifyHandler } from '../_lib/netlifyHandler.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicationId } = req.query;

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    const { data: documents, error } = await supabase
      .from('application_documents')
      .select('*')
      .eq('application_id', applicationId);

    if (error) {
      console.error('Documents fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    return res.status(200).json({
      success: true,
      data: documents || []
    });

  } catch (error) {
    console.error('Documents API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
