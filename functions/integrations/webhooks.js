/**
 * Webhook Management API
 * Provides CRUD operations for webhook configurations
 */

import { createIntegrationEndpoint, ApiResponse, webhookManager } from '../_lib/integrationFramework.js';
import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export const onRequest = createIntegrationEndpoint({
  requireAuth: true,
  requireAdmin: true,
  auditLogging: true,
  handlers: {
    // GET /integrations/webhooks - List all webhooks
    get: async (context) => {
      const url = new URL(context.request.url);
      const page = parseInt(url.searchParams.get('page')) || 1;
      const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100);
      const offset = (page - 1) * limit;

      const { data: webhooks, error, count } = await supabaseAdminClient
        .from('integration_webhooks')
        .select('*, webhook_deliveries(count)', { count: 'exact' })
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        return ApiResponse.error(error.message).toResponse(500);
      }

      return ApiResponse.success({
        webhooks,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        }
      }).toResponse();
    },

    // POST /integrations/webhooks - Create new webhook
    post: async (context) => {
      const body = await context.request.json();
      const { name, url, events, secret, active = true, metadata = {} } = body;

      // Validation
      if (!name || !url || !events || !Array.isArray(events)) {
        return ApiResponse.error('Name, URL, and events array are required').toResponse(400);
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return ApiResponse.error('Invalid URL format').toResponse(400);
      }

      // Validate events
      const validEvents = [
        'application.created',
        'application.updated',
        'application.submitted',
        'application.approved',
        'application.rejected',
        'payment.verified',
        'payment.rejected',
        'user.registered',
        'document.uploaded',
        'notification.sent'
      ];

      const invalidEvents = events.filter(event => !validEvents.includes(event));
      if (invalidEvents.length > 0) {
        return ApiResponse.error(`Invalid events: ${invalidEvents.join(', ')}`).toResponse(400);
      }

      try {
        const { data: webhook, error } = await supabaseAdminClient
          .from('integration_webhooks')
          .insert({
            name,
            url,
            events,
            secret,
            active,
            metadata,
            created_by: context.auth.user.id
          })
          .select()
          .single();

        if (error) {
          return ApiResponse.error(error.message).toResponse(500);
        }

        return ApiResponse.success(webhook, {
          message: 'Webhook created successfully'
        }).toResponse(201);

      } catch (error) {
        return ApiResponse.error(error.message).toResponse(500);
      }
    },

    // PUT /integrations/webhooks - Update webhook
    put: async (context) => {
      const url = new URL(context.request.url);
      const webhookId = url.searchParams.get('id');
      
      if (!webhookId) {
        return ApiResponse.error('Webhook ID is required').toResponse(400);
      }

      const body = await context.request.json();
      const { name, url: webhookUrl, events, secret, active, metadata } = body;

      // Validate URL if provided
      if (webhookUrl) {
        try {
          new URL(webhookUrl);
        } catch {
          return ApiResponse.error('Invalid URL format').toResponse(400);
        }
      }

      try {
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (webhookUrl !== undefined) updateData.url = webhookUrl;
        if (events !== undefined) updateData.events = events;
        if (secret !== undefined) updateData.secret = secret;
        if (active !== undefined) updateData.active = active;
        if (metadata !== undefined) updateData.metadata = metadata;

        const { data: webhook, error } = await supabaseAdminClient
          .from('integration_webhooks')
          .update(updateData)
          .eq('id', webhookId)
          .select()
          .single();

        if (error) {
          return ApiResponse.error(error.message).toResponse(500);
        }

        if (!webhook) {
          return ApiResponse.error('Webhook not found').toResponse(404);
        }

        return ApiResponse.success(webhook, {
          message: 'Webhook updated successfully'
        }).toResponse();

      } catch (error) {
        return ApiResponse.error(error.message).toResponse(500);
      }
    },

    // DELETE /integrations/webhooks - Delete webhook
    delete: async (context) => {
      const url = new URL(context.request.url);
      const webhookId = url.searchParams.get('id');
      
      if (!webhookId) {
        return ApiResponse.error('Webhook ID is required').toResponse(400);
      }

      try {
        const { error } = await supabaseAdminClient
          .from('integration_webhooks')
          .delete()
          .eq('id', webhookId);

        if (error) {
          return ApiResponse.error(error.message).toResponse(500);
        }

        return ApiResponse.success(null, {
          message: 'Webhook deleted successfully'
        }).toResponse();

      } catch (error) {
        return ApiResponse.error(error.message).toResponse(500);
      }
    }
  }
});