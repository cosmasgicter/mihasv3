import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixMissingProfile() {
  const userId = '6e147ead-e34d-41e2-bc05-358a653ff633'
  
  // Check if profile exists
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (existingProfile) {
    console.log('Profile already exists:', existingProfile)
    return
  }
  
  // Get user from auth
  const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId)
  
  if (userError || !user) {
    console.error('User not found:', userError)
    return
  }
  
  console.log('User found:', user.email, user.user_metadata)
  
  // Create profile
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || 'Solomon Ngoma',
      role: 'student'
    })
    .select()
  
  if (error) {
    console.error('Error creating profile:', error)
  } else {
    console.log('Profile created successfully:', data)
  }
}

fixMissingProfile()
