/**
 * Professional Email Templates for MIHAS Application System
 */

const baseStyles = `
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
  .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
  .header { background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); padding: 40px 20px; text-align: center; }
  .logo { color: #ffffff; font-size: 28px; font-weight: bold; margin: 0; letter-spacing: 1px; }
  .content { padding: 40px 30px; }
  .title { color: #1f2937; font-size: 24px; font-weight: 600; margin: 0 0 20px 0; }
  .text { color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0; }
  .highlight-box { background: #f3f4f6; border-left: 4px solid #2563eb; padding: 20px; margin: 25px 0; border-radius: 4px; }
  .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
  .info-label { color: #6b7280; font-size: 14px; font-weight: 500; }
  .info-value { color: #1f2937; font-size: 14px; font-weight: 600; }
  .button { display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 25px 0; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2); }
  .footer { background: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb; }
  .footer-text { color: #6b7280; font-size: 14px; margin: 5px 0; }
  .social-links { margin: 20px 0; }
  .social-link { display: inline-block; margin: 0 10px; color: #6b7280; text-decoration: none; }
  .badge { display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin: 10px 0; }
  .badge-success { background: #d1fae5; color: #065f46; }
  .badge-warning { background: #fef3c7; color: #92400e; }
  .badge-error { background: #fee2e2; color: #991b1b; }
  .badge-info { background: #dbeafe; color: #1e40af; }
`;

export function getApplicationStatusEmail({ status, applicationNumber, program, studentName, notes, appUrl }) {
  const statusConfig = {
    submitted: {
      emoji: '✅',
      title: 'Application Submitted Successfully',
      color: '#10b981',
      badge: 'badge-success',
      message: `Your application has been successfully submitted and is now under review by our admissions team.`
    },
    approved: {
      emoji: '🎉',
      title: 'Congratulations! Application Approved',
      color: '#10b981',
      badge: 'badge-success',
      message: `We are delighted to inform you that your application has been approved! Welcome to the MIHAS-KATC family.`
    },
    rejected: {
      emoji: '📋',
      title: 'Application Status Update',
      color: '#ef4444',
      badge: 'badge-error',
      message: `Thank you for your interest in MIHAS-KATC. After careful review, we regret to inform you that we are unable to offer you admission at this time.`
    },
    under_review: {
      emoji: '👀',
      title: 'Application Under Review',
      color: '#3b82f6',
      badge: 'badge-info',
      message: `Your application is currently being reviewed by our admissions committee. We will notify you once a decision has been made.`
    },
    pending_documents: {
      emoji: '📄',
      title: 'Additional Documents Required',
      color: '#f59e0b',
      badge: 'badge-warning',
      message: `Your application requires additional documents to proceed. Please upload the required documents as soon as possible.`
    }
  };

  const config = statusConfig[status] || statusConfig.submitted;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${baseStyles}</style>
</head>
<body style="background-color: #f3f4f6; padding: 20px;">
  <div class="container">
    <div class="header">
      <h1 class="logo">MIHAS-KATC</h1>
      <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 14px;">Mukuba Institute of Health & Allied Sciences</p>
    </div>
    
    <div class="content">
      <div style="text-align: center; margin-bottom: 30px;">
        <span style="font-size: 48px;">${config.emoji}</span>
      </div>
      
      <h2 class="title" style="color: ${config.color};">${config.title}</h2>
      
      <p class="text">Dear ${studentName || 'Student'},</p>
      
      <p class="text">${config.message}</p>
      
      <div class="highlight-box">
        <div class="info-row">
          <span class="info-label">Application Number</span>
          <span class="info-value">${applicationNumber}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Program</span>
          <span class="info-value">${program}</span>
        </div>
        <div class="info-row" style="border-bottom: none;">
          <span class="info-label">Status</span>
          <span class="info-value">
            <span class="badge ${config.badge}">${status.replace('_', ' ').toUpperCase()}</span>
          </span>
        </div>
      </div>
      
      ${notes ? `
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #92400e; font-weight: 600; font-size: 14px;">📝 Note from Admissions:</p>
        <p style="margin: 10px 0 0 0; color: #78350f; font-size: 14px; line-height: 1.6;">${notes}</p>
      </div>
      ` : ''}
      
      ${status === 'approved' ? `
      <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); padding: 25px; border-radius: 8px; margin: 25px 0; text-align: center;">
        <p style="margin: 0; color: #065f46; font-size: 18px; font-weight: 600;">🎓 Next Steps</p>
        <p style="margin: 10px 0 0 0; color: #047857; font-size: 14px;">Check your email for enrollment instructions and important dates.</p>
      </div>
      ` : ''}
      
      <div style="text-align: center;">
        <a href="${appUrl}" class="button">View Application Details</a>
      </div>
      
      <p class="text" style="font-size: 14px; color: #6b7280; margin-top: 30px;">
        If you have any questions, please contact our admissions office at 
        <a href="mailto:admissions@mihas.edu.zm" style="color: #2563eb;">admissions@mihas.edu.zm</a>
      </p>
    </div>
    
    <div class="footer">
      <p class="footer-text" style="font-weight: 600; color: #1f2937;">MIHAS-KATC Application System</p>
      <p class="footer-text">Mukuba Institute of Health & Allied Sciences</p>
      <p class="footer-text">Kitwe, Zambia</p>
      
      <div class="social-links">
        <a href="https://mihas.edu.zm" class="social-link">Website</a>
        <span style="color: #d1d5db;">•</span>
        <a href="mailto:admissions@mihas.edu.zm" class="social-link">Email</a>
        <span style="color: #d1d5db;">•</span>
        <a href="tel:+260123456789" class="social-link">Phone</a>
      </div>
      
      <p class="footer-text" style="font-size: 12px; margin-top: 20px;">
        © ${new Date().getFullYear()} MIHAS-KATC. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

export function getPaymentStatusEmail({ status, applicationNumber, amount, studentName, appUrl }) {
  const statusConfig = {
    verified: {
      emoji: '✅',
      title: 'Payment Verified Successfully',
      color: '#10b981',
      badge: 'badge-success',
      message: `Great news! Your payment has been verified and your application is now being processed.`
    },
    rejected: {
      emoji: '❌',
      title: 'Payment Verification Failed',
      color: '#ef4444',
      badge: 'badge-error',
      message: `We were unable to verify your payment. Please review the details below and contact us if you need assistance.`
    },
    pending_review: {
      emoji: '⏳',
      title: 'Payment Under Review',
      color: '#f59e0b',
      badge: 'badge-warning',
      message: `Your payment is currently being reviewed by our finance team. You will be notified once verification is complete.`
    }
  };

  const config = statusConfig[status] || statusConfig.pending_review;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${baseStyles}</style>
</head>
<body style="background-color: #f3f4f6; padding: 20px;">
  <div class="container">
    <div class="header">
      <h1 class="logo">MIHAS-KATC</h1>
      <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 14px;">Payment Notification</p>
    </div>
    
    <div class="content">
      <div style="text-align: center; margin-bottom: 30px;">
        <span style="font-size: 48px;">${config.emoji}</span>
      </div>
      
      <h2 class="title" style="color: ${config.color};">${config.title}</h2>
      
      <p class="text">Dear ${studentName || 'Student'},</p>
      
      <p class="text">${config.message}</p>
      
      <div class="highlight-box">
        <div class="info-row">
          <span class="info-label">Application Number</span>
          <span class="info-value">${applicationNumber}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Amount</span>
          <span class="info-value">K${amount || 153}.00</span>
        </div>
        <div class="info-row" style="border-bottom: none;">
          <span class="info-label">Payment Status</span>
          <span class="info-value">
            <span class="badge ${config.badge}">${status.replace('_', ' ').toUpperCase()}</span>
          </span>
        </div>
      </div>
      
      ${status === 'verified' ? `
      <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); padding: 25px; border-radius: 8px; margin: 25px 0; text-align: center;">
        <p style="margin: 0; color: #065f46; font-size: 16px; font-weight: 600;">💳 Payment Receipt Available</p>
        <p style="margin: 10px 0 0 0; color: #047857; font-size: 14px;">You can now download your official payment receipt from your application dashboard.</p>
      </div>
      ` : ''}
      
      ${status === 'rejected' ? `
      <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 20px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #991b1b; font-weight: 600; font-size: 14px;">⚠️ Action Required</p>
        <p style="margin: 10px 0 0 0; color: #7f1d1d; font-size: 14px; line-height: 1.6;">
          Please contact our admissions office or resubmit your proof of payment with the correct details.
        </p>
      </div>
      ` : ''}
      
      <div style="text-align: center;">
        <a href="${appUrl}" class="button">View Application</a>
      </div>
      
      <p class="text" style="font-size: 14px; color: #6b7280; margin-top: 30px;">
        For payment inquiries, contact us at 
        <a href="mailto:admissions@mihas.edu.zm" style="color: #2563eb;">admissions@mihas.edu.zm</a>
      </p>
    </div>
    
    <div class="footer">
      <p class="footer-text" style="font-weight: 600; color: #1f2937;">MIHAS-KATC Finance Department</p>
      <p class="footer-text">Mukuba Institute of Health & Allied Sciences</p>
      <p class="footer-text" style="font-size: 12px; margin-top: 20px;">
        © ${new Date().getFullYear()} MIHAS-KATC. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}
