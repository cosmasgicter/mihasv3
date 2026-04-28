/**
 * ShapeLandingHero — Clean, cinematic hero with full-bleed background image.
 *
 * Layout: left-aligned text over a darkened campus photo.
 * Bottom strip: compact trust badges + stats.
 * Mobile-first, LCP-optimised (image is eager-loaded, no JS animations on paint path).
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { CheckCircle } from '@/components/icons';
import { preloadAuthRoutes } from '@/lib/routePreload';

function TextRotate({ phrases, interval = 3000 }: { phrases: string[]; interval?: number }) {
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => {
    if (phrases.length <= 1) return;
    const id = setInterval(() => setIndex(i => (i + 1) % phrases.length), interval);
    return () => clearInterval(id);
  }, [phrases, interval]);
  return <span className="inline-block transition-opacity duration-500">{phrases[index]}</span>;
}

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

  return (
    <section id="hero" className="relative isolate overflow-hidden bg-slate-950">
      {/* Background image — eager for LCP */}
      <OptimizedImage
        src={proofPanel.image.src}
        alt=""
        width={proofPanel.image.width}
        height={proofPanel.image.height}
        lazy={false}
        fetchPriority="high"
        decoding="sync"
        srcSetWidths={[640, 960, 1280, 1920]}
        sizes="100vw"
        className="absolute inset-0 -z-10 h-full w-full object-cover"
        aria-hidden="true"
      />

      {/* Gradient overlays */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/85 via-slate-950/60 to-slate-950/40" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-slate-950 to-transparent" aria-hidden="true" />

      {/* ── Main content ── */}
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <div className="grid min-h-[calc(100svh-6.5rem)] grid-rows-[1fr_auto] gap-6 py-12 sm:py-16 lg:py-20">

          {/* Top: headline + CTAs */}
          <div className="flex items-center">
            <div className="max-w-2xl">
              {/* Accreditation pill */}
              <p className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                Government Accredited
              </p>

              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl lg:leading-[1.08]">
                {headline}
              </h1>

              {/* Rotating phrases */}
              {rotatingPhrases.length > 0 && (
                <>
                  <p className="sr-only">Programs include {rotatingPhrases.join(', ')}.</p>
                  <p aria-hidden="true" className="mt-3 text-lg font-semibold text-emerald-300 sm:mt-4 sm:text-xl md:text-2xl">
                    <TextRotate phrases={rotatingPhrases} interval={3000} />
                  </p>
                </>
              )}

              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300 sm:mt-5 sm:text-lg">
                {description}
              </p>

              {/* CTAs */}
              <div className="mt-7 flex flex-col gap-3 xs:flex-row sm:mt-8">
                <Link
                  to={primaryCta.href}
                  onPointerEnter={warmPrimaryRoute}
                  onFocus={warmPrimaryRoute}
                  onTouchStart={warmPrimaryRoute}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
                    'bg-white text-slate-950 shadow-lg shadow-white/10',
                    'hover:bg-slate-100 active:bg-slate-200',
                    'transition-colors duration-150 touch-manipulation',
                    'h-12 px-7 text-base sm:h-14 sm:px-8 sm:text-lg',
                  )}
                >
                  <span>{primaryCta.label}</span>
                  {primaryCta.icon && <span aria-hidden="true">{primaryCta.icon}</span>}
                </Link>

                {secondaryCta.href.startsWith('#') ? (
                  <a
                    href={secondaryCta.href}
                    className={cn(
                      'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
                      'border border-white/25 text-white',
                      'hover:bg-white/10',
                      'transition-colors duration-150 touch-manipulation',
                      'h-12 px-7 text-base sm:h-14 sm:px-8 sm:text-lg',
                    )}
                  >
                    <span>{secondaryCta.label}</span>
                    {secondaryCta.icon && <span aria-hidden="true">{secondaryCta.icon}</span>}
                  </a>
                ) : (
                  <Link
                    to={secondaryCta.href}
                    className={cn(
                      'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
                      'border border-white/25 text-white',
                      'hover:bg-white/10',
                      'transition-colors duration-150 touch-manipulation',
                      'h-12 px-7 text-base sm:h-14 sm:px-8 sm:text-lg',
                    )}
                  >
                    <span>{secondaryCta.label}</span>
                    {secondaryCta.icon && <span aria-hidden="true">{secondaryCta.icon}</span>}
                  </Link>
                )}
              </div>

              {/* Inline stats */}
              <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 sm:mt-10">
                <div>
                  <span className="text-2xl font-bold text-white sm:text-3xl">92%</span>
                  <span className="ml-1.5 text-sm text-slate-400">job placement</span>
                </div>
                <div>
                  <span className="text-2xl font-bold text-white sm:text-3xl">300+</span>
                  <span className="ml-1.5 text-sm text-slate-400">graduates employed</span>
                </div>
                <div>
                  <span className="text-2xl font-bold text-white sm:text-3xl">25+</span>
                  <span className="ml-1.5 text-sm text-slate-400">employer partners</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: trust strip */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {proofPanel.badges.map((badge) => (
                    <span
                      key={badge}
                      className="rounded border border-white/15 bg-white/8 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-white/80"
                    >
                      {badge}
                    </span>
                  ))}
                  <span className="text-sm font-medium text-white/70">accredited</span>
                </div>
                <p className="mt-2 text-sm font-medium text-white sm:text-base">{proofPanel.title}</p>
              </div>

              <div className="flex flex-wrap gap-2 sm:gap-3 lg:flex-shrink-0">
                {proofPanel.highlights.map((h) => (
                  <div key={h.label} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-center min-w-[5.5rem]">
                    <p className="text-lg font-bold text-white sm:text-xl">{h.value}</p>
                    <p className="text-[0.65rem] font-medium uppercase tracking-wide text-white/60">{h.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <ul className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-white/10 pt-3 text-sm text-slate-300 sm:grid-cols-3">
              {proofPanel.checklist.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" aria-hidden="true" />
                  <span className="text-xs leading-relaxed sm:text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ShapeLandingHero;
