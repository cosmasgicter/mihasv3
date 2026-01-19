# Error Monitoring Setup Guide

## 🎯 Quick Setup (15 minutes)

---

## Option 1: Sentry (Recommended) ⭐

### Why Sentry?
- Free tier: 5,000 errors/month
- Real-time error tracking
- Source maps support
- Performance monitoring
- Easy integration

### Setup Steps:

1. **Create Sentry Account**
   - Go to https://sentry.io/signup/
   - Create free account
   - Create new project: "MIHAS Application System"
   - Select "React" as platform

2. **Get DSN**
   - Copy your DSN from project settings
   - Format: `https://xxxxx@sentry.io/xxxxx`

3. **Install Sentry**
   ```bash
   npm install @sentry/react @sentry/vite-plugin
   ```

4. **Configure Sentry** (Add to `src/main.tsx`):
   ```typescript
   import * as Sentry from "@sentry/react";

   Sentry.init({
     dsn: "YOUR_SENTRY_DSN",
     environment: "production",
     tracesSampleRate: 0.1,
     integrations: [
       new Sentry.BrowserTracing(),
       new Sentry.Replay({
         maskAllText: true,
         blockAllMedia: true,
       }),
     ],
   });
   ```

5. **Add to Cloudflare Environment**
   - Go to Cloudflare Pages dashboard
   - Settings → Environment Variables
   - Add: `VITE_SENTRY_DSN=your-dsn-here`

6. **Deploy**
   ```bash
   git add -A
   git commit -m "Add Sentry error monitoring"
   git push
   ```

**Done!** Errors will now appear in Sentry dashboard.

---

## Option 2: Cloudflare Analytics (Already Enabled) ✅

### What's Included:
- ✅ Page views
- ✅ Performance metrics
- ✅ Geographic data
- ✅ Device/browser stats

### Access:
1. Go to Cloudflare dashboard
2. Select your Pages project
3. Click "Analytics" tab

**No setup needed** - already working!

---

## Option 3: Supabase Monitoring (Already Enabled) ✅

### What's Included:
- ✅ Database performance
- ✅ API requests
- ✅ Error logs
- ✅ Query performance

### Access:
1. Go to https://supabase.com/dashboard
2. Select project: `mylgegkqoddcrxtwcclb`
3. Click "Reports" or "Logs"

**No setup needed** - already working!

---

## Uptime Monitoring (5 minutes)

### Option A: UptimeRobot (Free)

1. **Sign up**: https://uptimerobot.com/
2. **Add Monitor**:
   - Type: HTTP(s)
   - URL: `https://mihasv3.pages.dev`
   - Name: "MIHAS Application System"
   - Interval: 5 minutes
3. **Add Alert**:
   - Email: `***REMOVED***`
   - SMS: Optional

### Option B: Pingdom (Free Trial)

1. **Sign up**: https://www.pingdom.com/
2. **Add Check**:
   - URL: `https://mihasv3.pages.dev`
   - Check interval: 1 minute
3. **Configure Alerts**

---

## Email Alerts (Already Configured) ✅

### Current Setup:
- ✅ Resend API configured
- ✅ Email: `***REMOVED***`
- ✅ Notifications working

### Test:
```bash
# Test email notification
curl -X POST https://mihasv3.pages.dev/notifications/send \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","title":"Test","content":"Test notification"}'
```

---

## Logging (Cloudflare Pages)

### View Logs:
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login
wrangler login

# Tail logs in real-time
wrangler pages deployment tail
```

### Or via Dashboard:
1. Cloudflare Dashboard → Pages
2. Select project
3. View → Functions logs

---

## Performance Monitoring

### Already Enabled:
- ✅ Cloudflare Analytics
- ✅ Supabase Performance Insights
- ✅ Browser Performance API

### Add Custom Metrics (Optional):
```typescript
// In src/lib/monitoring.ts
export function trackPerformance(metric: string, value: number) {
  if (window.performance && window.performance.mark) {
    window.performance.mark(metric);
  }
  
  // Send to analytics
  fetch('/api/metrics', {
    method: 'POST',
    body: JSON.stringify({ metric, value, timestamp: Date.now() })
  });
}
```

---

## Recommended Monitoring Stack

### Minimal (Free):
- ✅ Cloudflare Analytics (already enabled)
- ✅ Supabase Monitoring (already enabled)
- ✅ UptimeRobot (5 min setup)

### Standard (Recommended):
- ✅ Above +
- ⏳ Sentry (15 min setup)
- ⏳ Email alerts configured

### Enterprise:
- Above +
- New Relic / DataDog
- PagerDuty for on-call
- Custom dashboards

---

## Quick Start Checklist

**5-Minute Setup** (Minimum):
- [ ] Sign up for UptimeRobot
- [ ] Add uptime monitor for mihasv3.pages.dev
- [ ] Configure email alert to ***REMOVED***
- [ ] Test alert by pausing monitor

**15-Minute Setup** (Recommended):
- [ ] Above +
- [ ] Sign up for Sentry
- [ ] Install Sentry SDK
- [ ] Add DSN to environment variables
- [ ] Deploy and test error tracking

**30-Minute Setup** (Complete):
- [ ] Above +
- [ ] Set up Slack webhook for alerts
- [ ] Configure custom error boundaries
- [ ] Add performance tracking
- [ ] Create monitoring dashboard

---

## Testing Your Monitoring

### Test Error Tracking:
```typescript
// Add to any page temporarily
throw new Error("Test error - monitoring check");
```

### Test Uptime Alerts:
- Pause your uptime monitor
- Wait for alert email
- Resume monitor

### Test Email Notifications:
- Trigger application status change
- Verify email received

---

## Monitoring Checklist

| Service | Status | Setup Time | Priority |
|---------|--------|------------|----------|
| Cloudflare Analytics | ✅ Active | 0 min | HIGH |
| Supabase Monitoring | ✅ Active | 0 min | HIGH |
| Email Notifications | ✅ Active | 0 min | HIGH |
| Uptime Monitoring | ⏳ Pending | 5 min | HIGH |
| Error Tracking (Sentry) | ⏳ Pending | 15 min | MEDIUM |
| Performance Monitoring | ✅ Active | 0 min | MEDIUM |
| Log Aggregation | ✅ Active | 0 min | LOW |

---

## Support Contacts

**Cloudflare Support**: https://dash.cloudflare.com/support  
**Supabase Support**: https://supabase.com/dashboard/support  
**Sentry Support**: https://sentry.io/support/  

---

**Next Steps**: 
1. Set up UptimeRobot (5 min)
2. Install Sentry (15 min)
3. Test all monitoring
4. Document in runbook

**Total Setup Time**: 20 minutes for production-ready monitoring
