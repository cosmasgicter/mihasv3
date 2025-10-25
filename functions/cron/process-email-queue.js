import { supabaseAdminClient } from '../_lib/supabaseClient.js';
import { sendEmail } from '../_lib/emailService.js';

export async function onRequest(context) {
  const { env } = context;

  try {
    const supabaseAdmin = supabaseAdminClient;

    const { data: emails } = await supabaseAdmin
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10);

    const results = [];

    for (const email of emails || []) {
      await supabaseAdmin.from('email_queue').update({ status: 'sending' }).eq('id', email.id);

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">${email.subject}</h2>
          <p style="color: #374151; line-height: 1.6;">Dear ${email.template_data?.full_name || 'Student'},</p>
          <p style="color: #374151; line-height: 1.6;">
            Your application #${email.template_data?.application_number} for ${email.template_data?.program} has been submitted successfully.
          </p>
          <p style="color: #374151; line-height: 1.6;">Our admissions team will review your application and notify you of the outcome.</p>
          <a href="${env.PUBLIC_URL || 'https://apply.mihas.edu.zm'}/student/applications" 
             style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            View Application
          </a>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">MIHAS Application System</p>
        </div>
      `;

      const result = await sendEmail({ to: email.to_email, subject: email.subject, html, env });

      if (result.success) {
        await supabaseAdmin.from('email_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', email.id);
        results.push({ id: email.id, status: 'sent' });
      } else {
        await supabaseAdmin.from('email_queue').update({ status: 'failed', error_message: result.error }).eq('id', email.id);
        results.push({ id: email.id, status: 'failed' });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(onRequest({ env }));
  }
};
