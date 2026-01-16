/**
 * StatsSection Component - ShadcnBlocks-style statistics section
 * Displays animated counters for key metrics
 * 
 * @requirements 8.4, 8.5 - ShadcnBlocks page sections with design tokens
 */

import { cn } from '@/lib/utils';
import { ScrollReveal, StaggerReveal, StaggerItem, AnimatedCounter } from '@/components/smoothui';
import { LucideIcon } from 'lucide-react';

interface Stat {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
}

interface StatsSectionProps {
  title?: string;
  subtitle?: string;
  description?: string;
  stats: Stat[];
  columns?: 2 | 3 | 4;
  variant?: 'default' | 'cards' | 'minimal' | 'gradient';
  className?: string;
}

const columnConfig = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
};

export function StatsSection({
  title,
  subtitle,
  description,
  stats,
  columns = 4,
  variant = 'default',
  className,
}: StatsSectionProps) {
  return (
    <section
      className={cn(
        'py-16 sm:py-20',
        variant === 'gradient' && 'bg-gradient-to-br from-primary/5 via-background to-secondary/5',
        className
      )}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        {(title || subtitle || description) && (
          <ScrollReveal className="text-center max-w-3xl mx-auto mb-12">
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

        {/* Stats grid */}
        <StaggerReveal
          className={cn('grid gap-8', columnConfig[columns])}
          staggerDelay={0.15}
        >
          {stats.map((stat, index) => (
            <StaggerItem key={index}>
              <StatCard stat={stat} variant={variant} />
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  );
}

interface StatCardProps {
  stat: Stat;
  variant: 'default' | 'cards' | 'minimal' | 'gradient';
}

function StatCard({ stat, variant }: StatCardProps) {
  const Icon = stat.icon;

  const cardClasses = {
    default: 'text-center',
    cards: 'bg-card rounded-xl p-6 shadow-sm text-center',
    minimal: 'text-center',
    gradient: 'text-center',
  };

  return (
    <div className={cn(cardClasses[variant])}>
      {/* Icon */}
      {Icon && (
        <div className="flex justify-center mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      )}

      {/* Value with animated counter */}
      <div className="text-4xl sm:text-5xl font-bold text-primary">
        <AnimatedCounter
          value={stat.value}
          prefix={stat.prefix}
          suffix={stat.suffix}
          duration={2}
        />
      </div>

      {/* Label */}
      <div className="mt-2 text-lg font-medium text-foreground">
        {stat.label}
      </div>

      {/* Description */}
      {stat.description && (
        <p className="mt-1 text-sm text-muted-foreground">
          {stat.description}
        </p>
      )}
    </div>
  );
}

// Inline stats variant for hero sections
interface InlineStatsProps {
  stats: Array<{
    value: string;
    label: string;
  }>;
  className?: string;
}

export function InlineStats({ stats, className }: InlineStatsProps) {
  return (
    <div className={cn('flex flex-wrap justify-center gap-8 sm:gap-12', className)}>
      {stats.map((stat, index) => (
        <div key={index} className="text-center">
          <div className="text-3xl sm:text-4xl font-bold text-primary">
            {stat.value}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export default StatsSection;
