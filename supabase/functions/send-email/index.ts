import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

type EmailRequest = {
  to?: string
  subject?: string
  html?: string
  from?: string
}

type EmailError = {
  code: string
  message: string
  provider?: string
  status?: number
  retryable?: boolean
  details?: unknown
}

type EmailSuccess = {
  provider: string
  status: number
  messageId?: string
  metadata?: Record<string, unknown>
}

type EmailResponseBody =
  | { success: true; data: EmailSuccess }
  | { success: false; error: EmailError }

const corsHeaders: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  Vary: 'Origin'
}

const jsonHeaders: HeadersInit = {
  ...corsHeaders,
  'Content-Type': 'application/json; charset=utf-8'
}

function respond(body: EmailResponseBody, init?: ResponseInit): Response {
  const status = init?.status ?? 200
  return new Response(JSON.stringify(body), {
    ...init,
    status,
    headers: new Headers({ ...jsonHeaders, ...(init?.headers ?? {}) })
  })
}

function validationError(message: string, details?: unknown): Response {
  return respond(
    {
      success: false,
      error: {
        code: 'validation_error',
        message,
        status: 400,
        retryable: false,
        details
      }
    },
    { status: 200 }
  )
}

function configurationError(message: string, provider?: string): Response {
  return respond(
    {
      success: false,
      error: {
        code: 'configuration_error',
        message,
        provider,
        status: 500,
        retryable: false
      }
    },
    { status: 200 }
  )
}

async function sendViaResend(payload: Required<Pick<EmailRequest, 'to' | 'subject' | 'html'>> & { from: string }) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    return configurationError('RESEND_API_KEY is not configured', 'resend')
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: payload.to,
        from: payload.from,
        subject: payload.subject,
        html: payload.html
      })
    })

    const status = response.status
    if (response.ok) {
      const data = await response.json().catch(() => ({}))
      const messageId = typeof data?.id === 'string' ? data.id : undefined
      return respond({
        success: true,
        data: {
          provider: 'resend',
          status,
          messageId,
          metadata: { apiVersion: data?.object }
        }
      })
    }

    const errorBody = await parseErrorBody(response)
    const message = deriveErrorMessage(errorBody, 'Resend rejected the message')
    return respond(
      {
        success: false,
        error: {
          code: 'provider_error',
          message,
          provider: 'resend',
          status,
          retryable: status >= 500,
          details: errorBody
        }
      },
      { status: 200 }
    )
  } catch (error) {
    return respond(
      {
        success: false,
        error: {
          code: 'network_error',
          message: error instanceof Error ? error.message : 'Failed to reach Resend',
          provider: 'resend',
          status: 503,
          retryable: true
        }
      },
      { status: 200 }
    )
  }
}

async function sendViaSendGrid(payload: Required<Pick<EmailRequest, 'to' | 'subject' | 'html'>> & { from: string }) {
  const apiKey = Deno.env.get('SENDGRID_API_KEY')
  if (!apiKey) {
    return configurationError('SENDGRID_API_KEY is not configured', 'sendgrid')
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: payload.to }]
          }
        ],
        from: { email: payload.from },
        subject: payload.subject,
        content: [
          {
            type: 'text/html',
            value: payload.html
          }
        ]
      })
    })

    const status = response.status
    if (response.ok || status === 202) {
      const requestId = response.headers.get('x-message-id') ?? response.headers.get('x-request-id') ?? undefined
      return respond({
        success: true,
        data: {
          provider: 'sendgrid',
          status,
          messageId: requestId
        }
      })
    }

    const errorBody = await parseErrorBody(response)
    const message = deriveErrorMessage(errorBody, 'SendGrid rejected the message')
    return respond(
      {
        success: false,
        error: {
          code: 'provider_error',
          message,
          provider: 'sendgrid',
          status,
          retryable: status >= 500,
          details: errorBody
        }
      },
      { status: 200 }
    )
  } catch (error) {
    return respond(
      {
        success: false,
        error: {
          code: 'network_error',
          message: error instanceof Error ? error.message : 'Failed to reach SendGrid',
          provider: 'sendgrid',
          status: 503,
          retryable: true
        }
      },
      { status: 200 }
    )
  }
}

async function parseErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch (_error) {
      // fall through
    }
  }

  try {
    const text = await response.text()
    return text || null
  } catch (_error) {
    return null
  }
}

function deriveErrorMessage(errorBody: unknown, fallback: string): string {
  if (!errorBody) {
    return fallback
  }

  if (typeof errorBody === 'string') {
    return errorBody
  }

  if (typeof errorBody === 'object') {
    const value = (errorBody as Record<string, unknown>)
    const message = value.error || value.message || value.detail || value.description
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }

  return fallback
}

function resolveFromAddress(provider?: string): string | undefined {
  const explicit = provider === 'resend'
    ? Deno.env.get('RESEND_FROM_EMAIL')
    : provider === 'sendgrid'
      ? Deno.env.get('SENDGRID_FROM_EMAIL')
      : undefined

  return explicit || Deno.env.get('EMAIL_FROM_ADDRESS') || Deno.env.get('DEFAULT_FROM_EMAIL')
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return respond(
      {
        success: false,
        error: {
          code: 'method_not_allowed',
          message: 'Only POST requests are supported',
          status: 405,
          retryable: false
        }
      },
      { status: 405 }
    )
  }

  let payload: EmailRequest
  try {
    payload = await req.json()
  } catch (_error) {
    return validationError('Request body must be valid JSON')
  }

  if (!payload || typeof payload !== 'object') {
    return validationError('Request body is required')
  }

  const { to, subject, html } = payload

  if (!to || typeof to !== 'string' || to.trim().length === 0) {
    return validationError('A recipient email address (to) is required')
  }

  if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
    return validationError('A subject is required')
  }

  if (!html || typeof html !== 'string' || html.trim().length === 0) {
    return validationError('HTML content is required')
  }

  const configuredProvider = (Deno.env.get('EMAIL_PROVIDER') || '').toLowerCase().trim()
  const provider = configuredProvider || 'resend'

  const fromAddress = payload.from || resolveFromAddress(provider)
  if (!fromAddress) {
    return configurationError('A from email address is not configured', provider)
  }

  switch (provider) {
    case 'resend':
      return await sendViaResend({ to, subject, html, from: fromAddress })
    case 'sendgrid':
      return await sendViaSendGrid({ to, subject, html, from: fromAddress })
    default:
      return respond(
        {
          success: false,
          error: {
            code: 'unsupported_provider',
            message: `EMAIL_PROVIDER ${provider} is not supported`,
            provider,
            status: 500,
            retryable: false
          }
        },
        { status: 200 }
      )
  }
})
