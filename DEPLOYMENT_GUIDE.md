# MIHAS Application System V2 - Deployment Guide

## 🚀 Quick Deployment to Netlify

### Prerequisites
- Netlify account
- Access to MIHAS Supabase project
- Environment variables provided

### Step 1: Upload to Netlify
1. Zip the entire `mihas-application-v2` directory
2. Go to [Netlify](https://app.netlify.com)
3. Drag and drop the zip file or connect GitHub repository

### Step 2: Configure Build Settings
```
Build command: npm run build:prod
Publish directory: dist
```

### Step 3: Set Environment Variables
In Netlify Dashboard → Site Settings → Environment Variables, add:

```
VITE_SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw
VITE_API_BASE_URL=https://application.mihas.edu.zm
VITE_APP_BASE_URL=https://application.mihas.edu.zm
VITE_TURNSTILE_SITE_KEY=0x4AAAAAABzNXd6hf1VUxD3X
VITE_ANALYTICS_BASE_URL=https://cloud.umami.is
VITE_ANALYTICS_SITE_ID=a6f829ab-c066-457f-aaa7-bf6ce4cc8ed4
VITE_ANALYTICS_SHARE_TOKEN=api_4EXvHonSvmleHIuNPSelVgFQugvYMZNr
VITE_ENABLE_OCR=true
VITE_ENABLE_SMART_MATCHING=true
VITE_AUTO_SAVE_INTERVAL=30000
VITE_API_CACHE_TTL=300000
VITE_ENABLE_PERFORMANCE_MONITORING=true
VITE_ENABLE_DRAFT_MANAGEMENT=true
```

### Step 4: Deploy
1. Click "Deploy site"
2. Wait for build to complete
3. Visit your deployed application

## 🔧 Manual Deployment (Alternative)

### Local Build
```bash
# Navigate to project directory
cd mihas-application-v2

# Install dependencies
npm install

# Build for production
npm run build:prod

# The dist/ folder contains deployable files
```

### Upload dist/ folder to any static hosting service:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Azure Static Web Apps

## 🎯 V2 Features Included

### Performance Improvements
- ✅ Enhanced loading components
- ✅ API response caching
- ✅ Image compression
- ✅ Database optimization utilities

### Mobile Enhancements  
- ✅ Touch-optimized navigation
- ✅ 44px minimum touch targets
- ✅ Mobile-first design improvements
- ✅ Enhanced mobile buttons

### File Upload Improvements
- ✅ Drag & drop support
- ✅ Client-side image compression
- ✅ Progress tracking
- ✅ Enhanced validation

### Auto-Save & Draft Management
- ✅ Auto-save every 30 seconds
- ✅ Session recovery
- ✅ Draft warnings
- ✅ Timeout handling

### Smart Features
- ✅ OCR auto-fill capability
- ✅ Duplicate detection
- ✅ Smart matching algorithms
- ✅ Grade calculator

### Admin Tools
- ✅ Bulk operations
- ✅ Enhanced filtering
- ✅ Improved export functionality
- ✅ Performance dashboard

## 🛠️ Troubleshooting

### Build Issues
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check TypeScript errors
npm run type-check

# Build with verbose output
npm run build:prod -- --verbose
```

### Environment Variable Issues
- Ensure all VITE_ prefixed variables are set
- Check for typos in variable names
- Verify Supabase URLs and keys are correct

### Performance Issues
- Enable performance monitoring: `VITE_ENABLE_PERFORMANCE_MONITORING=true`
- Check network connectivity to Supabase
- Monitor Core Web Vitals in browser dev tools

## 📞 Support
- Check browser console for errors
- Verify environment variables in Netlify
- Test API endpoints manually
- Contact support with error logs if needed

---

**Status**: ✅ Ready for Production Deployment
**Version**: V2 with all improvements integrated