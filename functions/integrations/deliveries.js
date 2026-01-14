/**
 * Webhook Deliveries API
 * Provides access to webhook delivery logs and statistics
 */

import { createIntegrationEndpoint, ApiResponse } from '../_lib/integrationFramework.js';
import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export const onRequest = createIntegrationEndpoint({
  requireAuth: true,
  requireAdmin: true,
  auditLogging: true,
  handlers: {
    // GET /integrations/deliveries - List webhook deliveries
    get: async (context) => {
      const url = new URL(context.request.url);
      const webhookId = url.searchParams.get('webhook_id');
      const event = url.searchParams.get('event');
      const success = url.searchParams.get('success');
      const page = parseInt(url.searchParams.get('page')) || 1;
      const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100);
      const offset = (page - 1) * limit;

      try {
        let query = supabaseAdminClient
          .from('webhook_deliveries')
          .select(`
            *,
            integration_webhooks(name, url)
          `, { count: 'exact' });

        // Apply filters
        if (webhookId) {
          query = query.eq('webhook_id', webhookId);
        }
        if (event) {
          query = query.eq('event', event);
        }
        if (success !== null && success !== undefined) {
          query = query.eq('success', success === 'true');
        }

        const { data: deliveries, error, count } = await query
          .range(offset, offset + limit - 1)
          .order('delivered_at', { ascending: false });

        if (error) {
          return ApiResponse.error(error.message).toResponse(500);
        }

        // Get delivery statistics
        const { data: stats } = await supabaseAdminClient
          .from('webhook_deliveries')
          .select('success, event')
          .eq('webhook_id', webhookId || 'all');

        const statistics = {
          total: count,
          successful: stats?.filter(s => s.success).length || 0,
          failed: stats?.filter(s => !s.success).length || 0,
          byEvent: {}
        };

        // Group by event
        if (stats) {
          stats.forEach(stat => {
            if (!statistics.byEvent[stat.event]) {
              statistics.byEvent[stat.event] = { total: 0, successful: 0, failed: 0 };
            }
            statistics.byEvent[stat.event].total++;
            if (stat.success) {
              statistics.byEvent[stat.event].successful++;
            } else {
              statistics.byEvent[stat.event].failed++;
            }
          });
        }

        return ApiResponse.success({
          deliveries,
          statistics,
          pagination: {
            page,
            limit,
            total: count,
            pages: Math.ceil(count / limit)
          }
        }).toResponse();

      } catch (error) {
        return ApiResponse.error(error.message).toResponse(500);
      }
    }
  }
});