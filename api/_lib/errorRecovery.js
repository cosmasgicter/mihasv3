// Simple error recovery utilities

export function isNetworkError(error) {
  const message = error?.message?.toLowerCase() || ''
  return message.includes('network') || 
         message.includes('timeout') || 
         message.includes('connection') ||
         message.includes('fetch')
}

export function isAuthError(error) {
  const message = error?.message?.toLowerCase() || ''
  return message.includes('unauthorized') || 
         message.includes('invalid token') || 
         message.includes('expired')
}

export function createErrorResponse(error, req) {
  const isDev = process.env.NODE_ENV === 'development'
  
  if (isAuthError(error)) {
    return {
      status: 401,
      body: { error: 'Authentication required' }
    }
  }
  
  if (isNetworkError(error)) {
    return {
      status: 503,
      body: { error: 'Service temporarily unavailable' }
    }
  }
  
  return {
    status: 500,
    body: { 
      error: 'Internal server error',
      details: isDev ? error.message : undefined
    }
  }
}

export function withErrorRecovery(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res)
    } catch (error) {
      console.error('Handler error:', error)
      const { status, body } = createErrorResponse(error, req)
      return res.status(status).json(body)
    }
  }
}