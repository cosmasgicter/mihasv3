# Cron Job Configuration

## Setup on cron-job.org

### Job Details
- **Name**: Processing Email
- **URL**: `***REMOVED***/cron/process-email-queue`
- **Method**: POST
- **Schedule**: `* * * * *` (Every 1 minute)

### Headers (IMPORTANT)
Add this custom header for authentication:
```
X-Cron-Key: C6MWtFE5fuFw90CA2KWqAKqlyaILQaL9B3SsIJWFWpc=
```

### Steps to Configure:
1. Login to https://cron-job.org
2. Go to "Cronjobs" → "Create cronjob"
3. Fill in:
   - **Title**: Processing Email
   - **Address**: `***REMOVED***/cron/process-email-queue`
   - **Schedule**: Every 1 minute (or use: `* * * * *`)
   - **Request method**: POST
4. Click "Advanced" or "Headers"
5. Add custom header:
   - **Name**: `X-Cron-Key`
   - **Value**: `C6MWtFE5fuFw90CA2KWqAKqlyaILQaL9B3SsIJWFWpc=`
6. Save and enable the job

### Verification
After setup, check execution history on cron-job.org dashboard:
- Status should be 200 OK
- Response: `{"success":true,"processed":X}`

### Monitoring
Check email queue status:
```sql
SELECT status, COUNT(*) FROM email_queue GROUP BY status;
```

Expected results:
- Most emails should have status='sent'
- Few or no emails with status='pending'
- Monitor for status='failed'
