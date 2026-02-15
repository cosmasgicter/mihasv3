/**
 * CTASection Component - ShadcnBlocks-style call-to-action section
 * Full-width CTA with gradient backgrounds and animated buttons
 * 
 * @requirements 8.4, 8.5 - ShadcnBlocks page sections with design tokens
 */

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { ScrollReveal } from '@/components/smoothui';
import { ArrowRight, Sparkles } from 'lucide-react';

interface CTASectionProps {
  title: string;
  description?: string;
  primaryCTA: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryCTA?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  variant?: 'default' | 'gradient' | 'dark' | 'bordered';
  alignment?: 'left' | 'center';
  showIcon?: boolean;
  className?: string;
}

export function CTASection({
  title,
  description,
  primaryCTA,
  secondaryCTA,
  variant = 'gradient',
  alignment = 'center',
  showIcon = false,
  className,
}: CTASectionProps) {
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const variantClasses = {
    default: 'bg-card',
    gradient: 'bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-white',
    dark: 'bg-foreground text-background',
    bordered: 'border-2 border-primary bg-background',
  };

  const textClasses = {
    default: 'text-foreground',
    gradient: 'text-white',
    dark: 'text-background',
    bordered: 'text-foreground',
  };

  const descriptionClasses = {
    default: 'text-muted-foreground',
    gradient: 'text-white/80',
    dark: 'text-background/80',
    bordered: 'text-muted-foreground',
  };

  return (
    <section className={cn('py-16 sm:py-20', className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div
            className={cn(
              'rounded-2xl p-8 sm:p-12 lg:p-16',
              variantClasses[variant],
              alignment === 'center' && 'text-center'
            )}
          >
            <div className={cn('max-w-3xl', alignment === 'center' && 'mx-auto')}>
              {/* Icon */}
              {showIcon && (
                <div
                  className={cn("mb-6", !prefersReducedMotion && "animate-[wiggle_2s_ease-in-out_infinite]")}
                  style={{ animationDelay: '3s' }}
                >
                  <Sparkles className={cn('h-10 w-10', variant === 'gradient' || variant === 'dark' ? 'text-white' : 'text-primary')} />
                </div>
              )}

              {/* Title */}
              <h2
                className={cn(
                  'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight',
                  textClasses[variant]
                )}
              >
                {title}
              </h2>

              {/* Description */}
              {description && (
                <p
                  className={cn(
                    'mt-4 text-lg',
                    descriptionClasses[variant]
                  )}
                >
                  {description}
                </p>
              )}

              {/* CTAs */}
              <div
                className={cn(
                  'mt-8 flex flex-col sm:flex-row gap-4',
                  alignment === 'center' && 'justify-center'
                )}
              >
                <div
                  className="hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200"
                >
                  <Button
                    size="lg"
                    variant={variant === 'gradient' || variant === 'dark' ? 'secondary' : 'default'}
                    className="min-h-[48px] px-8 text-base font-semibold w-full sm:w-auto"
                    onClick={primaryCTA.onClick || (primaryCTA.href ? () => window.location.href = primaryCTA.href! : undefined)}
                  >
                    {primaryCTA.label}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>

                {secondaryCTA && (
                  <Button
                    size="lg"
                    variant="outline"
                    className={cn(
                      'min-h-[48px] px-8 text-base font-semibold w-full sm:w-auto',
                      (variant === 'gradient' || variant === 'dark') && 'border-white/30 text-white hover:bg-white/10'
                    )}
                    onClick={secondaryCTA.onClick || (secondaryCTA.href ? () => window.location.href = secondaryCTA.href! : undefined)}
                  >
                    {secondaryCTA.label}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// Simple banner CTA variant
interface CTABannerProps {
  text: string;
  ctaLabel: string;
  ctaHref?: string;
  ctaOnClick?: () => void;
  className?: string;
}

export function CTABanner({
  text,
  ctaLabel,
  ctaHref,
  ctaOnClick,
  className,
}: CTABannerProps) {
  return (
    <div
      className={cn(
        'bg-primary py-4 px-4 sm:px-6',
        className
      )}
    >
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-white font-medium text-center sm:text-left">
          {text}
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="whitespace-nowrap"
          onClick={ctaOnClick || (ctaHref ? () => window.location.href = ctaHref! : undefined)}
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}

export default CTASection;
