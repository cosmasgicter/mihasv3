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
  FileText, 
  User, 
  CreditCard, 
  Calendar,
  X,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
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
    neutral: 'text-muted-foreground bg-muted',
  };

  const content = (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border transition-all duration-200',
        variantStyles[variant],
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer'
      )}
    >
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
        iconStyles[variant]
      )}>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
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
    <div className="hover:scale-[1.02] active:scale-[0.98] transition-transform duration-150">
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
  hasDrafts,
  hasPendingPayment,
  hasScheduledInterview,
  onClearAllDrafts,
  isClearingDrafts = false,
  className,
}: QuickActionsProps) {
  let itemIndex = 0;

  return (
    <Card className={cn('border-border/50', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          Quick Actions
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Access common tasks quickly
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Primary action - Continue draft or Start new */}
          <div className={`${animateClasses.fadeIn} opacity-0`} style={staggerChild(itemIndex++)}>
            {hasDrafts ? (
              <ActionCard
                icon={<FileText className="h-5 w-5" />}
                title="Continue Draft"
                description="Resume your application"
                href="/student/application-wizard"
                variant="warning"
              />
            ) : (
              <ActionCard
                icon={<Plus className="h-5 w-5" />}
                title="Start New Application"
                description="Begin your application journey"
                href="/student/application-wizard"
                variant="primary"
              />
            )}
          </div>

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

          {/* Profile settings */}
          <div className={`${animateClasses.fadeIn} opacity-0`} style={staggerChild(itemIndex++)}>
            <ActionCard
              icon={<User className="h-5 w-5" />}
              title="Profile Settings"
              description="Update your personal information"
              href="/settings"
              variant="neutral"
            />
          </div>

          {/* Clear drafts action */}
          {hasDrafts && onClearAllDrafts && (
            <div className={`${animateClasses.fadeIn} opacity-0`} style={staggerChild(itemIndex++)}>
              <ActionCard
                icon={<X className="h-5 w-5" />}
                title="Clear All Drafts"
                description="Remove all draft applications"
                onClick={onClearAllDrafts}
                variant="danger"
                loading={isClearingDrafts}
                disabled={isClearingDrafts}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default QuickActions;
