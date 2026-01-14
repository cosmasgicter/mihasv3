# MIHAS Integration Framework

The MIHAS Integration Framework provides standardized APIs and webhook support for external system integrations. This framework ensures consistent patterns, security, and reliability across all integrations.

## Features

- **Standardized API Patterns**: Consistent request/response formats across all endpoints
- **Webhook Support**: Real-time notifications for external systems
- **Security**: Built-in authentication, authorization, and audit logging
- **Rate Limiting**: Configurable rate limits to prevent abuse
- **Documentation**: Auto-generated API documentation
- **Monitoring**: Comprehensive logging and delivery tracking

## Quick Start

### 1. Authentication

All API requests require authentication using Bearer tokens:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     ***REMOVED***/integrations/webhooks
```

### 2. Register a Webhook

```bash
curl -X POST ***REMOVED***/integrations/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Integration",
    "url": "https://your-system.com/webhooks/mihas",
    "events": ["application.submitted", "payment.verified"],
    "secret": "your-webhook-secret"
  }'
```

### 3. Handle Webhook Events

```javascript
// Example webhook handler (Node.js/Express)
app.post('/webhooks/mihas', (req, res) => {
  const signature = req.headers['x-mihas-signature'];
  const payload = JSON.stringify(req.body);
  
  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', 'your-webhook-secret')
    .update(payload)
    .digest('hex');
  
  if (signature !== `sha256=${expectedSignature}`) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process the event
  const { event, data } = req.body;
  console.log(`Received ${event}:`, data);
  
  res.status(200).send('OK');
});
```

## API Endpoints

### Webhook Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/integrations/webhooks` | List all webhooks |
| POST | `/integrations/webhooks` | Create new webhook |
| PUT | `/integrations/webhooks?id={id}` | Update webhook |
| DELETE | `/integrations/webhooks?id={id}` | Delete webhook |
| POST | `/integrations/test-webhook` | Test webhook delivery |
| GET | `/integrations/deliveries` | View delivery logs |

### External Systems

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/integrations/systems` | List external systems |
| POST | `/integrations/systems` | Register external system |
| PUT | `/integrations/systems/{id}` | Update system config |
| DELETE | `/integrations/systems/{id}` | Remove system |

## Webhook Events

The system supports the following webhook events:

### Application Events
- `application.created` - New application created
- `application.updated` - Application data updated
- `application.submitted` - Application submitted for review
- `application.approved` - Application approved
- `application.rejected` - Application rejected

### Payment Events
- `payment.received` - Payment received
- `payment.verified` - Payment verified by admin
- `payment.rejected` - Payment rejected

### User Events
- `user.registered` - New user registration
- `user.profile_updated` - User profile updated

### Document Events
- `document.uploaded` - Document uploaded
- `document.verified` - Document verified by admin

### Notification Events
- `notification.sent` - Notification delivered
- `notification.failed` - Notification delivery failed

## Webhook Payload Format

All webhook payloads follow this standard format:

```json
{
  "event": "application.submitted",
  "timestamp": "2025-01-13T10:30:00Z",
  "webhook_id": "uuid-of-webhook",
  "data": {
    "id": "application-id",
    "application_number": "MIHAS2025001",
    "user_id": "user-id",
    "program": "Registered Nursing",
    "status": "submitted",
    "submitted_at": "2025-01-13T10:30:00Z"
  }
}
```

## Security

### Webhook Signatures

All webhook deliveries include an `X-MIHAS-Signature` header containing an HMAC-SHA256 signature of the payload. Always verify this signature to ensure the webhook is from MIHAS.

### Rate Limiting

API endpoints are rate-limited to prevent abuse:
- Default: 100 requests per minute per user
- Webhook endpoints: 10 requests per minute
- Bulk operations: 2 requests per 5 minutes

### Authentication

- All API requests require valid Bearer tokens
- Admin endpoints require admin or super_admin role
- Tokens can be configured with specific permissions

## Error Handling

All API responses follow a consistent format:

```json
{
  "success": true|false,
  "data": {...},
  "error": "Error message if success is false",
  "meta": {
    "timestamp": "2025-01-13T10:30:00Z",
    "version": "1.0"
  }
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error

## Monitoring and Logging

### Delivery Tracking

All webhook deliveries are logged with:
- Delivery timestamp
- Response status and headers
- Success/failure status
- Error messages for failed deliveries

### Audit Logging

All API access is logged with:
- User ID and IP address
- Request method and URL
- Response status
- Request/response bodies (configurable)

### Retry Logic

Failed webhook deliveries are automatically retried:
- Exponential backoff (1s, 2s, 4s, 8s, 16s)
- Maximum 5 retry attempts
- Failed deliveries are logged for manual review

## Examples

See the [examples directory](./examples/) for complete integration examples in various programming languages:

- [Node.js/Express](./examples/nodejs/)
- [Python/Flask](./examples/python/)
- [PHP/Laravel](./examples/php/)
- [C#/.NET](./examples/dotnet/)

## Support

For integration support:
- Email: tech-support@mihas.edu.zm
- Documentation: https://docs.mihas.edu.zm/integrations
- Status Page: https://status.mihas.edu.zm