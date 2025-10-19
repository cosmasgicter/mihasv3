# Link GitHub to Cloudflare Pages

## Project Already Exists - Connect Git

### Option 1: Delete and Recreate
1. Go to **mihas-v3** → **Settings** → **General**
2. Scroll to bottom → **Delete project**
3. Go to **Workers & Pages** → **Create application** → **Pages**
4. Click **Connect to Git** → **GitHub**
5. Select `cosmasgicter/mihasv3` → `main` branch

### Option 2: Manual Deploy (Keep Current)
1. Build locally: `npm run build:prod`
2. Go to **mihas-v3** → **Deployments**
3. Click **Create deployment**
4. Upload `dist` folder
5. Deploy

**Note:** Direct upload projects can't connect to Git later. Must delete and recreate for Git integration.

### Configure Build Settings (When Creating New)
```
Project name: mihas-v3
Production branch: main
Build command: npm run build:prod
Build output directory: dist
Root directory: /
Node version: 20.18.0
```

### Add Environment Variables (Settings → Variables and Secrets)
```
VITE_SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
VITE_SUPABASE_ANON_KEY=[your-anon-key]
```

### 5. Deploy
Click **Save and Deploy**

---

## Done!
- Auto-deploys on push to main
- Custom domain: mihas-v3.pages.dev
- No workflow file needed (Cloudflare handles it)
