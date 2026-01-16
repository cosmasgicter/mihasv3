/**
 * FeatureGrid Component - ShadcnBlocks-style feature grid
 * Responsive grid of feature cards with icons and hover effects
 * 
 * @requirements 8.4, 8.5 - ShadcnBlocks page sections with design tokens
 */

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ScrollReveal, StaggerReveal, StaggerItem } from '@/components/smoothui';
import { LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient?: string;
  href?: string;
}

interface FeatureGridProps {
  title?: string;
  subtitle?: string;
  description?: string;
  features: Feature[];
  columns?: 2 | 3 | 4;
  variant?: 'cards' | 'minimal' | 'bordered';
  className?: string;
}

const columnConfig = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

export function FeatureGrid({
  title,
  subtitle,
  description,
  features,
  columns = 3,
  variant = 'cards',
  className,
}: FeatureGridProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className={cn('py-16 sm:py-20 lg:py-24', className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        {(title || subtitle || description) && (
          <ScrollReveal className="text-center max-w-3xl mx-auto mb-12 lg:mb-16">
            {subtitle && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary mb-4">
                {subtitle}
              </span>
            )}
            {title && (
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-4 text-lg text-muted-foreground">
                {description}
              </p>
            )}
          </ScrollReveal>
        )}

        {/* Features grid */}
        <StaggerReveal
          className={cn('grid gap-6 lg:gap-8', columnConfig[columns])}
          staggerDelay={0.1}
        >
          {features.map((feature, index) => (
            <StaggerItem key={index}>
              <FeatureCard feature={feature} variant={variant} />
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  );
}

interface FeatureCardProps {
  feature: Feature;
  variant: 'cards' | 'minimal' | 'bordered';
}

function FeatureCard({ feature, variant }: FeatureCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const Icon = feature.icon;

  const cardClasses = {
    cards: 'bg-card rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow duration-300',
    minimal: 'p-6',
    bordered: 'border border-border rounded-xl p-6 hover:border-primary/50 transition-colors duration-300',
  };

  const iconGradient = feature.gradient || 'from-primary to-primary/80';

  const content = (
    <motion.div
      className={cn(cardClasses[variant], 'h-full')}
      whileHover={prefersReducedMotion ? {} : { y: -4 }}
      transition={{ duration: 0.2 }}
    >
      {/* Icon */}
      <div
        className={cn(
          'inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4',
          `bg-gradient-to-br ${iconGradient}`
        )}
      >
        <Icon className="h-6 w-6 text-white" />
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {feature.title}
      </h3>

      {/* Description */}
      <p className="text-muted-foreground text-sm leading-relaxed">
        {feature.description}
      </p>
    </motion.div>
  );

  if (feature.href) {
    return (
      <a href={feature.href} className="block h-full">
        {content}
      </a>
    );
  }

  return content;
}

// Simplified feature list variant
interface FeatureListProps {
  features: Array<{
    icon: LucideIcon;
    title: string;
    description: string;
  }>;
  className?: string;
}

export function FeatureList({ features, className }: FeatureListProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {features.map((feature, index) => {
        const Icon = feature.icon;
        return (
          <ScrollReveal key={index} direction="left" delay={index * 0.1}>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-foreground">{feature.title}</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          </ScrollReveal>
        );
      })}
    </div>
  );
}

export default FeatureGrid;
