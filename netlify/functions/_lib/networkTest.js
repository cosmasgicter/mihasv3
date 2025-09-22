const https = require('https')
const { URL } = require('url')

async function testSupabaseConnection(supabaseUrl) {
  return new Promise((resolve) => {
    const url = new URL(supabaseUrl)
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/rest/v1/',
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'MIHAS-Health-Check/1.0'
      }
    }

    const req = https.request(options, (res) => {
      resolve({
        success: true,
        status: res.statusCode,
        message: `Connected successfully (${res.statusCode})`
      })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({
        success: false,
        error: 'Connection timeout (10s)',
        message: 'Unable to connect to Supabase within 10 seconds'
      })
    })

    req.on('error', (error) => {
      resolve({
        success: false,
        error: error.code || error.message,
        message: `Connection failed: ${error.message}`
      })
    })

    req.end()
  })
}

module.exports = { testSupabaseConnection }