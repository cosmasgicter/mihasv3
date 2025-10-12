// Local function testing before deployment
import { config } from 'dotenv'

// Load environment
config({ path: '.env.production' })

const testCases = [
  {
    name: 'Applications ID Handler',
    test: async () => {
      const { baseHandler } = await import('./api/applications-id.js')
      
      const mockReq = {
        method: 'GET',
        query: { id: '87030776-bda9-4373-baa3-77f3fb012ac9' },
        headers: { authorization: 'Bearer fake-token' },
        path: '/api/applications/87030776-bda9-4373-baa3-77f3fb012ac9'
      }
      
      const mockRes = {
        headers: {},
        statusCode: 200,
        setHeader: function(name, value) { this.headers[name] = value; return this },
        status: function(code) { this.statusCode = code; return this },
        json: function(data) { return { statusCode: this.statusCode, body: JSON.stringify(data) } },
        end: function() { return { statusCode: this.statusCode, body: '' } }
      }
      
      const result = await baseHandler(mockReq, mockRes)
      return { success: true, result }
    }
  },
  {
    name: 'Admin Users ID Handler',
    test: async () => {
      const { baseHandler } = await import('./api/admin-users-id.js')
      
      const mockReq = {
        method: 'GET',
        query: { id: 'test-user-id' },
        headers: { authorization: 'Bearer fake-token' }
      }
      
      const mockRes = {
        headers: {},
        statusCode: 200,
        setHeader: function(name, value) { this.headers[name] = value; return this },
        status: function(code) { this.statusCode = code; return this },
        json: function(data) { return { statusCode: this.statusCode, body: JSON.stringify(data) } },
        end: function() { return { statusCode: this.statusCode, body: '' } }
      }
      
      const result = await baseHandler(mockReq, mockRes)
      return { success: true, result }
    }
  },
  {
    name: 'Predictive Dashboard Handler',
    test: async () => {
      const { baseHandler } = await import('./api/analytics-predictive-dashboard.js')
      
      const mockReq = {
        method: 'GET',
        headers: { authorization: 'Bearer fake-token' }
      }
      
      const mockRes = {
        headers: {},
        statusCode: 200,
        setHeader: function(name, value) { this.headers[name] = value; return this },
        status: function(code) { this.statusCode = code; return this },
        json: function(data) { return { statusCode: this.statusCode, body: JSON.stringify(data) } },
        end: function() { return { statusCode: this.statusCode, body: '' } }
      }
      
      const result = await baseHandler(mockReq, mockRes)
      return { success: true, result }
    }
  },
  {
    name: 'Netlify Handler Wrapper',
    test: async () => {
      const { withNetlifyHandler } = await import('./api/_lib/netlifyHandler.js')
      
      const mockHandler = async (req, res) => {
        return res.status(200).json({ test: 'success', id: req.query.id })
      }
      
      const netlifyHandler = withNetlifyHandler(mockHandler)
      
      const mockEvent = {
        httpMethod: 'GET',
        headers: {},
        queryStringParameters: { id: 'test-id' },
        pathParameters: { id: 'path-id' },
        path: '/api/test/path-id',
        body: null
      }
      
      const result = await netlifyHandler(mockEvent, {})
      return { success: true, result }
    }
  },
  {
    name: 'Environment Variables',
    test: async () => {
      const required = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
      const missing = required.filter(key => !process.env[key])
      
      return { 
        success: missing.length === 0,
        missing,
        supabaseUrl: process.env.VITE_SUPABASE_URL?.substring(0, 30) + '...',
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    }
  }
]

async function runLocalTests() {
  console.log('🔍 Local Function Testing (Pre-Deployment)')
  console.log('=' .repeat(60))
  
  for (const testCase of testCases) {
    console.log(`\n🧪 Testing: ${testCase.name}`)
    
    try {
      const result = await testCase.test()
      
      if (result.success) {
        console.log('   ✅ PASS')
        
        if (result.result) {
          console.log('   Result:', JSON.stringify(result.result, null, 2).substring(0, 200) + '...')
        }
        
        if (result.missing) {
          console.log('   Missing vars:', result.missing)
        }
        
        if (result.supabaseUrl) {
          console.log('   Supabase URL:', result.supabaseUrl)
        }
      } else {
        console.log('   ❌ FAIL')
        console.log('   Error:', result.error || 'Unknown error')
      }
    } catch (error) {
      console.log('   ❌ CRITICAL FAIL')
      console.log('   Error:', error.message)
      console.log('   Stack:', error.stack.split('\n').slice(0, 2).join('\n'))
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('✅ Local Testing Complete')
  console.log('=' .repeat(60))
}

runLocalTests().catch(console.error)