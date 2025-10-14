export function createErrorResponse(error, defaultStatus = 500) {
  if (typeof error === 'string') {
    return {
      status: defaultStatus,
      body: { error }
    }
  }

  if (error instanceof Error) {
    // Handle specific error types
    if (error.message.includes('JWT')) {
      return {
        status: 401,
        body: { error: 'Invalid or expired token' }
      }
    }

    if (error.message.includes('not found')) {
      return {
        status: 404,
        body: { error: 'Resource not found' }
      }
    }

    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return {
        status: 409,
        body: { error: 'Resource already exists' }
      }
    }

    if (error.message.includes('permission') || error.message.includes('access')) {
      return {
        status: 403,
        body: { error: 'Access denied' }
      }
    }

    return {
      status: defaultStatus,
      body: { error: error.message }
    }
  }

  return {
    status: defaultStatus,
    body: { error: 'Internal server error' }
  }
}

export function handleApiError(res, error, defaultStatus = 500) {
  const { status, body } = createErrorResponse(error, defaultStatus)
  return res.status(status).json(body)
}