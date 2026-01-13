/**
 * Bulk Notification Manager Component
 * Provides admin interface for creating, monitoring, and managing bulk notification jobs
 * 
 * Requirements: 6.4 - Bulk notification management
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { 
  Send, 
  Clock, 
  Users, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Play,
  Pause,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';

interface BulkJob {
  id: string;
  name: string;
  status: 'queued' | 'scheduled' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  total_recipients: number;
  processed_count: number;
  success_count: number;
  failed_count: number;
  progress_percentage: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  created_by_profiles?: { full_name: string };
}

interface BulkJobStatistics {
  total_jobs: number;
  jobs_by_status: Record<string, number>;
  total_recipients: number;
  total_success: number;
  total_failed: number;
  success_rate: number;
}

export function BulkNotificationManager() {
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [statistics, setStatistics] = useState<BulkJobStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  // Form state for creating new bulk job
  const [formData, setFormData] = useState({
    name: '',
    recipients: '',
    template_name: 'application_status_update',
    title: '',
    message: '',
    channels: ['email', 'in_app'],
    priority: 'normal' as const,
    scheduled_for: ''
  });

  useEffect(() => {
    loadJobs();
    loadStatistics();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadJobs();
      loadStatistics();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadJobs = async () => {
    try {
      const response = await fetch('/api/notifications/bulk-manager?action=jobs&limit=20', {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to load jobs');
      
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load bulk notification jobs',
        variant: 'destructive'
      });
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await fetch('/api/notifications/bulk-manager?action=statistics&hours=24', {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to load statistics');
      
      const data = await response.json();
      setStatistics(data.statistics);
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const createBulkJob = async () => {
    if (!formData.name || !formData.recipients || !formData.title || !formData.message) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    setCreating(true);
    try {
      // Parse recipients (assume comma-separated user IDs or emails)
      const recipients = formData.recipients
        .split(',')
        .map(r => r.trim())
        .filter(r => r.length > 0);

      const response = await fetch('/api/notifications/bulk-manager?action=queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          name: formData.name,
          recipients,
          template_name: formData.template_name,
          template_variables: {
            title: formData.title,
            message: formData.message
          },
          channels: formData.channels,
          priority: formData.priority,
          scheduled_for: formData.scheduled_for || undefined
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create bulk job');
      }

      const result = await response.json();
      
      toast({
        title: 'Success',
        description: `Bulk job created with ${result.total_recipients} recipients`
      });

      // Reset form
      setFormData({
        name: '',
        recipients: '',
        template_name: 'application_status_update',
        title: '',
        message: '',
        channels: ['email', 'in_app'],
        priority: 'normal',
        scheduled_for: ''
      });

      // Reload jobs
      loadJobs();
      loadStatistics();
    } catch (error) {
      console.error('Error creating bulk job:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create bulk job',
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/notifications/bulk-manager?action=cancel&job_id=${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (!response.ok) throw new Error('Failed to cancel job');

      toast({
        title: 'Success',
        description: 'Bulk job cancelled successfully'
      });

      loadJobs();
    } catch (error) {
      console.error('Error cancelling job:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel bulk job',
        variant: 'destructive'
      });
    }
  };

  const processQueue = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/notifications/bulk-manager?action=process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({})
      });

      if (!response.ok) throw new Error('Failed to process queue');

      const result = await response.json();
      
      toast({
        title: 'Success',
        description: `Processed ${result.processed_jobs} jobs`
      });

      loadJobs();
    } catch (error) {
      console.error('Error processing queue:', error);
      toast({
        title: 'Error',
        description: 'Failed to process notification queue',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      queued: 'secondary',
      scheduled: 'outline',
      processing: 'default',
      completed: 'success',
      failed: 'destructive',
      cancelled: 'secondary'
    } as const;

    const icons = {
      queued: Clock,
      scheduled: Clock,
      processing: RefreshCw,
      completed: CheckCircle,
      failed: XCircle,
      cancelled: XCircle
    };

    const Icon = icons[status as keyof typeof icons] || AlertCircle;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        <Icon className="w-3 h-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const variants = {
      urgent: 'destructive',
      high: 'default',
      normal: 'secondary',
      low: 'outline'
    } as const;

    return (
      <Badge variant={variants[priority as keyof typeof variants] || 'secondary'}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Bulk Notification Manager</h2>
        <div className="flex gap-2">
          <Button onClick={loadJobs} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={processQueue} disabled={loading} size="sm">
            <Play className="w-4 h-4 mr-2" />
            Process Queue
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Jobs (24h)</p>
                  <p className="text-2xl font-bold">{statistics.total_jobs}</p>
                </div>
                <Send className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Recipients</p>
                  <p className="text-2xl font-bold">{statistics.total_recipients}</p>
                </div>
                <Users className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold">{statistics.success_rate.toFixed(1)}%</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Failed Deliveries</p>
                  <p className="text-2xl font-bold">{statistics.total_failed}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">Active Jobs</TabsTrigger>
          <TabsTrigger value="create">Create New Job</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Notification Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {jobs.length === 0 ? (
                  <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>
                      No bulk notification jobs found.
                    </AlertDescription>
                  </Alert>
                ) : (
                  jobs.map((job) => (
                    <div key={job.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{job.name}</h3>
                          {getStatusBadge(job.status)}
                          {getPriorityBadge(job.priority)}
                        </div>
                        <div className="flex items-center gap-2">
                          {job.status === 'queued' || job.status === 'scheduled' ? (
                            <Button
                              onClick={() => cancelJob(job.id)}
                              variant="outline"
                              size="sm"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Recipients</p>
                          <p className="font-medium">{job.total_recipients}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Processed</p>
                          <p className="font-medium">{job.processed_count}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Success</p>
                          <p className="font-medium text-green-600">{job.success_count}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Failed</p>
                          <p className="font-medium text-red-600">{job.failed_count}</p>
                        </div>
                      </div>

                      {job.status === 'processing' && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Progress</span>
                            <span>{job.progress_percentage}%</span>
                          </div>
                          <Progress value={job.progress_percentage} className="h-2" />
                        </div>
                      )}

                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Created: {new Date(job.created_at).toLocaleString()}</span>
                        {job.created_by_profiles && (
                          <span>By: {job.created_by_profiles.full_name}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Bulk Notification Job</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Job Name *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Application Status Updates - January 2025"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority</label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Recipients *</label>
                <Textarea
                  value={formData.recipients}
                  onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
                  placeholder="Enter user IDs or email addresses, separated by commas"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Enter user IDs or email addresses separated by commas
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notification Title *</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Application Status Update"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Message *</label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Enter the notification message..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Scheduled For (Optional)</label>
                <Input
                  type="datetime-local"
                  value={formData.scheduled_for}
                  onChange={(e) => setFormData({ ...formData, scheduled_for: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to send immediately
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={createBulkJob} disabled={creating}>
                  {creating ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Create Bulk Job
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}