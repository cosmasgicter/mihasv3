/**
 * AuthLayout Component - variant-aware authentication layout
 * Provides distinct branding for sign-in vs sign-up while keeping the shared shell.
 */

import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  KeyRound,
  MapPin,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageTransition } from '@/components/smoothui/page-transition';

type AuthLayoutVariant = 'default' | 'signin' | 'signup';

interface AuthFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface AuthStat {
  value: string;
  label: string;
}

interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  backLinkLabel?: string;
  backLinkHref?: string;
  showBranding?: boolean;
  variant?: AuthLayoutVariant;
  panelBadge?: ReactNode;
}

interface AuthVariantConfig {
  badgeLabel: string;
  badgeDotClass: string;
  desktopGradientClass: string;
  mobileGradientClass: string;
  mobileCardClass: string;
  panelBadgeClass: string;
  heroTitle: string;
  heroDescription: string;
  mobileSummary: string;
  features: AuthFeature[];
  mobileFeatures: Array<{ icon: LucideIcon; text: string }>;
  stats: AuthStat[];
}

const layoutVariants: Record<AuthLayoutVariant, AuthVariantConfig> = {
  default: {
    badgeLabel: 'MIHAS Student Portal',
    badgeDotClass: 'bg-emerald-400',
    desktopGradientClass: 'from-blue-700 via-indigo-700 to-slate-900',
    mobileGradientClass: 'from-blue-700 via-indigo-600 to-slate-900',
    mobileCardClass: 'from-blue-600/10 via-indigo-500/10 to-slate-900/10 border-primary/20',
    panelBadgeClass: 'border-primary/20 bg-primary/10 text-primary',
    heroTitle: 'Grow your healthcare career with confidence',
    heroDescription:
      'Access your personalized portal to monitor applications, manage enrollment tasks, and stay connected with our admissions team every step of the way.',
    features: [
      {
        icon: Shield,
        title: '24/7 Access',
        description: 'Manage your journey from any device at any time.',
      },
      {
        icon: Users,
        title: 'Dedicated Support',
        description: 'Our advisors are ready to help you take the next step.',
      },
      {
        icon: Clock,
        title: 'Fast Processing',
        description: 'Quick application review and timely responses.',
      },
      {
        icon: Award,
        title: 'Accredited Programs',
        description: 'NMCZ, HPCZ, ECZ, and UNZA recognized qualifications.',
      },
    ],
    mobileFeatures: [
      { icon: Shield, text: '24/7 Access' },
      { icon: Clock, text: 'Fast Processing' },
      { icon: Award, text: 'Accredited Programs' },
    ],
    stats: [
      { value: '300+', label: 'Graduates' },
      { value: '92%', label: 'Placement Rate' },
      { value: '6+', label: 'Programs' },
    ],
    mobileSummary:
      'Access your personalized portal to monitor applications and stay connected with our admissions team.',
  },
  signin: {
    badgeLabel: 'Returning Applicant Access',
    badgeDotClass: 'bg-cyan-300',
    desktopGradientClass: 'from-slate-950 via-blue-950 to-cyan-700',
    mobileGradientClass: 'from-slate-950 via-blue-900 to-cyan-700',
    mobileCardClass: 'from-slate-950/5 via-blue-700/10 to-cyan-500/10 border-cyan-200/70',
    panelBadgeClass: 'border-cyan-200 bg-cyan-50 text-cyan-900',
    heroTitle: 'Return to your admissions workspace without losing momentum',
    heroDescription:
      'Sign in to continue saved drafts, upload documents, complete pay-later submissions, and track your latest admissions updates from one secure dashboard.',
    features: [
      {
        icon: KeyRound,
        title: 'Secure Account Access',
        description: 'Use the same email and password you registered with.',
      },
      {
        icon: FileText,
        title: 'Saved Progress',
        description: 'Pick up from your latest draft, payment, or submitted application.',
      },
      {
        icon: Clock,
        title: 'Real-Time Status',
        description: 'Check review, payment, and interview updates as they happen.',
      },
      {
        icon: CheckCircle2,
        title: 'One Portal',
        description: 'Applications, receipts, notifications, and profile updates stay together.',
      },
    ],
    mobileFeatures: [
      { icon: KeyRound, text: 'Secure sign in' },
      { icon: FileText, text: 'Continue saved drafts' },
      { icon: CheckCircle2, text: 'Track updates' },
    ],
    stats: [
      { value: '1', label: 'Portal login' },
      { value: '24/7', label: 'Dashboard access' },
      { value: 'Live', label: 'Application updates' },
    ],
    mobileSummary:
      'Use sign in if you already created an applicant account and want to continue with saved progress.',
  },
  signup: {
    badgeLabel: 'New Applicant Registration',
    badgeDotClass: 'bg-amber-300',
    desktopGradientClass: 'from-sky-800 via-cyan-600 to-emerald-500',
    mobileGradientClass: 'from-sky-800 via-cyan-600 to-emerald-500',
    mobileCardClass: 'from-sky-700/10 via-cyan-500/10 to-emerald-400/10 border-cyan-200/70',
    panelBadgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    heroTitle: 'Create your admissions profile before you start the application',
    heroDescription:
      'Register once, save your profile details securely, and reuse them when you begin your programme application, payment, and document-upload journey.',
    features: [
      {
        icon: Shield,
        title: 'Secure First Setup',
        description: 'Create one protected portal account for every return visit.',
      },
      {
        icon: FileText,
        title: 'Profile Prefill',
        description: 'Your account details are reused when you begin the application wizard.',
      },
      {
        icon: MapPin,
        title: 'Residence Ready',
        description: 'Residence country and town are captured once and carried forward.',
      },
      {
        icon: Users,
        title: 'Emergency Contact',
        description: 'Store your next-of-kin details up front for a cleaner application flow.',
      },
    ],
    mobileFeatures: [
      { icon: Shield, text: 'Create account first' },
      { icon: FileText, text: 'Prefill later steps' },
      { icon: Users, text: 'Save contact details' },
    ],
    stats: [
      { value: '1', label: 'Account setup' },
      { value: '4', label: 'Profile sections' },
      { value: 'Next', label: 'Start application' },
    ],
    mobileSummary:
      'This page creates your secure portal account first. Programme choice and application details come after sign in.',
  },
};

function BrandingPanel({ variant }: { variant: AuthLayoutVariant }) {
  const config = layoutVariants[variant];

  return (
    <div className="relative hidden lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-16">
      <div className={cn('absolute inset-0 bg-gradient-to-br', config.desktopGradientClass)} />

      <div className="absolute inset-0 opacity-10">
        <div className="absolute left-0 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 translate-x-1/2 translate-y-1/2 rounded-full bg-white blur-3xl" />
      </div>

      <div className="relative z-10 max-w-lg">
        <div className="mb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-white backdrop-blur-sm">
            <span className={cn('h-2 w-2 rounded-full', config.badgeDotClass)} aria-hidden />
            {config.badgeLabel}
          </span>
        </div>

        <h1 className="text-4xl font-bold leading-tight text-white drop-shadow-lg xl:text-5xl">
          {config.heroTitle}
        </h1>

        <p className="mt-6 text-lg leading-relaxed text-white/90">
          {config.heroDescription}
        </p>

        <div className="mt-10 grid grid-cols-2 gap-4">
          {config.features.map((feature, index) => (
            <div
              key={feature.title}
              className="animate-fade-in rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm transition-colors hover:bg-white/15"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <feature.icon className="mb-2 h-6 w-6 text-white/80" />
              <p className="text-sm font-semibold text-white">{feature.title}</p>
              <p className="mt-1 text-xs text-white/70">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-center gap-8">
          {config.stats.map((stat, index) => (
            <div key={stat.label} className="flex items-center gap-8">
              {index > 0 && <div className="h-12 w-px bg-white/20" aria-hidden />}
              <div>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-white/70">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface FormPanelProps extends Omit<AuthLayoutProps, 'showBranding'> {
  variant: AuthLayoutVariant;
}

function FormPanel({
  title,
  description,
  children,
  footer,
  backLinkHref = '/',
  backLinkLabel = 'Back to Home',
  variant,
  panelBadge,
}: FormPanelProps) {
  const config = layoutVariants[variant];
  const resolvedPanelBadge = panelBadge ?? (variant !== 'default' ? config.badgeLabel : null);

  return (
    <div className="flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-12 xl:px-16">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          to={backLinkHref}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 -ml-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLinkLabel}
        </Link>

        <div className="mt-6 flex items-center lg:hidden" role="img" aria-label="Mukuba Institute of Health and Allied Sciences logo">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-700 via-cyan-600 to-slate-900 text-white shadow-lg" aria-hidden="true">
            <GraduationCap className="h-6 w-6" />
          </div>
          <span className="ml-3 text-lg font-semibold text-foreground">MIHAS</span>
        </div>

        <div className={cn('mt-6 rounded-2xl border bg-gradient-to-r p-4 lg:hidden', config.mobileCardClass)}>
          <p className="text-sm leading-relaxed text-muted-foreground">{config.mobileSummary}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {config.mobileFeatures.map((feature) => (
              <span key={feature.text} className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                <feature.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {feature.text}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-[28px] border border-border/70 bg-background/90 p-6 shadow-xl backdrop-blur sm:p-8">
          <div className="space-y-6">
            {resolvedPanelBadge && (
              <div>
                <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]', config.panelBadgeClass)}>
                  {resolvedPanelBadge}
                </span>
              </div>
            )}

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h2>
              {description && (
                <div className="mt-3 text-base text-muted-foreground">
                  {description}
                </div>
              )}
            </div>

            <div>{children}</div>

            {footer && (
              <div className="border-t border-border pt-8">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthLayout({
  title,
  description,
  children,
  footer,
  backLinkHref = '/',
  backLinkLabel = 'Back to Home',
  showBranding = true,
  variant = 'default',
  panelBadge,
}: AuthLayoutProps) {
  const config = layoutVariants[variant];

  return (
    <PageTransition mode="fade">
      <div className="min-h-screen bg-background">
        <div className="flex min-h-screen">
          {showBranding && (
            <div className="hidden lg:flex lg:w-1/2 xl:w-[55%]">
              <BrandingPanel variant={variant} />
            </div>
          )}

          <div
            className={cn(
              'flex flex-1 flex-col',
              showBranding ? 'lg:w-1/2 xl:w-[45%]' : 'w-full',
            )}
          >
            <div className={cn('h-2 bg-gradient-to-r lg:hidden', config.mobileGradientClass)} />

            <FormPanel
              title={title}
              description={description}
              footer={footer}
              backLinkHref={backLinkHref}
              backLinkLabel={backLinkLabel}
              variant={variant}
              panelBadge={panelBadge}
            >
              {children}
            </FormPanel>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

export default AuthLayout;
