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
  address: 'President Avenue, Kalulushi, 2-Shaft, Next to KMC',
};

// ============================================================================
// Stats
// ============================================================================

export const stats: StatItem[] = [
  { value: 300, suffix: '+', label: 'Graduates Employed' },
  { value: 92, suffix: '%', label: 'Job Placement Rate' },
  { value: 6, suffix: '+', label: 'Years Training Healthcare Workers' },
  { value: 25, suffix: '+', label: 'Employer Partners Hiring Our Graduates' },
];

// ============================================================================
// Features
// ============================================================================

export const features: FeatureItem[] = [
  {
    icon: Users,
    title: 'Career-Ready Training',
    description:
      'Learn from healthcare professionals actively working in Zambian hospitals and clinics. Get mentored by experts who understand the job market',
    gradient: 'from-primary to-primary/60',
  },
  {
    icon: Award,
    title: 'Government Recognized Qualifications',
    description:
      'NMCZ, HPCZ & ECZ accredited programs accepted by employers across Zambia, SADC region, and internationally',
    gradient: 'from-secondary to-secondary/60',
  },
  {
    icon: BookOpen,
    title: 'Guaranteed Job Placement Support',
    description:
      '92% employment rate with direct connections to hospitals, clinics, and health organizations seeking qualified graduates',
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
    desc: 'Graduates qualified for nursing jobs in all Zambian hospitals and clinics',
  },
  {
    logo: 'hpc_logobig.webp',
    title: 'HPCZ Accredited',
    org: 'Health Professions Council of Zambia',
    desc: 'Graduates eligible for clinical officer positions nationwide',
  },
  {
    logo: 'eczlogo.webp',
    title: 'ECZ Recognized',
    org: 'Examinations Council of Zambia',
    desc: 'Environmental health graduates work in government and private sectors',
  },
  {
    logo: 'unza.webp',
    title: 'UNZA Affiliated',
    org: 'University of Zambia',
    desc: 'University-level qualifications recognized by international employers',
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
    image: '/images/programs/katc-campus.webp',
  },
  {
    institution: 'Mukuba Institute of Health and Applied Sciences',
    courses: ['Diploma in Registered Nursing (NMCZ Accredited)'],
    highlight: 'NMCZ Certified',
    accreditation: 'NMCZ Approved',
    image: '/images/programs/mihas-campus.webp',
  },
];

// ============================================================================
// Quick Links
// ============================================================================

export const quickLinks: QuickLinkItem[] = [
  { name: 'About Us', href: '#features', eventName: 'landing_footer_about_click' },
  { name: 'Programs', href: '#programs', eventName: 'landing_footer_programs_click' },
  { name: 'Track Application', href: '/track-application' },
  { name: 'Contact', href: '/contact' },
];

// ============================================================================
// Social Links
// ============================================================================

export const socialLinks: SocialLinkItem[] = [
  { name: 'Facebook', href: 'https://www.facebook.com/', icon: Facebook },
  { name: 'Twitter', href: 'https://x.com/', icon: Twitter },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/', icon: Linkedin },
];
