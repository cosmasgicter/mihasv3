---
inclusion: always
---

# MIHAS Application System - Product Context

MIHAS (Mukuba Institute of Health and Allied Sciences) Application System V3 is a production student admissions platform serving a Zambian medical institute. This is a **live system with real users and data**.

## Critical Constraints

**PRODUCTION SYSTEM RULES:**
- All changes must maintain backward compatibility with existing data
- Never break existing user workflows or data integrity
- Test thoroughly before suggesting production deployments
- Respect the 86-table database schema - coordinate schema changes carefully
- Consider offline functionality - PWA must work without network

**DATA SENSITIVITY:**
- Student applications contain personal information (PII)
- Medical credentials and eligibility data are regulated
- Maintain GDPR-like privacy standards even though not EU-based
- Never log sensitive data in production

## Core User Flows

### 1. Student Application Journey
- **Registration** → Email verification → Profile creation
- **4-Step Wizard**: Personal Info → Academic History → Program Selection → Document Upload
- **Auto-save**: Every 8 seconds to prevent data loss
- **Non-blocking validation**: Students can proceed even if eligibility checks fail
- **Application submission** → Payment → Interview scheduling → Admission decision

### 2. Admin Application Review
- View applications with filtering and search
- Verify eligibility against external systems (HPCZ, GNC/NMCZ, ECZ)
- Approve/reject applications with audit trail
- Generate admission letters and slips
- Bulk operations for efficiency

### 3. Eligibility Checking System
- **HPCZ**: Health Professions Council of Zambia registration verification
- **GNC/NMCZ**: General Nursing Council / Nurses and Midwives Council verification
- **ECZ**: Examinations Council of Zambia grade verification
- **Design principle**: Always non-blocking - manual override available

## Key Features & Behaviors

### Application Wizard
- 4 steps with progress tracking
- Auto-save every 8 seconds (critical - prevents data loss)
- Validation on blur and submit
- Draft state preserved across sessions
- Mobile-responsive with touch-friendly controls

### Document Management
- PDF generation for slips, letters, and reports
- File uploads with validation (size, type, virus scanning)
- Document versioning and audit trail
- Bulk document operations for admins

### Notification System
- **Email**: Transactional via Resend (application status, interviews, etc.)
- **SMS**: Critical updates via Twilio
- **WhatsApp**: Optional notifications via Twilio
- **In-app**: Real-time via Supabase subscriptions
- All notifications logged for audit

### Real-time Features
- Application status updates via Supabase real-time subscriptions
- Admin dashboard live metrics
- Notification delivery without page refresh

## System Scale & Architecture

- **Database**: 86 tables in PostgreSQL (Supabase)
- **API**: 47 Cloudflare Pages Functions (serverless)
- **Frontend**: 120+ React components, ~56K LOC
- **Users**: 3 roles (Student, Admin, Super Admin)
- **Deployment**: Cloudflare Pages with edge functions

## User Roles & Permissions

### Student
- Create and submit applications
- Upload documents
- Track application status
- Schedule interviews
- Make payments

### Admin
- Review and process applications
- Verify eligibility
- Approve/reject applications
- Generate reports
- Manage interviews

### Super Admin
- All admin permissions
- User management
- System configuration
- Analytics and reporting
- Audit trail access

## Business Rules to Respect

1. **Eligibility is advisory, not blocking**: Students can always proceed even if checks fail
2. **Payment before interview**: Students must pay application fee before interview scheduling
3. **Document requirements vary by program**: Different programs require different documents
4. **Zambian grading system**: ECZ grades (1-9, where 1-6 is pass, 7-9 is fail)
5. **Academic year cycles**: Applications open/close based on academic calendar
6. **Interview slots are limited**: First-come-first-served with admin override

## Performance Expectations

- **First load**: <2.5s on 3G connection (mobile-first market)
- **Wizard navigation**: Instant (<100ms)
- **Auto-save**: Silent, non-blocking
- **Document upload**: Progress indication, resumable
- **Offline mode**: Core features work without network

## Common Pitfalls to Avoid

- Don't assume fast internet - optimize for 3G/4G
- Don't block user progress on external API failures
- Don't remove auto-save - data loss is critical issue
- Don't break mobile layouts - majority of users on mobile
- Don't skip validation - but make it helpful, not blocking
- Don't ignore accessibility - screen readers must work
- Don't log PII in production logs or error tracking

## Integration Points

- **Supabase**: Auth, database, real-time, storage
- **Cloudflare**: Hosting, functions, CDN, DDoS protection
- **Resend**: Email delivery
- **Twilio**: SMS and WhatsApp
- **External APIs**: HPCZ, GNC/NMCZ, ECZ (unreliable - always have fallbacks)

## When Making Changes

1. Consider impact on existing applications in progress
2. Test with realistic Zambian data (names, phone formats, grades)
3. Verify mobile responsiveness (majority of users)
4. Check offline functionality if touching PWA features
5. Ensure admin workflows remain efficient (they process hundreds of applications)
6. Maintain audit trail for compliance
7. Consider performance on slower devices and networks