/**
 * Validates Cloudflare Turnstile token
 */
export async function validateTurnstileToken(token, remoteip) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY
  
  // Skip validation if no secret key is configured
  if (!secretKey) {
    console.warn('Turnstile secret key not configured, skipping validation')
    return { success: true, bypass: true }
  }

  // Skip validation for test tokens in development
  if (token === 'test-token' && process.env.NODE_ENV !== 'production') {
    return { success: true, bypass: true }
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: remoteip || ''
      })
    })

    const result = await response.json()
    return result
  } catch (error) {
    console.error('Turnstile validation error:', error)
    return { success: false, error: 'Verification failed' }
  }
}