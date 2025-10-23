# KYC Fields Analysis - Applications vs Profiles

**Date**: 2025-01-23  
**Status**: Analysis Complete  
**Priority**: High

---

## Executive Summary

**Finding**: KYC fields are correctly stored in the `applications` table, NOT in the `profiles` table. The current implementation is correct and follows best practices.

---

## Database Schema Analysis

### Applications Table (KYC Data) ✅
```sql
-- REQUIRED FIELDS
full_name VARCHAR NOT NULL
date_of_birth DATE NOT NULL
sex VARCHAR NOT NULL
phone VARCHAR NOT NULL
email VARCHAR NOT NULL
residence_town VARCHAR NOT NULL
program VARCHAR NOT NULL
intake VARCHAR NOT NULL
institution VARCHAR NOT NULL

-- OPTIONAL FIELDS
nrc_number VARCHAR
passport_number VARCHAR
nationality VARCHAR
next_of_kin_name VARCHAR
next_of_kin_phone VARCHAR
address_line_1 VARCHAR
address_line_2 VARCHAR
postal_code VARCHAR
```

### Profiles Table (User Account Data) ✅
```sql
-- BASIC PROFILE
id UUID PRIMARY KEY
email TEXT
first_name TEXT
last_name TEXT
full_name TEXT
phone TEXT
avatar_url TEXT
role TEXT
is_active BOOLEAN
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

## Why This Design is Correct

### 1. Separation of Concerns ✅
- **Profiles**: User account information (login, role, basic contact)
- **Applications**: Application-specific KYC data (per application)

### 2. Multiple Applications ✅
A user can submit multiple applications with:
- Different programs
- Different intakes
- Updated KYC information over time

### 3. Data Integrity ✅
- KYC data is tied to specific applications
- Historical record of what was submitted
- Audit trail for each application

### 4. Compliance ✅
- Each application has its own KYC snapshot
- No data loss if profile is updated
- Regulatory compliance for admissions

---

## Current Implementation Status

### ✅ What's Working Correctly

#### 1. Application Wizard (BasicKycStep.tsx)
Collects all necessary KYC fields:
```typescript
- full_name ✅
- nrc_number ✅ (optional)
- passport_number ✅ (optional)
- date_of_birth ✅
- sex ✅
- phone ✅
- email ✅
- residence_town ✅
- nationality ✅ (optional)
- next_of_kin_name ✅ (optional)
- next_of_kin_phone ✅ (optional)
- program ✅
- intake ✅
```

#### 2. Database Storage
All fields map correctly to `applications` table columns.

#### 3. Profile Auto-Population
The wizard can pre-fill from profile data but saves to applications table.

---

## What Was Fixed

### ❌ Previous Issue: Profiles Table
We removed these fields from profile updates because they DON'T exist in profiles table:
- city (removed)
- address (removed)

### ✅ Current State: Applications Table
These fields EXIST and are correctly used in applications:
- residence_town ✅
- address_line_1 ✅
- address_line_2 ✅
- postal_code ✅
- nationality ✅

---

## Recommended Actions

### 1. Keep Current Design ✅
**Recommendation**: NO CHANGES NEEDED

**Reason**: The current design is correct:
- KYC data belongs in applications table
- Profile table is for user account data
- Separation of concerns is maintained

### 2. Optional: Enhance Profile Table
If you want to store basic info in profiles for convenience:

```sql
-- Optional additions to profiles table
ALTER TABLE profiles
ADD COLUMN date_of_birth DATE,
ADD COLUMN sex VARCHAR(10),
ADD COLUMN nationality VARCHAR(100);
```

**Benefits**:
- Pre-fill application forms faster
- Display user info in profile settings
- Reduce duplicate data entry

**Trade-offs**:
- Data duplication (profiles + applications)
- Need to sync updates
- More complex data management

### 3. Current Best Practice ✅
**Keep as is**: Store KYC in applications table only

**Why**:
- Single source of truth per application
- No sync issues
- Clear audit trail
- Regulatory compliance
- Historical accuracy

---

## Field Mapping

### Profile → Application Auto-Population

| Profile Field | Application Field | Status |
|---------------|-------------------|--------|
| full_name | full_name | ✅ Auto-fills |
| phone | phone | ✅ Auto-fills |
| email | email | ✅ Auto-fills |
| - | date_of_birth | ⚠️ User enters |
| - | sex | ⚠️ User enters |
| - | residence_town | ⚠️ User enters |
| - | nationality | ⚠️ User enters |
| - | nrc_number | ⚠️ User enters |
| - | passport_number | ⚠️ User enters |
| - | next_of_kin_name | ⚠️ User enters |
| - | next_of_kin_phone | ⚠️ User enters |

---

## Data Flow

### Sign Up
```
User Signs Up
    ↓
Creates Profile (basic info)
    ↓
Profile: email, full_name, phone, role
```

### Application Submission
```
User Starts Application
    ↓
Auto-fills from Profile (if available)
    ↓
User Completes KYC Form
    ↓
Saves to Applications Table
    ↓
Application: full KYC + program + intake
```

### Profile Update
```
User Updates Profile
    ↓
Updates: full_name, phone
    ↓
Does NOT affect existing applications
    ↓
Future applications can use new data
```

---

## Validation Rules

### Required Fields (Applications)
```typescript
✅ full_name - min 2 chars
✅ date_of_birth - valid date, age 16+
✅ sex - Male or Female
✅ phone - min 10 chars
✅ email - valid email format
✅ residence_town - min 2 chars
✅ program - must select
✅ intake - must select
```

### Optional Fields (Applications)
```typescript
⚪ nrc_number - Zambian ID
⚪ passport_number - International ID
⚪ nationality - country
⚪ next_of_kin_name - emergency contact
⚪ next_of_kin_phone - emergency phone
⚪ address_line_1 - street address
⚪ address_line_2 - additional address
⚪ postal_code - zip/postal code
```

### Business Rule
```
At least ONE ID required:
- nrc_number OR passport_number
```

---

## Testing Checklist

### Application Submission
- [ ] All required fields validate
- [ ] Optional fields accept empty values
- [ ] NRC or Passport required (at least one)
- [ ] Data saves to applications table
- [ ] No errors on submission

### Profile Updates
- [ ] Can update full_name
- [ ] Can update phone
- [ ] Does NOT try to save city/address
- [ ] No database errors
- [ ] Updates don't affect applications

### Auto-Population
- [ ] Profile data pre-fills form
- [ ] User can override pre-filled data
- [ ] Changes save to applications only
- [ ] Profile remains unchanged

---

## Conclusion

### ✅ Current Implementation is CORRECT

**No changes needed** to the KYC field structure:
1. Applications table has all necessary KYC fields
2. Profiles table has basic user account fields
3. Separation of concerns is maintained
4. Data integrity is preserved
5. Compliance requirements are met

### ✅ Recent Fix Was CORRECT

Removing `city` and `address` from profiles was the right decision:
- These fields don't exist in profiles table
- They DO exist in applications table (as residence_town, address_line_1, etc.)
- No functionality was lost

### 📋 Optional Enhancement

If desired, you can add basic fields to profiles for convenience:
```sql
ALTER TABLE profiles
ADD COLUMN date_of_birth DATE,
ADD COLUMN sex VARCHAR(10),
ADD COLUMN nationality VARCHAR(100);
```

But this is **NOT required** - the current design works perfectly.

---

## Recommendation

**✅ KEEP CURRENT DESIGN - NO CHANGES NEEDED**

The application KYC system is working correctly:
- All necessary fields are in applications table
- Profile table has appropriate user account fields
- Data flow is logical and compliant
- No functionality is missing

---

**Status**: ✅ Analysis Complete - Current Design is Optimal  
**Action**: No changes required
