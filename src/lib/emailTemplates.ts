import { getApiBaseUrl } from './apiConfig'

// Get the application base URL for email links
const getAppBaseUrl = () => {
  const apiBase = getApiBaseUrl()
  // For production, use the configured domain, otherwise use the API base
  return import.meta.env.VITE_APP_BASE_URL || apiBase
}

export const EMAIL_TEMPLATES = {
  submitted: {
    subject: (program: string) => `✅ Application Submitted Successfully - ${program}`,
    body: (userName: string, program: string, applicationNumber: string) => 
      `Dear ${userName},\n\nYour application for ${program} has been successfully submitted!\n\n📋 Application Number: ${applicationNumber}\n📊 Status: Under Review\n⏰ Expected Processing Time: 3-5 business days\n\nYou can track your application status anytime at: ${getAppBaseUrl()}/track-application\n\nWhat's Next?\n- Our admissions team will review your application\n- You'll receive email updates on any status changes\n- Make sure to check your email regularly\n\nThank you for choosing MIHAS-KATC for your educational journey!\n\nBest regards,\nMIHAS-KATC Admissions Team\n\n---\nThis is an automated message. Please do not reply to this email.\nFor questions, contact us at info@mihas.edu.zm or info@katc.edu.zm`
  },
  
  approved: {
    subject: (program: string) => `🎉 Congratulations! Application Approved - ${program}`,
    body: (userName: string, program: string, applicationNumber: string) =>
      `Dear ${userName},\n\nCongratulations! We are pleased to inform you that your application for ${program} has been APPROVED!\n\n📋 Application Number: ${applicationNumber}\n🎓 Program: ${program}\n📅 Next Steps: You will receive enrollment details within 48 hours\n\nWelcome to the MIHAS-KATC family! We look forward to supporting your academic and professional growth.\n\nImportant Next Steps:\n1. Check your email for enrollment instructions\n2. Prepare required enrollment documents\n3. Complete registration process as instructed\n\nFor any questions about enrollment, please contact:\n- MIHAS: +260 961 515 151 | info@mihas.edu.zm\n- KATC: +260 966 992 299 | info@katc.edu.zm\n\nCongratulations once again!\n\nBest regards,\nMIHAS-KATC Admissions Team`
  },
  
  rejected: {
    subject: (program: string) => `Application Status Update - ${program}`,
    body: (userName: string, program: string, applicationNumber: string) =>
      `Dear ${userName},\n\nThank you for your interest in ${program} at MIHAS-KATC.\n\n📋 Application Number: ${applicationNumber}\n📊 Status: Not Selected\n\nAfter careful review of your application, we regret to inform you that we are unable to offer you admission at this time.\n\nThis decision does not reflect your potential or worth. We encourage you to:\n- Consider reapplying for future intakes\n- Explore other programs that might be a good fit\n- Contact our admissions team for feedback\n\nFuture Opportunities:\n- New intake periods open regularly\n- Consider our other accredited programs\n- Scholarship opportunities may be available\n\nFor questions or feedback, please contact:\n- MIHAS: +260 961 515 151 | info@mihas.edu.zm  \n- KATC: +260 966 992 299 | info@katc.edu.zm\n\nWe wish you all the best in your educational pursuits.\n\nBest regards,\nMIHAS-KATC Admissions Team`
  },
  
  pending_documents: {
    subject: (program: string) => `📄 Missing Documents Required - ${program}`,
    body: (userName: string, program: string, applicationNumber: string) =>
      `Dear ${userName},\n\nYour application for ${program} requires additional documents to continue processing.\n\n📋 Application Number: ${applicationNumber}\n📊 Status: Pending Documents\n⏰ Deadline: Please upload within 7 days\n\nRequired Documents:\nPlease log into your account to see which specific documents are needed.\n\nTo upload documents:\n1. Visit: ${getAppBaseUrl()}/apply\n2. Log into your account\n3. Navigate to your application\n4. Upload the required documents\n\nImportant: Failure to submit required documents within the deadline may result in application cancellation.\n\nFor technical support or questions:\n- MIHAS: +260 961 515 151 | info@mihas.edu.zm\n- KATC: +260 966 992 299 | info@katc.edu.zm\n\nBest regards,\nMIHAS-KATC Admissions Team`
  }
} as const