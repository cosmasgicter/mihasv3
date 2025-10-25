import { supabaseAdminClient } from './supabaseClient.js'
import { logAuditEvent } from './auditLogger.js'
import { validateTurnstileToken } from './turnstileValidator.js'

function computeDefaultBaseUrls() {
  const candidates = [
    process.env.PASSWORD_RESET_REDIRECT_BASE,
    process.env.PUBLIC_RESET_PASSWORD_URL,
    process.env.VITE_APP_BASE_URL,
    process.env.APP_BASE_URL,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.VITE_API_BASE_URL,
    'https://apply.mihas.edu.zm',
    'https://mihas-application.netlify.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)

  return Array.from(new Set(candidates))
}

function resolveBaseUrl(value) {
  if (!value) return null
  try {
    return new URL(value)
  } catch (_error) {
    return null
  }
}

const BASE_URLS = computeDefaultBaseUrls()

function buildFallbackRedirectUrl() {
  for (const candidate of BASE_URLS) {
    const parsed = resolveBaseUrl(candidate)
    if (!parsed) continue

    try {
      return new URL('/auth/reset-password', parsed).toString()
    } catch (_error) {
      continue
    }
  }

  return 'https://apply.mihas.edu.zm/auth/reset-password'
}

const FALLBACK_REDIRECT_URL = buildFallbackRedirectUrl()

const ALLOWED_REDIRECT_HOSTS = new Set(
  BASE_URLS
    .map(candidate => {
      const parsed = resolveBaseUrl(candidate)
      return parsed ? parsed.host : null
    })
    .filter(Boolean)
)

function sanitizeRedirectUrl(candidate) {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return FALLBACK_REDIRECT_URL
  }

  try {
    const parsed = new URL(candidate)
    if (ALLOWED_REDIRECT_HOSTS.has(parsed.host)) {
      return parsed.toString()
    }
  } catch (_error) {
    // Invalid URL, fall back to default
  }

  return FALLBACK_REDIRECT_URL
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildPasswordResetEmail({ actionLink, appName, supportEmail }) {
  const COLORS = {
    primaryBlue: '#0ea5e9',
    darkGray: '#111827',
    mediumGray: '#4b5563',
    lightGray: '#f9fafb',
    white: '#ffffff'
  };
  
  const escapedLink = escapeHtml(actionLink)
  const safeAppName = escapeHtml(appName || 'MIHAS Admissions Portal')
  const safeSupportEmail = escapeHtml(supportEmail || 'support@mihas.edu.zm')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.lightGray};font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.lightGray};padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${COLORS.white};border-radius:12px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:${COLORS.primaryBlue};padding:24px 40px;text-align:center;">
              <h1 style="margin:0;color:${COLORS.white};font-size:24px;font-weight:600;">MIHAS</h1>
              <p style="margin:4px 0 0;color:${COLORS.white};font-size:14px;opacity:0.9;">Mukuba Institute of Health and Allied Sciences</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h2 style="font-size:20px;margin:0 0 16px;color:${COLORS.darkGray};">Reset Your Password</h2>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.mediumGray};">
                We received a request to reset the password for your ${safeAppName} account. If you made this request, please choose a new password by selecting the button below.
              </p>
              <a href="${escapedLink}" style="display:inline-block;padding:14px 28px;background-color:${COLORS.primaryBlue};color:${COLORS.white};font-weight:600;border-radius:9999px;text-decoration:none;margin:16px 0;">Choose a New Password</a>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:${COLORS.mediumGray};">
                If the button above does not work, copy and paste this link into your browser:<br>
                <span style="color:${COLORS.primaryBlue};word-break:break-all;">${escapedLink}</span>
              </p>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:${COLORS.mediumGray};">
                This link will expire shortly for security reasons. If you did not request a password reset, no further action is required.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:${COLORS.lightGray};color:${COLORS.mediumGray};font-size:12px;text-align:center;">
              Need help? Contact us at ${safeSupportEmail}.<br>
              © ${new Date().getFullYear()} ${safeAppName}. All rights reserved.<br>
              <a href="https://mihas.edu.zm" style="color:${COLORS.primaryBlue};text-decoration:none;">mihas.edu.zm</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function extractClientIp(headers = {}) {
  const forwardedFor = headers['x-forwarded-for'] || headers['X-Forwarded-For']
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0]?.trim() || null
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0]
  }

  const realIp = headers['x-real-ip'] || headers['X-Real-Ip']
  if (typeof realIp === 'string' && realIp.trim().length > 0) {
    return realIp.trim()
  }

  return null
}

export async function initiatePasswordReset({
  email,
  redirectTo,
  turnstileToken,
  clientIp,
  request
}) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { status: 400, error: 'A valid email address is required' }
  }

  const resolvedClientIp = clientIp || extractClientIp(request?.headers)

  if (turnstileToken) {
    try {
      const validation = await validateTurnstileToken(turnstileToken, resolvedClientIp)
      if (!validation?.success && !validation?.bypass) {
        const errorCodes = Array.isArray(validation?.['error-codes'])
          ? validation['error-codes'].join(', ')
          : validation?.['error-codes']

        await logAuditEvent({
          req: request,
          action: 'auth.reset_password.turnstile_failed',
          actorEmail: normalizedEmail,
          metadata: { reason: validation?.error || errorCodes || 'turnstile_failed' }
        })
        return { status: 400, error: 'Security verification failed. Please try again.' }
      }
    } catch (error) {
      console.error('Turnstile validation error:', error)
      return { status: 503, error: 'Security verification service is unavailable. Please try again later.' }
    }
  }

  const resolvedRedirect = sanitizeRedirectUrl(redirectTo)
  const appName = process.env.APP_NAME || 'MIHAS Admissions Portal'
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@mihas.edu.zm'

  try {
    const { data, error } = await supabaseAdminClient.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: { redirectTo: resolvedRedirect }
    })

    if (error) {
      console.error('Supabase generateLink error:', error)
      await logAuditEvent({
        req: request,
        action: 'auth.reset_password.failure',
        actorEmail: normalizedEmail,
        metadata: { reason: error.message || 'generate_link_failed' }
      })
      return { status: 502, error: 'Unable to process password reset. Please try again later.' }
    }

    const actionLink = data?.properties?.action_link || data?.properties?.redirect_to
    if (!actionLink) {
      console.error('Supabase generateLink returned no action link')
      await logAuditEvent({
        req: request,
        action: 'auth.reset_password.failure',
        actorEmail: normalizedEmail,
        metadata: { reason: 'missing_action_link' }
      })
      return { status: 502, error: 'Unable to generate password reset link. Please contact support.' }
    }

    const html = buildPasswordResetEmail({ actionLink, appName, supportEmail })
    let sendErrorMessage = null

    if (typeof supabaseAdminClient.functions?.invoke === 'function') {
      const { data: result, error: invocationError } = await supabaseAdminClient.functions.invoke('send-email', {
        body: {
          to: normalizedEmail,
          subject: `Reset your ${appName} password`,
          html
        }
      })

      if (invocationError) {
        console.error('Email invocation error:', invocationError)
        sendErrorMessage = invocationError.message || 'Unable to dispatch reset email.'
      } else if (!result?.success) {
        const providerError = result?.error?.message || result?.error?.code || 'Email provider rejected the request.'
        console.error('Email provider error:', providerError, result)
        sendErrorMessage = providerError
      }
    } else {
      console.warn('Supabase function invocation is not available; skipping email dispatch.')
    }

    if (sendErrorMessage) {
      await logAuditEvent({
        req: request,
        action: 'auth.reset_password.email_failed',
        actorEmail: normalizedEmail,
        metadata: { reason: sendErrorMessage }
      })
      return { status: 502, error: 'Unable to send reset instructions. Please try again later.' }
    }

    await logAuditEvent({
      req: request,
      action: 'auth.reset_password.success',
      actorEmail: normalizedEmail,
      metadata: { redirect: resolvedRedirect }
    })

    return { status: 200 }
  } catch (error) {
    console.error('Password reset error:', error)
    await logAuditEvent({
      req: request,
      action: 'auth.reset_password.failure',
      actorEmail: normalizedEmail,
      metadata: { reason: error.message }
    })
    return { status: 500, error: 'Unexpected error processing password reset. Please try again later.' }
  }
}
