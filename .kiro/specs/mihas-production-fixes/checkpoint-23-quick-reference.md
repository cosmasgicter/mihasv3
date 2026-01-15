# Checkpoint 23 Quick Reference Guide

## Overview

This guide provides quick commands and checks for verifying cache and deployment functionality.

---

## Quick Verification Commands

### 1. Run Full Verification
```bash
node scripts/verify-checkpoint-23.js
```
**Expected:** All 43 checks pass (100% success rate)

### 2. Test Deployment Process
```bash
node scripts/test-deployment-process.js
```
**Expected:** Build completes, all assets hashed, service worker generated

### 3. Build for Production
```bash
npm run build:prod
```
**Expected:** dist/ directory created with optimized assets

### 4. Deploy to Cloudflare Pages
```bash
npm run deploy
# or
wrangler pages deploy dist
```

---

## Manual Verification Checklist

### Cache Invalidation
- [ ] Service worker uses `VITE_APP_VERSION`
- [ ] Cache names include version suffix
- [ ] Old caches deleted on activation
- [ ] Clients notified of cache updates

### Service Worker Update Flow
- [ ] Update detection works
- [ ] Version tracking functional
- [ ] SKIP_WAITING message sent
- [ ] Page reloads on controller change
- [ ] Periodic update checks (every 60s)

### Cache Headers
- [ ] HTML: `max-age=0, must-revalidate`
- [ ] JS/CSS: `max-age=31536000, immutable`
- [ ] Service Worker: `max-age=0`
- [ ] API: `no-store, no-cache`

### Draft System
- [ ] Auto-save every 8 seconds
- [ ] Offline queueing works
- [ ] Conflict resolution available
- [ ] Data persists to localStorage
- [ ] Restores on page load

---

## Key Files

### Configuration Files
- `wrangler.toml` - Cloudflare Pages configuration
- `vite.config.production.ts` - Build configuration
- `.env.example` - Environment variables template
- `public/_headers` - Static asset cache headers
- `functions/_headers` - API cache headers
- `public/_routes.json` - Cloudflare routing

### Implementation Files
- `src/service-worker.ts` - Service worker with cache strategies
- `src/hooks/useServiceWorkerUpdate.ts` - Update detection hook
- `src/hooks/useAutoSave.ts` - Auto-save implementation
- `src/pages/student/applicationWizard/hooks/useSmartAutoSave.ts` - Smart auto-save
- `src/hooks/queries/useSupabaseQuery.ts` - React Query cache config

### Verification Scripts
- `scripts/verify-checkpoint-23.js` - Full verification script
- `scripts/test-deployment-process.js` - Deployment test script

### Monitoring Components
- `src/components/admin/CacheMonitor.tsx` - Cache monitoring dashboard

---

## Environment Variables

### Required for Cache Invalidation
```env
VITE_APP_VERSION=1.0.0
```

### Update Version for New Deployment
1. Edit `.env.production` or set in Cloudflare Pages dashboard
2. Increment version: `1.0.0` → `1.0.1`
3. Build and deploy
4. Old caches automatically invalidated

---

## Cache Strategies

### Service Worker Caching

| Resource Type | Strategy | Max Age | Cache Name Pattern |
|--------------|----------|---------|-------------------|
| Images | CacheFirst | 30 days | `mihas-app-images-v{VERSION}` |
| CSS/JS | CacheFirst | 7 days | `mihas-app-assets-v{VERSION}` |
| Fonts | CacheFirst | 1 year | `mihas-app-fonts-v{VERSION}` |
| API (high volatility) | NetworkFirst | 1 min | `mihas-app-api-high-volatility-v{VERSION}` |
| API (medium volatility) | NetworkFirst | 15 min | `mihas-app-api-medium-volatility-v{VERSION}` |
| API (low volatility) | NetworkFirst | 30 min | `mihas-app-api-low-volatility-v{VERSION}` |
| Auth | NetworkOnly | N/A | Not cached |

### React Query Caching

| Data Type | Stale Time | GC Time | Use Case |
|-----------|-----------|---------|----------|
| Auth | 10 min | 30 min | Session data |
| Applications | 1 min | 5 min | Active applications |
| Users | 15 min | 30 min | User profiles |
| Analytics | 30 min | 60 min | Reports |
| Static | 2 hours | 24 hours | Catalog data |
| Realtime | 15 sec | 60 sec | Notifications |

---

## Troubleshooting

### Issue: Users Not Getting Latest Version

**Check:**
1. Verify `VITE_APP_VERSION` is updated
2. Check service worker is active: `navigator.serviceWorker.controller`
3. Check for update prompt in UI
4. Clear browser cache manually

**Fix:**
```javascript
// In browser console
navigator.serviceWorker.getRegistration().then(reg => reg.update())
```

### Issue: Cache Not Invalidating

**Check:**
1. Service worker activation event
2. Cache names include version
3. Old caches being deleted

**Fix:**
```javascript
// In browser console
caches.keys().then(names => {
  names.forEach(name => caches.delete(name))
})
location.reload()
```

### Issue: Auto-Save Not Working

**Check:**
1. `useSmartAutoSave` hook is called
2. `enabled` prop is true
3. `interval` is 8000ms
4. localStorage is available

**Debug:**
```javascript
// In browser console
localStorage.getItem('wizard_autosave_/apply')
```

### Issue: Offline Mode Not Working

**Check:**
1. Service worker is registered
2. Network status detection works
3. Save queue is populated

**Debug:**
```javascript
// In browser console
navigator.onLine // Should be false when offline
```

---

## Monitoring Cache Performance

### Using CacheMonitor Component

1. Navigate to admin dashboard
2. Add CacheMonitor component to a page
3. View cache statistics:
   - Total caches
   - Total size
   - Active cache names
   - Version information

### Manual Cache Inspection

```javascript
// In browser console

// List all caches
caches.keys().then(console.log)

// Get cache size
async function getCacheSize() {
  const names = await caches.keys()
  let total = 0
  for (const name of names) {
    const cache = await caches.open(name)
    const requests = await cache.keys()
    for (const req of requests) {
      const res = await cache.match(req)
      const blob = await res.blob()
      total += blob.size
    }
  }
  console.log('Total cache size:', (total / 1024 / 1024).toFixed(2), 'MB')
}
getCacheSize()

// Check service worker version
navigator.serviceWorker.getRegistration().then(reg => {
  const mc = new MessageChannel()
  mc.port1.onmessage = e => console.log('Version:', e.data)
  reg.active.postMessage({ type: 'GET_VERSION' }, [mc.port2])
})
```

---

## Deployment Workflow

### Standard Deployment

1. **Update Version**
   ```bash
   # Edit .env.production or wrangler.toml
   VITE_APP_VERSION=1.0.1
   ```

2. **Build**
   ```bash
   npm run build:prod
   ```

3. **Verify Build**
   ```bash
   node scripts/test-deployment-process.js
   ```

4. **Deploy**
   ```bash
   npm run deploy
   ```

5. **Verify Deployment**
   - Check Cloudflare Pages dashboard
   - Visit production URL
   - Verify service worker updates
   - Test cache invalidation

### Emergency Cache Clear

If users report seeing old content:

1. **Increment Version**
   ```bash
   VITE_APP_VERSION=1.0.2
   ```

2. **Deploy Immediately**
   ```bash
   npm run build:prod && npm run deploy
   ```

3. **Notify Users**
   - Update prompt will appear automatically
   - Users can click "Update Now"
   - Page reloads with new version

---

## Performance Targets

### Cache Performance
- Cache hit rate: > 80%
- Cache size: < 50MB
- Cache lookup time: < 10ms

### Service Worker Performance
- Installation time: < 2s
- Activation time: < 1s
- Update detection: < 60s

### Auto-Save Performance
- Save interval: 8s (exact)
- Save operation: < 500ms
- Offline queue: Unlimited
- Retry attempts: Max 5

---

## Success Criteria

✅ **Checkpoint 23 is complete when:**

1. All 43 verification checks pass
2. Service worker installs and activates correctly
3. Cache invalidation works on version change
4. Update prompt appears for new versions
5. Auto-save works every 8 seconds
6. Offline mode saves to localStorage
7. Build process completes successfully
8. Deployment to Cloudflare Pages works

---

## Additional Resources

- [Workbox Documentation](https://developers.google.com/web/tools/workbox)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [Cloudflare Pages](https://developers.cloudflare.com/pages)
- [React Query Caching](https://tanstack.com/query/latest/docs/react/guides/caching)

---

**Last Updated:** January 15, 2026  
**Checkpoint:** Task 23 - Cache and Deployment Verification
