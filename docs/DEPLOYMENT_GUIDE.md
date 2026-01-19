# Deployment Guide - MIHAS Application System

## Prerequisites

### Required
- Node.js 18+ and npm
- Supabase account (free tier works)
- Cloudflare account (free tier works)
- Git installed

### Optional
- Sentry account (for error monitoring)
- Custom domain

## Environment Variables

Create `.env` file in project root:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Sentry (Optional)
VITE_SENTRY_DSN=https://your-sentry-dsn

# App Config
VITE_APP_NAME=MIHAS
VITE_APP_URL=https://mihasv3.pages.dev
```

## Step 1: Database Setup (15 minutes)

### 1.1 Create Supabase Project
1. Go to https://supabase.com
2. Click "New Project"
3. Name: "mihas-production"
4. Database Password: (save securely)
5. Region: Choose closest to Zambia

### 1.2 Run Migrations
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### 1.3 Verify Database
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Should show 86 tables
```

## Step 2: Build Application (5 minutes)

```bash
# Install dependencies
npm install

# Build for production
npm run build:prod

# Test build locally
npm run preview
```

## Step 3: Deploy to Cloudflare Pages (10 minutes)

### 3.1 Via Dashboard (Recommended)
1. Go to https://dash.cloudflare.com
2. Pages → Create a project
3. Connect to Git → Select repository
4. Build settings:
   - Framework preset: Vite
   - Build command: `npm run build:prod`
   - Build output: `dist`
5. Environment variables: Add all from `.env`
6. Deploy

### 3.2 Via CLI (Alternative)
```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Deploy
wrangler pages deploy dist --project-name=mihas
```

## Step 4: Configure Supabase Auth (5 minutes)

1. Supabase Dashboard → Authentication → URL Configuration
2. Site URL: `https://mihasv3.pages.dev`
3. Redirect URLs: Add:
   - `https://mihasv3.pages.dev/auth/callback`
   - `https://mihasv3.pages.dev/admin`
   - `https://mihasv3.pages.dev/student/dashboard`

## Step 5: Setup Storage (5 minutes)

1. Supabase Dashboard → Storage
2. Create buckets:
   - `applications` (private)
   - `documents` (private)
   - `public` (public)
3. Set policies:
```sql
-- Allow authenticated users to upload
CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Allow users to read own documents
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (auth.uid()::text = (storage.foldername(name))[1]);
```

## Step 6: Create Admin User (5 minutes)

```sql
-- Create admin profile
INSERT INTO profiles (id, email, full_name, role)
VALUES (
  'your-user-id',
  '***REMOVED***',
  'System Administrator',
  'super_admin'
);

-- Add admin role
INSERT INTO user_roles (user_id, role)
VALUES ('your-user-id', 'super_admin');
```

## Step 7: Configure Email (10 minutes)

### Option A: Supabase Email (Quick)
1. Supabase Dashboard → Authentication → Email Templates
2. Customize templates
3. Enable email confirmations

### Option B: Custom SMTP (Recommended)
1. Get SMTP credentials (Gmail, SendGrid, etc.)
2. Supabase Dashboard → Project Settings → Auth
3. SMTP Settings:
   - Host: smtp.gmail.com
   - Port: 587
   - Username: your-email@gmail.com
   - Password: app-password

## Step 8: Setup Monitoring (10 minutes)

### 8.1 Sentry
1. Create project at https://sentry.io
2. Copy DSN
3. Add to Cloudflare environment variables:
   - `VITE_SENTRY_DSN=your-dsn`
4. Redeploy

### 8.2 Uptime Monitoring
1. Go to https://uptimerobot.com
2. Add monitor:
   - Type: HTTPS
   - URL: https://mihasv3.pages.dev
   - Interval: 5 minutes

## Step 9: Custom Domain (15 minutes)

1. Cloudflare Pages → Custom domains
2. Add domain: `mihasv3.pages.dev`
3. Update DNS records (automatic if using Cloudflare DNS)
4. Wait for SSL certificate (5-10 minutes)

## Step 10: Final Verification

### Checklist
- [ ] Homepage loads
- [ ] User can register
- [ ] User can login
- [ ] Student can create application
- [ ] Documents upload works
- [ ] Admin can login
- [ ] Admin can view applications
- [ ] Payment verification works
- [ ] Email notifications work
- [ ] Sentry receives errors

### Test Accounts
Create test accounts for each role:
```sql
-- Student
INSERT INTO profiles (id, email, role) 
VALUES ('uuid', 'student@test.com', 'student');

-- Admin
INSERT INTO profiles (id, email, role) 
VALUES ('uuid', 'admin@test.com', 'admin');
```

## Rollback Plan

If deployment fails:

```bash
# Revert to previous deployment
wrangler pages deployment list --project-name=mihas
wrangler pages deployment rollback <deployment-id>

# Or via dashboard
# Cloudflare Pages → Deployments → Rollback
```

## Post-Deployment

### Week 1
- [ ] Monitor error rates in Sentry
- [ ] Check application submission success rate
- [ ] Verify email delivery
- [ ] Test payment flow end-to-end
- [ ] Review performance metrics

### Week 2
- [ ] Enable leaked password protection
- [ ] Review security advisors
- [ ] Optimize slow queries
- [ ] Add database backups

## Troubleshooting

### Build Fails
```bash
# Clear cache
rm -rf node_modules dist
npm install
npm run build:prod
```

### Database Connection Issues
- Check Supabase project is active
- Verify environment variables
- Check RLS policies allow access

### Email Not Sending
- Verify SMTP credentials
- Check email templates configured
- Test with Supabase test email

## Support

- Technical: ***REMOVED***
- Documentation: See `/docs` folder
- Issues: GitHub Issues

## Estimated Total Time: 1.5 hours
