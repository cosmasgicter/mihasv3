// Test the functions we just fixed
const baseUrl = 'https://mihasv3.pages.dev'

const fixedFunctions = [
  { name: 'Document Upload', url: `${baseUrl}/api/documents/upload`, method: 'POST' },
  { name: 'Admin Users', url: `${baseUrl}/api/admin/users/test-id`, method: 'GET' },
  { name: 'MCP Query', url: `${baseUrl}/api/mcp/query`, method: 'POST' },
  { name: 'Predictive Dashboard', url: `${baseUrl}/api/analytics/predictive-dashboard`, method: 'GET' },
  { name: 'Application Get', url: `${baseUrl}/api/applications/test-id`, method: 'GET' }
]

async function testFunction(func) {
  console.log(`\n🧪 Testing: ${func.name}`)
  
  try {
    const options = {
      method: func.method,
      headers: { 'Content-Type': 'application/json' }
    }
    
    const response = await fetch(func.url, options)
    const text = await response.text()
    
    console.log(`   Status: ${response.status} ${response.statusText}`)
    
    if (response.status >= 500) {
      console.log('   ❌ STILL BROKEN')
      console.log(`   Error: ${text.substring(0, 100)}...`)
    } else {
      console.log('   ✅ FIXED!')
      if (response.status < 400) {
        try {
          const json = JSON.parse(text)
          console.log(`   Response: ${Object.keys(json).join(', ')}`)
        } catch {
          console.log(`   Response: ${text.substring(0, 50)}...`)
        }
      }
    }
  } catch (error) {
    console.log('   ❌ NETWORK ERROR')
    console.log(`   Error: ${error.message}`)
  }
}

async function runTest() {
  console.log('🔧 Testing Fixed Functions\n')
  
  for (const func of fixedFunctions) {
    await testFunction(func)
  }
  
  console.log('\n✅ Test Complete')
}

runTest().catch(console.error)