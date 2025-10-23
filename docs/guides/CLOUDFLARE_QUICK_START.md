# 🚀 Cloudflare Pages - Quick Start

## 1️⃣ Install (30 seconds)
```bash
npm install -D wrangler
```

## 2️⃣ Migrate Functions (2 minutes)
```bash
npm run migrate:cf
```

## 3️⃣ Update API Calls (1 minute)
```bash
# Replace /.netlify/functions/ with /api/
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i 's|/.netlify/functions/|/api/|g' {} +
```

## 4️⃣ Test Locally (1 minute)
```bash
npm run build:prod
npm run dev:cf
```
Visit: http://localhost:8788

## 5️⃣ Deploy (2 minutes)

### Option A: CLI
```bash
npx wrangler login
npm run deploy:cf
```

### Option B: Dashboard
1. https://dash.cloudflare.com
2. Workers & Pages → Create → Connect Git
3. Build: `npm run build:prod`
4. Output: `dist`

## 6️⃣ Environment Variables
Dashboard → Settings → Environment variables:
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NODE_ENV=production
```

## ✅ Done!

**Total Time:** ~7 minutes

**Your app is now:**
- Running on Cloudflare's global edge network
- 0ms cold starts
- Unlimited bandwidth
- 100k requests/day free

---

**Need help?** See `CLOUDFLARE_MIGRATION.md` for full guide.
