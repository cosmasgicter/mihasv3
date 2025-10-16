# 📚 MIHAS Admin User Guide

## Complete Guide to Admin Functionality

### 🎯 Overview
The MIHAS Admin Portal provides comprehensive tools for managing student applications from submission to approval. This guide covers all features and workflows.

---

## 🔐 Access & Login

### Admin Access
- Navigate to `/admin/applications`
- Login with admin credentials
- System verifies admin role via JWT token

### Security Features
- Role-based access control (RBAC)
- Session management with auto-logout
- Secure API endpoints with admin verification

---

## 📊 Dashboard Overview

### Quick Stats Cards
Located at the top of the dashboard:

1. **Today's Submissions**
   - Shows applications submitted today
   - Blue indicator with clock icon
   - Real-time count

2. **Pending Review**
   - Applications awaiting review
   - Yellow indicator with alert icon
   - Requires admin action

3. **Approved Applications**
   - Successfully approved applications
   - Green indicator with checkmark
   - Final approval count

4. **Rejected Applications**
   - Rejected applications
   - Red indicator with X icon
   - Rejection tracking

### Analytics Dashboard
- **AdminMetrics Component**: Visual charts and graphs
- **Application Trends**: Submission patterns over time
- **Payment Status**: Verification tracking
- **Program Distribution**: Applications by program
- **Days Since Submission**: Processing time metrics

---

## 🔍 Filtering & Search

### Search Bar
- Search by: Name, Email, Application Number
- Real-time search with debouncing
- Server-side filtering for performance

### Filter Options

1. **Status Filter**
   - Draft
   - Submitted
   - Under Review
   - Approved
   - Rejected

2. **Payment Status Filter**
   - Pending Review
   - Verified
   - Rejected

3. **Program Filter**
   - All available programs
   - Dynamic list from database

4. **Institution Filter**
   - KATC
   - MIHAS
   - Other institutions

### Quick Filters
- Pre-configured filter combinations
- One-click access to common views
- Saved in URL for sharing

---

## 📋 Application Management

### Application Cards
Each card displays:
- **Applicant Name** with photo placeholder
- **Application Number** (unique identifier)
- **Submission Date**
- **Status Badge** (color-coded)
- **Contact Information** (email, phone)
- **Program Details** (program, institution, intake)
- **Payment Status** with amount
- **Academic Info** (subjects count, points)
- **Grades Summary** (if available)
- **Document Count** (uploaded files)
- **Quick Actions** (view details, documents)

### Bulk Selection
1. Click checkbox on any card
2. Select multiple applications
3. Use bulk actions bar at bottom
4. Available actions:
   - Bulk Approve
   - Bulk Reject
   - Bulk Review
   - Clear Selection

---

## 👁️ Application Details Modal

### Overview Tab
Comprehensive application information:

#### Personal Information
- Full Name
- Email Address
- Phone Number
- Date of Birth
- Sex/Gender
- NRC Number
- Passport Number (if applicable)
- Residence Town
- Next of Kin Details

#### Program Information
- Selected Program
- Institution (KATC/MIHAS)
- Intake Period
- Application Date

#### Payment Information
- Payment Method
- Amount Paid vs Required
- Payer Name
- Payer Phone
- Payment Reference
- Verification Status
- Verified By (admin name)
- Verification Date

#### Admin Feedback Section
- Add internal notes for applicant
- Save feedback with timestamp
- Shows last update date
- Visible to applicant in their dashboard

### Interview Tab
Full interview management system:

#### Schedule Interview
1. **Date & Time**: Select interview date/time
2. **Mode**: Choose interview type
   - In Person
   - Virtual (Zoom/Teams)
   - Phone
3. **Location/Link**: Physical location or meeting URL
4. **Notes**: Instructions for applicant

#### Interview Actions
- **Schedule**: Create new interview
- **Update**: Modify existing interview
- **Reschedule**: Change date/time
- **Cancel**: Cancel scheduled interview

#### Interview Display
- Shows upcoming interview details
- Interview status tracking
- Mode and location visible
- Notes for applicant

### Grades Tab
Detailed academic performance:

#### Grade Display Features
- **All Subjects**: Complete list with grades
- **Best 5 Highlighted**: Green background for top 5
- **Color Coding**:
  - Green (1-3): Distinction/Merit
  - Yellow (4-6): Credit/Pass
  - Red (7-9): Weak/Fail
- **Points Calculation**: Total points from best 5
- **Subject Names**: Full subject names displayed
- **Grade Scale**: Zambian 1-9 system (1=best, 9=fail)

#### Points System
- Grade 1 = 9 points (Distinction)
- Grade 2 = 8 points
- Grade 3 = 7 points (Merit)
- Grade 4 = 6 points
- Grade 5 = 5 points (Credit)
- Grade 6 = 4 points
- Grade 7 = 3 points (Pass)
- Grade 8 = 2 points
- Grade 9 = 1 point (Fail)

**Best 5 Calculation**: Sum of points from top 5 subjects

### Documents Tab
Document management and verification:

#### Document Types
- **Result Slip**: Grade 12 results
- **Extra KYC**: Additional identification
- **Proof of Payment**: Payment receipt
- **System Generated**: Acceptance letters, receipts

#### Document Features
- View/Download documents
- Verification status badges
- File size information
- Upload date
- Verification notes
- System-generated indicator

#### Document Actions
- Open in new tab
- Download to device
- Verify/Reject documents
- Add verification notes

### History Tab
Complete audit trail:

#### Status History
- All status changes
- Changed by (admin name)
- Change date/time
- Notes for each change
- Color-coded status indicators

#### Timeline View
- Chronological order (newest first)
- Visual status icons
- Admin attribution
- Change reasons/notes

---

## ✅ Application Processing Workflow

### 1. New Application (Submitted)
**Status**: Submitted → Under Review

**Actions**:
1. Click "View Details" on application card
2. Review all information in Overview tab
3. Check Grades tab for academic performance
4. Verify Documents tab for required files
5. Click "Start Review" button
6. Status changes to "Under Review"

### 2. Under Review
**Status**: Under Review → Approved/Rejected

**Review Checklist**:
- ✅ Personal information complete
- ✅ Payment verified
- ✅ Documents uploaded and valid
- ✅ Grades meet requirements
- ✅ Program eligibility confirmed

**Actions**:
1. Add admin feedback (optional)
2. Schedule interview if required
3. Click "Approve" or "Reject"
4. Add notes explaining decision
5. System updates status automatically

### 3. Payment Verification
**Process**:
1. Check payment information in Overview tab
2. Verify payment amount matches fee
3. Confirm payment reference/receipt
4. Update payment status:
   - Verified: Payment confirmed
   - Rejected: Payment invalid
5. System tracks who verified and when

### 4. Interview Scheduling
**Process**:
1. Go to Interview tab
2. Fill in interview details:
   - Date and time
   - Mode (in-person/virtual/phone)
   - Location or meeting link
   - Instructions/notes
3. Click "Schedule Interview"
4. System sends notification to applicant
5. Interview appears in applicant's dashboard

### 5. Final Decision
**Approval**:
1. Click "Approve" button
2. Add approval notes
3. Generate acceptance letter
4. Send notification to applicant
5. Update intake available spots

**Rejection**:
1. Click "Reject" button
2. Add rejection reason (required)
3. Send notification to applicant
4. Applicant can view feedback

---

## 📧 Notifications

### Send Notification
**Process**:
1. Open application details modal
2. Click "Send Notification" button
3. System creates notification entry
4. Notification appears in applicant's dashboard
5. Email sent to applicant (if configured)

### Notification Templates
Supports variable substitution:
- `{application_number}`: Application ID
- `{full_name}`: Applicant name
- `{program}`: Selected program
- `{status}`: Current status

### Automatic Notifications
System sends notifications for:
- Status changes
- Payment verification
- Interview scheduling
- Document verification
- Final decisions

---

## 📄 Document Generation

### Acceptance Letter
**When**: After application approval

**Process**:
1. Open approved application
2. Click "Acceptance Letter" button
3. System generates PDF document
4. Document saved to application_documents
5. Applicant can download from dashboard

**Contents**:
- Official letterhead
- Applicant details
- Program information
- Intake details
- Next steps instructions

### Finance Receipt
**When**: After payment verification

**Process**:
1. Open application with verified payment
2. Click "Finance Receipt" button
3. System generates receipt PDF
4. Receipt saved to documents
5. Applicant can download

**Contents**:
- Receipt number
- Payment details
- Amount paid
- Payment method
- Official stamp/signature

---

## 📊 Export & Reporting

### Export Options

#### CSV Export
- Lightweight format
- Opens in Excel/Google Sheets
- All application data
- Respects current filters

#### Excel Export (.xlsx)
- Native Excel format
- Formatted columns
- Multiple sheets possible
- Professional appearance

#### PDF Export
- Print-ready format
- Formatted tables
- Official reports
- Shareable documents

### Export Process
1. Apply desired filters
2. Click export button (CSV/Excel/PDF)
3. System processes in batches
4. Progress indicator shown
5. File downloads automatically

### Export Features
- **Filtered Exports**: Only exports visible applications
- **Batch Processing**: Handles large datasets (500 per batch)
- **Progress Tracking**: Shows export progress
- **Error Handling**: Graceful failure recovery

---

## 🔄 Bulk Operations

### Bulk Actions Available
1. **Bulk Approve**: Approve multiple applications
2. **Bulk Reject**: Reject multiple applications
3. **Bulk Review**: Move to under review
4. **Bulk Export**: Export selected applications

### Bulk Action Process
1. Select applications using checkboxes
2. Bulk actions bar appears at bottom
3. Choose action from dropdown
4. Confirm action
5. System processes all selected
6. Progress indicator shown
7. Success/error messages displayed

### Best Practices
- Review applications individually first
- Use bulk actions for similar cases
- Add notes for bulk decisions
- Verify selection before confirming
- Monitor progress for large batches

---

## 🎨 UI Features

### Mobile-First Design
- Responsive layout for all devices
- Touch-optimized buttons (44px minimum)
- Swipe gestures supported
- Mobile navigation menu
- Collapsible filters on mobile

### Color Coding
**Status Colors**:
- 🔵 Blue: Submitted
- 🟡 Yellow: Under Review
- 🟢 Green: Approved
- 🔴 Red: Rejected
- ⚪ Gray: Draft

**Payment Colors**:
- 🟡 Yellow: Pending Review
- 🟢 Green: Verified
- 🔴 Red: Rejected

**Grade Colors**:
- 🟢 Green: Grades 1-3 (Distinction/Merit)
- 🟡 Yellow: Grades 4-6 (Credit/Pass)
- 🔴 Red: Grades 7-9 (Weak/Fail)

### Icons
- 👤 User: Personal information
- 📧 Mail: Email address
- 📱 Phone: Phone number
- 📅 Calendar: Dates
- 🎓 Graduation Cap: Academic info
- 🏢 Building: Institution
- 💳 Credit Card: Payment
- 📄 File: Documents
- 🔔 Bell: Notifications
- ⏰ Clock: Pending actions
- ✅ Check: Approved/Verified
- ❌ X: Rejected/Cancelled

---

## 🔧 Troubleshooting

### Common Issues

#### Applications Not Loading
**Solution**:
1. Check internet connection
2. Refresh page (F5 or refresh button)
3. Clear browser cache
4. Check admin permissions
5. Contact system administrator

#### Filters Not Working
**Solution**:
1. Clear all filters and reapply
2. Check URL parameters
3. Refresh page
4. Try different filter combinations

#### Export Failing
**Solution**:
1. Reduce number of applications (use filters)
2. Try different export format
3. Check browser download settings
4. Ensure sufficient disk space
5. Try again after a few minutes

#### Modal Not Opening
**Solution**:
1. Check browser console for errors
2. Disable browser extensions
3. Try different browser
4. Clear browser cache
5. Refresh page

#### Grades Not Showing
**Solution**:
1. Verify grades were uploaded by applicant
2. Check Grades tab in modal
3. Ensure application is submitted
4. Contact applicant to upload grades
5. Check database for grade records

---

## 📈 Performance Tips

### For Large Datasets
1. Use filters to reduce visible applications
2. Load more applications gradually (pagination)
3. Export in smaller batches
4. Use search for specific applications
5. Close unused browser tabs

### Best Practices
1. Process applications regularly
2. Use bulk actions for efficiency
3. Add notes for future reference
4. Schedule interviews promptly
5. Verify payments quickly
6. Generate documents immediately after approval
7. Send notifications for all status changes

---

## 🔒 Security Best Practices

### Admin Account Security
1. Use strong passwords
2. Don't share admin credentials
3. Log out when finished
4. Use secure networks
5. Keep browser updated

### Data Protection
1. Don't download sensitive data unnecessarily
2. Secure exported files
3. Don't share application details publicly
4. Follow GDPR/data protection guidelines
5. Report security concerns immediately

### Access Control
1. Only admins can access admin portal
2. All actions are logged
3. Status history tracks who made changes
4. Payment verification requires admin role
5. Document generation is admin-only

---

## 📞 Support & Help

### Getting Help
- **Technical Issues**: Contact IT support
- **Process Questions**: Refer to this guide
- **System Bugs**: Report to development team
- **Feature Requests**: Submit via feedback form

### Training Resources
- Video tutorials (if available)
- This user guide
- System documentation
- Admin training sessions

---

## 🎓 Quick Reference

### Keyboard Shortcuts
- `Ctrl/Cmd + F`: Focus search bar
- `Esc`: Close modal
- `Ctrl/Cmd + R`: Refresh page

### Status Workflow
```
Draft → Submitted → Under Review → Approved/Rejected
```

### Payment Workflow
```
Pending Review → Verified/Rejected
```

### Interview Workflow
```
Not Scheduled → Scheduled → Completed/Cancelled
```

---

## ✅ Admin Checklist

### Daily Tasks
- [ ] Review new submissions
- [ ] Verify pending payments
- [ ] Respond to applicant queries
- [ ] Schedule interviews
- [ ] Process under review applications

### Weekly Tasks
- [ ] Generate reports
- [ ] Review analytics
- [ ] Update program information
- [ ] Check system performance
- [ ] Archive old applications

### Monthly Tasks
- [ ] Export monthly reports
- [ ] Review approval rates
- [ ] Analyze trends
- [ ] Update documentation
- [ ] Train new admins

---

## 🎉 Conclusion

The MIHAS Admin Portal provides all tools needed for efficient application management. This guide covers all features and workflows. For additional help, contact system support.

**Version**: 2.0  
**Last Updated**: 2025-01-23  
**Author**: MIHAS Development Team
