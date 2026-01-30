/**
 * API Performance Profiler
 * 
 * Measures response times and resource usage for each endpoint,
 * identifies slow endpoints and resource-intensive operations,
 * and generates performance optimization recommendations.
 * 
 * Requirements: 4.2
 */

import { APIEndpoint } from './api-cataloger';

export interface PerformanceMetrics {
  endpointId: string;
  url: string;
  method: string;
  responseTime: number;
  statusCode: number;
  contentLength: number;
  memoryUsage?: number;
  cpuUsage?: number;
  timestamp: Date;
  userAgent?: string;
  region?: string;
}

export interface PerformanceProfile {
  endpointId: string;
  averageResponseTime: number;
  medianResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  totalRequests: number;
  errorRate: number;
  throughput: number; // requests per second
  averageContentLength: number;
  lastProfiled: Date;
  recommendations: string[];
}

export interface PerformanceReport {
  profiles: PerformanceProfile[];
  slowestEndpoints: PerformanceProfile[];
  fastestEndpoints: PerformanceProfile[];
  highErrorRateEndpoints: PerformanceProfile[];
  resourceIntensiveEndpoints: PerformanceProfile[];
  overallStats: {
    totalEndpoints: number;
    averageResponseTime: number;
    totalRequests: number;
    overallErrorRate: number;
  };
  generatedAt: Date;
}

export class APIPerformanceProfiler {
  private metrics: PerformanceMetrics[] = [];
  private profiles: Map<string, PerformanceProfile> = new Map();
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Profile all endpoints by making test requests
   */
  async profileAllEndpoints(endpoints: APIEndpoint[], options: {
    requestsPerEndpoint?: number;
    timeout?: number;
    includeAuth?: boolean;
    authToken?: string;
  } = {}): Promise<PerformanceReport> {
    const {
      requestsPerEndpoint = 5,
      timeout = 30000,
      includeAuth = false,
      authToken
    } = options;

    console.log(`Starting performance profiling for ${endpoints.length} endpoints...`);

    for (const endpoint of endpoints) {
      try {
        await this.profileEndpoint(endpoint, {
          requestCount: requestsPerEndpoint,
          timeout,
          includeAuth,
          authToken
        });
      } catch (error) {
        console.warn(`Failed to profile endpoint ${endpoint.id}:`, error);
      }
    }

    return this.generateReport();
  }

  /**
   * Profile a single endpoint with multiple requests
   */
  async profileEndpoint(endpoint: APIEndpoint, options: {
    requestCount?: number;
    timeout?: number;
    includeAuth?: boolean;
    authToken?: string;
  } = {}): Promise<PerformanceProfile> {
    const {
      requestCount = 5,
      timeout = 30000,
      includeAuth = false,
      authToken
    } = options;

    const endpointMetrics: PerformanceMetrics[] = [];
    const url = this.buildEndpointUrl(endpoint);

    console.log(`Profiling endpoint: ${endpoint.id} (${url})`);

    for (let i = 0; i < requestCount; i++) {
      try {
        const metric = await this.measureRequest(url, endpoint, {
          timeout,
          includeAuth,
          authToken
        });
        endpointMetrics.push(metric);
        this.metrics.push(metric);

        // Small delay between requests to avoid overwhelming the server
        await this.delay(100);
      } catch (error) {
        console.warn(`Request ${i + 1} failed for ${endpoint.id}:`, error);
        
        // Record failed request
        const failedMetric: PerformanceMetrics = {
          endpointId: endpoint.id,
          url,
          method: endpoint.method[0] || 'GET',
          responseTime: timeout,
          statusCode: 0,
          contentLength: 0,
          timestamp: new Date()
        };
        endpointMetrics.push(failedMetric);
        this.metrics.push(failedMetric);
      }
    }

    const profile = this.calculateProfile(endpoint.id, endpointMetrics);
    this.profiles.set(endpoint.id, profile);

    return profile;
  }

  /**
   * Measure a single request performance
   */
  private async measureRequest(url: string, endpoint: APIEndpoint, options: {
    timeout?: number;
    includeAuth?: boolean;
    authToken?: string;
  }): Promise<PerformanceMetrics> {
    const startTime = performance.now();
    const method = endpoint.method[0] || 'GET';
    
    const headers: Record<string, string> = {
      'User-Agent': 'MIHAS-Performance-Profiler/1.0',
      'Accept': 'application/json'
    };

    if (options.includeAuth && options.authToken) {
      headers['Authorization'] = `Bearer ${options.authToken}`;
    }

    // Add test parameters for endpoints that require them
    const testUrl = this.addTestParameters(url, endpoint);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

    try {
      const response = await fetch(testUrl, {
        method,
        headers,
        signal: controller.signal,
        body: method !== 'GET' && method !== 'HEAD' ? JSON.stringify(this.getTestPayload(endpoint)) : undefined
      });

      clearTimeout(timeoutId);
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

      return {
        endpointId: endpoint.id,
        url: testUrl,
        method,
        responseTime,
        statusCode: response.status,
        contentLength,
        timestamp: new Date()
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const endTime = performance.now();
      
      throw new Error(`Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add test parameters to URL for endpoints that require them
   */
  private addTestParameters(url: string, endpoint: APIEndpoint): string {
    const urlObj = new URL(url);
    
    // Add common test parameters based on endpoint type
    if (endpoint.category === 'applications') {
      urlObj.searchParams.set('test', 'true');
      urlObj.searchParams.set('limit', '1');
    }
    
    if (endpoint.category === 'admin') {
      urlObj.searchParams.set('page', '1');
      urlObj.searchParams.set('limit', '10');
    }

    if (endpoint.parameters.includes('id')) {
      urlObj.searchParams.set('id', 'test-id');
    }

    return urlObj.toString();
  }

  /**
   * Get test payload for POST/PUT requests
   */
  private getTestPayload(endpoint: APIEndpoint): object {
    const basePayload = { test: true };
    
    if (endpoint.category === 'applications') {
      return {
        ...basePayload,
        name: 'Test Application',
        program: 'test-program'
      };
    }
    
    if (endpoint.category === 'notifications') {
      return {
        ...basePayload,
        message: 'Test notification',
        recipient: 'test@example.com'
      };
    }

    return basePayload;
  }

  /**
   * Calculate performance profile from metrics
   */
  private calculateProfile(endpointId: string, metrics: PerformanceMetrics[]): PerformanceProfile {
    if (metrics.length === 0) {
      throw new Error(`No metrics available for endpoint ${endpointId}`);
    }

    const responseTimes = metrics.map(m => m.responseTime).sort((a, b) => a - b);
    const successfulRequests = metrics.filter(m => m.statusCode >= 200 && m.statusCode < 400);
    const errorCount = metrics.length - successfulRequests.length;

    const profile: PerformanceProfile = {
      endpointId,
      averageResponseTime: this.calculateAverage(responseTimes),
      medianResponseTime: this.calculatePercentile(responseTimes, 50),
      p95ResponseTime: this.calculatePercentile(responseTimes, 95),
      p99ResponseTime: this.calculatePercentile(responseTimes, 99),
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      totalRequests: metrics.length,
      errorRate: (errorCount / metrics.length) * 100,
      throughput: this.calculateThroughput(metrics),
      averageContentLength: this.calculateAverage(metrics.map(m => m.contentLength)),
      lastProfiled: new Date(),
      recommendations: []
    };

    profile.recommendations = this.generateRecommendations(profile);

    return profile;
  }

  /**
   * Calculate average of an array of numbers
   */
  private calculateAverage(numbers: number[]): number {
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  /**
   * Calculate percentile of an array of numbers
   */
  private calculatePercentile(sortedNumbers: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedNumbers.length) - 1;
    return sortedNumbers[Math.max(0, index)];
  }

  /**
   * Calculate throughput (requests per second)
   */
  private calculateThroughput(metrics: PerformanceMetrics[]): number {
    if (metrics.length < 2) return 0;
    
    const timestamps = metrics.map(m => m.timestamp.getTime()).sort();
    const duration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000; // seconds
    
    return duration > 0 ? metrics.length / duration : 0;
  }

  /**
   * Generate performance optimization recommendations
   */
  private generateRecommendations(profile: PerformanceProfile): string[] {
    const recommendations: string[] = [];

    // Response time recommendations
    if (profile.averageResponseTime > 2000) {
      recommendations.push('CRITICAL: Average response time exceeds 2 seconds. Consider caching, database optimization, or code profiling.');
    } else if (profile.averageResponseTime > 1000) {
      recommendations.push('WARNING: Average response time exceeds 1 second. Review database queries and external API calls.');
    }

    // P95 response time
    if (profile.p95ResponseTime > 5000) {
      recommendations.push('CRITICAL: 95th percentile response time exceeds 5 seconds. Investigate worst-case scenarios.');
    }

    // Error rate recommendations
    if (profile.errorRate > 10) {
      recommendations.push('CRITICAL: Error rate exceeds 10%. Review error handling and input validation.');
    } else if (profile.errorRate > 5) {
      recommendations.push('WARNING: Error rate exceeds 5%. Monitor for potential issues.');
    }

    // Throughput recommendations
    if (profile.throughput < 1) {
      recommendations.push('INFO: Low throughput detected. Consider load testing under realistic conditions.');
    }

    // Content size recommendations
    if (profile.averageContentLength > 1024 * 1024) { // 1MB
      recommendations.push('WARNING: Large response size detected. Consider pagination or response compression.');
    }

    // Variability recommendations
    const variability = profile.maxResponseTime - profile.minResponseTime;
    if (variability > profile.averageResponseTime * 2) {
      recommendations.push('WARNING: High response time variability. Investigate inconsistent performance patterns.');
    }

    return recommendations;
  }

  /**
   * Build endpoint URL for testing
   */
  private buildEndpointUrl(endpoint: APIEndpoint): string {
    if (this.baseUrl) {
      return `${this.baseUrl}/${endpoint.path.replace(/\.(js|ts)$/, '')}`;
    }
    
    // Default to localhost for testing
    return `http://localhost:5173/api/${endpoint.path.replace(/\.(js|ts)$/, '')}`;
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport(): PerformanceReport {
    const profiles = Array.from(this.profiles.values());
    
    // Sort profiles for different categories
    const slowestEndpoints = [...profiles]
      .sort((a, b) => b.averageResponseTime - a.averageResponseTime)
      .slice(0, 10);

    const fastestEndpoints = [...profiles]
      .sort((a, b) => a.averageResponseTime - b.averageResponseTime)
      .slice(0, 10);

    const highErrorRateEndpoints = profiles
      .filter(p => p.errorRate > 0)
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 10);

    const resourceIntensiveEndpoints = [...profiles]
      .sort((a, b) => b.averageContentLength - a.averageContentLength)
      .slice(0, 10);

    // Calculate overall statistics
    const totalRequests = profiles.reduce((sum, p) => sum + p.totalRequests, 0);
    const totalErrors = profiles.reduce((sum, p) => sum + (p.totalRequests * p.errorRate / 100), 0);
    const averageResponseTime = profiles.length > 0 
      ? profiles.reduce((sum, p) => sum + p.averageResponseTime, 0) / profiles.length 
      : 0;

    return {
      profiles,
      slowestEndpoints,
      fastestEndpoints,
      highErrorRateEndpoints,
      resourceIntensiveEndpoints,
      overallStats: {
        totalEndpoints: profiles.length,
        averageResponseTime,
        totalRequests,
        overallErrorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0
      },
      generatedAt: new Date()
    };
  }

  /**
   * Export performance report to JSON
   */
  async exportReport(outputPath: string): Promise<void> {
    const report = this.generateReport();
    const fs = await import('fs/promises');
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    console.log(`Performance report exported to ${outputPath}`);
  }

  /**
   * Get performance summary for a specific endpoint
   */
  getEndpointSummary(endpointId: string): PerformanceProfile | null {
    return this.profiles.get(endpointId) || null;
  }

  /**
   * Clear all metrics and profiles
   */
  clearData(): void {
    this.metrics = [];
    this.profiles.clear();
  }

  /**
   * Utility method to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}