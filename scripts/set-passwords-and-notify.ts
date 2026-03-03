/**
 * Set passwords for all users and send notification emails
 * Run with: bun run scripts/set-passwords-and-notify.ts
 */

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';

const DATABASE_URL = process.env.DATABASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

if (!RESEND_API_KEY) {
  console.error('RESEND_API_KEY not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const resend = new Resend(RESEND_API_KEY);

const PASSWORD = process.env.TEST_PASSWORD;
if (!PASSWORD) {
  console.error('TEST_PASSWORD env var required');
  process.exit(1);
}
const APP_URL = '***REMOVED***';

async function main() {
  console.log('Starting password update and email notification...\n');

  // Hash the password
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  console.log('Password hashed successfully\n');

  // Get all users without passwords
  const users = await sql`
    SELECT id, email, first_name, last_name, role 
    FROM profiles 
    WHERE password_hash IS NULL
  `;

  console.log(`Found ${users.length} users without passwords\n`);

  if (users.length === 0) {
    console.log('No users need password updates');
    return;
  }

  // Update all passwords
  const updateResult = await sql`
    UPDATE profiles 
    SET password_hash = ${passwordHash}, updated_at = NOW() 
    WHERE password_hash IS NULL
    RETURNING email
  `;

  console.log(`Updated passwords for ${updateResult.length} users\n`);

  // Send emails to each user
  let emailsSent = 0;
  let emailsFailed = 0;

  for (const user of users) {
    const firstName = user.first_name || 'User';
    
    try {
      await resend.emails.send({
        from: 'MIHAS Admissions <***REMOVED***>',
        to: user.email,
        subject: 'Your MIHAS Application Portal Password Has Been Set',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a365d;">MIHAS Application Portal</h2>
            <p>Dear ${firstName},</p>
            <p>Your password for the MIHAS Application Portal has been set. You can now log in to your account.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Email:</strong> ${user.email}</p>
              <p style="margin: 10px 0 0;"><strong>Temporary Password:</strong> ${PASSWORD}</p>
            </div>
            <p><strong>Important:</strong> Please change your password after logging in for security purposes.</p>
            <p>
              <a href="${APP_URL}/signin" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Log In Now
              </a>
            </p>
            <p style="color: #718096; font-size: 14px; margin-top: 30px;">
              If you did not request this, please contact us at ***REMOVED***
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
            <p style="color: #a0aec0; font-size: 12px;">
              Mukuba Institute of Health and Allied Sciences<br>
              Kitwe, Zambia
            </p>
          </div>
        `,
      });
      emailsSent++;
      console.log(`✓ Email sent to ${user.email}`);
    } catch (error) {
      emailsFailed++;
      console.error(`✗ Failed to send email to ${user.email}:`, error);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Passwords updated: ${updateResult.length}`);
  console.log(`Emails sent: ${emailsSent}`);
  console.log(`Emails failed: ${emailsFailed}`);
}

main().catch(console.error);
