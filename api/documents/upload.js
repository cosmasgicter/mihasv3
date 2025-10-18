import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js'
import { withNetlifyHandler } from '../_lib/netlifyHandler.js'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
const ALLOWED_BUCKETS = ['app_docs', 'documents', 'application-documents']

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const authContext = await getUserFromRequest(req)
    if (authContext.error) {
      return res.status(401).json({ error: authContext.error })
    }

    // Parse multipart form data (simplified for API functions)
    const contentType = req.headers['content-type'] || ''
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Content-Type must be multipart/form-data' })
    }

    // For Netlify functions, we need to handle file uploads differently
    // This is a simplified version - in production, use proper multipart parsing
    const body = req.body
    if (!body || !body.file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    const { file, userId, applicationId, fileType } = body

    // Validate file
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'File size must be less than 10MB' })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return res.status(400).json({ error: 'Only PDF, JPG, JPEG, and PNG files are allowed' })
    }

    // Generate filename
    const timestamp = Date.now()
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `${userId}/${applicationId}/${fileType}/${timestamp}-${sanitizedFileName}`

    // Try uploading to available buckets
    let uploadError = null
    let usedBucket = ''
    let uploadData = null

    for (const bucket of ALLOWED_BUCKETS) {
      try {
        const { data, error } = await supabaseAdminClient.storage
          .from(bucket)
          .upload(fileName, file, {
            contentType: file.type,
            upsert: true
          })

        if (!error && data) {
          usedBucket = bucket
          uploadData = data
          break
        } else {
          uploadError = error
        }
      } catch (bucketError) {
        uploadError = bucketError
        continue
      }
    }

    if (!usedBucket || !uploadData) {
      console.error('All bucket uploads failed:', uploadError)
      return res.status(500).json({ 
        error: uploadError?.message || 'Upload failed - storage not available' 
      })
    }

    // Get public URL
    const { data: urlData } = supabaseAdminClient.storage
      .from(usedBucket)
      .getPublicUrl(uploadData.path)

    if (!urlData.publicUrl) {
      return res.status(500).json({ error: 'Failed to generate file URL' })
    }

    return res.status(200).json({
      success: true,
      path: uploadData.path,
      url: urlData.publicUrl,
      bucket: usedBucket
    })

  } catch (error) {
    console.error('Upload error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler