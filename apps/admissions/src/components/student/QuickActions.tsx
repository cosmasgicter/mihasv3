/**
 * QuickActions Component
 * Action cards for common student tasks
 * 
 * @requirements 5.7 - Quick actions and navigation
 */

import React from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  CreditCard,
  Calendar,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { animateClasses, staggerChild } from '@/lib/animations';

interface QuickActionsProps {
  hasDrafts: boolean;
  hasPendingPayment: boolean;
  hasScheduledInterview: boolean;
  onClearAllDrafts?: () => void;
  isClearingDrafts?: boolean;
  className?: string;
}

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'warning' | 'success' | 'danger' | 'neutral';
  disabled?: boolean;
  loading?: boolean;
}

function ActionCard({
  icon,
  title,
  description,
  href,
  onClick,
  variant = 'neutral',
  disabled = false,
  loading = false,
}: ActionCardProps) {
  const variantStyles = {
    primary: 'border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50',
    warning: 'border-warning/30 bg-warning/5 hover:bg-warning/10 hover:border-warning/50',
    success: 'border-success/30 bg-success/5 hover:bg-success/10 hover:border-success/50',
    danger: 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10 hover:border-destructive/50',
    neutral: 'border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-border',
  };

  const iconStyles = {
    primary: 'text-primary bg-primary/10',
    warning: 'text-warning bg-warning/10',
    success: 'text-success bg-success/10',
    danger: 'text-destructive bg-destructive/10',
    neutral: 'text-foreground/80 bg-muted',
  };

  const content = (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-2xl border transition-all duration-200 min-h-[44px]',
        variantStyles[variant],
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer active:scale-[0.98]'
      )}
    >
      <div className={cn(
        'flex h-9 w-9 items-center justify-center rounded-xl shrink-0',
        iconStyles[variant]
      )}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-pulse" />
        ) : (
          icon
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground text-sm">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
    </div>
  );

  const wrappedContent = (
    <div className="transition-transform duration-150">
      {content}
    </div>
  );

  if (href && !disabled) {
    return <Link to={href}>{wrappedContent}</Link>;
  }

  if (onClick && !disabled) {
    return (
      <button 
        onClick={onClick} 
        disabled={disabled || loading}
        className="w-full text-left"
      >
        {wrappedContent}
      </button>
    );
  }

  return wrappedContent;
}

export function QuickActions({
  hasDrafts: _hasDrafts,
  hasPendingPayment,
  hasScheduledInterview,
  onClearAllDrafts: _onClearAllDrafts,
  isClearingDrafts: _isClearingDrafts = false,
  className,
}: QuickActionsProps) {
  let itemIndex = 0;
  const hasContextualActions = hasPendingPayment || hasScheduledInterview

  if (!hasContextualActions) {
    return null
  }

  return (
    <Card className={cn('border-border/50 rounded-2xl', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          Quick Actions
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Resolve time-sensitive tasks quickly
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Pending payment action */}
          {hasPendingPayment && (
            <div className={`${animateClasses.fadeIn} opacity-0`} style={staggerChild(itemIndex++)}>
              <ActionCard
                icon={<CreditCard className="h-5 w-5" />}
                title="Complete Payment"
                description="Finish your application payment"
                href="/student/payment"
                variant="warning"
              />
            </div>
          )}

          {/* Interview action */}
          {hasScheduledInterview && (
            <div className={`${animateClasses.fadeIn} opacity-0`} style={staggerChild(itemIndex++)}>
              <ActionCard
                icon={<Calendar className="h-5 w-5" />}
                title="View Interview Details"
                description="Check your interview schedule"
                href="/student/interview"
                variant="success"
              />
            </div>
          )}

        </div>
      </CardContent>
    </Card>
  );
}

export default QuickActions;
