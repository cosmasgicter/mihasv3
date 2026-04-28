/**
 * ShapeLandingHero — Centered cinematic hero with full-bleed background.
 * Clean, spacious, center-aligned. No clutter.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
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
      {/* Background image */}
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
      <div className="absolute inset-0 -z-10 bg-slate-950/70" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-slate-950 to-transparent" aria-hidden="true" />

      {/* Content */}
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[calc(100svh-6.5rem)] flex-col items-center justify-center py-20 text-center sm:py-24 lg:py-28">

          {/* Pill */}
          <p className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm sm:mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            Government Accredited
          </p>

          {/* Headline */}
          <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl lg:leading-[1.05]">
            {headline}
          </h1>

          {/* Rotating phrases */}
          {rotatingPhrases.length > 0 && (
            <>
              <p className="sr-only">Programs include {rotatingPhrases.join(', ')}.</p>
              <p aria-hidden="true" className="mt-4 text-xl font-semibold text-emerald-300 sm:mt-5 sm:text-2xl md:text-3xl">
                <TextRotate phrases={rotatingPhrases} interval={3000} />
              </p>
            </>
          )}

          {/* Description */}
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:mt-6 sm:text-lg md:text-xl">
            {description}
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-col items-center gap-3 sm:mt-10 sm:flex-row">
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
                'h-13 px-8 text-base sm:h-14 sm:px-10 sm:text-lg',
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
                  'border border-white/30 text-white hover:bg-white/10',
                  'transition-colors duration-150 touch-manipulation',
                  'h-13 px-8 text-base sm:h-14 sm:px-10 sm:text-lg',
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
                  'border border-white/30 text-white hover:bg-white/10',
                  'transition-colors duration-150 touch-manipulation',
                  'h-13 px-8 text-base sm:h-14 sm:px-10 sm:text-lg',
                )}
              >
                <span>{secondaryCta.label}</span>
                {secondaryCta.icon && <span aria-hidden="true">{secondaryCta.icon}</span>}
              </Link>
            )}
          </div>

          {/* Stats row */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 sm:mt-14">
            {[
              { value: '92%', label: 'Job Placement' },
              { value: '300+', label: 'Graduates Employed' },
              { value: '25+', label: 'Employer Partners' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold text-white sm:text-4xl">{stat.value}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400 sm:text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trust bar — pinned to bottom */}
      <div className="border-t border-white/10 bg-slate-950/80 backdrop-blur-sm">
        <div className="container-responsive flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          {proofPanel.badges.map((badge) => (
            <span key={badge} className="text-[0.7rem] font-bold uppercase tracking-widest text-white/50">
              {badge}
            </span>
          ))}
          <span className="hidden h-3 w-px bg-white/20 sm:block" aria-hidden="true" />
          <span className="text-xs text-white/50">{proofPanel.title}</span>
        </div>
      </div>
    </section>
  );
}

export default ShapeLandingHero;
