# Phase 3: Application Flow Testing

## 🎯 Objective
Test complete end-to-end application submission and admin review flows.

---

## 🧪 Test Suite 1: Student Application Submission

### Test 1.1: New Application - Happy Path
**Credentials**: cosmaskanchepa8@gmail.com / Beanola2025

#### Steps:
1. **Login & Navigate**
   - [ ] Login successful
   - [ ] Dashboard loads
   - [ ] Click "New Application"
   - [ ] Wizard loads without errors

2. **Step 1: Basic KYC**
   - [ ] Form pre-populated from profile
   - [ ] All fields visible and editable
   - [ ] Program dropdown loads
   - [ ] Intake dropdown loads
   - [ ] Validation works (try submitting empty)
   - [ ] NRC/Passport validation works
   - [ ] Date of birth validation (must be 16+)
   - [ ] Phone number validation
   - [ ] Email validation
   - [ ] Click "Next Step"

3. **Step 2: Education**
   - [ ] Can add grade entry
   - [ ] Subject dropdown populated
   - [ ] Grade input accepts 1-9
   - [ ] Can add multiple subjects
   - [ ] Can remove grade entry
   - [ ] Eligibility checker shows result
   - [ ] Recommended subjects display
   - [ ] Result slip upload works
   - [ ] Extra KYC upload works
   - [ ] Upload progress shows
   - [ ] Click "Next Step"

4. **Step 3: Payment**
   - [ ] Payment methods dropdown works
   - [ ] Amount field visible (min K153)
   - [ ] Payer name field
   - [ ] Payer phone field
   - [ ] Payment date picker
   - [ ] Reference number field
   - [ ] Proof of payment upload works
   - [ ] Click "Next Step"

5. **Step 4: Review & Submit**
   - [ ] All entered data displays correctly
   - [ ] Can navigate back to edit
   - [ ] Terms checkbox visible
   - [ ] Submit button disabled until checkbox
   - [ ] Check terms checkbox
   - [ ] Submit button enabled
   - [ ] Click "Submit Application"

6. **Submission Success**
   - [ ] Success message displays
   - [ ] Application number shown
   - [ ] Download slip button works
   - [ ] Email slip button works
   - [ ] "View Application" button works
   - [ ] Redirects to application details

**Expected Result**: ✅ Application submitted successfully

---

### Test 1.2: Draft Auto-Save
**Credentials**: cosmaskanchepa8@gmail.com / Beanola2025

#### Steps:
1. **Start New Application**
   - [ ] Fill Step 1 partially
   - [ ] Wait 30 seconds
   - [ ] "Auto-saving..." indicator shows
   - [ ] "Draft saved" confirmation shows

2. **Navigate Away**
   - [ ] Click "Back to Dashboard"
   - [ ] Dashboard shows draft count

3. **Resume Draft**
   - [ ] Click "Continue Draft"
   - [ ] Wizard loads with saved data
   - [ ] All fields populated correctly
   - [ ] Can continue from where left off

**Expected Result**: ✅ Draft saved and restored correctly

---

### Test 1.3: Manual Draft Save
**Credentials**: cosmaskanchepa8@gmail.com / Beanola2025

#### Steps:
1. **Start New Application**
   - [ ] Fill some fields
   - [ ] Click "Save Now" button
   - [ ] "Draft saved" confirmation shows
   - [ ] Navigate away
   - [ ] Return and verify data saved

**Expected Result**: ✅ Manual save works

---

### Test 1.4: Validation Errors
**Credentials**: cosmaskanchepa8@gmail.com / Beanola2025

#### Test Cases:
1. **Empty Fields**
   - [ ] Try next step with empty required fields
   - [ ] Error messages display
   - [ ] Fields highlighted in red

2. **Invalid Data**
   - [ ] Invalid email format
   - [ ] Invalid phone number
   - [ ] Date of birth < 16 years
   - [ ] Grade outside 1-9 range
   - [ ] Amount < K153

3. **File Upload**
   - [ ] File too large (>5MB)
   - [ ] Wrong file type
   - [ ] Error messages clear

**Expected Result**: ✅ All validations work correctly

---

### Test 1.5: File Upload
**Credentials**: cosmaskanchepa8@gmail.com / Beanola2025

#### Test Cases:
1. **Result Slip Upload**
   - [ ] Click upload button
   - [ ] Select PDF file
   - [ ] Progress bar shows
   - [ ] File name displays
   - [ ] Can remove and re-upload

2. **Image Compression**
   - [ ] Upload large image (>2MB)
   - [ ] Compression indicator shows
   - [ ] Compressed file uploaded
   - [ ] Quality acceptable

3. **Multiple Files**
   - [ ] Upload result slip
   - [ ] Upload extra KYC
   - [ ] Upload proof of payment
   - [ ] All files tracked separately

**Expected Result**: ✅ All uploads work correctly

---

## 🛡️ Test Suite 2: Admin Review Flow

### Test 2.1: View Applications List
**Credentials**: cosmas@beanola.com / Beanola2025

#### Steps:
1. **Navigate to Applications**
   - [ ] Login as admin
   - [ ] Click "Applications" in menu
   - [ ] List loads with pagination
   - [ ] All columns visible:
     - Application Number
     - Student Name
     - Program
     - Status
     - Date
     - Actions

2. **Filters**
   - [ ] Status filter works
   - [ ] Program filter works
   - [ ] Date range filter works
   - [ ] Search by name works
   - [ ] Search by application number works

3. **Sorting**
   - [ ] Sort by date (asc/desc)
   - [ ] Sort by status
   - [ ] Sort by name

**Expected Result**: ✅ List and filters work correctly

---

### Test 2.2: Review Application
**Credentials**: cosmas@beanola.com / Beanola2025

#### Steps:
1. **Open Application**
   - [ ] Click on pending application
   - [ ] Details page loads
   - [ ] All sections visible:
     - Student Information
     - Program Details
     - Education Background
     - Payment Information
     - Documents

2. **View Documents**
   - [ ] Result slip viewable
   - [ ] Extra KYC viewable
   - [ ] Proof of payment viewable
   - [ ] Can download each document

3. **Check Calculations**
   - [ ] Grades displayed correctly
   - [ ] Eligibility status accurate
   - [ ] Points calculation correct

**Expected Result**: ✅ All data displays correctly

---

### Test 2.3: Update Status
**Credentials**: cosmas@beanola.com / Beanola2025

#### Test Cases:
1. **Approve Application**
   - [ ] Click "Approve" button
   - [ ] Confirmation dialog shows
   - [ ] Confirm approval
   - [ ] Status updates to "Approved"
   - [ ] Student receives notification
   - [ ] Audit log entry created

2. **Reject Application**
   - [ ] Click "Reject" button
   - [ ] Reason field required
   - [ ] Enter rejection reason
   - [ ] Confirm rejection
   - [ ] Status updates to "Rejected"
   - [ ] Student receives notification with reason
   - [ ] Audit log entry created

3. **Under Review**
   - [ ] Click "Under Review"
   - [ ] Status updates
   - [ ] Student notified

**Expected Result**: ✅ Status updates work correctly

---

### Test 2.4: Bulk Operations
**Credentials**: cosmas@beanola.com / Beanola2025

#### Steps:
1. **Select Multiple**
   - [ ] Checkbox on each row
   - [ ] Select 3+ applications
   - [ ] Bulk actions menu appears

2. **Bulk Status Update**
   - [ ] Select "Update Status"
   - [ ] Choose new status
   - [ ] Confirm action
   - [ ] All selected updated
   - [ ] Notifications sent

3. **Bulk Export**
   - [ ] Select applications
   - [ ] Click "Export"
   - [ ] CSV downloads
   - [ ] All data included

**Expected Result**: ✅ Bulk operations work

---

## 🔒 Test Suite 3: Security & Permissions

### Test 3.1: Student Access Control
**Credentials**: cosmaskanchepa8@gmail.com / Beanola2025

#### Test Cases:
- [ ] Cannot access /admin routes
- [ ] Cannot view other students' applications
- [ ] Cannot modify submitted applications
- [ ] Cannot access admin API endpoints

**Expected Result**: ✅ Access properly restricted

---

### Test 3.2: Admin Access Control
**Credentials**: cosmas@beanola.com / Beanola2025

#### Test Cases:
- [ ] Can access all admin routes
- [ ] Can view all applications
- [ ] Can update application status
- [ ] Can manage users
- [ ] Can view audit logs

**Expected Result**: ✅ Admin has full access

---

## ⚡ Test Suite 4: Performance

### Test 4.1: Load Times
- [ ] Dashboard loads < 3s
- [ ] Application wizard loads < 2s
- [ ] Admin applications list < 3s
- [ ] File upload < 5s (5MB file)

### Test 4.2: Concurrent Users
- [ ] 2 students submit simultaneously
- [ ] No data corruption
- [ ] Both submissions successful

**Expected Result**: ✅ Performance acceptable

---

## 🐛 Test Suite 5: Error Handling

### Test 5.1: Network Errors
1. **Offline Submission**
   - [ ] Disconnect network
   - [ ] Try to submit
   - [ ] Error message shows
   - [ ] Data preserved in draft

2. **Slow Network**
   - [ ] Throttle to 3G
   - [ ] Upload file
   - [ ] Progress indicator works
   - [ ] Eventually succeeds

### Test 5.2: Session Timeout
- [ ] Leave form idle 30+ minutes
- [ ] Try to submit
- [ ] Session expired message
- [ ] Redirects to login
- [ ] Draft preserved

**Expected Result**: ✅ Errors handled gracefully

---

## 📊 Test Results Summary

| Test Suite | Total Tests | Passed | Failed | Status |
|------------|-------------|--------|--------|--------|
| Student Application | 5 | - | - | ⏳ Pending |
| Admin Review | 4 | - | - | ⏳ Pending |
| Security | 2 | - | - | ⏳ Pending |
| Performance | 2 | - | - | ⏳ Pending |
| Error Handling | 2 | - | - | ⏳ Pending |
| **TOTAL** | **15** | **-** | **-** | **⏳ Pending** |

---

## 🚀 Quick Test Commands

```bash
# Start dev server
npm run dev

# Run in network mode for mobile testing
npm run dev:network

# Run automated tests
npm test

# Run E2E tests
npm run test:e2e
```

---

## 📝 Test Notes

### Issues Found:
*Record any issues discovered during testing*

### Recommendations:
*Note any improvements or optimizations*

---

**Phase 3 Status**: 🚧 IN PROGRESS  
**Started**: 2025-01-14  
**Target Completion**: TBD
