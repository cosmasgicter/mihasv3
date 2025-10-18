# Unified PDF and Email Template System

## Overview

Complete unified system for all PDF generation and email templates across the MIHAS application. Ensures consistent branding, design, and maintainability.

## Architecture

### Core Files

1. **`api/_lib/pdfTemplates.js`** - Unified PDF template system
2. **`api/_lib/emailTemplates.js`** - Unified email template system
3. **`api/_lib/applicationSlip.js`** - Legacy compatibility wrapper

### Design System

**Color Palette:**
- Primary Blue: `#0ea5e9`
- Dark Gray: `#111827`
- Medium Gray: `#4b5563`
- Light Gray: `#f9fafb`
- Border Gray: `#e5e7eb`
- White: `#ffffff`

**Typography:**
- Font Family: 'Helvetica Neue', Arial, sans-serif
- Headings: 20-24px, font-weight 600
- Body: 15px, line-height 1.6
- Small: 14px, line-height 1.6
- Footer: 12px

**Layout:**
- Max width: 600px
- Border radius: 8-12px
- Padding: 20-40px
- Table-style rows with alternating backgrounds

## PDF Templates

### Available Functions

```javascript
import { 
  generateApplicationSlip,
  generateAcceptanceLetter,
  generatePaymentReceipt 
} from '../_lib/pdfTemplates.js';
```

### 1. Application Slip

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

### 2. Acceptance Letter

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

### 3. Payment Receipt

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

## Email Templates

### Available Functions

```javascript
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

### 1. Application Slip Email

```javascript
const html = generateApplicationSlipEmail({
  full_name: 'John Doe',
  application_number: 'APP-2025-001',
  public_tracking_code: 'TRK-ABC123',
  program_name: 'Nursing',
  status: 'submitted',
  submitted_at: '2025-01-23T10:00:00Z',
  slipUrl: 'https://apply.mihas.edu.zm/track-application?code=TRK-ABC123'
});
```

### 2. Application Submitted Email

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

### 3. Application Approved Email

```javascript
const html = generateApplicationApprovedEmail({
  full_name: 'John Doe',
  application_number: 'APP-2025-001',
  program_name: 'Nursing',
  institution: 'MIHAS'
});
```

### 4. Application Rejected Email

```javascript
const html = generateApplicationRejectedEmail({
  full_name: 'John Doe',
  application_number: 'APP-2025-001',
  program_name: 'Nursing'
});
```

### 5. Pending Documents Email

```javascript
const html = generatePendingDocumentsEmail({
  full_name: 'John Doe',
  application_number: 'APP-2025-001',
  program_name: 'Nursing'
});
```

### 6. Payment Receipt Email

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

### 7. Generic Notification Email

```javascript
const html = generateGenericNotificationEmail({
  title: 'Important Update',
  message: 'Your application has been updated.',
  actionUrl: 'https://apply.mihas.edu.zm/dashboard',
  actionText: 'View Dashboard'
});
```

## Integration Points

### Updated Files

1. **`api/applications/email-slip.js`** - Uses unified email templates
2. **`api/admin/applications/update-status.js`** - Sends status update emails
3. **`api/_lib/passwordReset.js`** - Uses unified email design
4. **`api-functions/generate-pdf.js`** - Uses unified PDF templates

### Legacy Files (Deprecated)

- **`src/lib/emailTemplates.ts`** - Marked as deprecated, use API templates instead

## Usage Guidelines

### For New Features

1. **Always use unified templates** - Never create inline HTML or PDF generation
2. **Import from `_lib` directory** - Use centralized template functions
3. **Follow color palette** - Use defined colors for consistency
4. **Test email rendering** - Check in multiple email clients

### For Existing Code

1. **Migrate gradually** - Update as you touch related code
2. **Maintain backwards compatibility** - Use wrapper functions if needed
3. **Document changes** - Update this file when adding new templates

## Testing

### PDF Testing

```javascript
// Generate and save locally for testing
const pdfBuffer = await generateApplicationSlip(testData);
fs.writeFileSync('test-slip.pdf', pdfBuffer);
```

### Email Testing

```javascript
// Generate HTML and save for testing
const html = generateApplicationSlipEmail(testData);
fs.writeFileSync('test-email.html', html);
```

## Maintenance

### Adding New Templates

1. Add function to appropriate `_lib` file
2. Follow existing naming conventions
3. Use shared helper functions (escapeHtml, formatDate, etc.)
4. Update this documentation
5. Add to exports

### Updating Existing Templates

1. Update in `_lib` file only
2. Test all integration points
3. Update documentation if API changes
4. Notify team of breaking changes

## Benefits

✅ **Consistency** - Single source of truth for all templates  
✅ **Maintainability** - Update once, apply everywhere  
✅ **Branding** - Consistent colors, fonts, and layout  
✅ **Quality** - Professional, tested templates  
✅ **Performance** - Optimized generation code  
✅ **Security** - Centralized HTML escaping and validation

## Future Enhancements

- [ ] Add template versioning
- [ ] Create template preview tool
- [ ] Add multi-language support
- [ ] Generate templates from database
- [ ] Add A/B testing capability
- [ ] Create template analytics

---

**Last Updated:** 2025-01-23  
**Version:** 1.0  
**Maintainer:** Development Team
