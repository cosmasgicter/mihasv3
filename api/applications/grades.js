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

    // Get grades with subject names
    const { data: grades, error } = await supabase
      .from('application_grades')
      .select(`
        id,
        grade,
        subject_id,
        subjects(name)
      `)
      .eq('application_id', applicationId)
      .order('grade', { ascending: true });

    if (error) {
      console.error('Grades fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch grades' });
    }

    // Calculate best 5 points
    const best5Grades = grades.slice(0, 5);
    const totalPoints = best5Grades.reduce((sum, g) => sum + g.grade, 0);

    return res.status(200).json({
      success: true,
      data: {
        grades: grades.map(g => ({
          id: g.id,
          grade: g.grade,
          subject: g.subjects?.name || 'Unknown Subject',
          points: g.grade
        })),
        best5Points: totalPoints,
        totalSubjects: grades.length
      }
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}