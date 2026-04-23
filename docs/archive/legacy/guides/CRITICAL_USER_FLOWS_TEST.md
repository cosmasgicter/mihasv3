# Critical User Flows - Test Checklist

## 🧪 Test Status: READY FOR TESTING

---

## 1️⃣ STUDENT REGISTRATION & LOGIN
**Priority**: CRITICAL

### Test Steps:
- [ ] Navigate to `/register`
- [ ] Fill in: email, password, first name, last name, phone
- [ ] Submit registration
- [ ] Check email for verification link
- [ ] Click verification link
- [ ] Login with credentials
- [ ] Verify redirect to student dashboard

**Expected Result**: User registered, verified, and logged in successfully

**Test Data**:
- Email: `test.student@example.com`
- Password: `TestPass123!`
- Phone: `+260971234567`

---

## 2️⃣ APPLICATION SUBMISSION (Full Flow)
**Priority**: CRITICAL

### Test Steps:
- [ ] Login as student
- [ ] Click "New Application"
- [ ] **Step 1 - Personal Info**: Fill all required fields
- [ ] **Step 2 - Education & Documents**: Add 5+ subjects with grades and upload result slip plus NRC/passport
- [ ] **Step 3 - Payment**: Confirm resolved fee, launch the Lenco widget, and wait for successful payment confirmation
- [ ] **Step 4 - Review**: Verify all data correct
- [ ] Submit application
- [ ] Verify application number generated
- [ ] Check email for confirmation
- [ ] Verify status = "submitted"

**Expected Result**: Application submitted successfully with application number

**Test Data**:
- Program: "Diploma in Nursing"
- Intake: "January 2025"
- Grades: English-7, Math-6, Science-8, Biology-9, Chemistry-7

---

## 3️⃣ PAYMENT REVIEW / OVERRIDE (Admin)
**Priority**: CRITICAL

### Test Steps:
- [ ] Login as admin (`cosmas@beanola.com`)
- [ ] Navigate to Applications page
- [ ] Find test application
- [ ] Click on application to view details
- [ ] Verify the application shows a confirmed payment state after successful Lenco payment
- [ ] If testing the override path, open the payment review controls
- [ ] Set payment to `verified` or `rejected` with notes
- [ ] Verify payment state and review notes persist
- [ ] Check student-facing status reflects the review outcome where applicable

**Expected Result**: Payment state is accurate, and the override path works when it is intentionally used

---

## 4️⃣ APPLICATION APPROVAL (Admin)
**Priority**: CRITICAL

### Test Steps:
- [ ] Login as admin
- [ ] Find application with verified payment
- [ ] Try to approve application WITHOUT payment verification (should fail)
- [ ] Verify payment first
- [ ] Change status to "under_review"
- [ ] Click "Approve"
- [ ] Confirm approval
- [ ] Verify status = "approved"
- [ ] Check student receives approval email

**Expected Result**: Application approved only after payment verified

---

## 5️⃣ APPLICATION REJECTION (Admin)
**Priority**: HIGH

### Test Steps:
- [ ] Login as admin
- [ ] Find application in "under_review" status
- [ ] Click "Reject"
- [ ] Add rejection notes
- [ ] Confirm rejection
- [ ] Verify status = "rejected"
- [ ] Check student receives rejection email

**Expected Result**: Application rejected with notification sent

---

## 6️⃣ PUBLIC APPLICATION TRACKER
**Priority**: HIGH

### Test Steps:
- [ ] Navigate to `/track-application` (not logged in)
- [ ] Enter application number or tracking code
- [ ] Click "Track Application"
- [ ] Verify application details displayed
- [ ] Verify status badge shows correct status
- [ ] Verify payment status visible
- [ ] Try downloading application slip
- [ ] Try emailing application slip if the flow prompts for a destination address

**Expected Result**: Application details visible without login

**Test Data**:
- Use application number from Test #2
- Use email from Test #2

---

## 7️⃣ AUTO-SAVE FUNCTIONALITY
**Priority**: HIGH

### Test Steps:
- [ ] Login as student
- [ ] Start new application
- [ ] Fill Step 1 partially
- [ ] Wait 10 seconds (auto-save triggers at 8s)
- [ ] Close browser tab
- [ ] Reopen and login
- [ ] Verify draft application exists
- [ ] Verify data saved correctly
- [ ] Continue and complete application

**Expected Result**: Draft auto-saved and recoverable

---

## 8️⃣ DOCUMENT UPLOAD & VERIFICATION
**Priority**: HIGH

### Test Steps:
- [ ] Login as student
- [ ] Upload result slip (PDF, <10MB)
- [ ] Upload NRC scan (Image, <10MB)
- [ ] Verify identity document is required before moving beyond the education step
- [ ] Verify files uploaded successfully
- [ ] Login as admin
- [ ] View application documents
- [ ] Verify each document
- [ ] Add verification notes
- [ ] Check student receives notification

**Expected Result**: Documents uploaded and verified

---

## 9️⃣ ELIGIBILITY CHECKING
**Priority**: MEDIUM

### Test Steps:
- [ ] Login as student
- [ ] Start application
- [ ] Enter grades in Step 2
- [ ] Verify eligibility status calculated
- [ ] Try with passing grades (should show eligible)
- [ ] Try with failing grades (should show warning)
- [ ] Verify student can still proceed (non-blocking)

**Expected Result**: Eligibility calculated but non-blocking

---

## 🔟 ADMIN DASHBOARD & ANALYTICS
**Priority**: MEDIUM

### Test Steps:
- [ ] Login as admin
- [ ] View dashboard
- [ ] Verify statistics displayed:
  - [ ] Total applications
  - [ ] Pending review count
  - [ ] Approved count
  - [ ] Rejected count
  - [ ] Payment verification pending
- [ ] Check charts render correctly
- [ ] Export applications to CSV
- [ ] Verify CSV contains correct data

**Expected Result**: Dashboard shows accurate statistics

---

## 🔒 SECURITY TESTS
**Priority**: CRITICAL

### Test Steps:
- [ ] Try accessing `/admin` as student (should redirect)
- [ ] Try accessing another student's application (should fail)
- [ ] Try approving application without payment (should fail)
- [ ] Try SQL injection in search fields (should be sanitized)
- [ ] Try uploading executable file (should be rejected)
- [ ] Try accessing API without auth token (should fail)

**Expected Result**: All unauthorized access blocked

---

## 📧 EMAIL NOTIFICATIONS
**Priority**: HIGH

### Test Steps:
- [ ] Registration confirmation email
- [ ] Application submission confirmation
- [ ] Payment verification notification
- [ ] Application status change notification
- [ ] Approval notification
- [ ] Rejection notification

**Expected Result**: All emails sent with correct content

---

## 📱 MOBILE RESPONSIVENESS
**Priority**: MEDIUM

### Test Steps:
- [ ] Test on mobile device (or Chrome DevTools mobile view)
- [ ] Navigate through application wizard
- [ ] Upload documents from mobile
- [ ] Verify all buttons clickable
- [ ] Verify forms usable
- [ ] Check public tracker on mobile

**Expected Result**: Fully functional on mobile

---

## ⚡ PERFORMANCE TESTS
**Priority**: MEDIUM

### Test Steps:
- [ ] Measure page load time (<3s)
- [ ] Test with 10 concurrent users
- [ ] Upload large file (9.5MB)
- [ ] Load applications list with 100+ records
- [ ] Check database query performance

**Expected Result**: Acceptable performance under load

---

## 📊 TEST SUMMARY

| Flow | Priority | Status | Notes |
|------|----------|--------|-------|
| Registration & Login | CRITICAL | ⏳ Pending | |
| Application Submission | CRITICAL | ⏳ Pending | |
| Payment Verification | CRITICAL | ⏳ Pending | |
| Application Approval | CRITICAL | ⏳ Pending | |
| Application Rejection | HIGH | ⏳ Pending | |
| Public Tracker | HIGH | ⏳ Pending | |
| Auto-Save | HIGH | ⏳ Pending | |
| Document Upload | HIGH | ⏳ Pending | |
| Eligibility Check | MEDIUM | ⏳ Pending | |
| Admin Dashboard | MEDIUM | ⏳ Pending | |
| Security | CRITICAL | ⏳ Pending | |
| Email Notifications | HIGH | ⏳ Pending | |
| Mobile | MEDIUM | ⏳ Pending | |
| Performance | MEDIUM | ⏳ Pending | |

---

## 🎯 PASS CRITERIA

**Minimum to Launch**:
- ✅ All CRITICAL tests pass
- ✅ 80%+ of HIGH priority tests pass
- ✅ No security vulnerabilities found
- ✅ Email notifications working

**Recommended**:
- ✅ All tests pass
- ✅ Performance acceptable
- ✅ Mobile fully functional

---

## 🐛 BUG TRACKING

| Bug ID | Severity | Description | Status |
|--------|----------|-------------|--------|
| - | - | - | - |

---

**Test Environment**: Production (mihasv3.pages.dev)
**Test Date**: [To be filled]  
**Tester**: [To be filled]  
**Results**: [To be filled]
