/**
 * AuthLayout Component - Enhanced split-screen authentication layout
 * Two-column layout with branding panel and form panel
 * Responsive collapse to single column on mobile
 * 
 * @requirements 3.2, 3.8 - Split-screen layout with responsive design
 */

import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, GraduationCap, Shield, Clock, Users, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageTransition } from '@/components/smoothui/page-transition';

interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  backLinkLabel?: string;
  backLinkHref?: string;
  showBranding?: boolean;
}

// Feature highlights for the branding panel
const brandingFeatures = [
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
];

// Branding Panel Component
function BrandingPanel() {



  return (
    <div className="relative hidden lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-16">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800" />
      
      {/* Decorative patterns */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-lg"
      >
        {/* Logo and badge */}
        <div className="mb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" aria-hidden />
            MIHAS Student Portal
          </span>
        </div>

        {/* Main heading */}
        <h1 className="text-4xl xl:text-5xl font-bold leading-tight text-white drop-shadow-lg"
        >
          Grow your healthcare career with confidence
        </h1>

        {/* Description */}
        <p className="mt-6 text-lg text-white/90 leading-relaxed"
        >
          Access your personalized portal to monitor applications, manage enrollment tasks, 
          and stay connected with our admissions team every step of the way.
        </p>

        {/* Feature cards */}
        <div className="mt-10 grid grid-cols-2 gap-4"
        >
          {brandingFeatures.map((feature, index) => (
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm hover:bg-white/15 transition-colors animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <feature.icon className="h-6 w-6 text-white/80 mb-2" />
              <p className="text-sm font-semibold text-white">{feature.title}</p>
              <p className="mt-1 text-xs text-white/70">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-10 flex items-center gap-8"
        >
          <div>
            <p className="text-3xl font-bold text-white">300+</p>
            <p className="text-sm text-white/70">Graduates</p>
          </div>
          <div className="h-12 w-px bg-white/20" />
          <div>
            <p className="text-3xl font-bold text-white">92%</p>
            <p className="text-sm text-white/70">Placement Rate</p>
          </div>
          <div className="h-12 w-px bg-white/20" />
          <div>
            <p className="text-3xl font-bold text-white">6+</p>
            <p className="text-sm text-white/70">Programs</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mobile branding features (condensed version for mobile)
const mobileBrandingFeatures = [
  { icon: Shield, text: '24/7 Access' },
  { icon: Clock, text: 'Fast Processing' },
  { icon: Award, text: 'Accredited Programs' },
];

// Form Panel Component
function FormPanel({
  title,
  description,
  children,
  footer,
  backLinkHref = '/',
  backLinkLabel = 'Back to Home',
}: Omit<AuthLayoutProps, 'showBranding'>) {


  return (
    <div className="flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-12 xl:px-16">
      <div className="mx-auto w-full max-w-md"
      >
        {/* Back link */}
        <Link
          to={backLinkHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md px-2 py-1 -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLinkLabel}
        </Link>

        {/* Logo - visible on mobile */}
        <div className="mt-6 flex items-center lg:hidden">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800 text-white shadow-lg">
            <GraduationCap className="h-6 w-6" />
          </div>
          <span className="ml-3 text-lg font-semibold text-foreground">MIHAS</span>
        </div>

        {/* Mobile branding section - visible only on mobile */}
        <div className="lg:hidden mt-6 p-4 rounded-xl bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-blue-800/10 border border-primary/20">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Access your personalized portal to monitor applications and stay connected with our admissions team.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {mobileBrandingFeatures.map((feature) => (
              <span
                key={feature.text}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary/80"
              >
                <feature.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {feature.text}
              </span>
            ))}
          </div>
        </div>

        {/* Title and description */}
        <div className="mt-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {title}
          </h2>
          {description && (
            <p className="mt-2 text-base text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {/* Form content */}
        <div className="mt-8">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="mt-8 border-t border-border pt-8">
            {footer}
          </div>
        )}
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
}: AuthLayoutProps) {
  return (
    <PageTransition mode="fade">
      <div className="min-h-screen bg-background">
        <div className="flex min-h-screen">
          {/* Branding Panel - Hidden on mobile, visible on lg+ */}
          {showBranding && (
            <div className="hidden lg:flex lg:w-1/2 xl:w-[55%]">
              <BrandingPanel />
            </div>
          )}

          {/* Form Panel */}
          <div className={cn(
            'flex-1 flex flex-col',
            showBranding ? 'lg:w-1/2 xl:w-[45%]' : 'w-full'
          )}>
            {/* Mobile gradient header */}
            <div className="lg:hidden h-2 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800" />
            
            <FormPanel
              title={title}
              description={description}
              footer={footer}
              backLinkHref={backLinkHref}
              backLinkLabel={backLinkLabel}
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
