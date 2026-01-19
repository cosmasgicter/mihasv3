// Trusted origins for CORS
const ALLOWED_ORIGINS = [
  'https://mihasv3.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000'
];

// Pattern to match mihasv3.pages.dev subdomains (preview deployments)
const SUBDOMAIN_PATTERN = /^https:\/\/[a-z0-9-]+\.mihasv3\.pages\.dev$/;

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (SUBDOMAIN_PATTERN.test(origin)) return true;
  return false;
}

function getCorsHeaders(origin) {
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization, x-requested-with',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  };
}

export function addCorsHeaders(headers = {}, origin = null) {
  return { ...getCorsHeaders(origin), ...headers };
}

export function handleCors(req, res) {
  const origin = req.headers?.origin || req.headers?.get?.('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}

export { isAllowedOrigin, getCorsHeaders, ALLOWED_ORIGINS };
