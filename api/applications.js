import { supabaseAdminClient, requireUser } from './_lib/supabaseClient.js';
import { withNetlifyHandler } from './_lib/netlifyHandler.js';
import { validateCreate } from './_lib/validation.js';
import { sanitizeForLog } from './_lib/security.js';

const baseHandler = async (req, res) => {
  try {
    const { user } = await requireUser(req);

    if (req.method === 'GET') {
      const page = parseInt(req.query.page || '0', 10);
      const pageSize = parseInt(req.query.pageSize || '15', 10);
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdminClient
        .from('applications_new')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id) // Only fetch applications for the current user
        .order('created_at', { ascending: false })
        .range(from, to);

      if (req.query.status) {
        query = query.eq('status', req.query.status);
      }

      const { data, error, count } = await query;

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({
        applications: data || [],
        totalCount: count || 0,
        page,
        pageSize,
      });
    }

    if (req.method === 'POST') {
      const result = validateCreate(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues.map(d => d.message).join(', ') });
      }

      const applicationData = { ...result.data, user_id: user.id };

      const { data, error } = await supabaseAdminClient
        .from('applications_new')
        .insert([applicationData])
        .select()
        .single();

      if (error) {
        console.error('[API/applications] POST Error:', sanitizeForLog(error));
        return res.status(400).json({ error: error.message });
      }

      return res.status(201).json(data);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error('[API/applications] Error:', sanitizeForLog(error.message));
    if (error.message.includes('denied')) {
        return res.status(403).json({ error: 'Access denied' });
    }
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}

export const expressHandler = baseHandler;
export const netlifyHandler = withNetlifyHandler(baseHandler);
export default netlifyHandler;