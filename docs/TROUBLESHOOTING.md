# Troubleshooting Guide

## Quick Diagnosis

### Is it working?
1. Can you access the homepage? → **Frontend issue**
2. Can you login? → **Auth issue**
3. Can you submit forms? → **API issue**
4. Can you see data? → **Database issue**

## Common Issues

### 1. Application Won't Submit

**Symptoms**: Submit button disabled or error on submit

**Causes & Solutions**:

✅ **Missing required fields**
- Check all red-highlighted fields
- Scroll through all form steps
- Look for validation errors

✅ **Documents not uploaded**
- Verify all required documents uploaded
- Check file size < 5MB
- Use supported formats (PDF, JPG, PNG)

✅ **Network error**
- Check internet connection
- Try refreshing page
- Clear browser cache
- Try different browser

✅ **Session expired**
- Logout and login again
- Check if token is valid

**Debug Steps**:
```javascript
// Open browser console (F12)
// Look for errors in Console tab
// Check Network tab for failed requests
```

### 2. Payment Not Showing as Verified

**Symptoms**: Payment status stuck on "Pending Review"

**Causes & Solutions**:

✅ **Processing time**
- Wait 1-2 business days
- Verification is manual process

✅ **Proof not uploaded**
- Check you uploaded proof of payment
- Re-upload if unclear

✅ **Wrong amount**
- Verify you paid K153
- Check transaction was successful

✅ **Admin hasn't reviewed**
- Contact ***REMOVED***
- Include transaction reference

**Check Status**:
```sql
-- Admin can check in database
SELECT payment_status, payment_verified_at 
FROM applications 
WHERE application_number = 'MIHAS202500001';
```

### 3. Can't Login

**Symptoms**: "Invalid credentials" or stuck on login page

**Causes & Solutions**:

✅ **Wrong password**
- Click "Forgot Password"
- Check email for reset link
- Check spam folder

✅ **Email not verified**
- Check inbox for verification email
- Click verification link
- Resend if expired

✅ **Account doesn't exist**
- Try registering instead
- Check you're using correct email

✅ **Legacy password migration required**
- If login returns `PASSWORD_MIGRATION_REQUIRED`, your account is from a legacy auth system and needs password bootstrap/recovery.
- Use the password recovery flow first (Forgot Password / reset link).
- If recovery is not available, ask an admin to run bootstrap migration (`POST /api/auth?action=bootstrap`) or admin set-password.
- After migration, login again and the system stores a bcrypt hash automatically.

✅ **Browser issues**
- Clear cookies and cache
- Try incognito/private mode
- Try different browser

**Reset Password**:
1. Click "Forgot Password"
2. Enter email
3. Check inbox (and spam)
4. Click reset link
5. Create new password

### 4. Documents Won't Upload

**Symptoms**: Upload fails or shows error

**Causes & Solutions**:

✅ **File too large**
- Max size: 5MB
- Compress image/PDF
- Use online compressor

✅ **Wrong format**
- Supported: PDF, JPG, PNG
- Convert other formats
- Don't use HEIC or WebP

✅ **Network timeout**
- Check internet speed
- Try smaller file
- Upload one at a time

✅ **Storage quota**
- Contact admin if persists
- May need storage increase

**Compress Files**:
- Images: Use TinyPNG.com
- PDFs: Use SmallPDF.com
- Or use phone camera at lower quality

### 5. Admin Can't Approve Application

**Symptoms**: Approve button disabled or error

**Causes & Solutions**:

✅ **Payment not verified** (MOST COMMON)
- Verify payment first
- System blocks approval without payment
- This is intentional security feature

✅ **Missing permissions**
- Check user has admin role
- Contact super admin

✅ **Application in wrong status**
- Must be "Under Review" to approve
- Change status first

✅ **Database error**
- Check browser console
- Check Vercel logs for errors
- Contact tech support

**Verify Requirements**:
```typescript
// Requirements for approval:
1. payment_status === 'verified' ✓
2. status === 'under_review' ✓
3. user has admin role ✓
4. all documents uploaded ✓
```

### 6. Email Notifications Not Received

**Symptoms**: No emails arriving

**Causes & Solutions**:

✅ **Check spam folder**
- Look in spam/junk
- Mark as "Not Spam"
- Add to contacts

✅ **Wrong email address**
- Verify email in profile
- Update if incorrect

✅ **Email service down**
- Check Resend status (https://resend-status.com)
- Wait and try again

✅ **Email blocked**
- Check email provider settings
- Whitelist noreply@mihas.edu.zm

**Test Email**:
```sql
-- Admin can trigger test email
SELECT send_test_email('user@example.com');
```

### 7. Page Loads Slowly

**Symptoms**: Long loading times, spinning indicators

**Causes & Solutions**:

✅ **Slow internet**
- Check connection speed
- Try different network
- Use mobile data

✅ **Large documents**
- Compress before uploading
- Load documents on-demand

✅ **Too many applications**
- Use filters to reduce data
- Paginate results

✅ **Server issues**
- Check status page
- Try again later

**Performance Check**:
```javascript
// Open browser console
// Run performance test
performance.now()
```

### 8. Data Not Refreshing

**Symptoms**: Old data showing, changes not visible

**Causes & Solutions**:

✅ **Cache issue**
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Clear browser cache
- Try incognito mode

✅ **Realtime not working**
- Check internet connection
- Logout and login
- Check Vercel deployment status

✅ **Race condition**
- Wait 1-2 seconds
- Refresh manually
- This is fixed in latest version

**Force Refresh**:
```javascript
// In browser console
window.location.reload(true)
```

### 9. Mobile App Issues

**Symptoms**: Layout broken, buttons not working on mobile

**Causes & Solutions**:

✅ **Old browser**
- Update mobile browser
- Use Chrome or Safari
- Avoid old Android browsers

✅ **Screen size**
- Rotate to landscape
- Zoom out if needed
- Some features desktop-only

✅ **Touch not working**
- Try tapping different area
- Restart browser
- Clear app cache

**Mobile Compatibility**:
- iOS Safari: ✅ Supported
- Android Chrome: ✅ Supported
- Android Firefox: ✅ Supported
- Old browsers: ❌ Not supported

### 10. Database Errors

**Symptoms**: "Database error" or query failure

**Causes & Solutions**:

✅ **Not authenticated**
- Login again
- Check session valid

✅ **Wrong permissions**
- Check user role
- Contact admin for access

✅ **API authorization blocking**
- Check you own the data
- Admins can access all data

✅ **Database down**
- Check Neon Postgres status (https://neonstatus.com)
- Wait for recovery

**Check via API**:
```bash
# Check database connectivity
curl ***REMOVED***/api/health?action=db
```

## Error Codes

### Frontend Errors

| Code | Meaning | Solution |
|------|---------|----------|
| 400 | Bad Request | Check form data |
| 401 | Unauthorized | Login again |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Check URL |
| 500 | Server Error | Contact support |

### Database Errors

| Code | Meaning | Solution |
|------|---------|----------|
| 23505 | Duplicate | Record already exists |
| 23503 | Foreign key | Related record missing |
| SECURITY_VIOLATION | Arcjet block | Rate limit or bot detection triggered |

## Browser-Specific Issues

### Chrome
- Clear cache: Settings → Privacy → Clear browsing data
- Disable extensions: Try incognito mode
- Update: Help → About Google Chrome

### Firefox
- Clear cache: Options → Privacy → Clear Data
- Disable add-ons: Try private window
- Update: Help → About Firefox

### Safari
- Clear cache: Safari → Clear History
- Disable extensions: Develop → Disable Extensions
- Update: System Preferences → Software Update

### Edge
- Clear cache: Settings → Privacy → Clear browsing data
- Reset: Settings → Reset settings
- Update: Help → About Microsoft Edge

## Development Issues

### Build Fails

```bash
# Clear everything and rebuild
rm -rf node_modules dist .vite
bun install
bun run build
```

### TypeScript Errors

```bash
# Check types
bun run type-check

# Common fixes
bun add -d @types/node
```

### Database Connection

```bash
# Test Neon Postgres connection
curl ***REMOVED***/api/health?action=db
```

### Port Already in Use

```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Or use different port
bun run dev -- --port 3000
```

## Getting Help

### Self-Service

1. **Search this guide** - Use Ctrl+F
2. **Check browser console** - F12 → Console tab
3. **Check network tab** - F12 → Network tab
4. **Try different browser** - Rule out browser issues
5. **Clear cache** - Often fixes weird issues

### Contact Support

**Before contacting**:
- [ ] Tried solutions above
- [ ] Checked browser console for errors
- [ ] Noted exact error message
- [ ] Can reproduce the issue
- [ ] Have screenshots ready

**Email**: ***REMOVED***

**Include**:
1. What you were trying to do
2. What happened instead
3. Error message (exact text)
4. Screenshot
5. Browser and OS
6. Application number (if relevant)

**Response Time**:
- Critical (can't submit): 2-4 hours
- High (can't login): 4-8 hours
- Medium (slow performance): 1-2 days
- Low (cosmetic): 3-5 days

### Emergency Contact

**Critical issues only** (system down, data loss):
- Phone: +260-XXX-XXX-XXX
- Available: 24/7

## Preventive Measures

### For Students

1. **Save often** - Auto-save every 8 seconds, but manual save too
2. **Keep receipts** - Save all payment confirmations
3. **Use good internet** - Avoid public WiFi for submissions
4. **Update browser** - Use latest version
5. **Check email** - Monitor for updates

### For Admins

1. **Verify payment first** - Before any approval
2. **Add clear feedback** - When rejecting
3. **Check documents** - Before approving
4. **Log actions** - System tracks everything
5. **Report bugs** - Help improve system

### For Developers

1. **Test locally** - Before deploying
2. **Check console** - No errors before commit
3. **Run migrations** - Keep DB in sync
4. **Monitor Vercel logs** - Check for new errors
5. **Update dependencies** - Security patches

## Status Pages

Check if services are down:
- Neon Postgres: https://neonstatus.com
- Vercel: https://vercel-status.com
- GitHub: https://githubstatus.com

## Logs & Monitoring

### Check Logs

**Vercel** (Errors & API):
- https://vercel.com/dashboard → Select project → Logs
- Shows all production errors and API function logs
- Filter by function name, status code, or time range

**Health Endpoints**:
```bash
# Quick system check
curl ***REMOVED***/api/health?action=ping
curl ***REMOVED***/api/health?action=db
curl ***REMOVED***/api/health?action=env
```

### Monitor Performance

**Lighthouse** (Browser):
1. F12 → Lighthouse tab
2. Generate report
3. Check scores

**React DevTools**:
1. Install extension
2. Profiler tab
3. Record interaction

## FAQ

**Q: How long should I wait before reporting an issue?**
A: Try basic troubleshooting (5 min), then report if persists.

**Q: Can I get a refund if system is down?**
A: Contact admissions office for refund policy.

**Q: My application disappeared!**
A: Check you're logged into correct account. Contact support with application number.

**Q: Can I edit after submission?**
A: No. Contact ***REMOVED*** for changes.

**Q: System says I'm not eligible but I am?**
A: System checks are automatic. You can still submit - admissions reviews manually.

---

**Still stuck?** Email ***REMOVED*** with details.

**Version**: 3.0  
**Last Updated**: January 2025
