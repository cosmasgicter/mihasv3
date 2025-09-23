function getHeader(headers, name) {
  if (!headers) {
    return undefined
  }

  const lowerName = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value
    }
  }

  return undefined
}

function mergeQueryParameters(event) {
  const single = event.queryStringParameters || {}
  const multi = event.multiValueQueryStringParameters || {}
  const pathParams = event.pathParameters || {}

  const query = { ...single }

  for (const [key, value] of Object.entries(multi)) {
    if (value === undefined || value === null) {
      continue
    }

    if (Array.isArray(value)) {
      query[key] = value.length === 1 ? value[0] : value
    } else if (!(key in query)) {
      query[key] = value
    }
  }

  for (const [key, value] of Object.entries(pathParams)) {
    if (query[key] === undefined) {
      query[key] = value
    }
  }

  return query
}

function decodeBody(eventBody, isBase64Encoded) {
  if (!eventBody) {
    return ''
  }

  if (!isBase64Encoded) {
    return eventBody
  }

  try {
    return Buffer.from(eventBody, 'base64')
  } catch (error) {
    return ''
  }
}

function parseRequestBody(event, headers) {
  const decoded = decodeBody(event.body, event.isBase64Encoded)

  if (Buffer.isBuffer(decoded)) {
    return decoded
  }

  if (typeof decoded !== 'string' || decoded.length === 0) {
    return decoded
  }

  const contentType = getHeader(headers, 'content-type')
  if (typeof contentType === 'string' && contentType.toLowerCase().includes('application/json')) {
    try {
      return JSON.parse(decoded)
    } catch (error) {
      return decoded
    }
  }

  const trimmed = decoded.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed)
    } catch (error) {
      return decoded
    }
  }

  return decoded
}

function createRequest(event, context) {
  const headers = event.headers || {}
  const rawBody = decodeBody(event.body, event.isBase64Encoded)

  return {
    method: event.httpMethod,
    headers,
    query: mergeQueryParameters(event),
    params: event.pathParameters || {},
    body: parseRequestBody(event, headers),
    rawBody,
    path: event.path,
    url: event.rawUrl || event.path,
    event,
    context
  }
}

function createResponse() {
  let statusCode = 200
  const headers = {}
  let body
  let headersSent = false
  let isBase64Encoded = false

  const hasHeader = name => {
    const lowerName = name.toLowerCase()
    return Object.keys(headers).some(key => key.toLowerCase() === lowerName)
  }

  const finalize = (value, { forceJson = false } = {}) => {
    if (headersSent) {
      return formatResponse()
    }

    if (value !== undefined) {
      body = value
    }

    headersSent = true
    return formatResponse({ forceJson })
  }

  const formatResponse = ({ forceJson = false } = {}) => {
    let responseBody = body
    let responseIsBase64 = false

    if (responseBody === undefined || responseBody === null) {
      responseBody = ''
    } else if (Buffer.isBuffer(responseBody)) {
      responseBody = responseBody.toString('base64')
      responseIsBase64 = true
    } else if (forceJson) {
      try {
        responseBody = JSON.stringify(responseBody)
      } catch (error) {
        responseBody = JSON.stringify(String(responseBody))
      }
    } else if (typeof responseBody === 'object' && !(responseBody instanceof String)) {
      responseBody = JSON.stringify(responseBody)
      if (!hasHeader('content-type')) {
        headers['Content-Type'] = 'application/json'
      }
    } else {
      responseBody = String(responseBody)
    }

    if (forceJson && !hasHeader('content-type')) {
      headers['Content-Type'] = 'application/json'
    }

    isBase64Encoded = responseIsBase64

    return {
      statusCode,
      headers,
      body: responseBody,
      isBase64Encoded
    }
  }

  const res = {
    setHeader(name, value) {
      headers[name] = value
      return res
    },
    status(code) {
      statusCode = code
      return res
    },
    json(value) {
      body = value
      return finalize(value, { forceJson: true })
    },
    send(value) {
      body = value
      return finalize(value)
    },
    end(value) {
      if (value !== undefined) {
        body = value
      }
      return finalize(body)
    },
    get statusCode() {
      return statusCode
    },
    set statusCode(value) {
      statusCode = value
    },
    get headersSent() {
      return headersSent
    },
    _finalize() {
      return finalize(body)
    }
  }

  return res
}

function normalizeHandlerResult(result) {
  if (!result || typeof result !== 'object') {
    return null
  }

  const { statusCode = 200, headers = {}, body = '' } = result
  let responseBody = body
  let isBase64Encoded = Boolean(result.isBase64Encoded)

  if (Buffer.isBuffer(responseBody)) {
    responseBody = responseBody.toString('base64')
    isBase64Encoded = true
  } else if (typeof responseBody === 'object' && !(responseBody instanceof String)) {
    responseBody = JSON.stringify(responseBody)
    if (!Object.keys(headers).some(key => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json'
    }
  } else if (responseBody === undefined || responseBody === null) {
    responseBody = ''
  } else {
    responseBody = String(responseBody)
  }

  return {
    statusCode,
    headers,
    body: responseBody,
    isBase64Encoded
  }
}

export function withNetlifyHandler(expressHandler) {
  if (typeof expressHandler !== 'function') {
    throw new TypeError('Expected a handler function')
  }

  const netlifyHandler = async function netlifyWrapper(event, context) {
    const req = createRequest(event, context)
    const res = createResponse()

    const result = await expressHandler(req, res)

    const normalized = normalizeHandlerResult(result)
    if (normalized) {
      return normalized
    }

    if (res.headersSent) {
      return res._finalize()
    }

    return {
      statusCode: 200,
      headers: {},
      body: ''
    }
  }

  netlifyHandler.handler = netlifyHandler
  netlifyHandler.expressHandler = expressHandler

  return netlifyHandler
}
