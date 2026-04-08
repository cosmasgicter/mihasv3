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
 */

import type React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { InfiniteGrid } from './infinite-grid';
import { TextRotate } from './text-rotate';
import { ShinyText } from './shiny-text';

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
  /** Campus image src */
  imageSrc: string;
  /** Campus image alt */
  imageAlt: string;
}

export function ShapeLandingHero({
  headline,
  description,
  rotatingPhrases,
  primaryCta,
  secondaryCta,
  imageSrc,
  imageAlt,
}: ShapeLandingHeroProps) {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
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
        <div className="grid grid-cols-1 items-center gap-10 pt-24 pb-16 lg:grid-cols-2 lg:gap-14">
          {/* Text column */}
          <div className="text-center text-white lg:text-left">
            <p className="mb-4 inline-flex items-center rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
              Government Accredited Health Programs
            </p>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 leading-tight">
              {headline}
            </h1>

            {/* Rotating phrases */}
            {rotatingPhrases.length > 0 && (
              <div className="mb-4 sm:mb-6 text-lg sm:text-xl md:text-2xl font-semibold text-white/90">
                <TextRotate
                  phrases={rotatingPhrases}
                  interval={3000}
                  duration={500}
                />
              </div>
            )}

            <p className="text-base sm:text-lg md:text-xl mb-6 sm:mb-8 max-w-2xl mx-auto lg:mx-0 leading-relaxed text-white/95 font-medium">
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
            <div className="flex flex-col xs:flex-row gap-4 sm:gap-6 justify-center lg:justify-start items-center max-w-md xs:max-w-none mx-auto lg:mx-0">
              <Link
                to={primaryCta.href}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
                  'bg-gradient-to-r from-primary via-primary to-info text-primary-foreground',
                  'shadow-lg hover:brightness-105 hover:shadow-xl active:scale-[0.98]',
                  'transition-all duration-150 touch-manipulation',
                  'w-full xs:w-auto min-h-[48px] px-6 sm:px-8 text-xl',
                  'motion-reduce:transform-none motion-reduce:transition-none',
                )}
                aria-label={primaryCta.label}
              >
                <span>{primaryCta.label}</span>
                {primaryCta.icon}
              </Link>

              <Link
                to={secondaryCta.href}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
                  'border-2 border-white bg-white/10 text-white',
                  'hover:bg-white hover:text-primary backdrop-blur-sm',
                  'transition-all duration-150 touch-manipulation',
                  'w-full xs:w-auto min-h-[48px] px-6 sm:px-8 text-xl',
                  'motion-reduce:transform-none motion-reduce:transition-none',
                )}
                aria-label={secondaryCta.label}
              >
                <span>{secondaryCta.label}</span>
                {secondaryCta.icon}
              </Link>
            </div>
          </div>

          {/* Image column */}
          <div className="mx-auto w-full max-w-xl">
            <div className="relative overflow-hidden rounded-3xl border border-white/25 bg-white/10 p-2 shadow-2xl backdrop-blur-sm">
              <img
                src={imageSrc}
                alt={imageAlt}
                className="h-64 w-full rounded-2xl sm:h-80 lg:h-[420px] object-cover"
                width={1024}
                height={420}
                loading="eager"
              />

              <div className="pointer-events-none absolute inset-x-6 bottom-6 rounded-2xl border border-white/30 bg-black/40 p-4 backdrop-blur-md">
                <p className="text-sm font-semibold text-white">
                  92% Job Placement Rate
                </p>
                <p className="text-xs text-white/90">
                  Trusted by hospitals, clinics, and public health institutions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ShapeLandingHero;
