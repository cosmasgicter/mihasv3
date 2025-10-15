import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('URL:', supabaseUrl)
console.log('Service Key present:', !!serviceKey)
console.log('Service Key length:', serviceKey?.length)

const client = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

// Test token from logs
const testToken = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IjE1ZTkxenVweDltUlBkU00iLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL215bGdlZ2txb2RkY3J4dHdjY2xiLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJmYzZhMTUzNi0yZTVjLTQwOTktOWI5ZS1hMzg2NTM0MDhmOTUiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzYwNTMyMzU4LCJpYXQiOjE3NjA1Mjg3NTgsImVtYWlsIjoiY29zbWFzQGJlYW5vbGEuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImNvc21hc0BiZWFub2xhLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6ImZjNmExNTM2LTJlNWMtNDA5OS05YjllLWEzODY1MzQwOGY5NSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzYwNTI4NzU4fV0sInNlc3Npb25faWQiOiI4ZWU3ZGI2MC1iZmFjLTRjNGMtOTA1MC01YWNhODg5NmMwYzYiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.0JY-gwMnLI4I7VgmLFcjZw6LV-vwZMzyqC1MZONuOrQ'

console.log('\nTesting auth.getUser()...')
const { data, error } = await client.auth.getUser(testToken)
console.log('Result:', { data, error })
