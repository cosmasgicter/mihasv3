# Cloudflare Pages Deployment Guide

## Overview

This guide covers the complete deployment process for the MIHAS Application System on Cloudflare Pages, including configuration, optimization, testing, and monitoring.

## Prerequisites

- Cloudflare account with Pages access
- Wrangler CLI installed: `npm install -g wrangler`
- Node.js 20.18.0 or higher
- Git repository connected to Cloudflare Pages

## Configuration Files

### 1. wrangler.toml

Primary configuration file for Cloudflare Pages:

```toml
name = "mihasv3"
compatibility_date = "2025-01-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"

[build]
command = "npm run build:prod"
cwd = "."
watch_dirs = ["src", "functions"]

[build.environment]
NODE_VERSION = "20.18.0"
NPM_VERSION = "10.0.0"

[vars]
# Environment variables
VITE_APP_VERSION = "1.0.0"
# ... (see wrangler.toml for full list)

[ai]
binding = "AI"

[observability]
enabled = true
head_sampling_rate = 1.0
```

### 2. _routes.json

Routing configuration that defines which paths invoke edge functions:

**Key Principles:**
- **Include:** Paths that should invoke edge functions
- **Exclude:** Static assets that should be served directly from CDN

**Optimizations:**
- Specific route patterns instead of wildcards
- Comprehensive exclusions for static assets
- Prevents unnecessary function invocations

### 3. _headers

CDN caching and security headers configuration:

**Cache Strategy:**
- **HTML:** `max-age=0` (always fresh)
- **Hashed Assets:** `max-age=31536000, immutable` (1 year)
- **Images:** `max-age=2592000` (30 days)
- **Manifest:** `max-age=3600` (1 hour)
- **Service Worker:** `max-age=0` (always fresh)

**Security Headers:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY/SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Build Process

### Production Build

```bash
npm run build:prod
```

This command:
1. Optimizes images
2. Compiles TypeScript
3. Builds with Vite (production mode)
4. Inlines critical CSS
5. Prerenders landing page
6. Generates optimized bundles

### Build Output

```
dist/
├── index.html              # Entry point
├── assets/                 # Hashed bundles
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── ...
├── images/                 # Optimized images
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
└── _headers                # CDN configuration
```

## Deployment Methods

### Method 1: Wrangler CLI (Recommended)

```bash
# Build and deploy
npm run build:prod
wrangler pages deploy dist --project-name=mihas

# Or use the combined command
npm run deploy:cf
```

### Method 2: Git Integration

1. Push to connected Git repository
2. Cloudflare Pages automatically builds and deploys
3. Monitor build logs in Cloudflare dashboard

### Method 3: Direct Upload

```bash
# Deploy specific directory
wrangler pages deploy dist
```

## Environment Variables

### Required Variables

Set in Cloudflare Pages dashboard under Settings > Environment Variables:

**Production:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `CRON_SECRET_KEY`

**Preview:**
- Same as production but with test/staging values

### Variable Precedence

1. wrangler.toml `[vars]` section (lowest priority)
2. Environment-specific variables in dashboard
3. Secrets (highest priority)

## Testing Deployment

### 1. Pre-Deployment Tests

```bash
# Run all tests
npm run test:production-ready

# Specific test suites
npm run test:unit:coverage
npm run test:e2e
npm run test:performance
```

### 2. Edge Function Performance Audit

```bash
# Audit all edge functions
node scripts/audit-edge-functions.js
```

**Targets:**
- CPU time < 50ms
- Memory usage < 128MB
- File size < 100KB
- Complexity < 20

### 3. CDN Caching Verification

```bash
# Verify caching configuration
node scripts/verify-cdn-caching.js
```

Checks:
- Cache-Control headers
- X-Cache status (HIT/MISS)
- Asset caching
- Security headers

### 4. Full Deployment Test

```bash
# Test deployed application
node scripts/test-cloudflare-deployment.js
```

Tests:
- Endpoint availability
- Response times
- Security headers
- CDN integration
- Function performance

## Performance Optimization

### 1. Code Splitting

Configured in `vite.config.production.ts`:

```javascript
manualChunks: {
  'react-vendor': ['react', 'react-dom', 'react-router-dom'],
  'supabase': ['@supabase/supabase-js'],
  'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
  'ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
}
```

### 2. Asset Optimization

- Images compressed with Sharp
- CSS minified and inlined (critical)
- JavaScript minified with Terser
- Tree shaking enabled

### 3. Caching Strategy

**Browser Cache:**
- Service Worker for offline support
- React Query for API caching
- LocalStorage for user preferences

**CDN Cache:**
- Long-term caching for hashed assets
- Short-term caching for HTML
- Stale-while-revalidate for images

### 4. Edge Function Optimization

- Specific column selection in queries
- Query result limits
- Proper error handling
- Minimal dependencies

## Monitoring

### 1. Cloudflare Analytics

Monitor in Cloudflare dashboard:
- Request volume
- Response times
- Error rates
- Cache hit ratio
- Geographic distribution

### 2. Performance Metrics

Track Web Vitals:
- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1
- **FCP** (First Contentful Paint): < 1.5s
- **TTFB** (Time to First Byte): < 600ms

### 3. Error Tracking

Sentry integration:
- Frontend errors
- API errors
- Performance issues
- User feedback

### 4. Uptime Monitoring

Set up external monitoring:
- Health check endpoint: `/health`
- Alert on downtime
- Monitor response times

## Rollback Procedure

### Quick Rollback

1. Go to Cloudflare Pages dashboard
2. Navigate to Deployments
3. Find previous working deployment
4. Click "Rollback to this deployment"

### Manual Rollback

```bash
# Deploy specific commit
git checkout <previous-commit>
npm run build:prod
wrangler pages deploy dist
```

## Troubleshooting

### Build Failures

**Issue:** Build fails with memory error
**Solution:** Increase Node memory: `NODE_OPTIONS=--max-old-space-size=4096`

**Issue:** TypeScript errors
**Solution:** Run `npm run type-check` locally first

### Function Errors

**Issue:** Function timeout
**Solution:** Optimize database queries, add indexes

**Issue:** Memory limit exceeded
**Solution:** Reduce bundle size, optimize data processing

### Caching Issues

**Issue:** Users seeing old version
**Solution:** 
1. Verify `VITE_APP_VERSION` is updated
2. Check service worker update prompt
3. Clear Cloudflare cache manually

**Issue:** Assets not caching
**Solution:** Verify `_headers` file is in dist directory

### Performance Issues

**Issue:** Slow page loads
**Solution:**
1. Run Lighthouse audit
2. Check bundle sizes
3. Optimize images
4. Review database queries

## Best Practices

### 1. Version Management

- Update `VITE_APP_VERSION` on each deployment
- Use semantic versioning
- Tag releases in Git

### 2. Environment Separation

- Use separate Cloudflare projects for staging/production
- Test in staging before production
- Use environment-specific variables

### 3. Security

- Rotate secrets regularly
- Use service role key only in functions
- Implement rate limiting
- Monitor for suspicious activity

### 4. Performance

- Monitor Core Web Vitals
- Run performance audits monthly
- Optimize slow endpoints
- Review bundle sizes

### 5. Reliability

- Test before deploying
- Monitor error rates
- Have rollback plan ready
- Document incidents

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Performance audit completed
- [ ] Security audit completed
- [ ] Environment variables configured
- [ ] Version number updated
- [ ] Changelog updated

### Deployment

- [ ] Build successful
- [ ] Functions deployed
- [ ] Assets uploaded
- [ ] DNS configured (if needed)
- [ ] SSL certificate active

### Post-Deployment

- [ ] Health check passing
- [ ] CDN caching verified
- [ ] Performance metrics acceptable
- [ ] Error rates normal
- [ ] User testing completed
- [ ] Monitoring alerts configured

## Support

### Resources

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [MIHAS Documentation](./README.md)

### Getting Help

1. Check Cloudflare status page
2. Review deployment logs
3. Check error tracking (Sentry)
4. Contact Cloudflare support

## Conclusion

Following this guide ensures reliable, performant deployments of the MIHAS Application System on Cloudflare Pages. Regular monitoring and optimization maintain excellent user experience.

**Current Status:** ✅ Optimized and Production Ready

**Last Updated:** January 2025
