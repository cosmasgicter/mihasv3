/**
 * DashboardStatusOverview Component
 * Card-based layout with key metrics and status indicators
 * 
 * @requirements 5.1, 5.3, 5.5, 5.6 - Student Dashboard status display
 * @requirements 19.1, 19.2, 19.3, 19.4, 19.5 - Application statistics accuracy
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  CheckCircle, 
  AlertCircle,
  CreditCard,
  TrendingUp,
  Plus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { StatusIndicator, StatusBadge } from '@/components/8starlabs';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { animateClasses, staggerChild } from '@/lib/animations';
import type { Application } from '@/types/database';
import { requiresStudentPaymentAction } from '@/lib/paymentStatus';
import { computeApplicationStats } from '@/lib/applicationStats';

interface DashboardStatusOverviewProps {
  applications: Application[];
  className?: string;
}

// Map application status to 8starlabs status types
const statusMapping: Record<string, 'operational' | 'degraded' | 'down' | 'idle' | 'pending' | 'success' | 'error' | 'warning'> = {
  draft: 'idle',
  submitted: 'pending',
  under_review: 'pending',
  pending_payment: 'warning',
  interview_scheduled: 'operational',
  waitlisted: 'warning',
  conditionally_approved: 'operational',
  approved: 'success',
  enrolled: 'success',
  rejected: 'error',
  withdrawn: 'down',
  expired: 'down',
  enrollment_expired: 'down',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  pending_payment: 'Pending Payment',
  interview_scheduled: 'Interview Scheduled',
  waitlisted: 'Waitlisted',
  conditionally_approved: 'Conditionally Approved',
  approved: 'Approved',
  enrolled: 'Enrolled',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
  enrollment_expired: 'Enrollment Expired',
};

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  accent?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
  href?: string;
  className?: string;
}

function MetricCard({ 
  title, 
  value, 
  icon, 
  description, 
  trend,
  accent = 'neutral',
  href,
  className 
}: MetricCardProps) {
  const accentStyles = {
    primary: 'border-l-primary bg-primary/5',
    success: 'border-l-success bg-success/5',
    warning: 'border-l-warning bg-warning/5',
    error: 'border-l-destructive bg-destructive/5',
    neutral: 'border-l-border bg-muted/30',
  };

  const iconStyles = {
    primary: 'text-primary bg-primary/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
    error: 'text-destructive bg-destructive/10',
    neutral: 'text-muted-foreground bg-muted',
  };

  const content = (
    <div className={cn(
      'rounded-2xl border border-border/50 p-4 transition-all duration-200',
      'border-l-4',
      accentStyles[accent],
      href && 'hover:shadow-md hover:border-primary/20 cursor-pointer min-h-[44px]',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
            {title}
          </p>
          <p className="text-2xl font-bold tracking-tight text-foreground">
            {value}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">
              {description}
            </p>
          )}
        </div>
        <div className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl shrink-0',
          iconStyles[accent]
        )}>
          {icon}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link to={href}>
        <div className="hover:-translate-y-0.5 transition-transform duration-200">
          {content}
        </div>
      </Link>
    );
  }

  return content;
}

export function DashboardStatusOverview({ 
  applications, 
  className 
}: DashboardStatusOverviewProps) {

  // Derive all statistics from the applications list (React Query cache)
  // Requirements 19.1-19.5: accurate stats, no hardcoded/placeholder values
  const stats = computeApplicationStats(applications);

  const paymentActionRequiredCount = applications.filter(app =>
    app.status !== 'draft' && requiresStudentPaymentAction(app.payment_status)
  ).length;
  const paymentActionApplication = applications.find(app =>
    app.status !== 'draft' && requiresStudentPaymentAction(app.payment_status)
  );
  const paymentActionHref = paymentActionApplication
    ? `/student/payment?applicationId=${encodeURIComponent(paymentActionApplication.id)}`
    : '/student/payment';

  // Latest non-draft application for the status card
  const submittedApplications = applications.filter(app => app.status !== 'draft');
  const latestApplication = submittedApplications.length > 0 
    ? [...submittedApplications]
        .sort((a, b) => {
          const getRelevantDate = (app: Application) => {
            if (app.submitted_at) {
              return new Date(app.submitted_at).getTime();
            }
            return new Date(app.created_at ?? 0).getTime();
          };
          return getRelevantDate(b) - getRelevantDate(a);
        })[0]
    : null;
  
  const latestApplicationRequiresPayment = latestApplication
    ? latestApplication.status !== 'draft' && requiresStudentPaymentAction(latestApplication.payment_status)
    : false

  const latestApplicationLink = latestApplication
    ? latestApplicationRequiresPayment
      ? `/student/payment?applicationId=${encodeURIComponent(latestApplication.id)}`
      : `/student/application/${latestApplication.id}`
    : '/student/dashboard';

  const metrics = [
    {
      title: 'In Progress',
      value: stats.inProgress,
      icon: <FileText className="h-5 w-5" />,
      description:
        stats.inProgress > 0
          ? 'Draft or submitted'
          : 'No applications in progress',
      accent: stats.inProgress > 0 ? 'primary' as const : 'neutral' as const,
    },
    {
      title: 'Completed',
      value: stats.completed,
      icon: <CheckCircle className="h-5 w-5" />,
      description:
        stats.completed > 0
          ? 'Approved, rejected, or waitlisted'
          : 'No completed applications yet',
      accent: stats.completed > 0 ? 'success' as const : 'neutral' as const,
    },
    {
      title: 'Payment Action Required',
      value: paymentActionRequiredCount,
      icon: <CreditCard className="h-5 w-5" />,
      description:
        paymentActionRequiredCount > 0
          ? 'Finish payment or resubmit proof'
          : 'No payment follow-up needed',
      accent: paymentActionRequiredCount > 0 ? 'warning' as const : 'neutral' as const,
      href: paymentActionRequiredCount > 0 ? paymentActionHref : undefined,
    },
    {
      title: 'Total Applications',
      value: stats.total,
      icon: <AlertCircle className="h-5 w-5" />,
      description:
        stats.total > 0
          ? 'All applications'
          : 'Start your first application',
      accent: stats.total > 0 ? 'primary' as const : 'neutral' as const,
    },
  ];

  return (
    <div className={cn('space-y-6', className)}>
      {/* Visually hidden live region for screen reader announcements on polling updates (Req 28.3) */}
      <div className="sr-only" aria-live="polite" aria-atomic="true" role="status">
        {stats.total > 0
          ? `${stats.inProgress} application${stats.inProgress !== 1 ? 's' : ''} in progress, ${stats.completed} completed`
          : 'No applications yet'}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {metrics.map((metric, index) => (
          <div
            key={metric.title}
            className={`${animateClasses.slideUp} opacity-0`}
            style={staggerChild(index)}
          >
            <MetricCard {...metric} />
          </div>
        ))}
      </div>

      {/* Requirement 19.4: Zero applications prompt */}
      {stats.total === 0 && (
        <div
          className={`${animateClasses.slideUp} opacity-0 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-6 text-center`}
          style={staggerChild(4)}
        >
          <p className="text-sm font-semibold text-foreground mb-1">
            You have no applications yet
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Start your admissions journey by creating your first application.
          </p>
          <Link to="/student/application-wizard">
            <Button variant="primary" size="sm" className="min-h-[44px] transition-all duration-200 active:scale-[0.98]">
              <Plus className="mr-2 h-4 w-4" />
              New Application
            </Button>
          </Link>
        </div>
      )}

      {/* Current Application Status */}
      {latestApplication && (
        <div className={`${animateClasses.slideUp} opacity-0`} style={staggerChild(5)}>
          <Card className="border-border/50 overflow-hidden rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Latest Application Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <StatusIndicator 
                    status={statusMapping[latestApplication.status] || 'idle'}
                    label={statusLabels[latestApplication.status] || latestApplication.status}
                    showPulse={latestApplication.status === 'under_review'}
                    size="lg"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {latestApplication.program || 'Application'}
                  </span>
                  {' · '}
                  <span>#{latestApplication.application_number}</span>
                </div>
                <Link 
                  to={latestApplicationLink}
                  className="min-h-[44px] inline-flex items-center text-sm font-medium text-primary transition-colors duration-200 hover:text-primary/80"
                >
                  {latestApplication.status === 'draft' ? 'Continue Application →' : latestApplicationRequiresPayment ? 'Complete Payment →' : 'View Details →'}
                </Link>
              </div>
              {latestApplication.admin_feedback && (
                <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                  <p className="text-xs font-semibold text-primary/70 mb-1">Feedback from Admissions</p>
                  <p className="text-sm text-foreground">{latestApplication.admin_feedback}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pending Payment Alert */}
      {paymentActionRequiredCount > 0 && (
        <div
          className={`${animateClasses.scaleIn} opacity-0 rounded-2xl border border-warning/30 bg-gradient-to-br from-warning/10 to-transparent p-4`}
          style={staggerChild(6)}
        >
          <div className="flex items-start gap-3">
            <CreditCard className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                Payment Required
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                You have {paymentActionRequiredCount} application{paymentActionRequiredCount > 1 ? 's' : ''} that still need payment follow-up.
              </p>
              <Link 
                to={paymentActionHref}
                className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-warning transition-colors duration-200 hover:text-warning/80"
              >
                Complete Payment →
              </Link>
            </div>
            <StatusBadge status="warning" label="Action Needed" />
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardStatusOverview;
