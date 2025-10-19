// Simple debug function to test Netlify runtime
import { logger } from '../_lib/logger.js'

export const handler = async (event, context) => {
  logger.info('Debug function called:', { method: event.httpMethod, path: event.path })
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: JSON.stringify({
      message: 'Debug function working',
      method: event.httpMethod,
      path: event.path,
      timestamp: new Date().toISOString()
    })
  }
}

export default handler