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
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Get application details
    const { data: application, error } = await supabase
      .from('applications')
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