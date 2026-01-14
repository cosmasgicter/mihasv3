/**
 * Standardized Integration Framework for MIHAS System
 * Provides consistent API patterns, webhook support, and integration management
 */

import { supabaseAdminClient } from './supabaseClient.js';
import { AuditLogger } from './auditLogger.js';
import { addCorsHeaders } from './cors.js';
import { createErrorResponse } from './errorHandler.js';

/**
 * Standard API Response Format
 */
export class ApiResponse {
  constructor(success = true, data = null, error = null, meta = {}) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.meta = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      ...meta
    };
  }

  static success(data, meta = {}) {
    return new ApiResponse(true, data, null, meta);
  }

  static error(error, meta = {}) {
    return new ApiResponse(false, null, error, meta);
  }

  toResponse(status = 200, headers = {}) {
    return new Response(JSON.stringify(this), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...addCorsHeaders(),
        ...headers
      }
    });
  }
}

/**
 * Integration API Base Class
 * Provides standardized patterns for all integration endpoints
 */
export class IntegrationApi {
  constructor(config = {}) {
    this.config = {
      requireAuth: true,
      requireAdmin: false,
      rateLimiting: true,
      auditLogging: true,
      ...config
    };
    this.auditLogger = new AuditLogger(supabaseAdminClient);
  }

  /**
   * Handle incoming requests with standardized processing
   */
  async handleRequest(context, handlers = {}) {
    const { request } = context;
    const method = request.method;

    try {
      // Handle CORS preflight
      if (method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: addCorsHeaders()
        });
      }

      // Authentication check
      if (this.config.requireAuth) {
        const authResult = await this.authenticate(request);
        if (!authResult.success) {
          return ApiResponse.error(authResult.error).toResponse(authResult.status);
        }
        context.auth = authResult;
      }

      // Rate limiting
      if (this.config.rateLimiting) {
        const rateLimitResult = await this.checkRateLimit(request, context);
        if (!rateLimitResult.allowed) {
          return ApiResponse.error('Rate limit exceeded', {
            retryAfter: rateLimitResult.retryAfter
          }).toResponse(429, {
            'Retry-After': rateLimitResult.retryAfter.toString()
          });
        }
      }

      // Route to appropriate handler
      const handler = handlers[method.toLowerCase()];
      if (!handler) {
        return ApiResponse.error('Method not allowed').toResponse(405);
      }

      const result = await handler(context);

      // Audit logging
      if (this.config.auditLogging && context.auth?.user) {
        await this.auditLogger.logApiAccess(
          context.auth.user.id,
          method,
          request.url,
          result.success ? 'success' : 'error',
          request
        );
      }

      return result;

    } catch (error) {
      console.error('Integration API error:', error);
      
      // Audit log error
      if (this.config.auditLogging && context.auth?.user) {
        await this.auditLogger.logApiAccess(
          context.auth.user.id,
          method,
          request.url,
          'error',
          request,
          { error: error.message }
        );
      }

      const { status, body } = createErrorResponse(error);
      return ApiResponse.error(body.error).toResponse(status);
    }
  }

  /**
   * Authenticate request
   */
  async authenticate(request) {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader) {
        return { success: false, error: 'Authorization header required', status: 401 };
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabaseAdminClient.auth.getUser(token);

      if (error || !user) {
        return { success: false, error: 'Invalid or expired token', status: 401 };
      }

      // Get user profile
      const { data: profile } = await supabaseAdminClient
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single();

      if (!profile?.is_active) {
        return { success: false, error: 'Account is inactive', status: 403 };
      }

      // Check admin requirement
      if (this.config.requireAdmin && !['admin', 'super_admin'].includes(profile.role)) {
        return { success: false, error: 'Admin access required', status: 403 };
      }

      return {
        success: true,
        user,
        profile,
        isAdmin: ['admin', 'super_admin'].includes(profile.role)
      };

    } catch (error) {
      return { success: false, error: 'Authentication failed', status: 500 };
    }
  }

  /**
   * Check rate limiting
   */
  async checkRateLimit(request, context) {
    // Simple in-memory rate limiting (in production, use Redis or similar)
    const userId = context.auth?.user?.id || 'anonymous';
    const key = `${userId}:${new URL(request.url).pathname}`;
    
    // Default: 100 requests per minute
    const limit = this.config.rateLimit || { requests: 100, window: 60000 };
    
    // This is a simplified implementation
    // In production, implement proper distributed rate limiting
    return { allowed: true };
  }
}

/**
 * Webhook Management System
 */
export class WebhookManager {
  constructor() {
    this.supabase = supabaseAdminClient;
  }

  /**
   * Register a webhook endpoint
   */
  async registerWebhook(config) {
    const { url, events, secret, active = true, metadata = {} } = config;

    if (!url || !events || !Array.isArray(events)) {
      throw new Error('URL and events array are required');
    }

    const { data, error } = await this.supabase
      .from('integration_webhooks')
      .insert({
        url,
        events,
        secret,
        active,
        metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Trigger webhook for specific event
   */
  async triggerWebhook(event, payload) {
    try {
      // Get active webhooks for this event
      const { data: webhooks } = await this.supabase
        .from('integration_webhooks')
        .select('*')
        .eq('active', true)
        .contains('events', [event]);

      if (!webhooks?.length) return;

      // Send webhooks in parallel
      const promises = webhooks.map(webhook => this.sendWebhook(webhook, event, payload));
      await Promise.allSettled(promises);

    } catch (error) {
      console.error('Webhook trigger error:', error);
    }
  }

  /**
   * Send individual webhook
   */
  async sendWebhook(webhook, event, payload) {
    try {
      const webhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        data: payload,
        webhook_id: webhook.id
      };

      // Create signature if secret is provided
      let headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'MIHAS-Webhook/1.0'
      };

      if (webhook.secret) {
        const crypto = await import('crypto');
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(JSON.stringify(webhookPayload))
          .digest('hex');
        headers['X-MIHAS-Signature'] = `sha256=${signature}`;
      }

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(webhookPayload),
        timeout: 30000
      });

      // Log webhook delivery
      await this.supabase
        .from('webhook_deliveries')
        .insert({
          webhook_id: webhook.id,
          event,
          payload: webhookPayload,
          response_status: response.status,
          response_headers: Object.fromEntries(response.headers.entries()),
          delivered_at: new Date().toISOString(),
          success: response.ok
        });

      if (!response.ok) {
        console.error(`Webhook delivery failed: ${webhook.url} - ${response.status}`);
      }

    } catch (error) {
      console.error('Webhook send error:', error);
      
      // Log failed delivery
      await this.supabase
        .from('webhook_deliveries')
        .insert({
          webhook_id: webhook.id,
          event,
          payload: { event, data: payload },
          error_message: error.message,
          delivered_at: new Date().toISOString(),
          success: false
        });
    }
  }

  /**
   * Validate webhook signature
   */
  validateSignature(payload, signature, secret) {
    if (!signature || !secret) return false;

    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      
      return signature === `sha256=${expectedSignature}`;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Integration Registry
 * Manages available integrations and their configurations
 */
export class IntegrationRegistry {
  constructor() {
    this.supabase = supabaseAdminClient;
    this.integrations = new Map();
  }

  /**
   * Register an integration
   */
  registerIntegration(name, config) {
    this.integrations.set(name, {
      name,
      version: config.version || '1.0',
      endpoints: config.endpoints || [],
      webhooks: config.webhooks || [],
      authentication: config.authentication || 'bearer',
      rateLimit: config.rateLimit || { requests: 100, window: 60000 },
      ...config
    });
  }

  /**
   * Get integration configuration
   */
  getIntegration(name) {
    return this.integrations.get(name);
  }

  /**
   * List all registered integrations
   */
  listIntegrations() {
    return Array.from(this.integrations.values());
  }

  /**
   * Create integration API documentation
   */
  generateDocumentation(name) {
    const integration = this.getIntegration(name);
    if (!integration) return null;

    return {
      name: integration.name,
      version: integration.version,
      description: integration.description,
      authentication: integration.authentication,
      baseUrl: integration.baseUrl,
      endpoints: integration.endpoints.map(endpoint => ({
        path: endpoint.path,
        method: endpoint.method,
        description: endpoint.description,
        parameters: endpoint.parameters || [],
        responses: endpoint.responses || {}
      })),
      webhooks: integration.webhooks.map(webhook => ({
        event: webhook.event,
        description: webhook.description,
        payload: webhook.payload || {}
      })),
      examples: integration.examples || []
    };
  }
}

// Global instances
export const webhookManager = new WebhookManager();
export const integrationRegistry = new IntegrationRegistry();

/**
 * Helper function to create standardized integration endpoints
 */
export function createIntegrationEndpoint(config) {
  const api = new IntegrationApi(config);
  
  return async (context) => {
    return api.handleRequest(context, config.handlers);
  };
}

/**
 * Middleware for webhook validation
 */
export function webhookValidationMiddleware(secret) {
  return async (request, next) => {
    const signature = request.headers.get('X-MIHAS-Signature');
    const body = await request.text();
    
    if (!webhookManager.validateSignature(body, signature, secret)) {
      return ApiResponse.error('Invalid webhook signature').toResponse(401);
    }
    
    // Restore body for next handler
    request.body = body;
    return next();
  };
}