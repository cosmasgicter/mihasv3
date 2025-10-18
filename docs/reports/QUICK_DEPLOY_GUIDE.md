# Quick Deployment Guide - MIHAS Application System

## 🚀 Deploy in 5 Minutes

### Prerequisites
- ✅ Netlify CLI installed
- ✅ Logged in to Netlify (`alexisstar8@gmail.com`)
- ✅ All environment variables in `.env.production`

---

## Step-by-Step Deployment

### 1️⃣ Link to Netlify (1 min)

```bash
netlify link
```

Select your MIHAS site from the list, or create a new one with `netlify init`.

---

### 2️⃣ Set Environment Variables (2 min)

**Automated Setup**:
```bash
chmod +x setup-netlify-deployment.sh
./setup-netlify-deployment.sh
```

**Or manually via Netlify Dashboard**:
1. Go to https://app.netlify.com
2. Select your site → Site settings → Environment variables
3. Add these critical variables:

```
VITE_SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
VITE_SUPABASE_ANON_KEY=[from .env.production]
SUPABASE_SERVICE_ROLE_KEY=[from .env.production]
SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
VITE_API_BASE_URL=***REMOVED***
VITE_NODE_ENV=production
EMAIL_PROVIDER=resend
RESEND_API_KEY=[from .env.production]
```

---

### 3️⃣ Build & Deploy (2 min)

```bash
# Build
npm run build:prod

# Deploy to production
netlify deploy --prod
```

---

### 4️⃣ Verify (30 sec)

```bash
# Test health endpoint
curl ***REMOVED***/api/health

# Expected: {"status":"healthy","supabase":{"connected":true}}
```

---

## ✅ Success Checklist

After deployment, verify:

- [ ] Health endpoint: `***REMOVED***/api/health` returns 200
- [ ] Programs: `***REMOVED***/api/catalog/programs` returns data
- [ ] Frontend loads: `***REMOVED***`
- [ ] Login works
- [ ] Application submission works

---

## 🔧 Troubleshooting

### Issue: 503 Error on Health Endpoint

**Solution**: Environment variables not set in Netlify
```bash
netlify env:list  # Check if variables are set
./setup-netlify-deployment.sh  # Set them automatically
```

### Issue: Build Fails

**Solution**: Check Node version
```bash
node --version  # Should be 20.18.0 or higher
npm install  # Reinstall dependencies
npm run build:prod  # Try again
```

### Issue: Functions Not Working

**Solution**: Check function logs
```bash
netlify functions:log health
netlify functions:log catalog-programs
```

---

## 📚 Additional Resources

- **Full Diagnosis**: `NETLIFY_DEPLOYMENT_DIAGNOSIS.md`
- **Detailed Fix Summary**: `DEPLOYMENT_FIX_SUMMARY.md`
- **Configuration Verification**: Run `./verify-netlify-config.sh`

---

## 🆘 Need Help?

1. Check function logs: `netlify functions:log`
2. Verify environment variables: `netlify env:list`
3. Test locally first: `netlify dev`
4. Review detailed diagnosis documents

---

**Ready to deploy? Start with Step 1! 🚀**
