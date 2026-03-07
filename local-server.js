// Simple local server to test Vercel API endpoints
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resolveLocalApiModulePath } from './src/lib/localApiResolver.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// Mock VercelRequest/VercelResponse adapter
function createVercelAdapter(handler) {
  return async (req, res) => {
    // Adapt express req to VercelRequest-like object
    const vercelReq = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      query: req.query,
      body: req.body,
      cookies: req.cookies || {},
    };
    
    // Adapt express res to VercelResponse-like object
    const vercelRes = {
      status: (code) => {
        res.status(code);
        return vercelRes;
      },
      json: (data) => {
        res.json(data);
        return vercelRes;
      },
      send: (data) => {
        res.send(data);
        return vercelRes;
      },
      end: () => {
        res.end();
        return vercelRes;
      },
      setHeader: (name, value) => {
        res.setHeader(name, value);
        return vercelRes;
      },
    };
    
    try {
      await handler(vercelReq, vercelRes);
    } catch (error) {
      console.error('Handler error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  };
}

// Dynamically load and register API handlers
const apiFiles = ['health', 'ping', 'auth', 'catalog', 'applications', 'admin', 'sessions', 'documents', 'notifications', 'payments'];

for (const file of apiFiles) {
  try {
    const modulePath = resolveLocalApiModulePath(file, { rootDir: __dirname });
    const module = await import(modulePath);
    const handler = module.default;
    if (handler) {
      app.all(`/api/${file}`, createVercelAdapter(handler));
      console.log(`✓ Registered /api/${file}`);
    }
  } catch (error) {
    console.log(`✗ Failed to load /api/${file}: ${error.message}`);
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\nLocal API server running at http://localhost:${PORT}`);
  console.log('Test endpoints:');
  console.log(`  GET http://localhost:${PORT}/api/health`);
  console.log(`  GET http://localhost:${PORT}/api/health?action=ping`);
  console.log(`  GET http://localhost:${PORT}/api/health?action=env`);
  console.log(`  GET http://localhost:${PORT}/api/ping`);
  console.log(`  GET http://localhost:${PORT}/api/catalog?type=programs`);
});
