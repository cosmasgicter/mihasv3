import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
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