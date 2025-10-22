# Email with Attachments - Quick Start

## Setup (One-time)

1. Get Resend API key from https://resend.com
2. Add to environment:
   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   FROM_EMAIL=MIHAS <noreply@mihas.edu.zm>
   ```

## Send Email with PDF Attachment

```javascript
import { supabaseAdminClient } from '../_lib/supabaseClient.js';

// 1. Generate your PDF
const pdfBuffer = await generateYourPDF(data);

// 2. Send email with attachment
const { data: result, error } = await supabaseAdminClient.functions.invoke('send-email', {
  body: {
    to: 'recipient@example.com',
    subject: 'Your Document',
    html: '<p>Your document is attached.</p>',
    attachments: [{
      filename: 'document.pdf',
      content: pdfBuffer.toString('base64'),
      contentType: 'application/pdf'
    }]
  }
});

if (error) {
  console.error('Email failed:', error);
}
```

## That's it!

See `docs/EMAIL_ATTACHMENT_STANDARD.md` for full documentation.
