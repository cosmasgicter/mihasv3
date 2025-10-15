# Netlify Environment Variables Setup

## ✅ Successfully Configured

All environment variables have been set in Netlify for the production environment.

### Supabase Configuration
- `VITE_SUPABASE_URL` = https://mylgegkqoddcrxtwcclb.supabase.co
- `VITE_SUPABASE_ANON_KEY` = (set)
- `SUPABASE_SERVICE_ROLE_KEY` = (set)
- `SUPABASE_URL` = https://mylgegkqoddcrxtwcclb.supabase.co

### API Configuration
- `VITE_API_BASE_URL` = ***REMOVED***
- `VITE_APP_BASE_URL` = ***REMOVED***

### Rate Limiting
- `RATE_LIMIT_TABLE` = request_rate_limits
- `RATE_LIMIT_DEFAULT_WINDOW_MS` = 60000
- `RATE_LIMIT_DEFAULT_MAX_ATTEMPTS` = 60
- `RATE_LIMIT_AUTH_MAX_ATTEMPTS` = 10
- `RATE_LIMIT_AUTH_WINDOW_MS` = 60000
- `RATE_LIMIT_APPLICATIONS_MAX_ATTEMPTS` = 40
- `RATE_LIMIT_APPLICATIONS_WINDOW_MS` = 60000

### Security (Cloudflare Turnstile)
- `VITE_TURNSTILE_SITE_KEY` = 0x4AAAAAABzNXd6hf1VUxD3X
- `TURNSTILE_SECRET_KEY` = 0x4AAAAAABzNXd6hf1VUxD3X

### Email Configuration (Resend)
- `EMAIL_PROVIDER` = resend
- `EMAIL_FROM` = ***REMOVED***
- `RESEND_API_KEY` = (set)
- `RESEND_FROM_EMAIL` = MIHAS Admissions <***REMOVED***>
- `APPLICATION_ADMIN_EMAILS` = ***REMOVED***

### SMTP Configuration (Zoho - Alternative)
- `SMTP_HOST` = smtp.zoho.com
- `SMTP_PORT` = 465
- `SMTP_USERNAME` = ***REMOVED***
- `SMTP_PASSWORD` = (set)
- `SMTP_SECURE` = true
- `SMTP_FROM_EMAIL` = MIHAS Admissions <***REMOVED***>

### Analytics (Umami)
- `VITE_ANALYTICS_BASE_URL` = https://cloud.umami.is
- `VITE_ANALYTICS_SITE_ID` = a6f829ab-c066-457f-aaa7-bf6ce4cc8ed4
- `VITE_ANALYTICS_SHARE_TOKEN` = (set)

### Application Settings
- `VITE_NODE_ENV` = production
- `VITE_DEV_SERVER_PORT` = 5173

### Email Fallbacks
- `DEFAULT_FROM_EMAIL` = ***REMOVED***
- `EMAIL_FROM_ADDRESS` = ***REMOVED***

### Session Management
- `SESSION_TIMEOUT_MINUTES` = 30
- `SESSION_WARNING_MINUTES` = 5

### File Upload
- `MAX_FILE_SIZE_MB` = 10
- `ALLOWED_FILE_TYPES` = image/*,.pdf,.doc,.docx

### Cache Configuration
- `API_CACHE_TTL_MS` = 300000
- `STATIC_CACHE_TTL_SECONDS` = 31536000

### Mock Data
- `MIHAS_USE_MOCK_DATA` = false

## Next Steps

1. **Redeploy the application** to apply the environment variables:
   ```bash
   netlify deploy --prod
   ```

2. **Verify environment variables** in Netlify dashboard:
   - Go to: https://app.netlify.com/sites/mihas/settings/deploys#environment
   - Check that all variables are listed

3. **Test API endpoints** after deployment to ensure they work correctly

## Troubleshooting

If environment variables are not working:
- Check Netlify dashboard for any errors
- Verify variables are set in the correct context (production/all)
- Redeploy to ensure variables are picked up
- Check function logs for any missing variable errors
