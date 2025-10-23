# API Structure Guide

**Last Updated**: 2025-01-23  
**Status**: ✅ Standardized

---

## 📁 Directory Structure

```
mihasv3/
├── api/                    # Source code (organized by feature)
│   ├── admin/
│   ├── applications/
│   ├── auth/
│   ├── catalog/
│   └── _lib/              # Shared utilities
│
├── api-functions/          # Deployment functions (flat structure)
│   ├── admin-*.js
│   ├── applications-*.js
│   ├── auth-*.js
│   └── *.js               # All serverless functions
│
└── netlify/functions/      # ⚠️ DEPRECATED - Do not use
```

---

## 🎯 Standard: Use `api-functions/` Only

### ✅ Correct Location
**ALL API functions MUST be placed in `api-functions/`**

```
api-functions/
├── send-email.js           ✅ Correct
├── generate-pdf.js         ✅ Correct
├── interview-reminders.js  ✅ Correct
└── your-new-function.js    ✅ Correct
```

### ❌ Incorrect Location
```
netlify/functions/
└── your-function.js        ❌ Wrong - Do not use
```

---

## 📋 Naming Convention

### Flat File Structure
All functions use kebab-case with feature prefixes:

```
{feature}-{resource}-{action}.js
```

### Examples
```
✅ admin-users-id.js              # GET/PUT /api/admin/users/:id
✅ applications-id.js             # GET/PUT /api/applications/:id
✅ auth-login.js                  # POST /api/auth/login
✅ send-email.js                  # POST /.netlify/functions/send-email
✅ interview-reminders.js         # Scheduled function
```

---

## 🔧 Configuration

### netlify.toml
```toml
[functions]
  directory = "api-functions"    # ← Single source of truth
  node_bundler = "esbuild"
  external_node_modules = ["@supabase/supabase-js"]

# Scheduled functions
[[functions]]
  path = "interview-reminders"   # ← File in api-functions/
  schedule = "@hourly"
```

---

## 🚀 Creating New Functions

### Step 1: Create Function File
Place in `api-functions/` with proper naming:

```javascript
// api-functions/your-new-function.js
exports.handler = async (event, context) => {
  // Your code here
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  }
}
```

### Step 2: Add Redirect (if needed)
Update `netlify.toml`:

```toml
[[redirects]]
  from = "/api/your/endpoint"
  to = "/.netlify/functions/your-new-function"
  status = 200
  force = true
```

### Step 3: Test Locally
```bash
npm run dev
# Access at: http://localhost:8888/.netlify/functions/your-new-function
```

---

## 📦 Function Types

### 1. HTTP Functions
Regular API endpoints triggered by HTTP requests:

```javascript
// api-functions/my-api.js
exports.handler = async (event, context) => {
  const method = event.httpMethod
  const body = JSON.parse(event.body || '{}')
  
  // Handle request
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'response' })
  }
}
```

### 2. Scheduled Functions
Cron jobs that run on a schedule:

```javascript
// api-functions/my-scheduled-task.js
exports.handler = async (event, context) => {
  console.log('Running scheduled task...')
  
  // Perform task
  
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  }
}
```

Configure in `netlify.toml`:
```toml
[[functions]]
  path = "my-scheduled-task"
  schedule = "@hourly"  # or "0 0 * * *" for cron syntax
```

### 3. Background Functions
Long-running tasks (use with caution):

```javascript
// api-functions/my-background-task.js
exports.handler = async (event, context) => {
  // Set longer timeout if needed
  context.callbackWaitsForEmptyEventLoop = false
  
  // Long-running task
  
  return { statusCode: 200 }
}
```

---

## 🔄 Migration from netlify/functions/

### If You Find Functions in netlify/functions/
1. **Move** the file to `api-functions/`
2. **Update** any imports/references
3. **Test** the function works
4. **Delete** the old file from `netlify/functions/`

```bash
# Example migration
mv netlify/functions/my-function.js api-functions/
# Test it works
# Delete old location
```

---

## 🛠️ Shared Utilities

### Location
Place shared code in `api-functions/_lib/` or `api/_lib/`:

```
api-functions/
└── _lib/
    ├── supabaseClient.js
    ├── cors.js
    └── validation.js
```

### Usage
```javascript
// api-functions/my-function.js
const { createClient } = require('./_lib/supabaseClient')
const { corsHeaders } = require('./_lib/cors')

exports.handler = async (event, context) => {
  const supabase = createClient()
  // Use shared utilities
}
```

---

## 🔐 Environment Variables

### Access in Functions
```javascript
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
```

### Configuration
Set in Netlify dashboard or `netlify.toml`:

```toml
[dev.env]
  VITE_SUPABASE_URL = "https://your-project.supabase.co"
  SUPABASE_SERVICE_ROLE_KEY = "your-key"
```

---

## 🧪 Testing Functions

### Local Testing
```bash
# Start dev server
npm run dev

# Test function
curl http://localhost:8888/.netlify/functions/your-function
```

### Production Testing
```bash
# After deployment
curl https://your-site.netlify.app/.netlify/functions/your-function
```

---

## 📊 Current Functions Inventory

### Admin Functions (12)
- `admin-applications-update-status.js`
- `admin-applications-verify-payment.js`
- `admin-audit-log.js`
- `admin-audit-log-export.js`
- `admin-audit-log-stats.js`
- `admin-dashboard.js`
- `admin-email-queue-status.js`
- `admin-queue-status.js`
- `admin-users.js`
- `admin-users-id.js`
- `admin-users-id-permissions.js`
- `admin-users-id-role.js`

### Application Functions (11)
- `applications.js`
- `applications-id.js`
- `applications-academic-summary.js`
- `applications-bulk.js`
- `applications-details.js`
- `applications-documents.js`
- `applications-email-slip.js`
- `applications-generate-slip.js`
- `applications-grades.js`
- `applications-review.js`
- `applications-summary.js`

### Auth Functions (4)
- `auth-login.js`
- `auth-register.js`
- `auth-reset-password.js`
- `auth-signin.js`

### Catalog Functions (3)
- `catalog-intakes.js`
- `catalog-programs.js`
- `catalog-subjects.js`

### Notification Functions (6)
- `notifications-application-submitted.js`
- `notifications-dispatch-channel.js`
- `notifications-preferences.js`
- `notifications-process-email-queue.js`
- `notifications-send.js`
- `notifications-update-consent.js`

### Enhancement Functions (3) ✨ NEW
- `send-email.js` - Email sending service
- `generate-pdf.js` - PDF generation service
- `interview-reminders.js` - Scheduled interview reminders

### Other Functions (8)
- `analytics-metrics.js`
- `analytics-predictive-dashboard.js`
- `analytics-telemetry.js`
- `documents-upload.js`
- `health.js`
- `mcp-query.js`
- `push-subscriptions.js`
- `push-subscriptions-dispatch.js`
- `test.js`
- `debug-test.js`

**Total**: 47 functions

---

## 🎯 Best Practices

### 1. Keep Functions Small
Each function should do ONE thing well:
```javascript
// ✅ Good - Single responsibility
exports.handler = async (event) => {
  return sendEmail(event.body)
}

// ❌ Bad - Multiple responsibilities
exports.handler = async (event) => {
  sendEmail()
  generatePDF()
  updateDatabase()
  sendNotification()
}
```

### 2. Use Shared Libraries
Don't duplicate code:
```javascript
// ✅ Good - Reuse utilities
const { createClient } = require('./_lib/supabaseClient')

// ❌ Bad - Duplicate client creation
const supabase = createClient(url, key)
```

### 3. Handle Errors Properly
```javascript
// ✅ Good - Proper error handling
try {
  const result = await doSomething()
  return { statusCode: 200, body: JSON.stringify(result) }
} catch (error) {
  console.error('Error:', error)
  return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
}
```

### 4. Return Consistent Responses
```javascript
// ✅ Good - Consistent structure
return {
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: true, data: result })
}
```

### 5. Add CORS Headers
```javascript
// ✅ Good - Include CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
}

return {
  statusCode: 200,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
}
```

---

## 🚫 Common Mistakes to Avoid

### ❌ Don't Use netlify/functions/
```javascript
// ❌ Wrong location
netlify/functions/my-function.js

// ✅ Correct location
api-functions/my-function.js
```

### ❌ Don't Hardcode Credentials
```javascript
// ❌ Bad
const apiKey = 'sk_live_123456789'

// ✅ Good
const apiKey = process.env.API_KEY
```

### ❌ Don't Forget Error Handling
```javascript
// ❌ Bad - No error handling
const data = await fetchData()
return { statusCode: 200, body: JSON.stringify(data) }

// ✅ Good - Proper error handling
try {
  const data = await fetchData()
  return { statusCode: 200, body: JSON.stringify(data) }
} catch (error) {
  return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
}
```

---

## 🔄 Platform Migration Readiness

### Why This Structure Helps
By keeping all functions in `api-functions/` with a flat structure:

1. **Easy to migrate** to Vercel, AWS Lambda, or other platforms
2. **Clear inventory** of all serverless functions
3. **Consistent naming** makes automation easier
4. **Single source of truth** for deployment

### Migration Checklist
If migrating from Netlify:
- [ ] All functions in `api-functions/`
- [ ] No functions in `netlify/functions/`
- [ ] Environment variables documented
- [ ] Shared utilities in `_lib/`
- [ ] Scheduled functions identified
- [ ] Redirects documented

---

## 📚 Additional Resources

- [Netlify Functions Docs](https://docs.netlify.com/functions/overview/)
- [Scheduled Functions](https://docs.netlify.com/functions/scheduled-functions/)
- [Environment Variables](https://docs.netlify.com/environment-variables/overview/)

---

## ✅ Checklist for New Functions

Before creating a new function:
- [ ] Placed in `api-functions/` directory
- [ ] Named using kebab-case convention
- [ ] Added redirect in `netlify.toml` (if needed)
- [ ] Includes proper error handling
- [ ] Returns consistent response format
- [ ] Uses shared utilities from `_lib/`
- [ ] Environment variables used (not hardcoded)
- [ ] CORS headers included
- [ ] Tested locally with `npm run dev`
- [ ] Documented in this guide

---

**Remember**: `api-functions/` is the ONLY location for serverless functions. This ensures consistency, maintainability, and platform migration readiness.
