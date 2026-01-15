# Cron Setup for Cloudflare Pages

Cloudflare Pages doesn't support cron triggers in wrangler.toml. Set up manually:

## Option 1: External Cron Service (Recommended)

Use a free service to call the endpoint every 2 minutes:

### Using cron-job.org (Free)
1. Go to https://cron-job.org
2. Create account
3. Add new cron job:
   - URL: `https://apply.mihas.edu.zm/cron/process-email-queue`
   - Method: POST
   - Schedule: `*/2 * * * *` (every 2 minutes)

### Using EasyCron (Free)
1. Go to https://www.easycron.com
2. Create account
3. Add cron job:
   - URL: `https://apply.mihas.edu.zm/cron/process-email-queue`
   - Interval: Every 2 minutes

## Option 2: Cloudflare Worker (Paid)

Convert to a Worker with cron trigger (requires Workers Paid plan):

1. Create separate Worker project
2. Add cron trigger in wrangler.toml
3. Worker calls the Pages endpoint

## Option 3: Manual Trigger

Call manually when needed:
```bash
curl -X POST https://apply.mihas.edu.zm/cron/process-email-queue
```

## Current Status

✅ Email queue system working
✅ Endpoint ready: `/cron/process-email-queue`
⏳ Needs external cron service configured
