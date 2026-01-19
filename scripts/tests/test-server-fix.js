// Quick test to verify server fixes
const testEndpoints = [
  {
    name: 'Predictive Dashboard',
    url: 'https://mihasv3.pages.dev/api/analytics/predictive-dashboard',
    method: 'GET'
  },
  {
    name: 'Application Update',
    url: 'https://mihasv3.pages.dev/api/applications/test-id',
    method: 'PATCH',
    body: { action: 'update_payment_status', paymentStatus: 'verified' }
  }
]

async function testEndpoint(endpoint) {
  try {
    const options = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    }

    if (endpoint.body) {
      options.body = JSON.stringify(endpoint.body)
    }

    const response = await fetch(endpoint.url, options)
    
    console.log(`${endpoint.name}: ${response.status} ${response.statusText}`)
    
    if (response.status < 500) {
      console.log('✅ Server error fixed')
    } else {
      console.log('❌ Still has server error')
    }
  } catch (error) {
    console.log(`${endpoint.name}: Network error - ${error.message}`)
  }
}

async function runTests() {
  console.log('Testing server fixes...\n')
  
  for (const endpoint of testEndpoints) {
    await testEndpoint(endpoint)
  }
}

runTests()