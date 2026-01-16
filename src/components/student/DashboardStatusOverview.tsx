/**
 * DashboardStatusOverview Component
 * Card-based layout with key metrics and status indicators
 * 
 * @requirements 5.1, 5.3, 5.5, 5.6 - Student Dashboard status display
 */

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Calendar,
  CreditCard,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusIndicator, StatusBadge } from '@/components/8starlabs';
import { cn } from '@/lib/utils';
import type { Application } from '@/lib/supabase';

interface DashboardStatusOverviewProps {
  applications: Application[];
  totalDraftCount: number;
  className?: string;
}

type ApplicationStatusType = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'pending_payment' | 'interview_scheduled';

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
  const prefersReducedMotion = useReducedMotion();
  
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
        {prefersReducedMotion ? content : (
          <motion.div
            whileHover={{ y: -2 }}
            transition={{ duration: 0.2 }}
          >
            {content}
          </motion.div>
        )}
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
  const prefersReducedMotion = useReducedMotion();

  // Calculate metrics
  const submittedCount = applications.filter(app => app.status !== 'draft').length;
  const underReviewCount = applications.filter(app => app.status === 'under_review').length;
  const approvedCount = applications.filter(app => app.status === 'approved').length;
  const pendingPaymentCount = applications.filter(app => 
    app.status === 'submitted' && app.payment_status !== 'verified'
  ).length;

  // Get the most recent application for status display
  const latestApplication = applications.length > 0 
    ? applications.reduce((latest, app) => 
        new Date(app.updated_at || app.created_at) > new Date(latest.updated_at || latest.created_at) 
          ? app 
          : latest
      )
    : null;

  const metrics = [
    {
      title: 'Total Applications',
      value: applications.length,
      icon: <FileText className="h-5 w-5" />,
      description: `${submittedCount} submitted`,
      accent: 'primary' as const,
      href: undefined,
    },
    {
      title: 'Drafts in Progress',
      value: totalDraftCount,
      icon: <Clock className="h-5 w-5" />,
      description: totalDraftCount > 0 ? 'Continue where you left off' : 'No drafts',
      accent: totalDraftCount > 0 ? 'warning' as const : 'neutral' as const,
      href: totalDraftCount > 0 ? '/student/application-wizard' : undefined,
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: prefersReducedMotion ? 0 : 0.3 }
    },
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Metrics Grid */}
      <motion.div
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {metrics.map((metric, index) => (
          <motion.div key={metric.title} variants={itemVariants}>
            <MetricCard {...metric} />
          </motion.div>
        ))}
      </motion.div>

      {/* Current Application Status */}
      {latestApplication && (
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 20 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
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
                  to={`/student/application/${latestApplication.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View Details →
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Pending Payment Alert */}
      {pendingPaymentCount > 0 && (
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.95 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="rounded-xl border border-warning/30 bg-warning/10 p-4"
        >
          <div className="flex items-start gap-3">
            <CreditCard className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-foreground">
                Payment Required
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                You have {pendingPaymentCount} application{pendingPaymentCount > 1 ? 's' : ''} awaiting payment. 
                Complete payment to proceed with your application.
              </p>
            </div>
            <StatusBadge status="warning" label="Action Needed" />
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default DashboardStatusOverview;
