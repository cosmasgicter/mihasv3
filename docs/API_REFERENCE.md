# API Reference - MIHAS Application System

## Base URL

```
Production: ***REMOVED***
Development: http://localhost:8788
```

## Authentication

All API endpoints require authentication via JWT token in the Authorization header:

```http
Authorization: Bearer <jwt_token>
```

Get token from Supabase Auth after login.

## Rate Limiting

- **Limit**: 100 requests per minute per IP
- **Headers**: 
  - `X-RateLimit-Limit`: Total allowed
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Endpoints

### Applications

#### List Applications
```http
GET /applications
```

**Query Parameters**:
- `status` (optional): Filter by status
- `payment_status` (optional): Filter by payment status
- `program` (optional): Filter by program
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "application_number": "MIHAS202500001",
      "full_name": "John Doe",
      "email": "john@example.com",
      "status": "submitted",
      "payment_status": "pending_review",
      "submitted_at": "2025-01-20T10:00:00Z"
    }
  ],
  "total": 100
}
```

#### Get Application
```http
GET /applications/:id
```

**Parameters**:
- `id`: Application UUID

**Query Parameters**:
- `include`: Comma-separated list (grades,documents,statusHistory,interview)

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "application_number": "MIHAS202500001",
    "full_name": "John Doe",
    "email": "john@example.com",
    "phone": "+260977123456",
    "program": "Diploma in Nursing",
    "status": "submitted",
    "payment_status": "verified",
    "grades": [...],
    "documents": [...],
    "statusHistory": [...]
  }
}
```

#### Create Application
```http
POST /applications
```

**Request Body**:
```json
{
  "full_name": "John Doe",
  "email": "john@example.com",
  "phone": "+260977123456",
  "date_of_birth": "2000-01-01",
  "sex": "male",
  "nrc_number": "123456/78/9",
  "program": "Diploma in Nursing",
  "intake": "January 2025",
  "institution": "MIHAS"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "application_number": "MIHAS202500001",
    ...
  }
}
```

#### Update Application
```http
PATCH /applications/:id
```

**Request Body** (partial update):
```json
{
  "phone": "+260977999999",
  "residence_town": "Lusaka"
}
```

**Response**:
```json
{
  "success": true,
  "data": { ... }
}
```

#### Delete Application
```http
DELETE /applications/:id
```

**Response**:
```json
{
  "success": true,
  "message": "Application deleted"
}
```

#### Update Application Status
```http
PATCH /applications/:id/status
```

**Request Body**:
```json
{
  "status": "approved",
  "notes": "All requirements met"
}
```

**Valid Statuses**:
- `draft`
- `submitted`
- `under_review`
- `pending_documents`
- `approved`
- `rejected`

**Response**:
```json
{
  "success": true,
  "data": { ... }
}
```

#### Verify Payment
```http
POST /applications/:id/verify-payment
```

**Request Body**:
```json
{
  "payment_status": "verified",
  "notes": "Payment confirmed via MTN Money",
  "reference": "MTN123456789"
}
```

**Valid Payment Statuses**:
- `pending_review`
- `verified`
- `rejected`

**Response**:
```json
{
  "success": true,
  "data": {
    "payment_status": "verified",
    "payment_verified_at": "2025-01-20T10:00:00Z",
    "payment_verified_by": "***REMOVED***"
  }
}
```

### Grades

#### Add Grades
```http
POST /applications/:id/grades
```

**Request Body**:
```json
{
  "grades": [
    {
      "subject_id": "uuid",
      "grade": 2
    },
    {
      "subject_id": "uuid",
      "grade": 3
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "grades": [...],
    "total_points": 15,
    "best_five_points": 12
  }
}
```

#### Update Grades
```http
PUT /applications/:id/grades
```

**Request Body**: Same as Add Grades (replaces all grades)

### Documents

#### Upload Document
```http
POST /applications/:id/documents
```

**Request**: Multipart form data
- `file`: File to upload
- `document_type`: Type (result_slip, nrc, proof_of_payment, etc.)

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "file_url": "https://...",
    "document_type": "result_slip",
    "file_size": 1024000
  }
}
```

#### List Documents
```http
GET /applications/:id/documents
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "document_type": "result_slip",
      "file_url": "https://...",
      "verification_status": "pending"
    }
  ]
}
```

#### Verify Document
```http
PATCH /applications/:id/documents/:documentId/verify
```

**Request Body**:
```json
{
  "verification_status": "verified",
  "notes": "Document is clear and authentic"
}
```

### Interviews

#### Schedule Interview
```http
POST /applications/:id/interview
```

**Request Body**:
```json
{
  "scheduled_at": "2025-02-01T10:00:00Z",
  "mode": "in_person",
  "location": "Main Campus, Room 101",
  "notes": "Bring original documents"
}
```

**Valid Modes**:
- `in_person`
- `virtual`
- `phone`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "scheduled_at": "2025-02-01T10:00:00Z",
    "mode": "in_person",
    "status": "scheduled"
  }
}
```

#### Update Interview
```http
PATCH /applications/:id/interview
```

**Request Body**: Same as Schedule Interview

#### Cancel Interview
```http
DELETE /applications/:id/interview
```

**Request Body**:
```json
{
  "notes": "Applicant requested reschedule"
}
```

### Notifications

#### Send Notification
```http
POST /notifications
```

**Request Body**:
```json
{
  "user_id": "uuid",
  "title": "Application Approved",
  "message": "Your application has been approved",
  "type": "application_status"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "sent_at": "2025-01-20T10:00:00Z"
  }
}
```

#### List Notifications
```http
GET /notifications
```

**Query Parameters**:
- `read`: Filter by read status (true/false)
- `type`: Filter by notification type

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Application Approved",
      "message": "...",
      "read": false,
      "created_at": "2025-01-20T10:00:00Z"
    }
  ]
}
```

#### Mark as Read
```http
PATCH /notifications/:id/read
```

### Reports

#### Application Statistics
```http
GET /reports/applications/stats
```

**Query Parameters**:
- `start_date`: Start date (ISO 8601)
- `end_date`: End date (ISO 8601)
- `program`: Filter by program

**Response**:
```json
{
  "success": true,
  "data": {
    "total": 500,
    "by_status": {
      "submitted": 100,
      "under_review": 200,
      "approved": 150,
      "rejected": 50
    },
    "by_program": {
      "Diploma in Nursing": 300,
      "Diploma in Pharmacy": 200
    }
  }
}
```

### Users

#### Get Profile
```http
GET /users/profile
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "student"
  }
}
```

#### Update Profile
```http
PATCH /users/profile
```

**Request Body**:
```json
{
  "full_name": "John Smith",
  "phone": "+260977123456"
}
```

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `PAYMENT_NOT_VERIFIED` | 400 | Payment must be verified first |
| `DUPLICATE_APPLICATION` | 409 | Application already exists |
| `FILE_TOO_LARGE` | 413 | File exceeds size limit |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal server error |

## Webhooks

### Application Status Changed
```json
{
  "event": "application.status_changed",
  "data": {
    "application_id": "uuid",
    "old_status": "submitted",
    "new_status": "approved",
    "changed_by": "***REMOVED***",
    "timestamp": "2025-01-20T10:00:00Z"
  }
}
```

### Payment Verified
```json
{
  "event": "payment.verified",
  "data": {
    "application_id": "uuid",
    "amount": 153,
    "verified_by": "***REMOVED***",
    "timestamp": "2025-01-20T10:00:00Z"
  }
}
```

## SDK Examples

### JavaScript/TypeScript
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-key'
)

// Get applications
const { data, error } = await supabase
  .from('applications')
  .select('*')
  .eq('status', 'submitted')

// Update application
const { data, error } = await supabase
  .from('applications')
  .update({ status: 'approved' })
  .eq('id', applicationId)
```

### cURL
```bash
# Get applications
curl -X GET ***REMOVED***/applications \
  -H "Authorization: Bearer <token>"

# Create application
curl -X POST ***REMOVED***/applications \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"full_name":"John Doe","email":"john@example.com"}'
```

### Python
```python
import requests

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# Get applications
response = requests.get(
    '***REMOVED***/applications',
    headers=headers
)

# Create application
response = requests.post(
    '***REMOVED***/applications',
    headers=headers,
    json={'full_name': 'John Doe', 'email': 'john@example.com'}
)
```

## Testing

### Test Credentials
```
Student: student@test.com / password
Admin: admin@test.com / password
```

### Test Data
```json
{
  "full_name": "Test User",
  "email": "test@example.com",
  "phone": "+260977000000",
  "nrc_number": "000000/00/0",
  "program": "Diploma in Nursing",
  "intake": "January 2025"
}
```

## Changelog

### v3.0 (2025-01-25)
- Added payment verification endpoint
- Added interview management
- Improved error handling
- Added rate limiting

### v2.0 (2024-12-01)
- Added document verification
- Added notifications
- Added reports

### v1.0 (2024-10-01)
- Initial release

---

**Questions?** Email dev@mihas.edu.zm

**Version**: 3.0  
**Last Updated**: January 2025
