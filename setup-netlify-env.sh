#!/bin/bash

# Set Netlify environment variables for production

echo "Setting up Netlify environment variables..."

# Supabase Configuration
netlify env:set VITE_SUPABASE_URL "https://mylgegkqoddcrxtwcclb.supabase.co"
netlify env:set VITE_SUPABASE_ANON_KEY "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw"
netlify env:set SUPABASE_SERVICE_ROLE_KEY "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUxMjA4MywiZXhwIjoyMDczMDg4MDgzfQ.FsspKE5bjcG4TW8IvG-N0o7W0E7ljxznwlzJCm50ZRE"
netlify env:set SUPABASE_URL "https://mylgegkqoddcrxtwcclb.supabase.co"

# API Configuration
netlify env:set VITE_API_BASE_URL "***REMOVED***"
netlify env:set VITE_APP_BASE_URL "***REMOVED***"

# Rate Limiting
netlify env:set RATE_LIMIT_TABLE "request_rate_limits"
netlify env:set RATE_LIMIT_DEFAULT_WINDOW_MS "60000"
netlify env:set RATE_LIMIT_DEFAULT_MAX_ATTEMPTS "60"
netlify env:set RATE_LIMIT_AUTH_MAX_ATTEMPTS "10"
netlify env:set RATE_LIMIT_AUTH_WINDOW_MS "60000"
netlify env:set RATE_LIMIT_APPLICATIONS_MAX_ATTEMPTS "40"
netlify env:set RATE_LIMIT_APPLICATIONS_WINDOW_MS "60000"

# Cloudflare Turnstile
netlify env:set VITE_TURNSTILE_SITE_KEY "0x4AAAAAABzNXd6hf1VUxD3X"
netlify env:set TURNSTILE_SECRET_KEY "0x4AAAAAABzNXd6hf1VUxD3X"

# Email Configuration (Resend)
netlify env:set EMAIL_PROVIDER "resend"
netlify env:set EMAIL_FROM "***REMOVED***"
netlify env:set RESEND_API_KEY "***REMOVED***"
netlify env:set RESEND_FROM_EMAIL "MIHAS Admissions <***REMOVED***>"
netlify env:set APPLICATION_ADMIN_EMAILS "***REMOVED***"

# SMTP Configuration (Zoho - Alternative)
netlify env:set SMTP_HOST "smtp.zoho.com"
netlify env:set SMTP_PORT "465"
netlify env:set SMTP_USERNAME "***REMOVED***"
netlify env:set SMTP_PASSWORD "***REMOVED***"
netlify env:set SMTP_SECURE "true"
netlify env:set SMTP_FROM_EMAIL "MIHAS Admissions <***REMOVED***>"

# Analytics (Umami)
netlify env:set VITE_ANALYTICS_BASE_URL "https://cloud.umami.is"
netlify env:set VITE_ANALYTICS_SITE_ID "a6f829ab-c066-457f-aaa7-bf6ce4cc8ed4"
netlify env:set VITE_ANALYTICS_SHARE_TOKEN "api_4EXvHonSvmleHIuNPSelVgFQugvYMZNr"

# Additional Production Variables
netlify env:set VITE_NODE_ENV "production"
netlify env:set VITE_DEV_SERVER_PORT "5173"

# Email Fallbacks
netlify env:set DEFAULT_FROM_EMAIL "***REMOVED***"
netlify env:set EMAIL_FROM_ADDRESS "***REMOVED***"

# Session Management
netlify env:set SESSION_TIMEOUT_MINUTES "30"
netlify env:set SESSION_WARNING_MINUTES "5"

# File Upload
netlify env:set MAX_FILE_SIZE_MB "10"
netlify env:set ALLOWED_FILE_TYPES "image/*,.pdf,.doc,.docx"

# Cache Configuration
netlify env:set API_CACHE_TTL_MS "300000"
netlify env:set STATIC_CACHE_TTL_SECONDS "31536000"

# Mock Data Configuration
netlify env:set MIHAS_USE_MOCK_DATA "false"

echo "✅ Netlify environment variables set successfully!"
echo ""
echo "To verify, run: netlify env:list"
