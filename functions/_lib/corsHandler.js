import { isAllowedOrigin, ALLOWED_ORIGINS } from './cors.js';

export function withCors(handler) {
  return async function corsWrapper(req, res) {
    const origin = req.headers?.origin || req.headers?.get?.('origin');
    const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
    
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization, x-requested-with');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    return await handler(req, res);
  };
}