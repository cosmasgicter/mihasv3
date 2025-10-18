# Template Migration Guide

## Quick Reference

### Before (Old Way)
```javascript
// ❌ Inline HTML in API endpoint
const html = `
  <div style="font-family: Arial;">
    <h2>Application Slip</h2>
    <p>Dear ${name},</p>
  </div>
`;
```

### After (New Way)
```javascript
// ✅ Use unified template system
import { generateApplicationSlipEmail } from '../_lib/emailTemplates.js';

const html = generateApplicationSlipEmail({
  full_name: name,
  application_number: appNumber,
  // ... other data
});
```

## Migration Checklist

### Phase 1: Core Templates ✅ COMPLETE

- [x] Create `api/_lib/pdfTemplates.js`
- [x] Create `api/_lib/emailTemplates.js`
- [x] Update `api/applications/email-slip.js`
- [x] Update `api/admin/applications/update-status.js`
- [x] Update `api/_lib/passwordReset.js`
- [x] Update `api-functions/generate-pdf.js`
- [x] Mark `src/lib/emailTemplates.ts` as deprecated

### Phase 2: Remaining Endpoints (TODO)

- [ ] Update `api/notifications/send.js` to use templates
- [ ] Update `api/notifications/application-submitted.js`
- [ ] Scan for other inline HTML/PDF generation
- [ ] Update frontend email preview components

### Phase 3: Database & Optimization (TODO)

- [ ] Review `email_notifications` table structure
- [ ] Add template versioning to database
- [ ] Optimize email queue processing
- [ ] Add email analytics tracking

## Common Migration Patterns

### Pattern 1: Simple Email Replacement

**Before:**
```javascript
const html = `<p>Hello ${name}</p>`;
await supabase.functions.invoke('send-email', {
  body: { to: email, subject: 'Test', html }
});
```

**After:**
```javascript
import { generateGenericNotificationEmail } from '../_lib/emailTemplates.js';

const html = generateGenericNotificationEmail({
  title: 'Test',
  message: `Hello ${name}`
});
await supabase.functions.invoke('send-email', {
  body: { to: email, subject: 'Test', html }
});
```

### Pattern 2: Status Update Emails

**Before:**
```javascript
if (status === 'approved') {
  const html = `<p>Congratulations ${name}!</p>`;
  // send email
}
```

**After:**
```javascript
import { generateApplicationApprovedEmail } from '../_lib/emailTemplates.js';

if (status === 'approved') {
  const html = generateApplicationApprovedEmail({
    full_name: name,
    application_number: appNumber,
    program_name: program,
    institution: institution
  });
  // send email
}
```

### Pattern 3: PDF Generation

**Before:**
```javascript
import jsPDF from 'jspdf';
const doc = new jsPDF();
doc.text('Application Slip', 10, 10);
// ... manual PDF creation
```

**After:**
```javascript
import { generateApplicationSlip } from '../_lib/pdfTemplates.js';

const pdfBuffer = await generateApplicationSlip({
  application_number: appNumber,
  full_name: name,
  // ... other data
});
```

## Step-by-Step Migration

### Step 1: Identify Template Usage

Search for:
- `invoke('send-email'`
- Inline HTML strings with `<html>`, `<div>`, etc.
- `jsPDF` or `pdf-lib` usage
- Email template strings

### Step 2: Choose Appropriate Template

| Use Case | Template Function |
|----------|------------------|
| Application slip email | `generateApplicationSlipEmail` |
| Application submitted | `generateApplicationSubmittedEmail` |
| Approval notification | `generateApplicationApprovedEmail` |
| Rejection notification | `generateApplicationRejectedEmail` |
| Missing documents | `generatePendingDocumentsEmail` |
| Payment receipt | `generatePaymentReceiptEmail` |
| Generic notification | `generateGenericNotificationEmail` |
| Password reset | Built into `passwordReset.js` |

### Step 3: Map Data Fields

Example mapping:
```javascript
// Old inline data
const name = application.full_name;
const appNum = application.application_number;

// New template data
const emailData = {
  full_name: application.full_name,
  application_number: application.application_number,
  public_tracking_code: application.public_tracking_code,
  program_name: application.program,
  status: application.status,
  submitted_at: application.submitted_at
};
```

### Step 4: Import and Replace

```javascript
// Add import at top of file
import { generateApplicationSlipEmail } from '../_lib/emailTemplates.js';

// Replace inline HTML
const html = generateApplicationSlipEmail(emailData);
```

### Step 5: Test

1. Generate email HTML locally
2. Check in email client (Gmail, Outlook)
3. Verify all data displays correctly
4. Test responsive design on mobile
5. Verify links work correctly

## Testing Checklist

### Email Testing

- [ ] Desktop email clients (Outlook, Thunderbird)
- [ ] Web email clients (Gmail, Yahoo, Outlook.com)
- [ ] Mobile email clients (iOS Mail, Gmail app)
- [ ] Dark mode rendering
- [ ] All links functional
- [ ] Images load correctly
- [ ] Text is readable
- [ ] Layout not broken

### PDF Testing

- [ ] Opens in Adobe Reader
- [ ] Opens in browser PDF viewer
- [ ] Opens on mobile devices
- [ ] All text visible
- [ ] QR codes scannable
- [ ] Tables formatted correctly
- [ ] File size reasonable (<500KB)

## Troubleshooting

### Issue: Email looks broken

**Solution:** Check HTML escaping
```javascript
// Use escapeHtml for user data
import { escapeHtml } from '../_lib/emailTemplates.js';
const safeName = escapeHtml(userInput);
```

### Issue: PDF generation fails

**Solution:** Verify all required fields
```javascript
// Check data before generation
if (!data.application_number || !data.full_name) {
  throw new Error('Missing required fields');
}
```

### Issue: Colors don't match

**Solution:** Use color constants
```javascript
// Import colors from template file
const COLORS = {
  primaryBlue: '#0ea5e9',
  darkGray: '#111827',
  // ... etc
};
```

## Best Practices

### DO ✅

- Use unified templates for all emails and PDFs
- Escape all user-provided data
- Test in multiple email clients
- Follow existing naming conventions
- Document new template functions
- Keep templates simple and maintainable

### DON'T ❌

- Create inline HTML in API endpoints
- Hardcode colors or styles
- Skip HTML escaping
- Use deprecated template files
- Mix old and new template systems
- Create custom PDF generation code

## Getting Help

### Resources

- **Documentation:** `docs/UNIFIED_TEMPLATES_SYSTEM.md`
- **Examples:** Check updated API files
- **Template Code:** `api/_lib/pdfTemplates.js` and `api/_lib/emailTemplates.js`

### Common Questions

**Q: Can I customize template colors?**  
A: Update the COLORS constant in the template file. Changes apply everywhere.

**Q: How do I add a new template?**  
A: Add function to appropriate `_lib` file, follow existing patterns, update docs.

**Q: What about frontend email templates?**  
A: Frontend should use API endpoints that return unified templates.

**Q: Can I still use old templates?**  
A: They're deprecated but functional. Migrate when touching related code.

---

**Last Updated:** 2025-01-23  
**Version:** 1.0
