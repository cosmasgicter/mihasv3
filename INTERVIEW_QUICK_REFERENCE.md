# INTERVIEW SCHEDULING - QUICK REFERENCE

## 🚀 Quick Start

### Admin: Schedule Interview
```tsx
import { InterviewScheduler } from '@/components/admin/InterviewScheduler'

<InterviewScheduler 
  applicationId={applicationId}
  onSuccess={() => reload()}
/>
```

### Student: View Interview
```tsx
import { InterviewDetails } from '@/components/student/InterviewDetails'

<InterviewDetails interview={interview} />
```

---

## 📡 API Usage

### Fetch Interview
```javascript
const response = await fetch(`/api/applications/interview/${applicationId}`)
const { data } = await response.json()
```

### Schedule Interview
```javascript
await fetch(`/api/applications/interview/${applicationId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scheduled_at: '2025-02-01T10:00:00Z',
    mode: 'virtual',
    location: 'https://meet.google.com/abc-defg-hij',
    notes: 'Please join 5 minutes early'
  })
})
```

### Reschedule Interview
```javascript
await fetch(`/api/applications/interview/${applicationId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scheduled_at: '2025-02-02T14:00:00Z',
    mode: 'in-person',
    location: 'Room 101, Admin Block',
    status: 'scheduled'
  })
})
```

### Cancel Interview
```javascript
await fetch(`/api/applications/interview/${applicationId}`, {
  method: 'DELETE'
})
```

---

## 🗄️ Database

### Table: `application_interviews`
```sql
SELECT * FROM application_interviews 
WHERE application_id = 'uuid';
```

### Insert Interview
```sql
INSERT INTO application_interviews (
  application_id, scheduled_at, mode, location, 
  status, notes, created_by, updated_by
) VALUES (
  'app-uuid', '2025-02-01 10:00:00+00', 'virtual',
  'https://meet.google.com/abc', 'scheduled',
  'Join early', 'admin-uuid', 'admin-uuid'
);
```

---

## 🔔 Notifications

Automatically sent on:
- ✅ Schedule → "📅 Interview Scheduled"
- ✅ Reschedule → "🔄 Interview Rescheduled"
- ✅ Cancel → "❌ Interview Cancelled"

---

## ✅ Status

**Complete**: Database, API, UI, Notifications  
**Ready**: Production use  
**Docs**: `INTERVIEW_SCHEDULING_COMPLETE.md`
