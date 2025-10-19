// Global middleware for all Cloudflare Pages Functions
import { logger } from './_lib/logger.js';

export async function onRequest(context) {
  const { request, next } = context;
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  // Log request
  logger.info('Request:', {
    method: request.method,
    url: request.url,
    timestamp: new Date().toISOString()
  });
  
  // Process request
  const response = await next();
  
  // Add CORS to response
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  return response;
}
