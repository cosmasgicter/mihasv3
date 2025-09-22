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

    // Get application academic summary
    const { data: summary, error } = await supabase
      .from('application_summary')
      .select('best_5_points, total_subjects')
      .eq('id', id)
      .single();

    if (error || !summary) {
      return res.status(404).json({ error: 'Application not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        total_subjects: summary.total_subjects,
        best_5_points: summary.best_5_points,
        display_text: `${summary.best_5_points} points`
      }
    });

  } catch (error) {
    console.error('Academic summary error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}