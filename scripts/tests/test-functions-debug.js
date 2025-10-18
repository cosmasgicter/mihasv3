// Comprehensive function testing and debugging
import { supabaseAdminClient } from './api/_lib/supabaseClient.js'

const testEndpoints = [
  {
    name: 'Database Connection',
    test: async () => {
      const { data, error } = await supabaseAdminClient
        .from('applications_new')
        .select('count')
        .limit(1)
      return { success: !error, error: error?.message, data }
    }
  },
  {
    name: 'Predictive Dashboard Function',
    test: async () => {
      try {
        const { handlePredictiveDashboardRequest } = await import('./api/_lib/analytics/predictiveDashboard.js')
        const mockReq = { method: 'GET', headers: { authorization: 'Bearer test' } }
        const mockRes = {
          status: (code) => ({ json: (data) => ({ status: code, data }) }),
          setHeader: () => {},
          json: (data) => ({ status: 200, data })
        }
        const result = await handlePredictiveDashboardRequest(mockReq, mockRes)
        return { success: true, result }
      } catch (error) {
        return { success: false, error: error.message, stack: error.stack }
      }
    }
  },
  {
    name: 'Applications Function',
    test: async () => {
      try {
        const { handler } = await import('./api/applications/[id].js')
        const mockReq = { 
          method: 'GET', 
          query: { id: '87030776-bda9-4373-baa3-77f3fb012ac9' },
          headers: { authorization: 'Bearer test' }
        }
        const mockRes = {
          status: (code) => ({ json: (data) => ({ status: code, data }) }),
          setHeader: () => {},
          json: (data) => ({ status: 200, data })
        }
        const result = await handler(mockReq, mockRes)
        return { success: true, result }
      } catch (error) {
        return { success: false, error: error.message, stack: error.stack }
      }
    }
  },
  {
    name: 'Environment Variables',
    test: async () => {
      const required = [
        'VITE_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'VITE_SUPABASE_ANON_KEY'
      ]
      const missing = required.filter(key => !process.env[key])
      return { 
        success: missing.length === 0, 
        missing,
        hasUrl: !!process.env.VITE_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    }
  },
  {
    name: 'Supabase Tables Check',
    test: async () => {
      const tables = ['applications_new', 'user_roles', 'profiles']
      const results = {}
      
      for (const table of tables) {
        try {
          const { data, error } = await supabaseAdminClient
            .from(table)
            .select('*')
            .limit(1)
          results[table] = { exists: !error, error: error?.message }
        } catch (err) {
          results[table] = { exists: false, error: err.message }
        }
      }
      
      return { success: true, tables: results }
    }
  }
]

async function runTests() {
  console.log('🔍 Running comprehensive function tests...\n')
  
  for (const test of testEndpoints) {
    console.log(`Testing: ${test.name}`)
    try {
      const result = await test.test()
      if (result.success) {
        console.log('✅ PASS')
        if (result.data || result.result) {
          console.log('   Data:', JSON.stringify(result.data || result.result, null, 2))
        }
      } else {
        console.log('❌ FAIL')
        console.log('   Error:', result.error)
        if (result.stack) {
          console.log('   Stack:', result.stack.split('\n').slice(0, 3).join('\n'))
        }
      }
    } catch (error) {
      console.log('❌ CRITICAL FAIL')
      console.log('   Error:', error.message)
      console.log('   Stack:', error.stack.split('\n').slice(0, 3).join('\n'))
    }
    console.log('')
  }
}

runTests().catch(console.error)