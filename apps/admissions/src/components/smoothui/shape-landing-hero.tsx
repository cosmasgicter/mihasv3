import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { preloadAuthRoutes } from '@/lib/routePreload';
import { CheckCircle, GraduationCap, Building2 } from '@/components/icons';

interface ShapeLandingHeroProps {
  headline: string;
  description: string;
  rotatingPhrases: string[];
  primaryCta: { label: string; href: string; icon?: React.ReactNode };
  secondaryCta: { label: string; href: string; icon?: React.ReactNode };
  proofPanel: {
    eyebrow: string;
    title: string;
    description: string;
    checklist: string[];
  };
}

export function ShapeLandingHero({
  headline,
  description,
  rotatingPhrases,
  primaryCta,
  secondaryCta,
  proofPanel,
}: ShapeLandingHeroProps) {
  const warmPrimaryRoute = primaryCta.href.startsWith('/auth')
    ? () => { void preloadAuthRoutes('hero-cta') }
    : undefined;
  const visiblePrograms = rotatingPhrases.slice(0, 3);

  // Keep the public entry CSS-first. These delays reproduce the previous
  // framer-motion stagger while `motion-safe` lets the browser disable every
  // transform for people who request reduced motion.
  const revealStyle = (delay: number): React.CSSProperties => ({
    animationDelay: `${delay}s`,
    animationFillMode: 'both',
  });

  return (
    <section id="hero" className="relative isolate overflow-hidden border-b border-border bg-muted">
      <div className="container-responsive px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-18">
        <div className="grid min-h-[calc(100svh-8rem)] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_29rem] xl:grid-cols-[minmax(0,1fr)_32rem]">
          <div className="max-w-3xl">
            <div className="motion-safe:animate-hero-enter" style={revealStyle(0.2)}>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl lg:leading-[1.02]">
                {headline}
              </h1>
            </div>

            <div
              className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg motion-safe:animate-hero-enter"
              style={revealStyle(0.3)}
            >
              {description}
            </div>

            {visiblePrograms.length > 0 && (
              <div
                className="mt-5 flex flex-wrap gap-2 motion-safe:animate-hero-enter"
                aria-label="Available programme areas"
                style={revealStyle(0.4)}
              >
                {visiblePrograms.map((phrase, i) => (
                  <span
                    key={phrase}
                    className="rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary motion-safe:animate-hero-float"
                    style={{ animationDelay: `${i * 0.4}s` }}
                  >
                    {phrase}
                  </span>
                ))}
              </div>
            )}

            <div
              className="mt-8 flex flex-col gap-3 motion-safe:animate-hero-enter sm:flex-row"
              style={revealStyle(0.5)}
            >
              <div className="w-full transition-transform duration-150 ease-smooth-out motion-safe:hover:scale-[1.03] motion-safe:active:scale-[0.97] sm:w-auto">
                <Link
                  to={primaryCta.href}
                  data-landing-action="primary"
                  onPointerEnter={warmPrimaryRoute}
                  onFocus={warmPrimaryRoute}
                  onTouchStart={warmPrimaryRoute}
                  className={cn(
                    'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg font-semibold sm:w-auto',
                    'bg-primary px-6 text-primary-foreground shadow-sm',
                    'hover:bg-primary/90 active:bg-primary/85 active:scale-[0.98]',
                    'transition-colors duration-150 touch-manipulation',
                    'text-base',
                  )}
                >
                  <span>{primaryCta.label}</span>
                  {primaryCta.icon && <span aria-hidden="true">{primaryCta.icon}</span>}
                </Link>
              </div>

              {secondaryCta.href.startsWith('#') ? (
                <a
                  href={secondaryCta.href}
                  data-landing-action="secondary"
                  aria-label={secondaryCta.label}
                  className={cn(
                    'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg font-medium sm:w-auto',
                    'border border-border bg-transparent px-6 text-foreground',
                    'hover:bg-muted hover:border-foreground/40',
                    'transition-colors duration-150 touch-manipulation',
                    'text-base',
                  )}
                >
                  <span>{secondaryCta.label}</span>
                  {secondaryCta.icon && <span aria-hidden="true">{secondaryCta.icon}</span>}
                </a>
              ) : (
                <Link
                  to={secondaryCta.href}
                  data-landing-action="secondary"
                  aria-label={secondaryCta.label}
                  className={cn(
                    'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg font-medium sm:w-auto',
                    'border border-border bg-transparent px-6 text-foreground',
                    'hover:bg-muted hover:border-foreground/40',
                    'transition-colors duration-150 touch-manipulation',
                    'text-base',
                  )}
                >
                  <span>{secondaryCta.label}</span>
                  {secondaryCta.icon && <span aria-hidden="true">{secondaryCta.icon}</span>}
                </Link>
              )}
            </div>

          </div>

          <div
            className="rounded-lg border border-border bg-card p-3 shadow-md motion-safe:animate-hero-enter"
            style={revealStyle(0.4)}
          >
            <div className="relative overflow-hidden rounded-lg bg-primary/5">
              {/* Program-first, brand-neutral showcase (R3.6): the shared
                  portal must present canonical programs without favouring or
                  naming any single school. The configured schools are resolved
                  per-host at runtime, not hard-coded here. */}
              <div className="aspect-[4/3] grid grid-cols-2 gap-3 p-4 sm:p-6">
                <figure className="flex flex-col items-center justify-center gap-3 rounded-md border border-border bg-card p-3 shadow-sm">
                  <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 sm:h-20 sm:w-20" aria-hidden="true">
                    <GraduationCap className="h-8 w-8 text-primary sm:h-10 sm:w-10" />
                  </span>
                  <figcaption className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground sm:text-sm">Choose a programme</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Pick a programme and intake first</p>
                  </figcaption>
                </figure>
                <figure className="flex flex-col items-center justify-center gap-3 rounded-md border border-border bg-card p-3 shadow-sm">
                  <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 sm:h-20 sm:w-20" aria-hidden="true">
                    <Building2 className="h-8 w-8 text-primary sm:h-10 sm:w-10" />
                  </span>
                  <figcaption className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground sm:text-sm">School assigned</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Reviewed before you pay</p>
                  </figcaption>
                </figure>
              </div>
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">{proofPanel.eyebrow}</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{proofPanel.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{proofPanel.description}</p>
              </div>

              <div className="grid gap-3">
                {proofPanel.checklist.slice(0, 3).map((item) => (
                  <div key={item} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 border-t border-border pt-4">
                <div className="rounded-lg bg-muted p-3">
                  <CheckCircle className="h-4 w-4 text-primary" aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold text-foreground">Online tracking</p>
                  <p className="mt-1 text-xs text-muted-foreground">Status updates from phone or desktop</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ShapeLandingHero;
