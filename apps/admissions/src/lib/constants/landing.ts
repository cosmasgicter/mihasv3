/**
 * Shared constants for the landing page and public layout components.
 * Extracted from LandingPage.tsx so SharedFooter and other components can reuse this data.
 *
 * @requirements 16.4
 */

import type { LucideIcon } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

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
// Call-to-action labels (one source, task 29.3)
// ============================================================================
/** Each label is written once and names no count or date the page does not show. */
export const LANDING_ACTIONS = {
  start: 'Start your application',
  explore: 'See open programmes',
} as const;
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
      'Create an account to start. You can leave and come back later. Your progress is saved automatically.',
  },
  {
    step: 2,
    title: 'Fill in your details and upload documents',
    description:
      'Personal details, education history, NRC or passport, and your ECZ or Cambridge results. You can do this over several visits.',
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
      'Submit when everything is complete. You see every update in the portal, from under review to a decision, and you get an email when something changes.',
  },
];

// ============================================================================
// Quick Links
// ============================================================================

export const quickLinks: QuickLinkItem[] = [
  { name: 'Programmes', href: '#programs', eventName: 'landing_footer_programs_click' },
  { name: 'What you need', href: '#what-you-need' },
  { name: 'How it works', href: '#how-it-works' },
  { name: 'Track application', href: '/track-application' },
  { name: 'Contact', href: '/contact' },
  { name: 'For schools', href: '/for-schools' },
];

// ============================================================================
// Social Links
// ============================================================================

/**
 * Social profiles render only for entries with a real profile URL. None exists
 * today, so the footer shows no social block (task 29.1, R12.1).
 */
export const socialLinks: SocialLinkItem[] = [];
