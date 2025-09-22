const path = require('path')
const { supabaseAdminClient, getUserFromRequest } = require('../_lib/supabaseClient')
const { logAuditEvent } = require('../_lib/auditLogger')
const {
  checkRateLimit,
  buildRateLimitKey,
  getLimiterConfig,
  attachRateLimitHeaders
} = require('../_lib/rateLimiter')

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg'])
const EXTENSION_MIME_MAP = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg']
}
const ALLOWED_MIME_TYPES = new Set(
  Object.values(EXTENSION_MIME_MAP).flatMap((mimes) => mimes.map((mime) => mime.toLowerCase()))
)

const ENABLE_MALWARE_SCAN = process.env.ENABLE_MALWARE_SCAN === 'true'
const MALWARE_SIGNATURES = [
  Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')
]

const BASE64_REGEX = /^[A-Za-z0-9+/=]+$/

function respondWithError(res, statusCode, message) {
  return res.status(statusCode).json({ error: message })
}

function sanitizeStorageSegment(value, fieldName) {
  if (!value) {
    return { error: `Invalid ${fieldName}` }
  }

  const normalized = String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')

  if (!normalized) {
    return { error: `Invalid ${fieldName}` }
  }

  return { value: normalized }
}

function normalizeFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return { error: 'Invalid file name' }
  }

  const trimmed = fileName.trim()
  const baseName = path.posix.basename(trimmed)

  if (!baseName || baseName === '.' || baseName === '..' || baseName.includes('\0')) {
    return { error: 'Invalid file name' }
  }

  const lastDotIndex = baseName.lastIndexOf('.')
  if (lastDotIndex === -1) {
    return { error: 'File name must include an extension' }
  }

  const namePart = baseName.slice(0, lastDotIndex)
  const extension = baseName.slice(lastDotIndex + 1).toLowerCase()

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { error: 'File type is not allowed' }
  }

  const sanitizedName = namePart
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 150)

  const safeName = sanitizedName || 'document'
  const normalizedFileName = `${safeName}.${extension}`

  if (!normalizedFileName || normalizedFileName.startsWith('.')) {
    return { error: 'Invalid file name' }
  }

  return { fileName: normalizedFileName, extension }
}

function decodeBase64Payload(base64String, extension, declaredMimeType, declaredSize) {
  if (!base64String || typeof base64String !== 'string') {
    return { error: 'Invalid file data payload' }
  }

  const sanitizedBase64 = base64String.replace(/\s+/g, '')

  if (sanitizedBase64.length % 4 !== 0 || !BASE64_REGEX.test(sanitizedBase64)) {
    return { error: 'Invalid file data encoding' }
  }

  let buffer
  try {
    buffer = Buffer.from(sanitizedBase64, 'base64')
  } catch (error) {
    return { error: 'Invalid file data encoding' }
  }

  if (!buffer || buffer.length === 0) {
    return { error: 'File data is empty' }
  }

  if (Number.isFinite(declaredSize) && declaredSize !== buffer.length) {
    return { error: 'File data size mismatch' }
  }

  const extensionMimeTypes = EXTENSION_MIME_MAP[extension] ?? []
  const normalizedDeclaredMime = declaredMimeType?.toLowerCase()

  if (normalizedDeclaredMime && !extensionMimeTypes.includes(normalizedDeclaredMime)) {
    return { error: 'File type does not match the provided content-type' }
  }

  const resolvedMimeType = normalizedDeclaredMime || extensionMimeTypes[0]

  if (!resolvedMimeType || !ALLOWED_MIME_TYPES.has(resolvedMimeType)) {
    return { error: 'File type is not allowed' }
  }

  return {
    buffer,
    size: buffer.length,
    mimeType: resolvedMimeType
  }
}

function decodeFileData(fileData, extension) {
  if (!fileData) {
    return { error: 'Missing file data' }
  }

  if (typeof fileData === 'string') {
    const trimmed = fileData.trim()
    const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/i)

    if (dataUrlMatch) {
      const [, mimeType, base64Content] = dataUrlMatch
      return decodeBase64Payload(base64Content, extension, mimeType, undefined)
    }

    return decodeBase64Payload(trimmed, extension, undefined, undefined)
  }

  if (typeof fileData === 'object') {
    const base64Content =
      typeof fileData.base64 === 'string'
        ? fileData.base64
        : typeof fileData.data === 'string'
          ? fileData.data
          : typeof fileData.content === 'string'
            ? fileData.content
            : undefined

    const declaredMimeType = typeof fileData.mimeType === 'string' ? fileData.mimeType : undefined
    const declaredSize =
      typeof fileData.size === 'number'
        ? fileData.size
        : typeof fileData.size === 'string'
          ? Number.parseInt(fileData.size, 10)
          : undefined

    return decodeBase64Payload(base64Content, extension, declaredMimeType, declaredSize)
  }

  return { error: 'Invalid file data payload' }
}

async function scanForMalware(buffer) {
  if (!ENABLE_MALWARE_SCAN) {
    return { clean: true }
  }

  for (const signature of MALWARE_SIGNATURES) {
    if (buffer.includes(signature)) {
      return { clean: false, error: 'Malicious content detected in the uploaded file' }
    }
  }

  return { clean: true }
}

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const rateKey = buildRateLimitKey(req, { prefix: 'documents-upload' })
    const rateResult = await checkRateLimit(
      rateKey,
      getLimiterConfig('documents_upload', { maxAttempts: 15, windowMs: 300_000 })
    )

    if (rateResult.isLimited) {
      attachRateLimitHeaders(res, rateResult)
      return res.status(429).json({ error: 'Too many document uploads. Please try again later.' })
    }
  } catch (rateError) {
    console.error('Document upload rate limiter error:', rateError)
    return res.status(503).json({ error: 'Rate limiter unavailable' })
  }

  const authContext = await getUserFromRequest(req)
  if (authContext.error) {
    return res.status(401).json({ error: authContext.error })
  }

  try {
    // Parse body if it's a string (Netlify functions)
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON in request body' })
      }
    }

    const { fileName, fileData, documentType, applicationId } = body || {}

    if (!fileName || !fileData || !documentType || !applicationId) {
      return res.status(400).json({ error: 'Missing required document fields' })
    }

    const normalizedFileNameResult = normalizeFileName(fileName)
    if (normalizedFileNameResult.error) {
      return respondWithError(res, 400, normalizedFileNameResult.error)
    }

    const decodedFile = decodeFileData(fileData, normalizedFileNameResult.extension)
    if (decodedFile.error) {
      return respondWithError(res, 400, decodedFile.error)
    }

    if (decodedFile.size > MAX_FILE_SIZE_BYTES) {
      return respondWithError(res, 413, 'File exceeds the maximum allowed size of 10MB')
    }

    const malwareResult = await scanForMalware(decodedFile.buffer)
    if (!malwareResult.clean) {
      return respondWithError(res, 400, malwareResult.error || 'Malicious content detected')
    }

    const { data: application, error: applicationError } = await supabaseAdminClient
      .from('applications_new')
      .select('id, user_id')
      .eq('id', applicationId)
      .maybeSingle()

    if (applicationError) {
      return res.status(400).json({ error: applicationError.message })
    }

    if (!application) {
      return res.status(404).json({ error: 'Application not found' })
    }

    if (!authContext.isAdmin && application.user_id !== authContext.user.id) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const sanitizedUserIdResult = sanitizeStorageSegment(application.user_id, 'user identifier')
    if (sanitizedUserIdResult.error) {
      return respondWithError(res, 400, sanitizedUserIdResult.error)
    }

    const sanitizedApplicationIdResult = sanitizeStorageSegment(applicationId, 'application identifier')
    if (sanitizedApplicationIdResult.error) {
      return respondWithError(res, 400, sanitizedApplicationIdResult.error)
    }

    const filePath = path.posix.join(
      sanitizedUserIdResult.value,
      sanitizedApplicationIdResult.value,
      normalizedFileNameResult.fileName
    )
    const { data: uploadData, error: uploadError } = await supabaseAdminClient.storage
      .from('documents')
      .upload(filePath, decodedFile.buffer, {
        contentType: decodedFile.mimeType,
        upsert: false,
        cacheControl: '3600'
      })

    if (uploadError) {
      return res.status(400).json({ error: uploadError.message })
    }

    const { data, error } = await supabaseAdminClient
      .from('application_documents')
      .insert({
        application_id: applicationId,
        document_type: documentType,
        document_name: normalizedFileNameResult.fileName,
        file_url: uploadData.path,
        system_generated: false,
        verification_status: 'pending'
      })
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    await logAuditEvent({
      req,
      action: 'documents.upload',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'application_documents',
      targetId: data?.id || null,
      metadata: {
        applicationId,
        documentType,
        fileName: normalizedFileNameResult.fileName,
        fileSize: decodedFile.size,
        mimeType: decodedFile.mimeType,
        byAdmin: authContext.isAdmin
      }
    })

    return res.status(201).json(data)
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}