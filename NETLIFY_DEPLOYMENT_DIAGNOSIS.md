# Netlify Deployment Configuration Diagnosis

## Executive Summary

**Status**: ⚠️ Configuration Issues Identified  
**Critical Issue**: Site not properly linked to Netlify deployment  
**Impact**: Health endpoint returning 503 errors due to missing environment variables or improper site linkage

---

## Configuration Analysis

### ✅ What's Working

1. **Local Configuration**
   - ✅ `netlify.toml` properly configured
   - ✅ Build command: `npm run build:prod`
   - ✅ Publish directory: `dist`
   - ✅ Functions directory: `api-functions` (47 functions)
   - ✅ Node bundler: `esbuild`
   - ✅ All function files present

2. **Environment Files**
   - ✅ `.env.production` exists with all required variables
   - ✅ Supabase URL: `https://mylgegkqoddcrxtwcclb.supabase.co`
   - ✅ API keys configured
   - ✅ Email configuration (Resend + SMTP)

3. **Source Code**
   - ✅ Health endpoint exists: `api/health/index.js`
   - ✅ Network test utility: `api/_lib/networkTest.js`
   - ✅ All API endpoints properly structured

4. **Netlify CLI**
   - ✅ Installed: `netlify-cli/23.6.0`
   - ✅ Logged in: `alexisstar8@gmail.com`
   - ✅ Team: BEANOLA

### ❌ Issues Identified

1. **Site Linkage**
   - ❌ Site not linked to Netlify project
   - ❌ `.netlify/state.json` exists but site ID is empty
   - ❌ Cannot fetch environment variables from Netlify

2. **Environment Variables**
   - ⚠️ Environment variables not set in Netlify dashboard
   - ⚠️ Functions may be running without required credentials
   - ⚠️ This explains the 503 errors on health endpoint

3. **Build Output**
   - ⚠️ `dist` directory not present (needs build)

---

## Root Cause Analysis

### Why Health Endpoint Returns 503

The health endpoint (`/api/health`) is failing with 503 errors because:

1. **Missing Environment Variables in Netlify**
   - The function needs `SUPABASE_URL` or `VITE_SUPABASE_URL`
   - Without these, the health check cannot connect to Supabase
   - Function initialization may be failing

2. **Timeout Configuration**
   - Health check has 10s timeout
   - Supabase connection test also has 10s timeout
   - This creates a race condition in Netlify's 10s function timeout

3. **Site Not Properly Linked**
   - Environment variables from `.env.production` are not automatically deployed
   - Netlify needs explicit environment variable configuration

---

## Critical Environment Variables Required

### Supabase Configuration
```bash
VITE_SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
```

### API Configuration
```bash
VITE_API_BASE_URL=***REMOVED***
VITE_APP_BASE_URL=***REMOVED***
VITE_NODE_ENV=production
```

### Email Configuration
```bash
EMAIL_PROVIDER=resend
EMAIL_FROM=***REMOVED***
RESEND_API_KEY=***REMOVED***
RESEND_FROM_EMAIL="MIHAS Admissions <***REMOVED***>"
```

### SMTP Fallback
```bash
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_USERNAME=***REMOVED***
SMTP_PASSWORD=***REMOVED***
SMTP_SECURE=true
SMTP_FROM_EMAIL="MIHAS Admissions <***REMOVED***>"
```

### Security & Analytics
```bash
TURNSTILE_SECRET_KEY=0x4AAAAAABzNXd6hf1VUxD3X
VITE_TURNSTILE_SITE_KEY=0x4AAAAAABzNXd6hf1VUxD3X
VITE_ANALYTICS_BASE_URL=https://cloud.umami.is
VITE_ANALYTICS_SITE_ID=a6f829ab-c066-457f-aaa7-bf6ce4cc8ed4
```

---

## Resolution Steps

### Step 1: Link Site to Netlify

**Option A: Link to Existing Site**
```bash
netlify link
```
Select your existing MIHAS site from the list.

**Option B: Create New Site**
```bash
netlify init
```
Follow prompts to create a new site.

### Step 2: Set Environment Variables

**Automated Setup (Recommended)**
```bash
chmod +x setup-netlify-deployment.sh
./setup-netlify-deployment.sh
```

**Manual Setup**
```bash
# Supabase
netlify env:set VITE_SUPABASE_URL "https://mylgegkqoddcrxtwcclb.supabase.co"
netlify env:set VITE_SUPABASE_ANON_KEY "your-anon-key"
netlify env:set SUPABASE_SERVICE_ROLE_KEY "your-service-role-key"
netlify env:set SUPABASE_URL "https://mylgegkqoddcrxtwcclb.supabase.co"

# API
netlify env:set VITE_API_BASE_URL "***REMOVED***"
netlify env:set VITE_NODE_ENV "production"

# Email
netlify env:set EMAIL_PROVIDER "resend"
netlify env:set RESEND_API_KEY "your-resend-key"

# Continue for all variables...
```

**Via Netlify Dashboard**
1. Go to: https://app.netlify.com
2. Select your site
3. Go to: Site settings → Environment variables
4. Add all variables from `.env.production`

### Step 3: Fix Health Endpoint Timeout

Update `api/_lib/networkTest.js` to reduce timeout:

```javascript
const options = {
  // ... other options
  timeout: 5000, // Reduced from 10000 to 5000ms
}
```

### Step 4: Build and Deploy

```bash
# Build the application
npm run build:prod

# Test locally
netlify dev

# Deploy to production
netlify deploy --prod
```

### Step 5: Verify Deployment

```bash
# Test health endpoint
curl https://your-site.netlify.app/api/health

# Expected response:
# {"status":"healthy","supabase":{"connected":true}}
```

---

## Verification Checklist

- [ ] Site linked to Netlify (`netlify status` shows site info)
- [ ] All environment variables set (`netlify env:list`)
- [ ] Build completes successfully (`npm run build:prod`)
- [ ] Functions deploy without errors
- [ ] Health endpoint returns 200 OK
- [ ] Supabase connection test passes
- [ ] Frontend loads correctly
- [ ] Authentication works
- [ ] Application submission works

---

## Testing Commands

### Local Testing
```bash
# Test local build
npm run build:prod
netlify dev

# Test health endpoint locally
curl http://localhost:8888/api/health
```

### Production Testing
```bash
# After deployment
curl ***REMOVED***/api/health
curl ***REMOVED***/api/catalog/programs
curl ***REMOVED***/api/catalog/intakes
```

---

## Monitoring & Debugging

### View Function Logs
```bash
netlify functions:log health
```

### View Build Logs
```bash
netlify build --dry
```

### Check Deployment Status
```bash
netlify status
netlify sites:list
```

---

## Additional Recommendations

### 1. Increase Function Timeout (if needed)
Add to `netlify.toml`:
```toml
[functions]
  directory = "api-functions"
  node_bundler = "esbuild"
  external_node_modules = ["@supabase/supabase-js"]
  
[functions."*"]
  timeout = 26  # Increase from default 10s to 26s
```

### 2. Add Function-Specific Configuration
```toml
[functions.health]
  timeout = 15
```

### 3. Enable Build Plugins
```toml
[[plugins]]
  package = "@netlify/plugin-nextjs"
```

### 4. Configure Redirects for Better Performance
Already configured in `netlify.toml` - verify they're working.

---

## Support Resources

- **Netlify Documentation**: https://docs.netlify.com
- **Netlify Functions**: https://docs.netlify.com/functions/overview/
- **Environment Variables**: https://docs.netlify.com/environment-variables/overview/
- **Supabase Integration**: https://supabase.com/docs/guides/hosting/netlify

---

## Contact & Escalation

If issues persist after following these steps:

1. Check Netlify function logs for specific errors
2. Verify Supabase connection from Netlify's IP
3. Test with minimal function first
4. Contact Netlify support with function logs

---

**Last Updated**: 2025-01-14  
**Status**: Awaiting site linkage and environment variable configuration
