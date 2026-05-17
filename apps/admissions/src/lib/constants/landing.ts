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
  image: string;
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
  katcPhone: '+260 966 992 299',
  mihasPhone: '+260 961 515 151',
  email: 'info@mihas.edu.zm',
  katcEmail: 'info@katc.edu.zm',
  // Distinct physical addresses — MIHAS and KATC are separate locations
  // in Kalulushi. The contact page displays both.
  mihasAddress:
    'Plot 3375 Off President Avenue, Kalulushi — next to the Civic Centre, opposite Kalulushi General Hospital',
  katcAddress: 'Plot 110206 Dag Hammarskjöld Road, Kalulushi 10101, Zambia',
  // Primary address shown when only one is appropriate (e.g. the public
  // contact page strip). Defaults to MIHAS — the parent institution.
  address:
    'Plot 3375 Off President Avenue, Kalulushi — next to the Civic Centre, opposite Kalulushi General Hospital',
};

// ============================================================================
// Stats
// ============================================================================

export const stats: StatItem[] = [
  { value: 300, suffix: '+', label: 'Graduates working in Zambian hospitals' },
  { value: 92, suffix: '%', label: 'Get hired within 12 months' },
  { value: 25, suffix: '+', label: 'Hospitals that hire from us directly' },
  { value: 6, suffix: '+', label: "Years we've been doing this" },
];

// ============================================================================
// Features
// ============================================================================

export const features: FeatureItem[] = [
  {
    icon: Users,
    title: 'Learn from Working Professionals',
    description:
      'Your lecturers are nurses, clinical officers, and health inspectors who still practice. They teach what actually happens on the ward, not just what is in the textbook.',
    gradient: 'from-primary to-primary/60',
  },
  {
    icon: Award,
    title: 'A diploma that is registered before you walk out',
    description:
      'NMCZ, HPCZ, and ECZ handle the accreditation. When you graduate, your name goes on the professional register — and every hospital in Zambia already knows what your diploma means.',
    gradient: 'from-secondary to-secondary/60',
  },
  {
    icon: BookOpen,
    title: '92% of our graduates are hired within a year',
    description:
      "We don't just send you out with a diploma. The major teaching hospitals in Lusaka and the Copperbelt call us when they need nurses and clinical officers. Our placements office keeps their numbers.",
    gradient: 'from-accent to-accent/60',
  },
];

// ============================================================================
// Accreditations
// ============================================================================

export const accreditations: AccreditationItem[] = [
  {
    logo: 'GNCLogo.webp',
    title: 'NMCZ Accredited',
    org: 'Nursing and Midwifery Council of Zambia',
    desc: 'Our nursing graduates can work in any hospital or clinic in Zambia.',
  },
  {
    logo: 'hpc_logobig.webp',
    title: 'HPCZ Accredited',
    org: 'Health Professions Council of Zambia',
    desc: 'Clinical medicine graduates qualify for clinical officer positions nationwide.',
  },
  {
    logo: 'eczlogo.webp',
    title: 'ECZ Recognized',
    org: 'Examinations Council of Zambia',
    desc: 'Environmental health graduates work in councils, ministries, mining companies, and hotels — anywhere food safety or water quality matters.',
  },
  {
    logo: 'unza.webp',
    title: 'UNZA Affiliated',
    org: 'University of Zambia',
    desc: 'Your diploma articulates into a UNZA degree. Work for a few years, come back, top up.',
  },
];

// ============================================================================
// Programs
// ============================================================================

export const programs: ProgramItem[] = [
  {
    institution: 'Kalulushi Training Centre',
    courses: [
      'Diploma in Clinical Medicine (HPCZ & UNZA Accredited)',
      'Diploma in Environmental Health (ECZ Certified & UNZA Accredited)',
    ],
    highlight: 'Professional Excellence',
    accreditation: 'HPCZ, ECZ & UNZA Certified',
    logo: '/images/logos/katc-logo.webp',
  },
  {
    institution: 'Mukuba Institute of Health and Applied Sciences',
    courses: ['Diploma in Registered Nursing (NMCZ Accredited)'],
    highlight: 'NMCZ Certified',
    accreditation: 'NMCZ Approved',
    logo: '/images/logos/mihas-logo.webp',
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
    amount: 'K150',
    note: 'Pay with Airtel Money or MTN Mobile Money. Card option also available.',
  },
  {
    audience: 'International students',
    amount: 'USD 20',
    note: 'Pay by card from anywhere. SADC and international applicants welcome.',
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
      'K150 for Zambian applicants via Airtel or MTN. USD 20 for international applicants via card. If money is tight right now, you can defer and pay before your interview.',
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
    title: 'Basic English and Math credits',
    description:
      'Minimum credits in English and Mathematics are required for all health science programs. Science subjects are required for nursing and clinical medicine.',
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
    title: 'Qualifications that cross borders',
    description:
      'NMCZ, HPCZ, and UNZA-affiliated diplomas are recognized across SADC. Many of our graduates work in hospitals in South Africa, Botswana, and Namibia.',
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
    title: 'On-campus housing available',
    description:
      'Both Kalulushi Training Centre and Mukuba Institute offer campus accommodation. Rooms are shared and priced to be affordable.',
  },
  {
    icon: FileCheck,
    title: 'Book during your application',
    description:
      'Once your admission is confirmed, you can request a room through the portal. Early confirmation gets first pick.',
  },
  {
    icon: BookOpen,
    title: 'Walking distance to everything',
    description:
      'Lecture halls, labs, library, and dining are all on campus. The clinical placement hospitals are a short ride away.',
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
  { name: 'Facebook', href: 'https://www.facebook.com/mihaskatc', icon: Facebook },
  { name: 'Twitter', href: 'https://x.com/mihaskatc', icon: Twitter },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/company/mihaskatc', icon: Linkedin },
];
