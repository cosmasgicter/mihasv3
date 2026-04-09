/**
 * ApplicationTimeline Component
 * Displays application history using 8starlabs Timeline component
 * 
 * @requirements 5.2, 5.4 - Application timeline with status-based coloring
 */

import React from 'react';
import { Timeline, TimelineItem } from '@/components/8starlabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { History, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { animateClasses } from '@/lib/animations';
import type { Application } from '@/types/database';
import { isPaymentVerified, normalizePaymentStatus } from '@/lib/paymentStatus';

interface ApplicationTimelineProps {
  applications: Application[];
  className?: string;
}

type TimelineStatus = 'completed' | 'current' | 'pending' | 'error';

// Map application status to timeline status
function mapApplicationStatusToTimelineStatus(status: string): TimelineStatus {
  switch (status) {
    case 'approved':
      return 'completed';
    case 'rejected':
      return 'error';
    case 'under_review':
      return 'current';
    case 'submitted':
      return 'pending';
    case 'draft':
    default:
      return 'pending';
  }
}

// Get human-readable status description
function getStatusDescription(status: string, paymentStatus?: string): string {
  const normalizedPaymentStatus = normalizePaymentStatus(paymentStatus)

  switch (status) {
    case 'draft':
      return 'Application started but not yet submitted';
    case 'submitted':
      return normalizedPaymentStatus === 'verified' 
        ? 'Application submitted and payment verified' 
        : normalizedPaymentStatus === 'pending_review'
          ? 'Application submitted and payment proof is under review'
          : 'Application submitted, awaiting payment verification';
    case 'under_review':
      return 'Your application is being reviewed by our team';
    case 'approved':
      return 'Congratulations! Your application has been approved';
    case 'rejected':
      return 'Unfortunately, your application was not successful';
    default:
      return 'Application status update';
  }
}

// Get formatted status title
function getStatusTitle(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft Created';
    case 'submitted':
      return 'Application Submitted';
    case 'under_review':
      return 'Under Review';
    case 'approved':
      return 'Application Approved';
    case 'rejected':
      return 'Application Rejected';
    default:
      return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

export function ApplicationTimeline({ applications, className }: ApplicationTimelineProps) {

  // Sort applications by date (most recent first) and take the latest one
  const sortedApplications = [...applications].sort((a, b) => {
    const dateA = new Date(a.updated_at || a.created_at || 0);
    const dateB = new Date(b.updated_at || b.created_at || 0);
    return dateB.getTime() - dateA.getTime();
  });

  const latestApplication = sortedApplications[0];

  if (!latestApplication) {
    return (
      <Card className={cn('border-border/50', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Application Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              No application history yet. Start your first application to see your progress here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Build timeline events from the latest application
  const timelineEvents = buildTimelineEvents(latestApplication);

  return (
    <div className={animateClasses.slideUp}>
      <Card className={cn('border-border/50', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Application Timeline
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Track your application progress
          </p>
        </CardHeader>
        <CardContent>
          <Timeline 
            events={timelineEvents}
            orientation="vertical"
            showConnector={true}
            animate={true}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Build timeline events from application data
function buildTimelineEvents(application: Application) {
  const events: Array<{
    id: string | number;
    date: Date | string;
    title: string;
    description?: string;
    status?: TimelineStatus;
  }> = [];

  // Application created event
  if (application.created_at) {
    events.push({
      id: 'created',
      date: application.created_at,
      title: 'Application Started',
      description: `Started application for ${application.program || 'program'}`,
      status: 'completed',
    });
  }

  // Submitted event
  if (application.submitted_at && application.status !== 'draft') {
    events.push({
      id: 'submitted',
      date: application.submitted_at,
      title: 'Application Submitted',
      description: 'Your application has been submitted for review',
      status: 'completed',
    });
  }

  // Payment event - using payment_verified_at and payment_status
  const normalizedPaymentStatus = normalizePaymentStatus(application.payment_status)

  if (isPaymentVerified(application.payment_status) && application.payment_verified_at) {
    events.push({
      id: 'payment',
      date: application.payment_verified_at,
      title: 'Payment Verified',
      description: 'Application fee has been verified',
      status: 'completed',
    });
  } else if (application.status === 'submitted' && normalizedPaymentStatus === 'pending_review') {
    events.push({
      id: 'payment_pending',
      date: new Date().toISOString(),
      title: 'Payment Proof Under Review',
      description: 'Your submitted payment proof is awaiting review',
      status: 'pending',
    });
  } else if (normalizedPaymentStatus === 'rejected') {
    events.push({
      id: 'payment_rejected',
      date: new Date().toISOString(),
      title: 'Payment Rejected',
      description: 'Please resubmit your payment proof',
      status: 'error',
    });
  }

  // Review event
  if (application.status === 'under_review') {
    events.push({
      id: 'review',
      date: application.review_started_at || application.updated_at || new Date().toISOString(),
      title: 'Under Review',
      description: 'Your application is being reviewed by our admissions team',
      status: 'current',
    });
  }

  // Decision event
  if (application.status === 'approved') {
    events.push({
      id: 'approved',
      date: application.decision_date || application.updated_at || new Date().toISOString(),
      title: 'Application Approved',
      description: 'Congratulations! Your application has been approved',
      status: 'completed',
    });
  } else if (application.status === 'rejected') {
    events.push({
      id: 'rejected',
      date: application.decision_date || application.updated_at || new Date().toISOString(),
      title: 'Application Not Successful',
      description: application.decision_reason || 'Unfortunately, your application was not successful this time',
      status: 'error',
    });
  }

  // If still in draft, show pending steps
  if (application.status === 'draft') {
    events.push({
      id: 'submit_pending',
      date: new Date().toISOString(),
      title: 'Submit Application',
      description: 'Complete and submit your application',
      status: 'pending',
    });
  }

  // Sort events by date
  return events.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateA.getTime() - dateB.getTime();
  });
}

export default ApplicationTimeline;
