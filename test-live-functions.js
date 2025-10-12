// Test live Netlify functions
const baseUrl = '***REMOVED***'

const tests = [
  {
    name: 'Health Check',
    url: `${baseUrl}/api/health`,
    method: 'GET'
  },
  {
    name: 'Predictive Dashboard',
    url: `${baseUrl}/api/analytics/predictive-dashboard`,
    method: 'GET',
    headers: { 'Authorization': 'Bearer fake-token' }
  },
  {
    name: 'Application Get',
    url: `${baseUrl}/api/applications/test-id`,
    method: 'GET',
    headers: { 'Authorization': 'Bearer fake-token' }
  },
  {
    name: 'Application Patch',
    url: `${baseUrl}/api/applications/test-id`,
    method: 'PATCH',
    headers: { 
      'Authorization': 'Bearer fake-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'update_payment_status', paymentStatus: 'verified' })
  }
]

async function testFunction(test) {
  console.log(`\n🧪 Testing: ${test.name}`)
  console.log(`   URL: ${test.url}`)
  
  try {
    const options = {
      method: test.method,
      headers: test.headers || {}
    }
    
    if (test.body) {
      options.body = test.body
    }
    
    const response = await fetch(test.url, options)
    const text = await response.text()
    
    console.log(`   Status: ${response.status} ${response.statusText}`)
    
    if (response.status >= 500) {
      console.log('   ❌ SERVER ERROR')
      console.log(`   Response: ${text.substring(0, 200)}...`)
    } else if (response.status >= 400) {
      console.log('   ⚠️  CLIENT ERROR (Expected for auth)')
      try {
        const json = JSON.parse(text)
        console.log(`   Error: ${json.error}`)
      } catch {
        console.log(`   Response: ${text.substring(0, 100)}...`)
      }
    } else {
      console.log('   ✅ SUCCESS')
      try {
        const json = JSON.parse(text)
        console.log(`   Data keys: ${Object.keys(json).join(', ')}`)
      } catch {
        console.log(`   Response: ${text.substring(0, 100)}...`)
      }
    }
  } catch (error) {
    console.log('   ❌ NETWORK ERROR')
    console.log(`   Error: ${error.message}`)
  }
}

async function runTests() {
  console.log('🔍 Testing Live Netlify Functions\n')
  console.log('=' .repeat(50))
  
  for (const test of tests) {
    await testFunction(test)
  }
  
  console.log('\n' + '='.repeat(50))
  console.log('✅ Test Complete')
}

runTests().catch(console.error)