import { withNetlifyHandler } from './_lib/netlifyHandler.js'
import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'
import { v4 as uuidv4 } from 'uuid'

const supabase = supabaseAdminClient

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

    const { fileName, fileType, fileSize, applicationId } = req.body || {}

    if (!fileName || !fileType) {
      return res.status(400).json({ error: 'fileName and fileType are required' })
    }

    // Generate unique file path
    const fileId = uuidv4()
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `applications/${applicationId || 'temp'}/${fileId}_${sanitizedFileName}`

    // Create signed upload URL
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .createSignedUploadUrl(filePath)

    if (uploadError) {
      console.error('Upload URL creation failed:', uploadError)
      return res.status(500).json({ error: 'Failed to create upload URL' })
    }

    return res.status(200).json({
      success: true,
      uploadUrl: uploadData.signedUrl,
      filePath: filePath,
      fileId: fileId,
      message: 'Upload URL generated successfully'
    })
  } catch (error) {
    console.error('Document upload error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler