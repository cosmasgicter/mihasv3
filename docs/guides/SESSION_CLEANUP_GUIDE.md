# Session Auto-Cleanup Implementation

## Overview
Automatic termination of inactive sessions after 30 days to maintain security and prevent session persistence.

## Implementation

### 1. Real-time Cleanup (Per User)
**File**: `functions/api/sessions.js`
**Trigger**: Every time a user views their active sessions
**Logic**: 
```javascript
async function cleanupOldSessions(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  await supabaseAdminClient
    .from('device_sessions')
    .update({ is_active: false })
    .eq('user_id', userId)
    .lt('last_activity', thirtyDaysAgo.toISOString());
}
```

### 2. Scheduled Cleanup (System-wide)
**File**: `functions/cron/cleanup-sessions.js`
**Endpoint**: `https://apply.mihas.edu.zm/cron/cleanup-sessions`
**Trigger**: Manual or scheduled via cron job
**Logic**: Deactivates all sessions inactive for 30+ days

## How It Works

### User Session View Flow
1. User opens Settings → Active Sessions
2. Frontend calls `GET /api/sessions`
3. Backend runs `cleanupOldSessions(userId)` first
4. Returns only active sessions (< 30 days old)
5. Old sessions automatically marked inactive

### Scheduled Cleanup Flow
1. Cron job calls `POST /cron/cleanup-sessions`
2. Finds all sessions with `last_activity < 30 days ago`
3. Sets `is_active = false` for those sessions
4. Returns count of cleaned sessions

## Session Lifecycle

```
Day 0:  Session created → is_active = true
Day 1-29: User active → last_activity updated
Day 30: No activity → Session marked inactive
Day 31+: Session hidden from user's active sessions list
```

## Configuration

### Cleanup Interval
**Current**: 30 days
**Location**: Both files use same logic
**To Change**: Update `thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)`

### Recommended Cron Schedule
```
# Run daily at 2 AM
0 2 * * * curl -X POST https://apply.mihas.edu.zm/cron/cleanup-sessions
```

## Testing

### Test Real-time Cleanup
1. Create test session with old `last_activity`
2. View active sessions in Settings
3. Verify old session is removed

### Test Scheduled Cleanup
```bash
curl -X POST https://apply.mihas.edu.zm/cron/cleanup-sessions
```

Expected response:
```json
{
  "success": true,
  "cleaned": 5,
  "message": "Cleaned up 5 inactive sessions"
}
```

## Database Schema

### device_sessions table
```sql
- id: uuid
- user_id: uuid
- device_id: text
- device_info: text
- last_activity: timestamp
- is_active: boolean
- session_token: text
- created_at: timestamp
```

## Security Benefits

1. **Automatic Cleanup**: No manual intervention needed
2. **Per-User Isolation**: Each user's cleanup runs independently
3. **Immediate Effect**: Old sessions removed on next view
4. **System-wide Backup**: Cron job catches any missed sessions
5. **No Data Loss**: Sessions marked inactive, not deleted

## Monitoring

### Check Cleanup Status
```sql
-- Count inactive sessions
SELECT COUNT(*) FROM device_sessions WHERE is_active = false;

-- Sessions cleaned in last 24 hours
SELECT COUNT(*) FROM device_sessions 
WHERE is_active = false 
AND updated_at > NOW() - INTERVAL '24 hours';
```

## Troubleshooting

### Sessions Not Cleaning Up
1. Check `last_activity` timestamp format
2. Verify 30-day calculation
3. Check database permissions
4. Review function logs

### Too Many Active Sessions
1. Run manual cleanup: `POST /cron/cleanup-sessions`
2. Check if `last_activity` is being updated
3. Verify session tracking is working

## Future Enhancements

1. Configurable cleanup interval per user role
2. Email notification before session expiry
3. Grace period for reactivation
4. Session activity analytics
5. Suspicious activity detection
