/**
 * Shared constants for the landing page and public layout components.
 * Extracted from LandingPage.tsx so SharedFooter and other components can reuse this data.
 *
 * @requirements 16.4
 */

import {
  Users,
  Award,
  BookOpen,
  Facebook,
  Twitter,
  Linkedin,
  Home,
  Globe,
  FileCheck,
  GraduationCap,
} from '@/components/icons';
import type { LucideIcon } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface StatItem {
  value: number;
  suffix: string;
  label: string;
}

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: string;
}

export interface AccreditationItem {
  logo: string;
  title: string;
  org: string;
  desc: string;
}

export interface ProgramItem {
  institution: string;
  courses: string[];
  highlight: string;
  accreditation: string;
  logo: string;
}

export interface QuickLinkItem {
  name: string;
  href: string;
  eventName?: string;
}

export interface SocialLinkItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

// ============================================================================
// Contact Info
// ============================================================================

export const contactInfo = {
  admissionsPhone: '+260 966 992 299',
  supportPhone: '+260 961 515 151',
  email: 'admissions@beanola.com',
  supportEmail: 'support@beanola.com',
  admissionsAddress: 'Beanola Technologies Admissions Desk, Lusaka, Zambia',
  supportAddress: 'Beanola Technologies Support Desk, Lusaka, Zambia',
  address: 'Beanola Technologies, Lusaka, Zambia',
};

// ============================================================================
// Stats
// ============================================================================

export const stats: StatItem[] = [
  { value: 300, suffix: '+', label: 'Applications processed through partner schools' },
  { value: 92, suffix: '%', label: 'Configured workflows completed without manual follow-up' },
  { value: 25, suffix: '+', label: 'Programs ready for institution assignment' },
  { value: 6, suffix: '+', label: 'Years building admissions operations software' },
];

// ============================================================================
// Features
// ============================================================================

export const features: FeatureItem[] = [
  {
    icon: Users,
    title: 'Apply once, let the platform route it',
    description:
      'Students choose a programme and submit one clean application. Beanola handles the institution, intake, payment, and document rules configured behind the scenes.',
    gradient: 'from-primary to-primary/60',
  },
  {
    icon: Award,
    title: 'Institution-specific approvals and documents',
    description:
      'Each school keeps its own logo, signature, bank details, programme templates, and accreditation wording, so official documents match the institution that owns the offer.',
    gradient: 'from-secondary to-secondary/60',
  },
  {
    icon: BookOpen,
    title: 'One operations view for many schools',
    description:
      'Super admins can onboard colleges and universities, assign programmes, and grant staff access only to the data they are allowed to see.',
    gradient: 'from-accent to-accent/60',
  },
];

// ============================================================================
// Accreditations
// ============================================================================

export const accreditations: AccreditationItem[] = [
  {
    logo: 'GNCLogo.webp',
    title: 'Tenant-managed accreditation',
    org: 'Institution profile configuration',
    desc: 'Accreditation labels are configured per school and programme instead of being hardcoded into the platform.',
  },
  {
    logo: 'hpc_logobig.webp',
    title: 'Programme-specific rules',
    org: 'Programme and intake catalogue',
    desc: 'Shared programmes can be assigned to one school or many schools while keeping each offer tied to the correct tenant.',
  },
  {
    logo: 'eczlogo.webp',
    title: 'Applicant document checks',
    org: 'Eligibility and admissions workflow',
    desc: 'Schools can define the documents, grades, and review steps needed for each intake.',
  },
  {
    logo: 'unza.webp',
    title: 'Official document automation',
    org: 'Beanola document profiles',
    desc: 'Offer letters, slips, and receipts use the selected school profile, logo, signature, and approved template.',
  },
];

// ============================================================================
// Programs
// ============================================================================

export const programs: ProgramItem[] = [
  {
    institution: 'Partner Colleges',
    courses: [
      'Diploma and certificate programmes configured per institution',
      'Health, business, technology, and professional pathways',
    ],
    highlight: 'College pathways',
    accreditation: 'Tenant-managed accreditation data',
    logo: '/images/logos/beanolalogo.webp',
  },
  {
    institution: 'Partner Universities',
    courses: [
      'Undergraduate, bridging, and professional programmes',
      'Shared programmes assigned to the schools that offer them',
    ],
    highlight: 'University pathways',
    accreditation: 'School-owned programme configuration',
    logo: '/images/logos/beanolalogo.webp',
  },
];

// ============================================================================
// Application Fees
// ============================================================================

export interface ApplicationFeeItem {
  audience: string;
  amount: string;
  note: string;
}

export const applicationFees: ApplicationFeeItem[] = [
  {
    audience: 'Zambian students',
    amount: 'Shown before checkout',
    note: 'Each school can configure its application fee. Mobile money and card options are shown when available.',
  },
  {
    audience: 'International students',
    amount: 'Shown before checkout',
    note: 'International fees and currencies are displayed before payment. SADC and international applicants are supported.',
  },
];

// ============================================================================
// How It Works (application timeline)
// ============================================================================

export interface HowItWorksStep {
  step: number;
  title: string;
  description: string;
}

export const howItWorksSteps: HowItWorksStep[] = [
  {
    step: 1,
    title: 'Create your account',
    description:
      'Takes 2 minutes. Verify your email and you are in. You can start the application and come back later — your progress is saved automatically.',
  },
  {
    step: 2,
    title: 'Fill in your details and upload documents',
    description:
      'Personal details, education history, NRC or passport, your ECZ or Cambridge results. You can do this in pieces over a few days.',
  },
  {
    step: 3,
    title: 'Pay the application fee',
    description:
      'The configured fee, currency, and payment methods are shown before checkout. If a school allows deferred payment, that option appears in the portal.',
  },
  {
    step: 4,
    title: 'Submit and track your status',
    description:
      'We review within a few working days. You see every update in the portal — under review, interview scheduled, decision. You also get an email and an SMS.',
  },
];

// ============================================================================
// Eligibility Requirements
// ============================================================================

export interface EligibilityItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const eligibilityItems: EligibilityItem[] = [
  {
    icon: GraduationCap,
    title: 'ECZ Grade 12 certificate',
    description:
      'We accept ECZ School Certificate and GCE. Specific grade requirements vary by program — full details show up inside your application.',
  },
  {
    icon: FileCheck,
    title: 'Cambridge certificate accepted',
    description:
      "If you sat Cambridge IGCSE or A-Levels instead of ECZ, that is fine. Our system supports both — just upload your certificate and we will convert.",
  },
  {
    icon: FileCheck,
    title: 'NRC or passport',
    description:
      'Zambian applicants upload an NRC. International applicants upload a passport. One clear photo is enough.',
  },
  {
    icon: BookOpen,
    title: 'Programme-specific requirements',
    description:
      'Required subjects, grades, certificates, and supporting documents are configured by programme and shown before you submit.',
  },
];

// ============================================================================
// International Students
// ============================================================================

export interface InternationalHighlight {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const internationalHighlights: InternationalHighlight[] = [
  {
    icon: Globe,
    title: 'Open to SADC and beyond',
    description:
      'We enroll students from Namibia, Botswana, Zimbabwe, Malawi, DRC, and further afield. The application is the same — we just verify your documents differently.',
  },
  {
    icon: Award,
    title: 'Pay in USD from anywhere',
    description:
      'International application fee is USD 20, paid by card. Tuition and accommodation invoices are issued in USD for international students.',
  },
  {
    icon: GraduationCap,
    title: 'Institution-specific recognition',
    description:
      'Recognition, accreditation, and progression details are displayed from the selected school and programme profile.',
  },
  {
    icon: Users,
    title: 'Help with the practical stuff',
    description:
      'Visa letters, arrival logistics, accommodation booking — we have done this many times. Email admissions and we will walk you through it.',
  },
];

// ============================================================================
// Accommodation & Campus Life
// ============================================================================

export interface AccommodationHighlight {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const accommodationHighlights: AccommodationHighlight[] = [
  {
    icon: Home,
    title: 'School housing details in one place',
    description:
      'Partner institutions can publish accommodation options, pricing, and booking rules directly in the application flow.',
  },
  {
    icon: FileCheck,
    title: 'Book during your application',
    description:
      'Once your admission is confirmed, you can request a room through the portal. Early confirmation gets first pick.',
  },
  {
    icon: BookOpen,
    title: 'Campus details from each school',
    description:
      'Lecture venues, labs, libraries, dining, and placement information are published by the institution offering the programme.',
  },
  {
    icon: Users,
    title: 'Safe and supervised',
    description:
      'Campus security, hostel matrons, and a student affairs office. Our staff treat your safety as part of the job, not an afterthought.',
  },
];

// ============================================================================
// Quick Links
// ============================================================================

export const quickLinks: QuickLinkItem[] = [
  { name: 'About Us', href: '#features', eventName: 'landing_footer_about_click' },
  { name: 'Programs', href: '#programs', eventName: 'landing_footer_programs_click' },
  { name: 'How It Works', href: '#how-it-works' },
  { name: 'International Students', href: '#international' },
  { name: 'Accommodation', href: '#accommodation' },
  { name: 'Track Application', href: '/track-application' },
  { name: 'Contact', href: '/contact' },
];

// ============================================================================
// Social Links
// ============================================================================

export const socialLinks: SocialLinkItem[] = [
  { name: 'Facebook', href: 'https://beanola.com', icon: Facebook },
  { name: 'Twitter', href: 'https://beanola.com', icon: Twitter },
  { name: 'LinkedIn', href: 'https://beanola.com', icon: Linkedin },
];
