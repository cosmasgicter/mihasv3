# Admin User Guide - MIHAS Application System

## Getting Started

### Login
1. Visit https://mihasv3.pages.dev/admin
2. Enter admin credentials
3. You'll be redirected to admin dashboard

### Dashboard Overview

**Key Metrics** (Top of page):
- Total Applications
- Pending Reviews
- Approved Applications
- Rejected Applications
- Payment Verification Queue

**Quick Actions**:
- View All Applications
- Payment Verification
- Generate Reports
- Send Notifications

## Application Review Process

### Step 1: Access Applications

1. Click "Applications" in sidebar
2. Use filters to find applications:
   - Status (Submitted, Under Review, etc.)
   - Payment Status (Pending, Verified, Rejected)
   - Program
   - Date Range
3. Click on application to open details

### Step 2: Review Application Details

**Overview Tab**:
- Personal Information
- Program Selection
- Application Status
- Payment Status
- Submission Date

**Grades Tab**:
- All Grade 12 subjects
- Best 5 subjects highlighted
- Total points calculated
- Eligibility status

**Documents Tab**:
- Result Slip
- NRC/Passport
- Proof of Payment
- Additional documents
- Click "View" to open document

**Interview Tab**:
- Schedule interview
- Set date, time, mode
- Add location/meeting link
- Send notification to student

**History Tab**:
- All status changes
- Who made changes
- When changes were made
- Notes added

### Step 3: Verify Payment

**CRITICAL**: Payment MUST be verified before approval.

1. Open application
2. Go to Overview tab
3. Check "Proof of Payment" document
4. Verify:
   - Amount is K153
   - Transaction reference visible
   - Date is recent
   - Payer name matches applicant
5. Update payment status:
   - Click "Verify Payment" button
   - Or click "Reject Payment" if invalid
6. Add notes explaining decision

**Payment Verification Checklist**:
- [ ] Amount correct (K153)
- [ ] Transaction reference clear
- [ ] Date within application period
- [ ] Receipt/screenshot authentic
- [ ] Payer name reasonable

### Step 4: Review Documents

For each document:
1. Click "View" to open
2. Check quality and readability
3. Verify authenticity
4. Mark as verified or request reupload

**Document Checklist**:
- [ ] Result slip shows all subjects
- [ ] Grades are clear and readable
- [ ] NRC/Passport is valid
- [ ] All required documents present

### Step 5: Check Eligibility

System automatically checks:
- Minimum grade requirements
- Required subjects present
- Professional registration (if needed)

**Manual Review**:
- Check special cases
- Consider borderline applications
- Review additional qualifications

### Step 6: Make Decision

**To Approve**:
1. Ensure payment is verified ✓
2. Ensure all documents verified ✓
3. Click "Approve" button
4. Add feedback (optional)
5. Confirm approval

**System will**:
- Generate acceptance letter
- Generate finance receipt
- Send email notification
- Update status to "Approved"

**To Reject**:
1. Click "Reject" button
2. **MUST** add feedback explaining why
3. Confirm rejection

**System will**:
- Send email with feedback
- Update status to "Rejected"
- Student can see feedback

**To Request Documents**:
1. Change status to "Pending Documents"
2. Add feedback listing needed documents
3. Student will be notified

## Payment Verification Queue

### Access Queue
1. Dashboard → "Payment Verification"
2. Shows all applications with:
   - Payment status: Pending Review
   - Proof of payment uploaded

### Bulk Verification
1. Select multiple applications
2. Click "Bulk Verify" or "Bulk Reject"
3. Add notes (optional)
4. Confirm action

**Best Practice**: Verify payments daily to avoid delays.

## Interview Management

### Schedule Interview

1. Open application
2. Go to "Interview" tab
3. Fill in details:
   - Date and Time
   - Mode (In Person, Virtual, Phone)
   - Location or Meeting Link
   - Notes for applicant
4. Click "Schedule Interview"

**System will**:
- Send email notification
- Add to applicant's dashboard
- Create calendar reminder

### Update Interview

1. Change date/time/location
2. Click "Update Interview"
3. Notification sent automatically

### Cancel Interview

1. Click "Cancel Interview"
2. Add reason in notes
3. Confirm cancellation

## Notifications

### Send Individual Notification

1. Open application
2. Click "Send Notification"
3. Choose template or write custom message
4. Click "Send"

### Bulk Notifications

1. Select multiple applications
2. Click "Send Notification"
3. Choose template
4. Customize message
5. Preview recipients
6. Send

**Available Templates**:
- Application Received
- Payment Verified
- Documents Needed
- Interview Scheduled
- Application Approved
- Application Rejected

## Reports & Analytics

### Generate Reports

1. Go to "Reports" section
2. Select report type:
   - Applications by Status
   - Applications by Program
   - Payment Summary
   - Approval Rate
   - Processing Time
3. Set date range
4. Click "Generate"
5. Export as PDF or Excel

### View Analytics

Dashboard shows:
- Application trends (graph)
- Approval/rejection rates
- Average processing time
- Payment verification rate
- Top programs

## Document Generation

### Acceptance Letter

1. Open approved application
2. Click "Generate Acceptance Letter"
3. PDF downloads automatically
4. Also available in student dashboard

### Finance Receipt

1. Open approved application
2. Click "Generate Finance Receipt"
3. PDF downloads automatically
4. Shows payment received

## Admin Feedback

### Add Feedback

1. Open application
2. Scroll to "Admin Feedback" section
3. Type feedback message
4. Click "Save Feedback"

**When to Add Feedback**:
- Rejecting application (required)
- Requesting documents (required)
- Approving with conditions
- General notes for student

**Feedback Tips**:
- Be clear and specific
- Be professional and respectful
- Provide actionable guidance
- Explain decisions

## User Management

### View Users

1. Go to "Users" section
2. See all registered users
3. Filter by role (Student, Admin, etc.)

### Manage Roles

1. Find user
2. Click "Edit"
3. Change role:
   - Student
   - Admin
   - Admissions Officer
   - Super Admin
4. Save changes

**Role Permissions**:
- **Student**: Apply, view own applications
- **Admin**: Review applications, verify payments
- **Admissions Officer**: Same as Admin + reports
- **Super Admin**: All permissions + user management

## Best Practices

### Daily Tasks
- [ ] Check payment verification queue
- [ ] Review new applications
- [ ] Respond to pending documents
- [ ] Process approvals/rejections

### Weekly Tasks
- [ ] Generate weekly report
- [ ] Review processing times
- [ ] Check for stuck applications
- [ ] Update interview schedules

### Quality Checks
- Always verify payment before approval
- Double-check document authenticity
- Provide clear feedback on rejections
- Respond to applications within 5 business days

## Keyboard Shortcuts

- `Ctrl + K`: Quick search
- `Ctrl + N`: New notification
- `Ctrl + R`: Refresh data
- `Esc`: Close modal

## Troubleshooting

### Can't approve application
**Check**:
- Is payment verified?
- Are all documents uploaded?
- Do you have admin permissions?

### Payment verification not saving
**Try**:
- Refresh page
- Check internet connection
- Clear browser cache
- Try different browser

### Document won't open
**Try**:
- Right-click → Open in new tab
- Check file format is supported
- Contact IT if persists

### Notification not sending
**Check**:
- Email template configured
- SMTP settings correct
- Student email valid
- Check spam folder

## Security Guidelines

### Password Security
- Change password every 90 days
- Use strong, unique password
- Never share credentials
- Enable 2FA if available

### Data Protection
- Don't share applicant information
- Log out when leaving computer
- Don't screenshot sensitive data
- Follow GDPR/data protection laws

### Access Control
- Only access applications you're reviewing
- Don't modify applications unnecessarily
- Log all important actions
- Report suspicious activity

## Support & Escalation

### Technical Issues
**Email**: admin@mihas.edu.zm
**Phone**: +260-XXX-XXX-XXX

### Policy Questions
**Contact**: Admissions Director
**Email**: director@mihas.edu.zm

### System Bugs
**Report**: GitHub Issues or admin@mihas.edu.zm
**Include**: 
- What you were doing
- Error message
- Screenshot
- Browser and OS

## Tips for Efficiency

1. **Use Filters**: Quickly find applications
2. **Bulk Actions**: Process multiple at once
3. **Keyboard Shortcuts**: Save time
4. **Templates**: Use for common messages
5. **Daily Routine**: Check queue every morning
6. **Clear Feedback**: Reduces follow-up questions
7. **Document Everything**: Add notes to history

## Common Scenarios

### Scenario 1: Incomplete Application
1. Change status to "Pending Documents"
2. Add feedback listing missing items
3. Set reminder to follow up in 7 days

### Scenario 2: Payment Dispute
1. Check proof of payment carefully
2. Contact finance department if needed
3. Add detailed notes
4. Communicate with applicant

### Scenario 3: Borderline Grades
1. Review program requirements
2. Check for special circumstances
3. Consult with admissions committee
4. Document decision rationale

### Scenario 4: Duplicate Application
1. Identify which is correct
2. Contact applicant
3. Reject duplicate
4. Process valid application

## Performance Metrics

Track your performance:
- Applications processed per day
- Average processing time
- Approval/rejection ratio
- Payment verification accuracy
- Response time to queries

**Target Metrics**:
- Process within 5 business days
- 95%+ payment verification accuracy
- <24 hour response to urgent queries

## Updates & Training

- Check for system updates weekly
- Attend monthly admin training
- Review policy changes
- Share feedback for improvements

---

**Questions?** Contact admin@mihas.edu.zm

**Version**: 3.0  
**Last Updated**: January 2025
