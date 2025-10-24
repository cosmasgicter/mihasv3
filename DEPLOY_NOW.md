# 🚀 DEPLOY NOW - Quick Reference

**Time Required**: 30 minutes  
**Status**: ✅ All fixes ready

---

## 1️⃣ BUILD & DEPLOY (10 minutes)

```bash
# Build production
npm run build:prod

# Deploy to Cloudflare Pages
npm run deploy
# OR
wrangler pages deploy dist
```

---

## 2️⃣ VERIFY APIs (5 minutes)

Open browser console on https://apply.mihas.edu.zm:

```javascript
// Get your token
const token = localStorage.getItem('supabase.auth.token')

// Test auth-roles
fetch('/api/auth-roles', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log)

// Test notifications
fetch('/api/notifications', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log)
```

Expected: Both return 200 with data

---

## 3️⃣ TEST USER FLOW (10 minutes)

1. Sign in as regular user
2. Go to dashboard
3. View your applications
4. Click on application
5. Verify it loads (no "Application Not Found")
6. Try downloading application slip

Expected: Everything works smoothly

---

## 4️⃣ TEST ADMIN FLOW (5 minutes)

1. Sign in as admin (cosmas@beanola.com)
2. Go to admin dashboard
3. View all applications
4. Click on any application
5. Verify you can see all details

Expected: Admin can view all applications

---

## ✅ SUCCESS CRITERIA

- [ ] No 500 errors in console
- [ ] Users can view their applications
- [ ] Admins can view all applications
- [ ] Application slips download successfully
- [ ] No "Application Not Found" errors

---

## 🔥 IF SOMETHING BREAKS

### Rollback
```bash
# List deployments
wrangler pages deployment list

# Rollback to previous
wrangler pages deployment rollback DEPLOYMENT_ID
```

### Check Logs
```bash
# View live logs
wrangler pages deployment tail
```

### Database Rollback
```sql
-- If RLS causes issues, temporarily disable
ALTER TABLE applications DISABLE ROW LEVEL SECURITY;

-- Then investigate and fix policies
```

---

## 📊 MONITORING

After deployment, monitor for 1 hour:

1. **Cloudflare Dashboard** - Check error rates
2. **Supabase Dashboard** - Check query performance
3. **Browser Console** - Check for errors
4. **User Reports** - Monitor support emails

---

## 🎯 WHAT WAS FIXED

1. ✅ **API 500 Errors** - Added missing imports
2. ✅ **Application Not Found** - Fixed RLS policies
3. ✅ **PDF Generation** - Code is correct, just needs dependencies

---

**Ready to deploy?** Run the commands above! 🚀
