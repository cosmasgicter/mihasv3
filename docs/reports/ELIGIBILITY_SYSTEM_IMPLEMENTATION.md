# Eligibility System Implementation

## Overview

This document describes the comprehensive eligibility checking system implemented for the MIHAS Application System, based on official guidelines from:
- **HPCZ** (Health Professions Council of Zambia)
- **GNC/NMCZ** (General Nursing Council / Nurses and Midwives Council of Zambia)
- **ECZ** (Examinations Council of Zambia)

## Key Features

### 1. **Non-Blocking Design**
- ✅ Students can **always proceed** with their application regardless of eligibility status
- ✅ Eligibility checks are **advisory only** - they inform but never block
- ✅ Admissions committee reviews all applications, including those not meeting standard requirements

### 2. **Accurate Program Requirements**

#### Diploma in Clinical Medicine (DCM) - HPCZ
**Mandatory Requirements:**
- Minimum 5 O-Level credits (grades 1-6)
- Required subjects: English, Mathematics, Biology, Chemistry, Physics
- Core science subjects must have minimum grade 6 (credit level)

#### Diploma in Registered Nursing (DRN) - GNC/NMCZ
**Mandatory Requirements:**
- Minimum 5 O-Level credits (grades 1-6)
- Required subjects: English, Mathematics, Biology
- Chemistry or Physics highly recommended
- English, Mathematics, and Biology must have minimum grade 6 (credit level)

#### Diploma in Environmental Health (DEH) - HPCZ
**Mandatory Requirements:**
- Minimum 5 O-Level credits (grades 1-6)
- Required subjects: English, Mathematics, Biology, Chemistry
- Biology and Chemistry must have minimum grade 6 (credit level)
- Geography or Agricultural Science recommended

### 3. **Zambian Grading System**
```
Grade 1: Distinction (A+)
Grade 2-6: Credit (A to C)
Grade 7-8: Pass (D+ to D)
Grade 9: Fail (F)
```

**Credit Level (Grade 6 or better)** is the standard requirement for core subjects.

## Implementation Components

### Frontend Components

#### 1. `EligibilityNotification.tsx`
Displays eligibility status with:
- ✅ Green notification for eligible students
- ⚠️ Yellow advisory for students not meeting requirements
- ℹ️ Blue info box reminding students they can still proceed
- Regulatory body badge (HPCZ, GNC/NMCZ, ECZ)
- Score percentage
- Detailed recommendations

#### 2. `EducationStep.tsx`
Updated to use the new notification component with real-time eligibility checking as students enter grades.

### Backend Logic

#### 1. `eligibility.ts`
Core eligibility checking logic:
- `checkEligibility()` - Main function that evaluates student grades against program requirements
- Returns detailed result including:
  - Eligibility status
  - Score percentage
  - Missing subjects
  - Weak grades
  - Recommendations
  - `canProceed: true` (always allows proceeding)

#### 2. `eligibilityEngine.ts`
Advanced eligibility engine with:
- Database-driven rules evaluation
- Regulatory compliance checking
- Assessment history tracking
- Appeal submission support
- **Never blocks applications** - status is advisory only

#### 3. `regulatoryGuidelines.ts`
Official guidelines from regulatory bodies:
- HPCZ guidelines for health programs
- GNC/NMCZ guidelines for nursing programs
- ECZ guidelines for education programs
- Compliance checking engine

### Database Schema

#### Tables

**eligibility_rules**
```sql
- program_id (FK to programs)
- rule_name (e.g., "Core Science Subjects")
- rule_type (subject_count, specific_subject, grade_average, etc.)
- condition_json (flexible rule conditions)
- weight (importance of rule)
- is_active (enable/disable rules)
```

**regulatory_guidelines**
```sql
- program_id (FK to programs)
- regulatory_body (HPCZ, GNC/NMCZ, ECZ)
- program_code (DCM, DRN, DEH, etc.)
- guideline_type (admission, academic, professional)
- requirement_text (human-readable requirement)
- compliance_level (mandatory, recommended, optional)
- verification_required (boolean)
- effective_date, expiry_date
```

**eligibility_assessments**
```sql
- application_id (FK to applications)
- program_id (FK to programs)
- overall_score (0-100)
- eligibility_status (eligible, conditional, under_review)
- detailed_breakdown (JSON with scores)
- missing_requirements (JSON array)
- recommendations (JSON array)
```

## User Experience Flow

### 1. Student Enters Grades
```
Student selects subjects and enters grades
↓
Real-time eligibility check runs
↓
Notification appears (green or yellow)
```

### 2. Eligible Student
```
✓ Green notification: "Meets HPCZ requirements for Clinical Medicine"
- Score: 85%
- All requirements met
- Can proceed with confidence
```

### 3. Not Eligible Student
```
⚠ Yellow advisory: "Advisory for Clinical Medicine"
- Score: 60%
- Missing: Physics
- Weak grades: Chemistry (grade 7, need 6)

ℹ️ Blue info box:
"You can still proceed with your application. The admissions 
committee will review your case. Please consult with the 
institution for guidance on alternative pathways."

Recommendations:
• Add Physics to your subject selection
• Improve Chemistry to at least grade 6 (credit level)
• Consider foundation program pathway
```

### 4. Application Submission
```
Student can ALWAYS click "Submit Application"
↓
Application is submitted regardless of eligibility
↓
Admissions committee reviews all applications
↓
Committee makes final decision
```

## API Endpoints

### Check Eligibility
```typescript
POST /api/eligibility/check
Body: {
  programId: string
  grades: Array<{
    subject_id: string
    subject_name: string
    grade: number
  }>
}

Response: {
  eligible: boolean
  message: string
  score: number
  regulatoryBody: string
  recommendations: string[]
  canProceed: true  // Always true
}
```

### Get Program Requirements
```typescript
GET /api/programs/:id/requirements

Response: {
  program: {...}
  eligibilityRules: [...]
  regulatoryGuidelines: [...]
}
```

## Testing

### Test Scenarios

#### 1. Eligible Student (Clinical Medicine)
```javascript
{
  grades: [
    { subject: "English", grade: 3 },
    { subject: "Mathematics", grade: 4 },
    { subject: "Biology", grade: 5 },
    { subject: "Chemistry", grade: 5 },
    { subject: "Physics", grade: 6 }
  ]
}
// Expected: ✓ Eligible, Score: 90%+
```

#### 2. Missing Subject (Clinical Medicine)
```javascript
{
  grades: [
    { subject: "English", grade: 3 },
    { subject: "Mathematics", grade: 4 },
    { subject: "Biology", grade: 5 },
    { subject: "Chemistry", grade: 5 }
    // Missing: Physics
  ]
}
// Expected: ⚠ Advisory, can still proceed
```

#### 3. Weak Grades (Nursing)
```javascript
{
  grades: [
    { subject: "English", grade: 7 },  // Below credit
    { subject: "Mathematics", grade: 6 },
    { subject: "Biology", grade: 8 },  // Below credit
    { subject: "Chemistry", grade: 5 },
    { subject: "Physics", grade: 6 }
  ]
}
// Expected: ⚠ Advisory, recommendations to improve
```

## Configuration

### Adding New Programs

1. **Add program to database:**
```sql
INSERT INTO programs (name, code, description)
VALUES ('New Program', 'NP', 'Description');
```

2. **Add eligibility rules:**
```sql
INSERT INTO eligibility_rules (program_id, rule_name, rule_type, condition_json, weight)
VALUES (
  'program-uuid',
  'Core Subjects',
  'specific_subject',
  '{"required_subjects": ["English", "Math"], "min_grade": 6}',
  2.0
);
```

3. **Add regulatory guidelines:**
```sql
INSERT INTO regulatory_guidelines (
  program_id, regulatory_body, guideline_type, 
  requirement_text, compliance_level
)
VALUES (
  'program-uuid',
  'HPCZ',
  'admission',
  'Minimum 5 O-Level credits...',
  'mandatory'
);
```

4. **Update eligibility.ts:**
```typescript
const PROGRAM_REQUIREMENTS = {
  'new program': {
    minSubjects: 5,
    requiredSubjects: ['english', 'mathematics'],
    minGrade: 8,
    coreSubjectsMinGrade: 6,
    regulatoryBody: 'HPCZ'
  }
}
```

## Maintenance

### Updating Requirements

When regulatory bodies update requirements:

1. Update `regulatoryGuidelines.ts` with new guidelines
2. Update database `regulatory_guidelines` table
3. Update `eligibility_rules` if calculation logic changes
4. Update `PROGRAM_REQUIREMENTS` in `eligibility.ts`
5. Test with sample student data
6. Deploy changes

### Monitoring

Track eligibility metrics:
- Percentage of eligible vs. conditional applications
- Common missing requirements
- Average eligibility scores by program
- Appeal success rates

## Support

### For Students
- Eligibility is advisory - you can always apply
- Consult with admissions office for guidance
- Consider alternative pathways if not meeting requirements
- Foundation programs available for most programs

### For Admissions Staff
- Review all applications regardless of eligibility status
- Use eligibility score as one factor in decision
- Consider special circumstances and appeals
- Document decisions for audit trail

## References

- HPCZ Official Website: [hpcz.org.zm](https://hpcz.org.zm)
- GNC/NMCZ Guidelines: Contact institution
- ECZ Grading System: [eczambia.org](https://eczambia.org)

## Version History

- **v1.0** (2025-01-23): Initial implementation with HPCZ, GNC/NMCZ, ECZ guidelines
- Non-blocking design ensures all students can apply
- Real-time eligibility checking with detailed feedback
- Database-driven rules for easy updates

---

**Last Updated:** 2025-01-23  
**Maintained By:** MIHAS Development Team
