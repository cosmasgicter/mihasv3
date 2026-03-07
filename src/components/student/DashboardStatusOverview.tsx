/**
 * DashboardStatusOverview Component
 * Card-based layout with key metrics and status indicators
 * 
 * @requirements 5.1, 5.3, 5.5, 5.6 - Student Dashboard status display
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  CheckCircle, 
  AlertCircle,
  CreditCard,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { StatusIndicator, StatusBadge } from '@/components/8starlabs';
import { cn } from '@/lib/utils';
import { animateClasses, staggerChild } from '@/lib/animations';
import type { Application } from '@/types/database';
import { requiresStudentPaymentAction } from '@/lib/paymentStatus';

interface DashboardStatusOverviewProps {
  applications: Application[];
  totalDraftCount: number;
  className?: string;
}

// Map application status to 8starlabs status types
const statusMapping: Record<string, 'operational' | 'degraded' | 'down' | 'idle' | 'pending' | 'success' | 'error' | 'warning'> = {
  draft: 'idle',
  submitted: 'pending',
  under_review: 'pending',
  pending_payment: 'warning',
  interview_scheduled: 'operational',
  approved: 'success',
  rejected: 'error',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  pending_payment: 'Pending Payment',
  interview_scheduled: 'Interview Scheduled',
  approved: 'Approved',
  rejected: 'Rejected',
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
      'rounded-xl border border-border/50 p-4 transition-all duration-200',
      'border-l-4',
      accentStyles[accent],
      href && 'hover:shadow-md hover:border-border cursor-pointer',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
            {title}
          </p>
          <p className="text-2xl font-bold text-foreground">
            {value}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">
              {description}
            </p>
          )}
        </div>
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
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
  totalDraftCount,
  className 
}: DashboardStatusOverviewProps) {

  // Calculate metrics
  const submittedApplications = applications.filter(app => app.status !== 'draft');
  const submittedCount = submittedApplications.length;
  const underReviewCount = submittedApplications.filter(app => app.status === 'under_review').length;
  const approvedCount = submittedApplications.filter(app => app.status === 'approved').length;
  const paymentActionRequiredCount = submittedApplications.filter(app =>
    requiresStudentPaymentAction(app.payment_status)
  ).length;

  // The dedicated continue-draft card owns draft recovery. This overview should
  // only summarize submitted applications and payment follow-up.
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
  
  const latestApplicationLink = latestApplication
    ? `/student/application/${latestApplication.id}`
    : '/student/dashboard';

  const metrics = [
    {
      title: 'Submitted Applications',
      value: submittedCount,
      icon: <FileText className="h-5 w-5" />,
      description:
        totalDraftCount > 0
          ? `${totalDraftCount} draft${totalDraftCount > 1 ? 's' : ''} saved separately`
          : submittedCount > 0
            ? 'Live application history'
            : 'No submitted applications yet',
      accent: 'primary' as const,
      href: submittedCount > 0 ? '/student/dashboard' : undefined,
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
      href: paymentActionRequiredCount > 0 ? '/student/payment' : undefined,
    },
    {
      title: 'Under Review',
      value: underReviewCount,
      icon: <AlertCircle className="h-5 w-5" />,
      description: underReviewCount > 0 ? 'Being processed' : 'None pending',
      accent: underReviewCount > 0 ? 'primary' as const : 'neutral' as const,
    },
    {
      title: 'Approved',
      value: approvedCount,
      icon: <CheckCircle className="h-5 w-5" />,
      description: approvedCount > 0 ? 'Congratulations!' : 'Awaiting decision',
      accent: approvedCount > 0 ? 'success' as const : 'neutral' as const,
    },
  ];

  return (
    <div className={cn('space-y-6', className)}>
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

      {/* Current Application Status */}
      {latestApplication && (
        <div className={`${animateClasses.slideUp} opacity-0`} style={staggerChild(4)}>
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Latest Application Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <StatusIndicator 
                    status={statusMapping[latestApplication.status] || 'idle'}
                    label={statusLabels[latestApplication.status] || latestApplication.status}
                    showPulse={latestApplication.status === 'under_review'}
                    size="lg"
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {latestApplication.program || 'Application'}
                  </span>
                  {' · '}
                  <span>#{latestApplication.application_number}</span>
                </div>
                <Link 
                  to={latestApplicationLink}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {latestApplication.status === 'draft' ? 'Continue Application →' : 'View Details →'}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pending Payment Alert */}
      {paymentActionRequiredCount > 0 && (
        <div
          className={`${animateClasses.scaleIn} opacity-0 rounded-xl border border-warning/30 bg-warning/10 p-4`}
          style={staggerChild(5)}
        >
          <div className="flex items-start gap-3">
            <CreditCard className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-foreground">
                Payment Required
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                You have {paymentActionRequiredCount} application{paymentActionRequiredCount > 1 ? 's' : ''} that still need payment follow-up.
                Finish payment or resubmit corrected proof to keep processing moving.
              </p>
              <Link 
                to="/student/payment"
                className="inline-flex items-center gap-1 text-sm font-medium text-warning hover:text-warning/80 mt-2"
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
