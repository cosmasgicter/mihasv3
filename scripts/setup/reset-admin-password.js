// Script to reset admin password
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mylgegkqoddcrxtwcclb.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUxMjA4MywiZXhwIjoyMDczMDg4MDgzfQ.FsspKE5bjcG4TW8IvG-N0o7W0E7ljxznwlzJCm50ZRE'

const supabase = supabaseAdminClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function resetAdminPassword() {
  console.log('🔧 Resetting admin password...')

  try {
    // First, get the user by email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers()
    
    if (listError) {
      console.error('Error listing users:', listError)
      return
    }

    const adminUser = users.users.find(user => user.email === 'cosmas@beanola.com')
    
    if (!adminUser) {
      console.log('❌ Admin user not found, creating new one...')
      
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: 'cosmas@beanola.com',
        password: 'Beanola@2025',
        user_metadata: { 
          full_name: 'Cosmas Admin',
          role: 'admin'
        },
        email_confirm: true
      })

      if (createError) {
        console.error('Error creating admin user:', createError)
        return
      }

      console.log('✅ Admin user created successfully')
      
      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          user_id: newUser.user.id,
          email: newUser.user.email,
          full_name: 'Cosmas Admin',
          role: 'admin'
        })
      
      if (profileError) {
        console.error('Profile creation error:', profileError)
      } else {
        console.log('✅ Admin profile created')
      }
      
    } else {
      console.log('👤 Admin user found, updating password...')
      
      const { data, error: updateError } = await supabase.auth.admin.updateUserById(
        adminUser.id,
        { 
          password: 'Beanola@2025',
          user_metadata: { 
            full_name: 'Cosmas Admin',
            role: 'admin'
          }
        }
      )

      if (updateError) {
        console.error('Error updating password:', updateError)
        return
      }

      console.log('✅ Admin password updated successfully')
      
      // Update/create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          user_id: adminUser.id,
          email: adminUser.email,
          full_name: 'Cosmas Admin',
          role: 'admin'
        })
      
      if (profileError) {
        console.error('Profile update error:', profileError)
      } else {
        console.log('✅ Admin profile updated')
      }
    }

    console.log('\n🎉 Admin account ready!')
    console.log('📧 Email: cosmas@beanola.com')
    console.log('🔑 Password: Beanola@2025')
    
  } catch (error) {
    console.error('Unexpected error:', error)
  }
}

resetAdminPassword().catch(console.error)