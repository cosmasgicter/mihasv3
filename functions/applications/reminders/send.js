export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const { email, fullName, draftName, lastUpdated } = await request.json()

    if (!email || !fullName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Complete Your Application</h1>
          </div>
          <div class="content">
            <p>Dear ${fullName},</p>
            <p>We noticed you started an application but haven't completed it yet.</p>
            ${draftName ? `<p><strong>Draft:</strong> ${draftName}</p>` : ''}
            ${lastUpdated ? `<p><strong>Last Updated:</strong> ${new Date(lastUpdated).toLocaleDateString()}</p>` : ''}
            <p>Don't miss out on your opportunity to join MIHAS! Complete your application today.</p>
            <a href="${env.PUBLIC_URL || '***REMOVED***'}/student/application-wizard" class="button">
              Continue Application
            </a>
            <p>If you have any questions, please contact us at ***REMOVED***</p>
          </div>
          <div class="footer">
            <p>Medical Institute of Health and Allied Sciences</p>
            <p>This is an automated reminder. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `

    const supabaseUrl = env.SUPABASE_URL
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY

    const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        to: email,
        subject: 'Complete Your MIHAS Application',
        html: emailHtml
      })
    })

    if (!response.ok) {
      throw new Error('Failed to send email')
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Reminder sent successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Reminder error:', error)
    return new Response(JSON.stringify({ 
      error: 'Failed to send reminder',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
