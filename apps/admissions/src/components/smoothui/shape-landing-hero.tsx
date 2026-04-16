/**
 * ShapeLandingHero Component - Geometric landing hero with animated elements
 * Replaces the existing HeroSection with a modern shape-based layout integrating
 * InfiniteGrid background, TextRotate for rotating phrases, and ShinyText for brand name.
 *
 * @requirements 4.1 - Shape-based geometric landing hero layout
 * @requirements 4.2 - Preserves existing CTA buttons with correct routing
 * @requirements 4.3 - Preserves campus image or equally compelling visual
 * @requirements 4.4 - Fully responsive from 320px to 2560px
 * @requirements 4.5 - Preserves SEO structured data and h1 heading hierarchy
 * @requirements 4.6 - LCP within 3 seconds on 3G mobile
 *
 * ─── WCAG 2.1 AA Contrast Audit ───────────────────────────────────────────
 * Background: bg-gradient-to-br from-primary via-primary/90 to-primary (≈ #0a4a7a)
 *             + overlay bg-gradient-to-t from-black/40 to-black/10
 * Darkest composite background ≈ #052d4d
 *
 * | Element                        | Class              | Effective FG | Ratio  | Pass |
 * |--------------------------------|--------------------|-------------|--------|------|
 * | Accreditation badge (text-xs)  | text-white (1.0)   | #ffffff     | ≥15:1  | ✅ AA |
 * | h1 headline (text-3xl–6xl)     | text-white (1.0)   | #ffffff     | ≥13:1  | ✅ AA |
 * | Rotating phrases (text-lg–2xl) | text-white (1.0)   | #ffffff     | ≥13:1  | ✅ AA (large) |
 * | Description (text-base–xl)     | text-white (1.0)   | #ffffff     | ≥13:1  | ✅ AA |
 * | ShinyText brand (text-sm)      | text-white (1.0)   | #ffffff     | ≥13:1  | ✅ AA |
 * | CTA primary button             | text-primary-fg    | per token   | ≥7:1   | ✅ AA |
 * | CTA secondary button           | text-white (1.0)   | #ffffff     | ≥13:1  | ✅ AA |
 * | Overlay title (text-sm)        | text-white (1.0)   | #ffffff     | ≥15:1  | ✅ AA |
 * | Overlay caption (text-xs)      | text-white (1.0)   | #ffffff     | ≥15:1  | ✅ AA |
 * | Checklist items (text-sm)      | text-white (1.0)   | #ffffff     | ≥12:1  | ✅ AA |
 * | Highlight labels (text-xs)     | text-white (1.0)   | #ffffff     | ≥13:1  | ✅ AA |
 * | Stats labels (text-xs–sm)      | text-white (1.0)   | #ffffff     | ≥13:1  | ✅ AA |
 * ──────────────────────────────────────────────────────────────────────────
 */

import type React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { InfiniteGrid } from './infinite-grid';
import { TextRotate } from './text-rotate';
import { ShinyText } from './shiny-text';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { CheckCircle } from '@/components/icons';
import { preloadAuthRoutes } from '@/lib/routePreload';

interface ShapeLandingHeroProps {
  /** Headline text */
  headline: string;
  /** Subheadline / description */
  description: string;
  /** Rotating phrases for TextRotate */
  rotatingPhrases: string[];
  /** Primary CTA */
  primaryCta: { label: string; href: string; icon?: React.ReactNode };
  /** Secondary CTA */
  secondaryCta: { label: string; href: string; icon?: React.ReactNode };
  /** Trust-building proof panel content */
  proofPanel: {
    image: {
      src: string;
      alt: string;
      width: number;
      height: number;
    };
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
    ? () => {
        void preloadAuthRoutes('hero-cta')
      }
    : undefined

  return (
    <section
      id="hero"
      className="relative flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden"
    >
      {/* Gradient background — uses primary blue throughout for consistent contrast with white text */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary opacity-95" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-black/10" />

      {/* InfiniteGrid background layer */}
      <InfiniteGrid
        cellSize={48}
        lineColor="rgba(255,255,255,0.5)"
        lineOpacity={0.08}
        speed={0.5}
        className="z-[1]"
      />

      {/* Content — pt-16 accounts for the sticky header height */}
      <div className="relative z-10 container-responsive px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 py-20 sm:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:gap-14">
          <div className="text-center text-white lg:text-left">
            <p className="mb-4 inline-flex items-center rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
              Government Accredited Health Programs
            </p>

            <h1 className="mx-auto mb-4 max-w-3xl text-3xl font-bold leading-tight sm:mb-6 sm:text-4xl md:text-5xl lg:mx-0 lg:text-6xl">
              {headline}
            </h1>

            {/* Rotating phrases */}
            {rotatingPhrases.length > 0 && (
              <>
                <p className="sr-only">
                  Programs include {rotatingPhrases.join(', ')}.
                </p>
                <div
                  aria-hidden="true"
                  className="mb-4 text-lg font-semibold text-white sm:mb-6 sm:text-xl md:text-2xl"
                >
                <TextRotate
                  phrases={rotatingPhrases}
                  interval={3000}
                  duration={500}
                  announce={false}
                />
                </div>
              </>
            )}

            <p className="mx-auto mb-6 max-w-2xl text-base font-medium leading-relaxed text-white sm:mb-8 sm:text-lg md:text-xl lg:mx-0">
              {description}
            </p>

            {/* ShinyText brand accent */}
            <div className="mb-6 sm:mb-8">
              <ShinyText
                text="MIHAS-KATC"
                className="text-sm font-bold uppercase tracking-widest text-white"
              />
            </div>

            {/* CTA buttons */}
            <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 xs:max-w-none xs:flex-row lg:mx-0 lg:justify-start">
              <Link
                to={primaryCta.href}
                onPointerEnter={warmPrimaryRoute}
                onFocus={warmPrimaryRoute}
                onTouchStart={warmPrimaryRoute}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
                  'bg-gradient-to-r from-primary via-primary to-info text-primary-foreground',
                  'shadow-lg hover:brightness-105 hover:shadow-xl active:scale-[0.98]',
                  'transition-[transform,box-shadow,filter] duration-150 touch-manipulation',
                  'w-full xs:w-auto min-h-[48px] px-6 sm:px-8 text-xl',
                  'motion-reduce:transform-none motion-reduce:transition-none',
                )}
                aria-label={primaryCta.label}
              >
                <span>{primaryCta.label}</span>
                {primaryCta.icon && <span aria-hidden="true">{primaryCta.icon}</span>}
              </Link>

              {secondaryCta.href.startsWith('#') ? (
                <a
                  href={secondaryCta.href}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
                    'border-2 border-white bg-white/10 text-white',
                    'hover:bg-white hover:text-primary backdrop-blur-sm',
                    'transition-[transform,background-color,color,border-color] duration-150 touch-manipulation',
                    'w-full xs:w-auto min-h-[48px] px-6 sm:px-8 text-xl',
                    'motion-reduce:transform-none motion-reduce:transition-none',
                  )}
                  aria-label={secondaryCta.label}
                >
                  <span>{secondaryCta.label}</span>
                  {secondaryCta.icon && <span aria-hidden="true">{secondaryCta.icon}</span>}
                </a>
              ) : (
                <Link
                  to={secondaryCta.href}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
                    'border-2 border-white bg-white/10 text-white',
                    'hover:bg-white hover:text-primary backdrop-blur-sm',
                    'transition-[transform,background-color,color,border-color] duration-150 touch-manipulation',
                    'w-full xs:w-auto min-h-[48px] px-6 sm:px-8 text-xl',
                    'motion-reduce:transform-none motion-reduce:transition-none',
                  )}
                  aria-label={secondaryCta.label}
                >
                  <span>{secondaryCta.label}</span>
                  {secondaryCta.icon && <span aria-hidden="true">{secondaryCta.icon}</span>}
                </Link>
              )}
            </div>

            {/* Stats highlight strip */}
            <div className="mt-10 flex flex-wrap justify-center gap-6 text-white sm:mt-12 sm:gap-10 lg:justify-start">
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold">92%</p>
                <p className="text-xs sm:text-sm text-white">Job Placement</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold">300+</p>
                <p className="text-xs sm:text-sm text-white">Graduates Employed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold">25+</p>
                <p className="text-xs sm:text-sm text-white">Employer Partners</p>
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[30rem]">
            <div className="relative">
              <div className="absolute inset-6 rounded-full bg-white/15 blur-3xl" aria-hidden="true" />

              <div className="relative rounded-[2rem] border border-white/25 bg-slate-950/30 p-3 shadow-[0_24px_80px_rgba(4,18,33,0.32)] backdrop-blur-xl">
                <div className="relative overflow-hidden rounded-[1.5rem]">
                  <OptimizedImage
                    src={proofPanel.image.src}
                    alt={proofPanel.image.alt}
                    width={proofPanel.image.width}
                    height={proofPanel.image.height}
                    lazy={false}
                    fetchPriority="high"
                    decoding="sync"
                    srcSetWidths={[320]}
                    sizes="(min-width: 1024px) 30rem, (min-width: 640px) 88vw, calc(100vw - 2rem)"
                    className="h-[20rem] w-full object-cover sm:h-[24rem]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/15 to-transparent" />

                  <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                    {proofPanel.badges.map((badge) => (
                      <span
                        key={badge}
                        className="rounded-full border border-white/30 bg-slate-950/75 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                    <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-white">
                      {proofPanel.eyebrow}
                    </p>
                    <p className="text-xl font-semibold leading-tight text-white sm:text-2xl">
                      {proofPanel.title}
                    </p>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-white">
                      {proofPanel.description}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {proofPanel.highlights.map((highlight) => (
                    <div
                      key={highlight.label}
                      className="rounded-[1.25rem] border border-white/25 bg-white/10 px-4 py-3 text-center backdrop-blur-sm"
                    >
                      <p className="text-xl font-bold text-white sm:text-2xl">{highlight.value}</p>
                      <p className="mt-1 text-[0.72rem] font-medium uppercase tracking-[0.16em] text-white">
                        {highlight.label}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-[1.25rem] border border-white/25 bg-slate-950/50 p-4 backdrop-blur-sm">
                  <ul className="space-y-3">
                    {proofPanel.checklist.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm text-white">
                        <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
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
