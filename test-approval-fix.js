#!/usr/bin/env node

/**
 * Test script to verify the approval functionality fix
 * Run with: node test-approval-fix.js
 */

const API_BASE = process.env.VITE_API_BASE_URL || 'http://localhost:8888'

async function testApprovalEndpoint() {
  console.log('🧪 Testing Application Approval Functionality')
  console.log('=' .repeat(50))

  // Test data
  const testApplicationId = 'test-app-123'
  const testToken = 'Bearer test-token'

  // Test status update
  console.log('\n1. Testing Status Update Endpoint...')
  try {
    const statusResponse = await fetch(`${API_BASE}/api/applications/${testApplicationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': testToken
      },
      body: JSON.stringify({
        action: 'update_status',
        status: 'approved'
      })
    })

    console.log(`   Status: ${statusResponse.status}`)
    console.log(`   Headers: ${JSON.stringify(Object.fromEntries(statusResponse.headers.entries()), null, 2)}`)
    
    if (statusResponse.ok) {
      const data = await statusResponse.json()
      console.log('   ✅ Status update endpoint is working')
      console.log(`   Response: ${JSON.stringify(data, null, 2)}`)
    } else {
      const error = await statusResponse.text()
      console.log('   ❌ Status update failed')
      console.log(`   Error: ${error}`)
    }
  } catch (error) {
    console.log('   ❌ Network error:', error.message)
  }

  // Test payment status update
  console.log('\n2. Testing Payment Status Update Endpoint...')
  try {
    const paymentResponse = await fetch(`${API_BASE}/api/applications/${testApplicationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': testToken
      },
      body: JSON.stringify({
        action: 'update_payment_status',
        paymentStatus: 'verified'
      })
    })

    console.log(`   Status: ${paymentResponse.status}`)
    
    if (paymentResponse.ok) {
      const data = await paymentResponse.json()
      console.log('   ✅ Payment status update endpoint is working')
      console.log(`   Response: ${JSON.stringify(data, null, 2)}`)
    } else {
      const error = await paymentResponse.text()
      console.log('   ❌ Payment status update failed')
      console.log(`   Error: ${error}`)
    }
  } catch (error) {
    console.log('   ❌ Network error:', error.message)
  }

  console.log('\n' + '=' .repeat(50))
  console.log('🏁 Test completed')
}

// Run the test
testApprovalEndpoint().catch(console.error)