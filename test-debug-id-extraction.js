// Debug ID extraction issue
const baseUrl = 'https://apply.mihas.edu.zm'
const studentCredentials = { email: 'alexisstar8@gmail.com', password: 'Skyl3r@L0m1s' }

async function authenticate() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(studentCredentials)
  })
  const data = await response.json()
  return data.token
}

async function debugIdExtraction() {
  console.log('🔍 Debugging ID Extraction Issue')
  console.log('=' .repeat(50))
  
  const token = await authenticate()
  console.log('✅ Authenticated')
  
  const testUrls = [
    `${baseUrl}/api/applications/87030776-bda9-4373-baa3-77f3fb012ac9`,
    `${baseUrl}/api/applications/87030776-bda9-4373-baa3-77f3fb012ac9?include=grades`,
    `${baseUrl}/api/admin/users/test-user-id`,
    `${baseUrl}/api/admin/users/test-user-id/role`
  ]
  
  for (const url of testUrls) {
    console.log(`\n🧪 Testing URL: ${url}`)
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      const text = await response.text()
      console.log(`   Status: ${response.status}`)
      
      try {
        const json = JSON.parse(text)
        console.log(`   Response: ${json.error || JSON.stringify(json).substring(0, 100)}`)
      } catch {
        console.log(`   Raw response: ${text.substring(0, 100)}`)
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`)
    }
  }
}

debugIdExtraction().catch(console.error)