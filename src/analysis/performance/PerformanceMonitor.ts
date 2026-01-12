/**
 * MIHAS Performance Monitor
 * 
 * Comprehensive performance monitoring and metrics collection
 * Requirements: 8.1, 8.2, 8.3
 */

import type { 
  PerformanceMetric, 
  AnalysisResult 
} from '../types';

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor() {
    // Initialize performance monitoring
    this.initializePerformanceObserver();
  }

  /**
   * Start performance monitoring
   * Property 32: Comprehensive System Monitoring
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      console.warn('Performance monitoring is already running');
      return;
    }

    console.log('🚀 Starting performance monitoring...');
    this.isMonitoring = true;

    // Collect metrics at regular intervals
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    // Collect initial metrics
    this.collectMetrics();
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    console.log('⏹️ Stopping performance monitoring...');
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Perform comprehensive performance analysis
   */
  async performPerformanceAnalysis(): Promise<AnalysisResult> {
    const analysisId = crypto.randomUUID();
    const startTime = new Date();

    try {
      console.log('🔍 Starting comprehensive performance analysis...');
      
      // Collect current metrics
      await this.collectMetrics();
      
      // Analyze API performance
      await this.analyzeAPIPerformance();
      
      // Analyze resource usage
      await this.analyzeResourceUsage();
      
      // Check for performance alerts
      const alerts = this.checkPerformanceAlerts();

      const result: AnalysisResult = {
        id: analysisId,
        analysis_type: 'performance',
        status: 'completed',
        started_at: startTime,
        completed_at: new Date(),
        results: {
          metrics: this.metrics,
          alerts: alerts,
          summary: this.generatePerformanceSummary()
        },
        metadata: {
          total_metrics: this.metrics.length,
          alert_count: alerts.length,
          monitoring_active: this.isMonitoring
        }
      };

      console.log(`✅ Performance analysis completed. Collected ${this.metrics.length} metrics, ${alerts.length} alerts.`);
      return result;

    } catch (error) {
      console.error('❌ Performance analysis failed:', error);
      
      return {
        id: analysisId,
        analysis_type: 'performance',
        status: 'failed',
        started_at: startTime,
        completed_at: new Date(),
        results: {},
        error_message: error instanceof Error ? error.message : 'Unknown error',
        metadata: {}
      };
    }
  }

  /**
   * Initialize Performance Observer for Web Vitals
   */
  private initializePerformanceObserver(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      return;
    }

    try {
      // Observe Core Web Vitals
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.processPerformanceEntry(entry);
        }
      });

      // Observe different types of performance entries
      const entryTypes = ['navigation', 'resource', 'measure', 'paint'];
      
      entryTypes.forEach(type => {
        try {
          observer.observe({ entryTypes: [type] });
        } catch (e) {
          // Some entry types might not be supported
          console.debug(`Performance entry type '${type}' not supported`);
        }
      });

    } catch (error) {
      console.warn('Could not initialize Performance Observer:', error);
    }
  }

  /**
   * Process performance entries from Performance Observer
   */
  private processPerformanceEntry(entry: PerformanceEntry): void {
    const timestamp = new Date();

    switch (entry.entryType) {
      case 'navigation':
        const navEntry = entry as PerformanceNavigationTiming;
        this.addMetric({
          metric_name: 'page_load_time',
          metric_type: 'response_time',
          value: navEntry.loadEventEnd - navEntry.navigationStart,
          unit: 'ms',
          timestamp,
          threshold_warning: 3000,
          threshold_critical: 5000
        });

        this.addMetric({
          metric_name: 'dom_content_loaded',
          metric_type: 'response_time',
          value: navEntry.domContentLoadedEventEnd - navEntry.navigationStart,
          unit: 'ms',
          timestamp,
          threshold_warning: 2000,
          threshold_critical: 4000
        });
        break;

      case 'resource':
        const resourceEntry = entry as PerformanceResourceTiming;
        if (resourceEntry.duration > 1000) { // Only track slow resources
          this.addMetric({
            metric_name: 'resource_load_time',
            metric_type: 'response_time',
            value: resourceEntry.duration,
            unit: 'ms',
            timestamp,
            endpoint: resourceEntry.name,
            threshold_warning: 1000,
            threshold_critical: 3000
          });
        }
        break;

      case 'paint':
        this.addMetric({
          metric_name: entry.name.replace('-', '_'),
          metric_type: 'response_time',
          value: entry.startTime,
          unit: 'ms',
          timestamp,
          threshold_warning: entry.name === 'first-contentful-paint' ? 1500 : 2500,
          threshold_critical: entry.name === 'first-contentful-paint' ? 3000 : 4000
        });
        break;
    }
  }

  /**
   * Collect current performance metrics
   */
  private async collectMetrics(): Promise<void> {
    const timestamp = new Date();

    // Memory usage (if available)
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      
      this.addMetric({
        metric_name: 'memory_used',
        metric_type: 'resource_usage',
        value: memory.usedJSHeapSize / 1024 / 1024, // Convert to MB
        unit: 'MB',
        timestamp,
        threshold_warning: 50,
        threshold_critical: 100
      });

      this.addMetric({
        metric_name: 'memory_usage_percent',
        metric_type: 'resource_usage',
        value: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100,
        unit: 'percent',
        timestamp,
        threshold_warning: 80,
        threshold_critical: 95
      });
    }

    // Connection information (if available)
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      this.addMetric({
        metric_name: 'network_downlink',
        metric_type: 'throughput',
        value: connection.downlink,
        unit: 'Mbps',
        timestamp,
        threshold_warning: 1,
        threshold_critical: 0.5
      });

      this.addMetric({
        metric_name: 'network_rtt',
        metric_type: 'response_time',
        value: connection.rtt,
        unit: 'ms',
        timestamp,
        threshold_warning: 200,
        threshold_critical: 500
      });
    }

    // Collect API response times
    await this.collectAPIMetrics();
  }

  /**
   * Collect API performance metrics
   */
  private async collectAPIMetrics(): Promise<void> {
    // Test key API endpoints
    const endpoints = [
      '/api/applications',
      '/api/user-profile',
      '/api/notifications',
      '/api/admin/dashboard'
    ];

    for (const endpoint of endpoints) {
      try {
        const startTime = performance.now();
        
        // Make a lightweight request to test response time
        const response = await fetch(endpoint, {
          method: 'HEAD', // Use HEAD to minimize data transfer
          headers: {
            'Authorization': `Bearer ${this.getAuthToken()}`
          }
        });

        const endTime = performance.now();
        const responseTime = endTime - startTime;

        this.addMetric({
          metric_name: 'api_response_time',
          metric_type: 'response_time',
          value: responseTime,
          unit: 'ms',
          timestamp: new Date(),
          endpoint: endpoint,
          threshold_warning: 500,
          threshold_critical: 2000
        });

        // Track error rates
        if (!response.ok) {
          this.addMetric({
            metric_name: 'api_error_rate',
            metric_type: 'error_rate',
            value: 1,
            unit: 'count',
            timestamp: new Date(),
            endpoint: endpoint,
            threshold_warning: 0.05,
            threshold_critical: 0.1
          });
        }

      } catch (error) {
        // Track failed requests
        this.addMetric({
          metric_name: 'api_error_rate',
          metric_type: 'error_rate',
          value: 1,
          unit: 'count',
          timestamp: new Date(),
          endpoint: endpoint,
          threshold_warning: 0.05,
          threshold_critical: 0.1
        });
      }
    }
  }

  /**
   * Analyze API performance patterns
   */
  private async analyzeAPIPerformance(): Promise<void> {
    const apiMetrics = this.metrics.filter(m => m.endpoint && m.metric_type === 'response_time');
    
    if (apiMetrics.length === 0) return;

    // Group by endpoint
    const endpointGroups = apiMetrics.reduce((groups, metric) => {
      const endpoint = metric.endpoint!;
      if (!groups[endpoint]) {
        groups[endpoint] = [];
      }
      groups[endpoint].push(metric);
      return groups;
    }, {} as Record<string, PerformanceMetric[]>);

    // Analyze each endpoint
    for (const [endpoint, metrics] of Object.entries(endpointGroups)) {
      const values = metrics.map(m => m.value);
      const average = values.reduce((sum, val) => sum + val, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);

      // Add summary metrics
      this.addMetric({
        metric_name: 'api_avg_response_time',
        metric_type: 'response_time',
        value: average,
        unit: 'ms',
        timestamp: new Date(),
        endpoint: endpoint,
        threshold_warning: 500,
        threshold_critical: 1000
      });

      if (max > 2000) {
        this.addMetric({
          metric_name: 'api_slow_response',
          metric_type: 'response_time',
          value: max,
          unit: 'ms',
          timestamp: new Date(),
          endpoint: endpoint,
          threshold_warning: 1000,
          threshold_critical: 2000
        });
      }
    }
  }

  /**
   * Analyze resource usage patterns
   */
  private async analyzeResourceUsage(): Promise<void> {
    const memoryMetrics = this.metrics.filter(m => m.metric_name.includes('memory'));
    
    if (memoryMetrics.length > 0) {
      const latestMemory = memoryMetrics[memoryMetrics.length - 1];
      
      if (latestMemory.value > (latestMemory.threshold_critical || 100)) {
        this.addMetric({
          metric_name: 'memory_critical_usage',
          metric_type: 'resource_usage',
          value: latestMemory.value,
          unit: latestMemory.unit,
          timestamp: new Date(),
          threshold_warning: latestMemory.threshold_warning,
          threshold_critical: latestMemory.threshold_critical
        });
      }
    }
  }

  /**
   * Check for performance alerts
   * Property 33: Automated Performance Alerting
   */
  private checkPerformanceAlerts(): PerformanceMetric[] {
    const alerts: PerformanceMetric[] = [];
    const recentMetrics = this.metrics.filter(
      m => Date.now() - m.timestamp.getTime() < 300000 // Last 5 minutes
    );

    for (const metric of recentMetrics) {
      if (metric.threshold_critical && metric.value > metric.threshold_critical) {
        alerts.push({
          ...metric,
          id: crypto.randomUUID(),
          metric_name: `CRITICAL_${metric.metric_name}`,
          timestamp: new Date()
        });
      } else if (metric.threshold_warning && metric.value > metric.threshold_warning) {
        alerts.push({
          ...metric,
          id: crypto.randomUUID(),
          metric_name: `WARNING_${metric.metric_name}`,
          timestamp: new Date()
        });
      }
    }

    return alerts;
  }

  /**
   * Add a performance metric
   */
  private addMetric(metric: Omit<PerformanceMetric, 'id'>): void {
    this.metrics.push({
      id: crypto.randomUUID(),
      ...metric
    });

    // Keep only recent metrics (last hour)
    const oneHourAgo = Date.now() - 3600000;
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() > oneHourAgo);
  }

  /**
   * Generate performance summary
   */
  private generatePerformanceSummary() {
    const recentMetrics = this.metrics.filter(
      m => Date.now() - m.timestamp.getTime() < 300000 // Last 5 minutes
    );

    const responseTimeMetrics = recentMetrics.filter(m => m.metric_type === 'response_time');
    const errorMetrics = recentMetrics.filter(m => m.metric_type === 'error_rate');
    const resourceMetrics = recentMetrics.filter(m => m.metric_type === 'resource_usage');

    return {
      total_metrics: this.metrics.length,
      recent_metrics: recentMetrics.length,
      average_response_time: responseTimeMetrics.length > 0 
        ? responseTimeMetrics.reduce((sum, m) => sum + m.value, 0) / responseTimeMetrics.length 
        : 0,
      error_count: errorMetrics.length,
      memory_usage: resourceMetrics.find(m => m.metric_name === 'memory_usage_percent')?.value || 0,
      alerts_triggered: this.checkPerformanceAlerts().length,
      monitoring_status: this.isMonitoring ? 'active' : 'inactive'
    };
  }

  /**
   * Get authentication token for API requests
   */
  private getAuthToken(): string {
    // This would get the actual auth token from your auth system
    return localStorage.getItem('supabase.auth.token') || '';
  }

  /**
   * Public getters
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  getRecentMetrics(minutes: number = 5): PerformanceMetric[] {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.metrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }
}