import { supabaseAdminClient, requireUser } from './_lib/supabaseClient.js';
import { withNetlifyHandler } from './_lib/netlifyHandler.js';
import { validateUpdate, validateStatusUpdate } from './_lib/validation.js';
import { sanitizeForLog } from './_lib/security.js';

const handler = async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Application ID is required' });
  }

  try {
    const { user, isAdmin } = await requireUser(req);

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdminClient
        .from('applications_new')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Application not found' });

      // Only admin or owner can view
      if (!isAdmin && data.user_id !== user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      const result = validateUpdate(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues.map(d => d.message).join(', ') });
      }

      const { data: existingApp, error: fetchError } = await supabaseAdminClient
        .from('applications_new')
        .select('user_id')
        .eq('id', id)
        .single();

      if (fetchError || !existingApp) {
        return res.status(404).json({ error: 'Application not found' });
      }

      // Only owner can update
      if (existingApp.user_id !== user.id && !isAdmin) {
          return res.status(403).json({ error: 'You do not have permission to update this application.' });
      }

      const { data, error } = await supabaseAdminClient
        .from('applications_new')
        .update(result.data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'PATCH') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'You must be an admin to perform this action.' });
      }

      const { action, ...payload } = req.body;

      if (action === 'update_status') {
        const result = validateStatusUpdate(payload);
        if (!result.success) {
          return res.status(400).json({ error: result.error.issues.map(d => d.message).join(', ') });
        }
        const { status, notes } = result.data;

        const { data, error } = await supabaseAdminClient
          .from('applications_new')
          .update({ status, admin_notes: notes, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json(data);
      }

      return res.status(400).json({ error: 'Invalid patch action' });
    }

    if (req.method === 'DELETE') {
      const { data: existingApp, error: fetchError } = await supabaseAdminClient
        .from('applications_new')
        .select('user_id')
        .eq('id', id)
        .single();

      if (fetchError || !existingApp) {
        return res.status(404).json({ error: 'Application not found' });
      }

      // Only owner can delete
      if (existingApp.user_id !== user.id && !isAdmin) {
        return res.status(403).json({ error: 'You do not have permission to delete this application.' });
      }

      const { error } = await supabaseAdminClient
        .from('applications_new')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      return res.status(204).end();
    }

    res.setHeader('Allow', ['GET', 'PUT', 'PATCH', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error(`[API/applications/${id}] Error:`, sanitizeForLog(error.message));
    if (error.message.includes('denied')) {
        return res.status(403).json({ error: 'Access denied' });
    }
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}

export const expressHandler = baseHandler;
export const netlifyHandler = withNetlifyHandler(baseHandler);
export default netlifyHandler;