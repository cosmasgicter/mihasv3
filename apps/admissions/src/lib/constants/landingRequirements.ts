/**
 * What a student needs to apply: the landing's third section. Kept apart from
 * landing.ts so the footer and the contact page, which only need contact details,
 * do not load icons.
 */
import { CreditCard, FileCheck, GraduationCap, Smartphone } from '@/components/icons';
import type { LucideIcon } from 'lucide-react';


export interface RequirementItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const requirementItems: RequirementItem[] = [
  {
    icon: FileCheck,
    title: 'NRC or passport',
    description:
      'Zambian applicants upload an NRC. International applicants upload a passport. One clear photo is enough.',
  },
  {
    icon: GraduationCap,
    title: 'Grade 12 results',
    description:
      'ECZ or Cambridge results. Required subjects and grades vary by programme and are shown before you submit.',
  },
  {
    icon: CreditCard,
    title: 'The application fee, shown before you pay',
    description:
      'The fee and currency come from the school and programme you choose. If the school allows it, you can defer payment and still submit.',
  },
  {
    icon: Smartphone,
    title: 'Mobile money or card',
    description:
      'Mobile money and card options are shown when available. International applicants pay by card.',
  },
];

