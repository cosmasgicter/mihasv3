# Cloudflare Pages Migration Guide

## ✅ Preparation Complete

### Files Created
- `wrangler.toml` - Cloudflare configuration
- `functions/_middleware.js` - Global CORS & logging
- `functions/_lib/` - Shared utilities
- `scripts/migrate-to-cloudflare.js` - Auto-migration script

## 🚀 Migration Steps

### 1. Install Wrangler
```bash
npm install -D wrangler
```

### 2. Update package.json scripts
```json
{
  "scripts": {
    "dev:cf": "wrangler pages dev dist --compatibility-date=2024-01-01",
    "deploy:cf": "wrangler pages deploy dist --project-name=mihas-v3"
  }
}
```

### 3. Run Migration Script
```bash
node scripts/migrate-to-cloudflare.js
```

This converts all 47 functions from Netlify → Cloudflare format.

### 4. Update Frontend API Calls

**Find & Replace:**
```bash
# Search for
/.netlify/functions/

# Replace with
/api/
```

**Or use this command:**
```bash
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i 's|/.netlify/functions/|/api/|g'
```

### 5. Test Locally
```bash
npm run build:prod
npx wrangler pages dev dist
```

Visit: http://localhost:8788

### 6. Deploy to Cloudflare

#### Option A: Git Integration (Recommended)
1. Go to https://dash.cloudflare.com
2. Workers & Pages → Create → Pages → Connect to Git
3. Select repository
4. Configure:
   - **Build command:** `npm run build:prod`
   - **Build output:** `dist`
   - **Root directory:** `/`

#### Option B: CLI Deploy
```bash
wrangler login
npm run build:prod
wrangler pages deploy dist --project-name=mihas-v3
```

### 7. Set Environment Variables

In Cloudflare Dashboard → Settings → Environment variables:

```
SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
NODE_ENV=production
```

## 🔄 Key Differences

| Aspect | Netlify | Cloudflare |
|--------|---------|------------|
| **Functions Dir** | `api-functions/` | `functions/` |
| **Route** | `/.netlify/functions/name` | `/name` |
| **Env Vars** | `process.env.VAR` | `context.env.VAR` |
| **Handler** | `exports.handler` | `export async function onRequest` |
| **Query Params** | `event.queryStringParameters` | `new URL(request.url).searchParams` |
| **Body** | `JSON.parse(event.body)` | `await request.json()` |
| **Response** | `{ statusCode, body }` | `new Response(body, { status })` |

## 📁 Function Structure

### Netlify (Old)
```javascript
export async function handler(event) {
  const { id } = event.queryStringParameters;
  return {
    statusCode: 200,
    body: JSON.stringify({ id })
  };
}
```

### Cloudflare (New)
```javascript
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

## 🎯 Method-Specific Handlers

```javascript
// GET requests
export async function onRequestGet(context) { }

// POST requests
export async function onRequestPost(context) { }

// PUT requests
export async function onRequestPut(context) { }

// DELETE requests
export async function onRequestDelete(context) { }

// All methods
export async function onRequest(context) { }
```

## 🔧 Dynamic Routes

```
functions/
├── users/
│   ├── [id].js          → /users/:id
│   └── [id]/
│       └── profile.js   → /users/:id/profile
└── api/
    └── [[path]].js      → /api/* (catch-all)
```

## ✅ Pre-Deploy Checklist

- [ ] Wrangler installed
- [ ] Migration script run
- [ ] Frontend API calls updated
- [ ] Local testing passed
- [ ] Environment variables ready
- [ ] Git repository connected
- [ ] Build command verified

## 🚨 Common Issues

### CORS Errors
Already handled by `_middleware.js`

### Environment Variables Not Working
Use `context.env.VAR` not `process.env.VAR`

### Function Not Found
Check file is in `/functions/` directory

### Module Import Errors
Use ES modules: `import` not `require`

## 📊 Performance Benefits

- **Edge Network:** Functions run globally
- **Cold Start:** ~0ms (vs Netlify ~50-200ms)
- **Bandwidth:** Unlimited
- **Requests:** 100k/day free (vs Netlify 125k/month)

## 🔗 Resources

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Functions Guide](https://developers.cloudflare.com/pages/functions/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

---

**Ready to deploy?** Run: `node scripts/migrate-to-cloudflare.js`
