# Email Configuration Required ⚠️

## Issues
1. ❌ New users cannot create accounts (500 error) - **FIXED** ✅
2. ❌ Password reset not working
3. ❌ No emails being sent

## Root Cause
Supabase Auth emails are not configured. Supabase uses its own SMTP settings for auth emails (signup confirmations, password resets).

## Solution: Configure Supabase SMTP

### Step 1: Go to Supabase Dashboard
1. Open: https://supabase.com/dashboard/project/mylgegkqoddcrxtwcclb
2. Navigate to: **Authentication** → **Email Templates** → **SMTP Settings**

### Step 2: Configure SMTP (Use Zoho)
```
SMTP Host: smtp.zoho.com
SMTP Port: 465
SMTP Username: ***REMOVED***
SMTP Password: ***REMOVED***
Enable SSL: Yes
Sender Email: ***REMOVED***
Sender Name: MIHAS Admissions
```

### Step 3: Test Email Configuration
After saving SMTP settings:
1. Go to Authentication → Users
2. Click "Invite User"
3. Enter a test email
4. Check if email is received

### Step 4: Customize Email Templates (Optional)
In **Authentication** → **Email Templates**, customize:
- **Confirm Signup**: Welcome email with confirmation link
- **Reset Password**: Password reset instructions
- **Magic Link**: Passwordless login link

## Current Signup Flow

### With Email Confirmation (Default)
1. User fills signup form
2. Account created in database ✅
3. Confirmation email sent ❌ (SMTP not configured)
4. User must click link to verify email
5. User can sign in

### Without Email Confirmation (Temporary Fix)
If you want signups to work immediately without email:

1. Go to: **Authentication** → **Settings** → **Email Auth**
2. Disable: "Enable email confirmations"
3. Users can sign in immediately after signup

⚠️ **Not recommended for production** - allows unverified emails

## Password Reset Flow

Requires SMTP configuration:
1. User clicks "Forgot Password"
2. Enters email
3. Supabase sends reset link via SMTP ❌ (not configured)
4. User clicks link
5. Sets new password

## Quick Test After Configuration

### Test Signup
```bash
# Should create account and send confirmation email
curl -X POST https://mylgegkqoddcrxtwcclb.supabase.co/auth/v1/signup \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### Test Password Reset
```bash
# Should send reset email
curl -X POST https://mylgegkqoddcrxtwcclb.supabase.co/auth/v1/recover \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## Alternative: Use Resend for Application Emails

Your app already has Resend configured for application-related emails:
- Application slip emails
- Admin notifications
- Custom app emails

But **Supabase Auth emails** (signup, password reset) require Supabase SMTP configuration.

## Summary

✅ **Signup trigger fixed** - Accounts will be created
❌ **SMTP not configured** - No emails sent
🔧 **Action required** - Configure SMTP in Supabase Dashboard

## Priority Actions

1. **Immediate**: Configure SMTP in Supabase Dashboard (5 minutes)
2. **Test**: Try signup and password reset
3. **Customize**: Update email templates with branding
4. **Monitor**: Check email delivery logs in Supabase

## Email Credentials Available
- Zoho SMTP: ***REMOVED*** (credentials in .env)
- Resend API: ***REMOVED*** (for app emails)

Configure Supabase SMTP now to enable all email functionality.
