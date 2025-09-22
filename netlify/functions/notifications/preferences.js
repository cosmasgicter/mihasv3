const { supabaseAdminClient, getUserFromRequest } = require('../_lib/supabaseClient')
const { fetchUserNotificationPreferences } = require('./_shared')

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authContext = await getUserFromRequest(req)
  if (authContext.error) {
    return res.status(403).json({ error: authContext.error })
  }

  try {
    const preferences = await fetchUserNotificationPreferences(authContext.user.id)
    const { data: profile, error: profileError } = await supabaseAdminClient
      .from('user_profiles')
      .select('phone')
      .eq('user_id', authContext.user.id)
      .maybeSingle()

    if (profileError) {
      throw new Error(profileError.message)
    }

    return res.status(200).json({ ...preferences, phone: profile?.phone ?? null })
  } catch (error) {
    console.error('Failed to load notification preferences:', error)
    return res.status(500).json({ error: 'Failed to load notification preferences' })
  }
}
