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

    // Get application summary with correct calculations
    const { data: application, error } = await supabase
      .from('application_summary')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(404).json({ error: 'Application not found' });
    }

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Format the response with correct academic data
    const response = {
      ...application,
      academic: {
        total_subjects: application.total_subjects,
        best_5_average: application.best_5_average,
        best_5_points: application.best_5_points,
        eligibility_status: application.eligibility_status,
        eligibility_score: application.eligibility_score
      }
    };

    return res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Application summary error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}