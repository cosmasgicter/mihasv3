/**
 * Webhook Testing API
 * Allows testing webhook endpoints with sample payloads
 */

import { createIntegrationEndpoint, ApiResponse, webhookManager } from '../_lib/integrationFramework.js';
import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export const onRequest = createIntegrationEndpoint({
  requireAuth: true,
  requireAdmin: true,
  auditLogging: true,
  handlers: {
    // POST /integrations/test-webhook - Test a webhook endpoint
    post: async (context) => {
      const body = await context.request.json();
      const { webhookId, event, testPayload } = body;

      if (!webhookId || !event) {
        return ApiResponse.error('Webhook ID and event are required').toResponse(400);
      }

      try {
        // Get webhook configuration
        const { data: webhook, error } = await supabaseAdminClient
          .from('integration_webhooks')
          .select('*')
          .eq('id', webhookId)
          .single();

        if (error || !webhook) {
          return ApiResponse.error('Webhook not found').toResponse(404);
        }

        // Check if webhook supports this event
        if (!webhook.events.includes(event)) {
          return ApiResponse.error(`Webhook does not support event: ${event}`).toResponse(400);
        }

        // Create test payload
        const payload = testPayload || {
          test: true,
          timestamp: new Date().toISOString(),
          event,
          data: {
            message: 'This is a test webhook delivery',
            webhook_id: webhookId
          }
        };

        // Send test webhook
        await webhookManager.sendWebhook(webhook, event, payload);

        // Get the latest delivery result
        const { data: delivery } = await supabaseAdminClient
          .from('webhook_deliveries')
          .select('*')
          .eq('webhook_id', webhookId)
          .order('delivered_at', { ascending: false })
          .limit(1)
          .single();

        return ApiResponse.success({
          webhook,
          delivery,
          testPayload: payload
        }, {
          message: 'Test webhook sent successfully'
        }).toResponse();

      } catch (error) {
        return ApiResponse.error(error.message).toResponse(500);
      }
    }
  }
});