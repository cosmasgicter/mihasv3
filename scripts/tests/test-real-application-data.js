// Test with real application data
const baseUrl = 'https://mihasv3.pages.dev'

const studentCredentials = { 
  email: 'alexisstar8@gmail.com', 
  password: 'Skyl3r@L0m1s' 
}

let studentToken = null
let realApplicationId = null

async function authenticateStudent() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(studentCredentials)
  })

  const data = await response.json()
  
  if (response.ok && data.token) {
    studentToken = data.token
    console.log('✅ Student authenticated')
    return true
  }
  return false
}

async function getRealApplicationId() {
  const response = await fetch(`${baseUrl}/api/applications`, {
    method: 'GET',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentToken}`
    }
  })

  const data = await response.json()
  
  if (response.ok && data.applications && data.applications.length > 0) {
    realApplicationId = data.applications[0].id
    console.log(`✅ Found real application ID: ${realApplicationId}`)
    console.log(`   Application status: ${data.applications[0].status}`)
    console.log(`   Created: ${data.applications[0].created_at}`)
    return true
  }
  
  console.log('❌ No applications found for student')
  return false
}

async function testRealApplicationEndpoints() {
  console.log('🔍 Testing Real Application Data Endpoints')
  console.log('=' .repeat(60))
  
  // Authenticate
  if (!await authenticateStudent()) {
    console.log('❌ Authentication failed')
    return
  }
  
  // Get real application ID
  if (!await getRealApplicationId()) {
    console.log('❌ No real application data available')
    return
  }
  
  const realTests = [
    {
      name: 'Get Real Application',
      url: `${baseUrl}/api/applications/${realApplicationId}`,
      method: 'GET'
    },
    {
      name: 'Get Application with Grades',
      url: `${baseUrl}/api/applications/${realApplicationId}?include=grades`,
      method: 'GET'
    },
    {
      name: 'Get Application with Documents',
      url: `${baseUrl}/api/applications/${realApplicationId}?include=documents`,
      method: 'GET'
    },
    {
      name: 'Get Application Full Details',
      url: `${baseUrl}/api/applications/${realApplicationId}?include=grades,documents,statusHistory`,
      method: 'GET'
    },
    {
      name: 'Generate Slip for Real Application',
      url: `${baseUrl}/api/applications/generate-slip`,
      method: 'POST',
      body: { applicationId: realApplicationId }
    },
    {
      name: 'Email Slip for Real Application',
      url: `${baseUrl}/api/applications/email-slip`,
      method: 'POST',
      body: { applicationId: realApplicationId }
    }
  ]
  
  console.log(`\n🧪 Testing ${realTests.length} endpoints with real data...\n`)
  
  for (const test of realTests) {
    console.log(`🧪 Testing: ${test.name}`)
    
    try {
      const options = {
        method: test.method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentToken}`
        }
      }
      
      if (test.body) {
        options.body = JSON.stringify(test.body)
      }
      
      const response = await fetch(test.url, options)
      const text = await response.text()
      
      console.log(`   Status: ${response.status} ${response.statusText}`)
      
      if (response.status >= 500) {
        console.log('   ❌ SERVER ERROR')
        console.log(`   Response: ${text.substring(0, 200)}...`)
      } else if (response.status >= 400) {
        console.log('   ⚠️  CLIENT ERROR')
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
          
          if (json.data) {
            console.log(`   Application ID: ${json.data.id}`)
            console.log(`   Status: ${json.data.status}`)
            console.log(`   Program: ${json.data.program || 'Not specified'}`)
            
            if (json.data.grades) {
              console.log(`   Grades: ${json.data.grades.length} subjects`)
            }
            if (json.data.documents) {
              console.log(`   Documents: ${json.data.documents.length} files`)
            }
            if (json.data.statusHistory) {
              console.log(`   Status History: ${json.data.statusHistory.length} entries`)
            }
          } else {
            const keys = Object.keys(json)
            console.log(`   Response keys: ${keys.join(', ')}`)
          }
        } catch {
          console.log(`   Response: ${text.substring(0, 100)}...`)
        }
      }
    } catch (error) {
      console.log('   ❌ NETWORK ERROR')
      console.log(`   Error: ${error.message}`)
    }
    
    console.log('')
  }
  
  console.log('=' .repeat(60))
  console.log('🎯 Real Application Data Test Complete')
  console.log('=' .repeat(60))
}

testRealApplicationEndpoints().catch(console.error)