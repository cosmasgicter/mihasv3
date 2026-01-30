// Minimal JavaScript endpoint - no TypeScript, no imports
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  return res.status(200).json({
    success: true,
    data: {
      pong: true,
      timestamp: new Date().toISOString()
    }
  });
}
