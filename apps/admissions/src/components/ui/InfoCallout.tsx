import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type CalloutVariant = 'info' | 'success' | 'warning' | 'neutral';

interface InfoCalloutProps {
  icon: LucideIcon;
  title: string;
  description: string;
  variant?: CalloutVariant;
  className?: string;
}

const variantStyles: Record<CalloutVariant, { container: string; icon: string; title: string; description: string }> = {
  info: {
    container: 'border-primary/30 bg-primary/5',
    icon: 'text-primary',
    title: 'text-foreground',
    description: 'text-muted-foreground',
  },
  success: {
    container: 'border-success/30 bg-success/5',
    icon: 'text-success',
    title: 'text-foreground',
    description: 'text-muted-foreground',
  },
  warning: {
    container: 'border-warning/30 bg-warning/5',
    icon: 'text-warning',
    title: 'text-foreground',
    description: 'text-muted-foreground',
  },
  neutral: {
    container: 'border-border bg-muted/40',
    icon: 'text-primary',
    title: 'text-foreground',
    description: 'text-muted-foreground',
  },
};

export function InfoCallout({ icon: Icon, title, description, variant = 'info', className }: InfoCalloutProps) {
  const styles = variantStyles[variant];

  return (
    <div className={cn('rounded-2xl border p-4', styles.container, className)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', styles.icon)} />
        <div className="space-y-1">
          <p className={cn('text-sm font-semibold', styles.title)}>{title}</p>
          <p className={cn('text-sm', styles.description)}>{description}</p>
        </div>
      </div>
    </div>
  );
}
