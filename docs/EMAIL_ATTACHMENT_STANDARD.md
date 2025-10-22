# Email Attachment Standard

## Overview

All email sending in the MIHAS system that requires attachments MUST use the standardized approach documented here.

## Standard Implementation

### 1. Supabase Edge Function (Recommended)

**Location**: `supabase/functions/send-email/index.ts`

**Usage**:
```javascript
const { data, error } = await supabaseAdminClient.functions.invoke('send-email', {
  body: {
    to: 'recipient@example.com',
    subject: 'Your Document',
    html: '<p>Please find your document attached.</p>',
    attachments: [{
      filename: 'document.pdf',
      content: pdfBuffer.toString('base64'), // Base64 encoded
      contentType: 'application/pdf'
    }]
  }
});
```

### 2. Cloudflare Functions (Alternative)

**Location**: `functions/_lib/emailService.js`

**Usage**:
```javascript
import { sendEmailWithPDF } from '../_lib/emailService.js';

const result = await sendEmailWithPDF({
  to: 'recipient@example.com',
  subject: 'Your Document',
  html: '<p>Please find your document attached.</p>',
  pdfBuffer: pdfBuffer,
  pdfFilename: 'document.pdf'
});
```

## Configuration

### Environment Variables

Add to `.env` or Cloudflare/Supabase environment:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
FROM_EMAIL=MIHAS <noreply@mihas.edu.zm>
```

### Get Resend API Key

1. Sign up at https://resend.com
2. Verify your domain
3. Generate API key
4. Add to environment variables

## Examples

### Example 1: Application Slip

```javascript
// Generate PDF
const pdfBuffer = await generateApplicationSlip(slipData);

// Send with attachment
await supabaseAdminClient.functions.invoke('send-email', {
  body: {
    to: application.email,
    subject: 'Your MIHAS Application Slip',
    html: renderApplicationSlipEmail(data),
    attachments: [{
      filename: `application-slip-${application.application_number}.pdf`,
      content: pdfBuffer.toString('base64'),
      contentType: 'application/pdf'
    }]
  }
});
```

### Example 2: Acceptance Letter

```javascript
const pdfBuffer = await generateAcceptanceLetter(data);

await supabaseAdminClient.functions.invoke('send-email', {
  body: {
    to: student.email,
    subject: 'MIHAS Acceptance Letter',
    html: renderAcceptanceEmail(data),
    attachments: [{
      filename: `acceptance-letter-${student.id}.pdf`,
      content: pdfBuffer.toString('base64'),
      contentType: 'application/pdf'
    }]
  }
});
```

### Example 3: Multiple Attachments

```javascript
await supabaseAdminClient.functions.invoke('send-email', {
  body: {
    to: recipient.email,
    subject: 'Your Documents',
    html: '<p>Please find your documents attached.</p>',
    attachments: [
      {
        filename: 'slip.pdf',
        content: slipBuffer.toString('base64'),
        contentType: 'application/pdf'
      },
      {
        filename: 'receipt.pdf',
        content: receiptBuffer.toString('base64'),
        contentType: 'application/pdf'
      }
    ]
  }
});
```

## Attachment Format

```typescript
interface EmailAttachment {
  filename: string;           // e.g., "document.pdf"
  content: string;            // Base64 encoded content
  contentType: string;        // MIME type, e.g., "application/pdf"
}
```

## Best Practices

1. **Always use attachments for PDFs** - Don't rely solely on download links
2. **Include both attachment and link** - Provide download link in email body as backup
3. **Use descriptive filenames** - Include application number or identifier
4. **Base64 encode buffers** - Convert Buffer to base64 string before sending
5. **Set correct content type** - Use proper MIME types
6. **Handle errors gracefully** - Log failures and provide fallback options
7. **Store in Supabase Storage** - Always store PDFs in storage as backup

## Migration Checklist

When updating existing email functions:

- [ ] Import standardized email service
- [ ] Convert PDF buffer to base64
- [ ] Add attachments array to email payload
- [ ] Keep download link in email body as backup
- [ ] Test email delivery
- [ ] Verify attachment opens correctly
- [ ] Update error handling

## Files Using This Standard

- ✅ `functions/applications/email/slip.js` - Application slip emails
- ✅ `supabase/functions/send-email/index.ts` - Edge function
- ✅ `functions/_lib/emailService.js` - Utility library

## Troubleshooting

### Attachment not received
- Verify RESEND_API_KEY is set
- Check base64 encoding is correct
- Ensure content type matches file type
- Check email size limits (10MB max)

### Email not sending
- Verify Resend domain is verified
- Check API key permissions
- Review Resend dashboard for errors
- Check rate limits

## Support

- Resend Docs: https://resend.com/docs
- Resend Dashboard: https://resend.com/emails
- MIHAS Support: ***REMOVED***
