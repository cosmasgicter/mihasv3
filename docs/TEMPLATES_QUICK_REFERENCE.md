# Templates Quick Reference Card

## 🚀 Quick Start

### Import Templates

```javascript
// PDF Templates
import { 
  generateApplicationSlip,
  generateAcceptanceLetter,
  generatePaymentReceipt 
} from '../_lib/pdfTemplates.js';

// Email Templates
import { 
  generateApplicationSlipEmail,
  generateApplicationSubmittedEmail,
  generateApplicationApprovedEmail,
  generateApplicationRejectedEmail,
  generatePendingDocumentsEmail,
  generatePaymentReceiptEmail,
  generateGenericNotificationEmail
} from '../_lib/emailTemplates.js';
```

## 📧 Email Templates

### Application Slip Email
```javascript
const html = generateApplicationSlipEmail({
  full_name: 'John Doe',
  application_number: 'APP-2025-001',
  public_tracking_code: 'TRK-ABC123',
  program_name: 'Nursing',
  status: 'submitted',
  submitted_at: '2025-01-23T10:00:00Z',
  slipUrl: 'https://mihasv3.pages.dev/track-application?code=TRK-ABC123'
});
```

### Application Submitted
```javascript
const html = generateApplicationSubmittedEmail({
  full_name: 'John Doe',
  application_number: 'APP-2025-001',
  public_tracking_code: 'TRK-ABC123',
  program_name: 'Nursing',
  institution: 'MIHAS',
  submitted_at: '2025-01-23T10:00:00Z'
});
```

### Approved
```javascript
const html = generateApplicationApprovedEmail({
  full_name: 'John Doe',
  application_number: 'APP-2025-001',
  program_name: 'Nursing',
  institution: 'MIHAS'
});
```

### Rejected
```javascript
const html = generateApplicationRejectedEmail({
  full_name: 'John Doe',
  application_number: 'APP-2025-001',
  program_name: 'Nursing'
});
```

### Pending Documents
```javascript
const html = generatePendingDocumentsEmail({
  full_name: 'John Doe',
  application_number: 'APP-2025-001',
  program_name: 'Nursing'
});
```

### Payment Receipt
```javascript
const html = generatePaymentReceiptEmail({
  full_name: 'John Doe',
  receipt_number: 'RCP-2025-001',
  application_number: 'APP-2025-001',
  amount: 500,
  payment_method: 'Mobile Money',
  payment_date: '2025-01-23T10:00:00Z'
});
```

### Generic Notification
```javascript
const html = generateGenericNotificationEmail({
  title: 'Important Update',
  message: 'Your application has been updated.',
  actionUrl: 'https://mihasv3.pages.dev/dashboard',
  actionText: 'View Dashboard' // optional
});
```

## 📄 PDF Templates

### Application Slip
```javascript
const pdfBuffer = await generateApplicationSlip({
  application_number: 'APP-2025-001',
  public_tracking_code: 'TRK-ABC123',
  full_name: 'John Doe',
  email: 'john@example.com',
  phone: '+260 XXX XXX XXX',
  program_name: 'Nursing',
  intake_name: 'January 2025',
  institution: 'MIHAS',
  status: 'submitted',
  payment_status: 'pending',
  submitted_at: '2025-01-23T10:00:00Z',
  updated_at: '2025-01-23T10:00:00Z'
});
```

### Acceptance Letter
```javascript
const pdfBuffer = await generateAcceptanceLetter({
  full_name: 'John Doe',
  application_number: 'APP-2025-001',
  program_name: 'Nursing',
  institution: 'MIHAS',
  intake_name: 'January 2025',
  decision_date: '2025-01-23T10:00:00Z'
});
```

### Payment Receipt
```javascript
const pdfBuffer = await generatePaymentReceipt({
  receipt_number: 'RCP-2025-001',
  application_number: 'APP-2025-001',
  full_name: 'John Doe',
  amount: 500,
  payment_method: 'Mobile Money',
  payment_date: '2025-01-23T10:00:00Z',
  program_name: 'Nursing'
});
```

## 🎨 Design System

### Colors
```javascript
const COLORS = {
  primaryBlue: '#0ea5e9',
  darkGray: '#111827',
  mediumGray: '#4b5563',
  lightGray: '#f9fafb',
  borderGray: '#e5e7eb',
  white: '#ffffff'
};
```

### Typography
- **Headings:** 20-24px, font-weight 600
- **Body:** 15px, line-height 1.6
- **Small:** 14px, line-height 1.6
- **Footer:** 12px

## 🔧 Common Patterns

### Send Email with Template
```javascript
import { generateApplicationApprovedEmail } from '../_lib/emailTemplates.js';

const html = generateApplicationApprovedEmail(data);

await supabaseAdminClient.functions.invoke('send-email', {
  body: {
    to: email,
    subject: '🎉 Application Approved',
    html
  }
});
```

### Generate and Send PDF
```javascript
import { generateApplicationSlip } from '../_lib/pdfTemplates.js';

const pdfBuffer = await generateApplicationSlip(data);
const pdfBase64 = pdfBuffer.toString('base64');

await supabaseAdminClient.functions.invoke('send-email', {
  body: {
    to: email,
    subject: 'Application Slip',
    html: emailHtml,
    attachments: [{
      filename: 'application-slip.pdf',
      content: pdfBase64,
      type: 'application/pdf',
      disposition: 'attachment'
    }]
  }
});
```

### HTML Escaping
```javascript
import { escapeHtml } from '../_lib/emailTemplates.js';

const safeName = escapeHtml(userInput);
```

### Date Formatting
```javascript
import { formatDate } from '../_lib/emailTemplates.js';

const formattedDate = formatDate('2025-01-23T10:00:00Z');
// Output: "January 23, 2025"
```

### Status Formatting
```javascript
import { formatStatus } from '../_lib/emailTemplates.js';

const formattedStatus = formatStatus('pending_documents');
// Output: "Pending Documents"
```

## ✅ Checklist

### Before Sending Email
- [ ] Import correct template function
- [ ] Provide all required data fields
- [ ] Escape user-provided data
- [ ] Test HTML in email client
- [ ] Verify all links work

### Before Generating PDF
- [ ] Import correct template function
- [ ] Provide all required data fields
- [ ] Test PDF opens correctly
- [ ] Verify QR codes scan
- [ ] Check file size (<500KB)

## 🚫 Don't Do This

```javascript
// ❌ Don't create inline HTML
const html = `<div><p>Hello ${name}</p></div>`;

// ❌ Don't use old template files
import { EMAIL_TEMPLATES } from 'src/lib/emailTemplates.ts';

// ❌ Don't skip HTML escaping
const html = `<p>${userInput}</p>`;

// ❌ Don't create custom PDF generation
const doc = new jsPDF();
doc.text('Custom PDF', 10, 10);
```

## ✅ Do This Instead

```javascript
// ✅ Use unified templates
import { generateGenericNotificationEmail } from '../_lib/emailTemplates.js';
const html = generateGenericNotificationEmail({ title: 'Hello', message: name });

// ✅ Use new template system
import { generateApplicationApprovedEmail } from '../_lib/emailTemplates.js';

// ✅ Always escape user data
import { escapeHtml } from '../_lib/emailTemplates.js';
const html = generateGenericNotificationEmail({ 
  title: 'Hello', 
  message: escapeHtml(userInput) 
});

// ✅ Use unified PDF templates
import { generateApplicationSlip } from '../_lib/pdfTemplates.js';
const pdfBuffer = await generateApplicationSlip(data);
```

## 📚 Documentation

- **Full Guide:** `docs/UNIFIED_TEMPLATES_SYSTEM.md`
- **Migration:** `docs/TEMPLATE_MIGRATION_GUIDE.md`
- **Implementation:** `docs/reports/UNIFIED_TEMPLATES_IMPLEMENTATION.md`

## 🆘 Need Help?

1. Check documentation files
2. Look at updated API files for examples
3. Review template source code in `api/_lib/`

---

**Quick Reference v1.0** | Last Updated: 2025-01-23
