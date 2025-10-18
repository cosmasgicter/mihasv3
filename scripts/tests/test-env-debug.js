// Environment debugging
import { config } from 'dotenv'
import { readFileSync } from 'fs'

console.log('🔍 Environment Debug Report\n')

// Load environment files
console.log('Loading .env files...')
config({ path: '.env.production' })
config({ path: '.env' })

console.log('\n📋 Environment Variables:')
const requiredVars = [
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY', 
  'VITE_SUPABASE_ANON_KEY'
]

requiredVars.forEach(key => {
  const value = process.env[key]
  console.log(`${key}: ${value ? '✅ SET' : '❌ MISSING'}`)
  if (value) {
    console.log(`   Value: ${value.substring(0, 20)}...`)
  }
})

console.log('\n📁 Environment Files:')
const envFiles = ['.env', '.env.production', '.env.development']
envFiles.forEach(file => {
  try {
    const content = readFileSync(file, 'utf8')
    console.log(`${file}: ✅ EXISTS (${content.split('\n').length} lines)`)
  } catch (error) {
    console.log(`${file}: ❌ MISSING`)
  }
})

console.log('\n🔧 Node Environment:')
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`)
console.log(`PWD: ${process.cwd()}`)

// Test Supabase connection
console.log('\n🔌 Testing Supabase Connection:')
if (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    
    const { data, error } = await client
      .from('applications')
      .select('count')
      .limit(1)
    
    if (error) {
      console.log('❌ Database Error:', error.message)
    } else {
      console.log('✅ Database Connected')
    }
  } catch (error) {
    console.log('❌ Connection Error:', error.message)
  }
} else {
  console.log('❌ Missing Supabase credentials')
}