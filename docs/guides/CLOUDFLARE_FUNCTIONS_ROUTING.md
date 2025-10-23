# Cloudflare Pages Functions Routing

## How It Works

Cloudflare Pages uses **file-based routing** for serverless functions:

```
functions/applications/generate/slip.js → /applications/generate/slip
functions/api/sessions/track.js → /api/sessions/track
functions/health.js → /health
```

**The file path IS the URL path.** No `/api` prefix unless the file is in `functions/api/`.

## Project Structure

```
mihasv3/
├── functions/              ← Serverless functions (deployed separately)
│   ├── applications/
│   │   ├── generate/
│   │   │   └── slip.js    → /applications/generate/slip
│   │   └── email/
│   │       └── slip.js    → /applications/email/slip
│   └── api/               ← Only these get /api prefix
│       └── sessions/
│           └── track.js   → /api/sessions/track
├── dist/                  ← Static assets (from build)
└── public/                ← Static files copied to dist
```

## Deployment

### Local Development
```bash
npm run dev  # Vite dev server (no functions)
```

### Production
```bash
npm run build              # Build static assets to dist/
npm run deploy             # Deploy to Cloudflare Pages
# OR
git push origin main       # Auto-deploy via Cloudflare Git integration
```

## Why 404 Happens

**The 404 error occurs because:**
1. Functions only work on Cloudflare Pages (after deployment)
2. Local dev server (`npm run dev`) doesn't run functions
3. Functions are NOT in the `dist/` folder - they're deployed separately

## Current API Endpoints

### Application Slip
- **POST** `/applications/generate/slip` - Generate PDF slip
- **POST** `/applications/email/slip` - Email slip to user

### Reminders
- **POST** `/applications/reminders/send` - Send reminder email

## Testing Functions

### Option 1: Deploy to Cloudflare
```bash
npm run build
npm run deploy
```

### Option 2: Use Wrangler Dev (with functions)
```bash
npm run build
npx wrangler pages dev dist --compatibility-date=2025-01-23
```

### Option 3: Test on Production
Functions work at: `***REMOVED***/applications/generate/slip`

## Fix Applied

✅ Reverted incorrect `/api` prefix
✅ Functions use correct paths: `/applications/*`
✅ Routes file configured correctly
✅ Functions folder at project root (correct location)

## Next Steps

**Deploy to Cloudflare Pages** to make functions available:
```bash
git add -A
git commit -m "fix: correct function routing paths"
git push origin main
```

Cloudflare will automatically deploy both:
- Static files from `dist/`
- Functions from `functions/`
