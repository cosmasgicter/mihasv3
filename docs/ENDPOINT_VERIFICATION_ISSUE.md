# Endpoint Verification Issue ⚠️

## Problem Detected

### API Endpoints Not Working
All API requests return HTML (React app) instead of JSON responses.

**Test Results**:
```bash
# Expected: JSON response
# Actual: HTML (React app)

curl https://apply.mihas.edu.zm/api/auth-roles
# Returns: <!DOCTYPE html>...

curl https://apply.mihas.edu.zm/api/catalog/programs
# Returns: <!DOCTYPE html>...
```

### Root Cause
**Cloudflare Pages Functions Not Deployed**

Evidence:
1. All API calls return React app HTML
2. HTTP 200 status (serving static files)
3. Wrangler shows: "Project not found"

### Why This Happened

#### Possible Reasons:
1. **Project Name Mismatch**
   - wrangler.toml: `name = "mihas"`
   - Cloudflare Pages: Project might have different name
   - Need to verify actual project name in Cloudflare dashboard

2. **Functions Not Deployed**
   - Cloudflare Pages may not be deploying `functions/` directory
   - Build might be completing but functions not uploaded
   - Need to check Cloudflare Pages build logs

3. **Routing Issue**
   - Static site deployed successfully
   - Functions routing not configured
   - All `/api/*` routes falling back to index.html

## Verification Steps Needed

### 1. Check Cloudflare Dashboard
- Login to Cloudflare Pages dashboard
- Find actual project name
- Check if functions are listed
- Review deployment logs

### 2. Check Project Configuration
```bash
# Verify project name
cat wrangler.toml | grep "name ="

# Check if functions exist locally
ls -la functions/api/
```

### 3. Manual Deploy Test
```bash
# Try manual deployment
npx wrangler pages deploy dist --project-name=<actual-name>
```

## Current Status

### What's Working ✅
- Static React app deployed
- HTTPS working
- Domain accessible
- Build completed successfully

### What's Not Working ❌
- API endpoints returning HTML
- Functions not being served
- `/api/*` routes not working

## Immediate Actions Required

### 1. Find Actual Project Name
Check Cloudflare Pages dashboard for the real project name.

### 2. Update wrangler.toml
```toml
# Update if name is different
name = "<actual-project-name>"
```

### 3. Verify Functions Deployment
Check Cloudflare Pages dashboard:
- Go to project settings
- Check "Functions" tab
- Verify functions are listed

### 4. Check Build Configuration
Cloudflare Pages should:
- Build command: `npm run build:prod`
- Output directory: `dist`
- Functions directory: `functions` (auto-detected)

## Possible Solutions

### Solution 1: Correct Project Name
```bash
# Find actual project name from dashboard
# Update wrangler.toml
# Redeploy
git commit --amend
git push origin main --force
```

### Solution 2: Manual Deployment
```bash
# Deploy manually with correct name
npm run build:prod
npx wrangler pages deploy dist --project-name=<actual-name>
```

### Solution 3: Check Functions Configuration
Cloudflare Pages might need explicit functions configuration:
- Check if `_routes.json` is needed
- Verify functions are in correct directory
- Check build logs for function detection

## Testing After Fix

Once fixed, test endpoints:
```bash
# Should return JSON, not HTML
curl https://apply.mihas.edu.zm/api/auth-roles
curl https://apply.mihas.edu.zm/api/admin-settings
curl https://apply.mihas.edu.zm/api/notifications
```

## Next Steps

1. ⏳ Check Cloudflare Pages dashboard
2. ⏳ Verify actual project name
3. ⏳ Check if functions are deployed
4. ⏳ Review build logs
5. ⏳ Fix configuration if needed
6. ⏳ Redeploy
7. ⏳ Test endpoints again

---

**Status**: ⚠️ INVESTIGATION NEEDED
**Issue**: Functions not deployed
**Action**: Check Cloudflare dashboard for project name and configuration
