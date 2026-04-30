import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { preloadAuthRoutes } from '@/lib/routePreload';
import { CheckCircle } from '@/components/icons';

interface ShapeLandingHeroProps {
  headline: string;
  description: string;
  rotatingPhrases: string[];
  primaryCta: { label: string; href: string; icon?: React.ReactNode };
  secondaryCta: { label: string; href: string; icon?: React.ReactNode };
  proofPanel: {
    image: { src: string; alt: string; width: number; height: number };
    eyebrow: string;
    title: string;
    description: string;
    badges: string[];
    highlights: Array<{ value: string; label: string }>;
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

  return (
    <section id="hero" className="relative isolate overflow-hidden border-b border-slate-200 bg-slate-50">
      <div className="container-responsive px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-18">
        <div className="grid min-h-[calc(100svh-8rem)] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_29rem] xl:grid-cols-[minmax(0,1fr)_32rem]">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase text-slate-600 shadow-sm">
              <CheckCircle className="h-4 w-4 text-primary" aria-hidden="true" />
              Government accredited admissions
            </div>

            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.02]">
              {headline}
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">
              {description}
            </p>

            {visiblePrograms.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2" aria-label="Available program areas">
                {visiblePrograms.map((phrase) => (
                  <span key={phrase} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700">
                    {phrase}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to={primaryCta.href}
              onPointerEnter={warmPrimaryRoute}
              onFocus={warmPrimaryRoute}
              onTouchStart={warmPrimaryRoute}
              className={cn(
                'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg font-semibold',
                'bg-primary px-6 text-primary-foreground shadow-sm',
                'hover:bg-primary/90 active:bg-primary/85',
                'transition-colors duration-150 touch-manipulation',
                'text-base',
              )}
            >
              <span>{primaryCta.label}</span>
              {primaryCta.icon && <span aria-hidden="true">{primaryCta.icon}</span>}
            </Link>

            {secondaryCta.href.startsWith('#') ? (
              <a
                href={secondaryCta.href}
                aria-label={secondaryCta.label}
                className={cn(
                  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg font-semibold',
                  'border border-slate-950 bg-slate-950 px-6 text-white shadow-sm hover:bg-slate-800',
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
                aria-label={secondaryCta.label}
                className={cn(
                  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg font-semibold',
                  'border border-slate-950 bg-slate-950 px-6 text-white shadow-sm hover:bg-slate-800',
                  'transition-colors duration-150 touch-manipulation',
                  'text-base',
                )}
              >
                <span>{secondaryCta.label}</span>
                {secondaryCta.icon && <span aria-hidden="true">{secondaryCta.icon}</span>}
              </Link>
            )}
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3 border-t border-slate-200 pt-6">
              {proofPanel.highlights.map((stat) => (
                <div key={stat.label}>
                  <p className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{stat.value}</p>
                  <p className="mt-1 text-xs font-medium uppercase text-slate-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-lg border border-slate-200 bg-white p-3 shadow-md">
            <div className="relative overflow-hidden rounded-lg bg-slate-100">
              <OptimizedImage
                src={proofPanel.image.src}
                alt={proofPanel.image.alt}
                width={proofPanel.image.width}
                height={proofPanel.image.height}
                lazy={false}
                fetchPriority="high"
                decoding="sync"
                srcSetWidths={[320, 640]}
                sizes="(min-width: 1024px) 32rem, 100vw"
                className="aspect-[4/3] h-auto w-full object-cover"
              />
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">{proofPanel.eyebrow}</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{proofPanel.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{proofPanel.description}</p>
              </div>

              <div className="grid gap-3">
                {proofPanel.checklist.slice(0, 3).map((item) => (
                  <div key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-4">
                <div className="rounded-lg bg-slate-50 p-3">
                  <CheckCircle className="h-4 w-4 text-primary" aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold text-slate-950">Online tracking</p>
                  <p className="mt-1 text-xs text-slate-500">Status updates from phone or desktop</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Recognized by</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {proofPanel.badges.map((badge) => (
                      <span key={badge} className="rounded-md border border-slate-950/10 bg-slate-950/75 px-2 py-1 text-[0.7rem] font-semibold text-white">
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default ShapeLandingHero;
