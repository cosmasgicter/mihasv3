-- Seed communication_templates for all template_keys used in production code.
-- Idempotent: uses ON CONFLICT ... DO UPDATE so re-running is safe.
-- NOTE: All Django models use managed=False so these must be applied manually to Neon.

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'application_submitted',
   'MIHAS Admissions — Your Application Has Been Submitted',
   '<p>Dear {{student_name}},</p><p>Your application for <strong>{{program_name}}</strong> ({{intake_name}}) has been successfully submitted.</p><p>Your tracking code is: <strong>{{tracking_code}}</strong></p><p>We will review your application and notify you of any updates.</p><p>Please log in to your portal to track progress.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'application_under_review',
   'MIHAS Admissions — Your Application Is Under Review',
   '<p>Dear {{student_name}},</p><p>Your application for <strong>{{program_name}}</strong> ({{intake_name}}) is now under review by our admissions team.</p><p>You will be notified once a decision has been made.</p><p>Please log in to your portal for updates.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'application_approved',
   'MIHAS Admissions — Congratulations! Your Application Has Been Approved',
   '<p>Dear {{student_name}},</p><p>Congratulations! Your application for <strong>{{program_name}}</strong> ({{intake_name}}) has been approved.</p><p>Please log in to your portal to confirm your enrollment.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'application_rejected',
   'MIHAS Admissions — Application Decision',
   '<p>Dear {{student_name}},</p><p>After careful review, we regret to inform you that your application for <strong>{{program_name}}</strong> ({{intake_name}}) has not been successful.</p><p>{{admin_feedback}}</p><p>You may apply again for a future intake.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'condition_assigned',
   'MIHAS Admissions — Conditional Offer Issued',
   '<p>Dear {{student_name}},</p><p>Your application for <strong>{{program_name}}</strong> ({{intake_name}}) has been conditionally approved.</p><p>Please log in to view and fulfil the conditions before the deadline.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'condition_verified',
   'MIHAS Admissions — Condition Met',
   '<p>Dear {{student_name}},</p><p>A condition on your application for <strong>{{program_name}}</strong> has been verified and marked as met.</p><p>{{condition_name}}</p><p>Please log in to check your remaining conditions.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'waitlist_position_assigned',
   'MIHAS Admissions — You Have Been Waitlisted',
   '<p>Dear {{student_name}},</p><p>Your application for <strong>{{program_name}}</strong> ({{intake_name}}) has been placed on the waitlist at position {{position}}.</p><p>You will be notified if a spot becomes available.</p><p>Please log in to your portal for updates.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'enrollment_confirmed',
   'MIHAS Admissions — Enrollment Confirmed',
   '<p>Dear {{student_name}},</p><p>Your enrollment for <strong>{{program_name}}</strong> ({{intake_name}}) has been confirmed.</p><p>Welcome to MIHAS! Please log in for next steps.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'enrollment_expired',
   'MIHAS Admissions — Enrollment Confirmation Expired',
   '<p>Dear {{student_name}},</p><p>Your enrollment confirmation for <strong>{{program_name}}</strong> ({{intake_name}}) has expired because it was not confirmed before the deadline.</p><p>Your spot has been released. You may reapply for a future intake.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'enrollment_confirmation_reminder',
   'MIHAS Admissions — Confirm Your Enrollment Soon',
   '<p>Dear {{student_name}},</p><p>Please confirm your enrollment for <strong>{{program_name}}</strong> ({{intake_name}}) before {{deadline_date}}.</p><p>You have {{days_until_expiry}} day(s) remaining. If not confirmed, your spot will be released.</p><p>Please log in to confirm.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'payment_expired',
   'MIHAS Admissions — Payment Expired',
   '<p>Dear {{student_name}},</p><p>Your pending payment for application {{application_number}} has expired after 24 hours.</p><p>Please log in and initiate a new payment.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'deferred_payment_reminder',
   'MIHAS Admissions — Complete Your Payment',
   '<p>Dear {{student_name}},</p><p>You deferred payment for your application to <strong>{{program_name}}</strong> ({{intake_name}}).</p><p>Please log in and complete your payment to avoid delays in processing.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'document_verified',
   'MIHAS Admissions — Document Verified',
   '<p>Dear {{student_name}},</p><p>Your document ({{document_name}}) for application {{application_number}} has been verified.</p><p>Please log in to check your application status.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'document_rejected',
   'MIHAS Admissions — Document Requires Attention',
   '<p>Dear {{student_name}},</p><p>Your document ({{document_name}}) for application {{application_number}} could not be verified. Please upload a clearer copy.</p><p>Please log in to re-upload.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'payment_verified',
   'MIHAS Admissions — Payment Confirmed',
   '<p>Dear {{student_name}},</p><p>Your payment for application {{application_number}} has been verified and confirmed.</p><p>Please log in to continue with your application.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'payment_rejected',
   'MIHAS Admissions — Payment Could Not Be Verified',
   '<p>Dear {{student_name}},</p><p>Your payment for application {{application_number}} could not be verified. Please try again or contact support.</p><p>Please log in for details.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'reviewer_assigned',
   'MIHAS Admissions — Reviewer Assigned',
   '<p>Dear {{student_name}},</p><p>A reviewer has been assigned to your application for <strong>{{program_name}}</strong> ({{intake_name}}).</p><p>You will be notified once the review is complete.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'amendment_reviewed',
   'MIHAS Admissions — Amendment Request Reviewed',
   '<p>Dear {{student_name}},</p><p>Your amendment request for field "{{field_name}}" has been {{amendment_status}}.</p><p>Please log in to view the details.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO communication_templates (id, template_key, subject_template, body_template, channel, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'fee_waiver_granted',
   'MIHAS Admissions — Fee Waiver Granted',
   '<p>Dear {{student_name}},</p><p>A fee waiver has been granted for your application to <strong>{{program_name}}</strong> ({{intake_name}}).</p><p>Please log in to continue with your application.</p><p>Best regards,<br>MIHAS Admissions</p>',
   'both', true, NOW(), NOW())
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
