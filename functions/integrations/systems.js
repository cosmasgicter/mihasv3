/**
 * External Systems Management API
 * Manages secure connections to third-party systems
 */

import { createIntegrationEndpoint, ApiResponse } from '../_lib/integrationFramework.js';
import { 
  authenticationManager, 
  encryptionManager, 
  integrationAuditTrail 
} from '../_lib/secureIntegration.js';
import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export const onRequest = createIntegrationEndpoint({
  requireAuth: true,
  requireAdmin: true,
  auditLogging: true,
  handlers: {
    // GET /integrations/systems - List external systems
    get: async (context) => {
      const url = new URL(context.request.url);
      const systemId = url.searchParams.get('id');

      try {
        if (systemId) {
          // Get specific system
          const { data: system, error } = await supabaseAdminClient
            .from('external_systems')
            .select('id, name, type, base_url, authentication_type, configuration, active, last_sync_at, created_at, updated_at')
            .eq('id', systemId)
            .single();

          if (error || !system) {
            return ApiResponse.error('System not found').toResponse(404);
          }

          return ApiResponse.success(system).toResponse();
        } else {
          // List all systems
          const { data: systems, error } = await supabaseAdminClient
            .from('external_systems')
            .select('id, name, type, base_url, authentication_type, configuration, active, last_sync_at, created_at, updated_at')
            .order('name');

          if (error) {
            return ApiResponse.error(error.message).toResponse(500);
          }

          return ApiResponse.success({ systems }).toResponse();
        }

      } catch (error) {
        return ApiResponse.error(error.message).toResponse(500);
      }
    },

    // POST /integrations/systems - Register new external system
    post: async (context) => {
      const body = await context.request.json();
      const {
        name,
        type,
        base_url,
        authentication_type = 'bearer',
        credentials = {},
        configuration = {},
        active = true
      } = body;

      // Validation
      if (!name || !type || !base_url) {
        return ApiResponse.error('Name, type, and base_url are required').toResponse(400);
      }

      const validAuthTypes = ['bearer', 'api_key', 'oauth2', 'basic'];
      if (!validAuthTypes.includes(authentication_type)) {
        return ApiResponse.error(`Invalid authentication type. Must be one of: ${validAuthTypes.join(', ')}`).toResponse(400);
      }

      try {
        // Validate URL
        new URL(base_url);

        // Encrypt sensitive credentials
        const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
        if (!encryptionKey) {
          return ApiResponse.error('Integration encryption not configured').toResponse(500);
        }

        const encryptedCredentials = encryptionManager.encrypt(credentials, encryptionKey);

        const { data: system, error } = await supabaseAdminClient
          .from('external_systems')
          .insert({
            name,
            type,
            base_url,
            authentication_type,
            credentials: encryptedCredentials,
            configuration,
            active,
            created_by: context.auth.user.id
          })
          .select('id, name, type, base_url, authentication_type, configuration, active, created_at')
          .single();

        if (error) {
          return ApiResponse.error(error.message).toResponse(500);
        }

        // Log system registration
        await integrationAuditTrail.logActivity({
          integration_name: name,
          action: 'system_registered',
          user_id: context.auth.user.id,
          ip_address: context.request.headers.get('CF-Connecting-IP'),
          user_agent: context.request.headers.get('User-Agent'),
          request_method: 'POST',
          request_url: context.request.url,
          metadata: { system_id: system.id, type, authentication_type }
        });

        return ApiResponse.success(system, {
          message: 'External system registered successfully'
        }).toResponse(201);

      } catch (error) {
        if (error.message.includes('Invalid URL')) {
          return ApiResponse.error('Invalid base_url format').toResponse(400);
        }
        return ApiResponse.error(error.message).toResponse(500);
      }
    },

    // PUT /integrations/systems/{id} - Update external system
    put: async (context) => {
      const url = new URL(context.request.url);
      const systemId = url.pathname.split('/').pop();
      
      if (!systemId) {
        return ApiResponse.error('System ID is required').toResponse(400);
      }

      const body = await context.request.json();
      const {
        name,
        type,
        base_url,
        authentication_type,
        credentials,
        configuration,
        active
      } = body;

      try {
        // Get existing system
        const { data: existingSystem, error: fetchError } = await supabaseAdminClient
          .from('external_systems')
          .select('*')
          .eq('id', systemId)
          .single();

        if (fetchError || !existingSystem) {
          return ApiResponse.error('System not found').toResponse(404);
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (type !== undefined) updateData.type = type;
        if (base_url !== undefined) {
          new URL(base_url); // Validate URL
          updateData.base_url = base_url;
        }
        if (authentication_type !== undefined) updateData.authentication_type = authentication_type;
        if (configuration !== undefined) updateData.configuration = configuration;
        if (active !== undefined) updateData.active = active;

        // Handle credentials update
        if (credentials !== undefined) {
          const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
          updateData.credentials = encryptionManager.encrypt(credentials, encryptionKey);
        }

        const { data: system, error } = await supabaseAdminClient
          .from('external_systems')
          .update(updateData)
          .eq('id', systemId)
          .select('id, name, type, base_url, authentication_type, configuration, active, updated_at')
          .single();

        if (error) {
          return ApiResponse.error(error.message).toResponse(500);
        }

        // Log system update
        await integrationAuditTrail.logActivity({
          integration_name: system.name,
          action: 'system_updated',
          user_id: context.auth.user.id,
          ip_address: context.request.headers.get('CF-Connecting-IP'),
          user_agent: context.request.headers.get('User-Agent'),
          request_method: 'PUT',
          request_url: context.request.url,
          metadata: { system_id: systemId, changes: Object.keys(updateData) }
        });

        return ApiResponse.success(system, {
          message: 'External system updated successfully'
        }).toResponse();

      } catch (error) {
        if (error.message.includes('Invalid URL')) {
          return ApiResponse.error('Invalid base_url format').toResponse(400);
        }
        return ApiResponse.error(error.message).toResponse(500);
      }
    },

    // DELETE /integrations/systems/{id} - Remove external system
    delete: async (context) => {
      const url = new URL(context.request.url);
      const systemId = url.pathname.split('/').pop();
      
      if (!systemId) {
        return ApiResponse.error('System ID is required').toResponse(400);
      }

      try {
        // Get system info for logging
        const { data: system } = await supabaseAdminClient
          .from('external_systems')
          .select('name')
          .eq('id', systemId)
          .single();

        const { error } = await supabaseAdminClient
          .from('external_systems')
          .delete()
          .eq('id', systemId);

        if (error) {
          return ApiResponse.error(error.message).toResponse(500);
        }

        // Log system removal
        if (system) {
          await integrationAuditTrail.logActivity({
            integration_name: system.name,
            action: 'system_removed',
            user_id: context.auth.user.id,
            ip_address: context.request.headers.get('CF-Connecting-IP'),
            user_agent: context.request.headers.get('User-Agent'),
            request_method: 'DELETE',
            request_url: context.request.url,
            metadata: { system_id: systemId }
          });
        }

        return ApiResponse.success(null, {
          message: 'External system removed successfully'
        }).toResponse();

      } catch (error) {
        return ApiResponse.error(error.message).toResponse(500);
      }
    }
  }
});