import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id, include } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Application ID is required' });
  }

  try {
    if (req.method === 'GET') {
      // Get basic application data
      const { data: application, error } = await supabase
        .from('applications')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return res.status(404).json({ error: 'Application not found' });
      }

      const result = { ...application };

      // Handle includes
      if (include) {
        const includes = include.split(',');

        if (includes.includes('grades')) {
          const { data: grades } = await supabase
            .from('application_grades')
            .select('id, grade, subject_id, subjects(name)')
            .eq('application_id', id)
            .order('grade', { ascending: true });

          result.grades = grades || [];
          
          // Calculate best 5 points
          const best5 = grades?.slice(0, 5) || [];
          result.best5Points = best5.reduce((sum, g) => sum + g.grade, 0);
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
      }

      return res.status(200).json({ success: true, data: result });
    }

    if (req.method === 'PATCH') {
      const updates = req.body;

      const { data, error } = await supabase
        .from('applications')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Update error:', error);
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({ success: true, data });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}