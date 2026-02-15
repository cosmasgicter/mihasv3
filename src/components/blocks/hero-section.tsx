/**
 * HeroSection Component - ShadcnBlocks-style hero section
 * Full-width hero with gradient backgrounds and animated content
 * 
 * @requirements 8.4, 8.5 - ShadcnBlocks page sections with design tokens
 */

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { ScrollReveal } from '@/components/smoothui';
import { ArrowRight, ChevronDown } from 'lucide-react';

interface HeroStat {
  value: string;
  label: string;
}

interface HeroCTA {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
}

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  description?: string;
  primaryCTA?: HeroCTA;
  secondaryCTA?: HeroCTA;
  stats?: HeroStat[];
  backgroundGradient?: string;
  backgroundImage?: string;
  alignment?: 'left' | 'center' | 'right';
  size?: 'sm' | 'md' | 'lg' | 'full';
  showScrollIndicator?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const sizeConfig = {
  sm: 'min-h-[50vh] py-16',
  md: 'min-h-[70vh] py-20',
  lg: 'min-h-[85vh] py-24',
  full: 'min-h-screen py-24',
};

const alignmentConfig = {
  left: 'text-left items-start',
  center: 'text-center items-center',
  right: 'text-right items-end',
};

export function HeroSection({
  title,
  subtitle,
  description,
  primaryCTA,
  secondaryCTA,
  stats,
  backgroundGradient = 'from-primary/5 via-background to-secondary/5',
  backgroundImage,
  alignment = 'center',
  size = 'lg',
  showScrollIndicator = false,
  className,
  children,
}: HeroSectionProps) {
  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  return (
    <section
      className={cn(
        'relative flex flex-col justify-center overflow-hidden',
        `bg-gradient-to-br ${backgroundGradient}`,
        sizeConfig[size],
        className
      )}
      style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {/* Background overlay for images */}
      {backgroundImage && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      )}

      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={cn('flex flex-col max-w-4xl mx-auto animate-fade-in', alignmentConfig[alignment])}
        >
          {/* Subtitle/Badge */}
          {subtitle && (
            <div>
              <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-primary mb-6">
                {subtitle}
              </span>
            </div>
          )}

          {/* Title */}
          <h1
            className={cn(
              'text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground',
              'leading-tight animate-slide-up'
            )}
          >
            {title}
          </h1>

          {/* Description */}
          {description && (
            <p
              className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl animate-slide-up"
              style={{ animationDelay: '150ms', animationFillMode: 'forwards', opacity: 0 }}
            >
              {description}
            </p>
          )}

          {/* CTAs */}
          {(primaryCTA || secondaryCTA) && (
            <div
              className={cn(
                'mt-8 flex flex-col sm:flex-row gap-4 animate-slide-up',
                alignment === 'center' && 'justify-center',
                alignment === 'right' && 'justify-end'
              )}
              style={{ animationDelay: '300ms', animationFillMode: 'forwards', opacity: 0 }}
            >
              {primaryCTA && (
                <Button
                  size="lg"
                  className="min-h-[48px] px-8 text-base font-semibold"
                  onClick={primaryCTA.onClick || (primaryCTA.href ? () => window.location.href = primaryCTA.href! : undefined)}
                >
                  {primaryCTA.label}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              )}
              {secondaryCTA && (
                <Button
                  size="lg"
                  variant="outline"
                  className="min-h-[48px] px-8 text-base font-semibold"
                  onClick={secondaryCTA.onClick || (secondaryCTA.href ? () => window.location.href = secondaryCTA.href! : undefined)}
                >
                  {secondaryCTA.label}
                </Button>
              )}
            </div>
          )}

          {/* Stats */}
          {stats && stats.length > 0 && (
            <div
              className={cn(
                'mt-12 grid grid-cols-2 sm:grid-cols-4 gap-8 animate-fade-in',
                alignment === 'center' && 'justify-items-center'
              )}
              style={{ animationDelay: '450ms', animationFillMode: 'forwards', opacity: 0 }}
            >
              {stats.map((stat, index) => (
                <div key={index} className="flex flex-col">
                  <span className="text-3xl sm:text-4xl font-bold text-primary">
                    {stat.value}
                  </span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Custom children */}
          {children && (
            <div className="mt-8 animate-fade-in" style={{ animationDelay: '450ms', animationFillMode: 'forwards', opacity: 0 }}>
              {children}
            </div>
          )}
        </div>
      </div>

      {/* Scroll indicator */}
      {showScrollIndicator && (
        <div
          className={cn(
            "absolute bottom-8 left-1/2 -translate-x-1/2",
            !prefersReducedMotion && "animate-bounce"
          )}
        >
          <ChevronDown className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
    </section>
  );
}

export default HeroSection;
