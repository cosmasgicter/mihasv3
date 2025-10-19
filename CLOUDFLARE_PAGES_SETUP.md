# Cloudflare Pages Configuration

## Build Settings

Configure these settings in your Cloudflare Pages dashboard:

### Framework preset
- **Framework**: None (or Vite)

### Build settings
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory**: `/`

### Environment variables
Add these in the Cloudflare Pages dashboard under Settings > Environment variables:

```
VITE_SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUxMjA4MywiZXhwIjoyMDczMDg4MDgzfQ.FsspKE5bjcG4TW8IvG-N0o7W0E7ljxznwlzJCm50ZRE
```

### Important Notes

1. **DO NOT** set a "Deploy command" - Cloudflare Pages automatically deploys after build
2. **DO NOT** use `wrangler deploy` or `wrangler pages deploy` in build settings
3. The build command should ONLY be `npm run build`
4. Functions in `/functions` directory are automatically deployed
5. Environment variables from `wrangler.toml` are NOT used in Git-based deployments

## Current Issue

The build is failing because there's a deploy command configured that tries to run wrangler, which requires authentication.

## Fix

Go to Cloudflare Pages dashboard:
1. Navigate to your project settings
2. Go to "Builds & deployments"
3. Click "Configure build settings"
4. **Remove any deploy command** - leave it empty
5. Ensure build command is: `npm run build`
6. Ensure build output directory is: `dist`
7. Save changes
8. Retry deployment

## Testing After Deployment

Once deployed, test the endpoints:

```bash
# Health check
curl https://apply.mihas.edu.zm/health

# Login
curl -X POST https://apply.mihas.edu.zm/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cosmas@beanola.com","password":"Beanola2025"}'

# Applications (with token)
curl https://apply.mihas.edu.zm/applications \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```
