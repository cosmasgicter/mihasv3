// Test script to create user accounts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mylgegkqoddcrxtwcclb.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUxMjA4MywiZXhwIjoyMDczMDg4MDgzfQ.FsspKE5bjcG4TW8IvG-N0o7W0E7ljxznwlzJCm50ZRE'

const supabase = supabaseAdminClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function createTestUsers() {
  console.log('Creating test users...')

  // Create student user
  try {
    const { data: studentData, error: studentError } = await supabase.auth.admin.createUser({
      email: 'alexisstar8@gmail.com',
      password: 'Skyl3r@L0m1s',
      user_metadata: { 
        full_name: 'Alexis Star',
        role: 'student'
      },
      email_confirm: true
    })

    if (studentError && !studentError.message.includes('already registered')) {
      console.error('Student creation error:', studentError)
    } else {
      console.log('✅ Student user created/exists:', studentData?.user?.email)
      
      // Create profile for student
      if (studentData?.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            user_id: studentData.user.id,
            email: studentData.user.email,
            full_name: 'Alexis Star',
            role: 'student'
          })
        
        if (profileError) {
          console.error('Student profile error:', profileError)
        } else {
          console.log('✅ Student profile created')
        }
      }
    }
  } catch (error) {
    console.error('Student creation failed:', error)
  }

  // Create admin user
  try {
    const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
      email: 'cosmas@beanola.com',
      password: 'Beanola@2025',
      user_metadata: { 
        full_name: 'Cosmas Admin',
        role: 'admin'
      },
      email_confirm: true
    })

    if (adminError && !adminError.message.includes('already registered')) {
      console.error('Admin creation error:', adminError)
    } else {
      console.log('✅ Admin user created/exists:', adminData?.user?.email)
      
      // Create profile for admin
      if (adminData?.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            user_id: adminData.user.id,
            email: adminData.user.email,
            full_name: 'Cosmas Admin',
            role: 'admin'
          })
        
        if (profileError) {
          console.error('Admin profile error:', profileError)
        } else {
          console.log('✅ Admin profile created')
        }
      }
    }
  } catch (error) {
    console.error('Admin creation failed:', error)
  }

  console.log('Test user creation completed!')
}

createTestUsers().catch(console.error)