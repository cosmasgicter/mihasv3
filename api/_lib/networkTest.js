import https from 'node:https'
import { URL } from 'node:url'

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
      const statusCode = res.statusCode ?? 0
      const statusMessage = res.statusMessage?.trim()
      const isSuccessful = statusCode >= 200 && statusCode < 400

      if (typeof res.resume === 'function') {
        res.resume()
      }

      if (isSuccessful) {
        resolve({
          success: true,
          status: statusCode,
          message: `Connected successfully (${statusCode})`
        })
        return
      }

      const description = statusMessage ? `${statusCode} ${statusMessage}` : `${statusCode}`

      resolve({
        success: false,
        status: statusCode,
        error: `HTTP ${statusCode}`,
        message: `Unexpected response from Supabase: ${description}`
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

export { testSupabaseConnection }
