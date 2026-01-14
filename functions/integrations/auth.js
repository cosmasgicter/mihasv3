/**
 * Integration Authentication API
 * Manages API keys, OAuth2 flows, and authentication for external systems
 */

import { createIntegrationEndpoint, ApiResponse } from '../_lib/integrationFramework.js';
import { authenticationManager, integrationAuditTrail } from '../_lib/secureIntegration.js';
import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export const onRequest = createIntegrationEndpoint({
  requireAuth: true,
  requireAdmin: true,
  auditLogging: true,
  handlers: {
    // POST /integrations/auth/api-keys - Generate API key
    post: async (context) => {
      const url = new URL(context.request.url);
      const action = url.pathname.split('/').pop();

      if (action === 'api-keys') {
        return handleApiKeyGeneration(context);
      } else if (action === 'oauth2-init') {
        return handleOAuth2Initiation(context);
      } else if (action === 'oauth2-callback') {
        return handleOAuth2Callback(context);
      } else if (action === 'refresh-token') {
        return handleTokenRefresh(context);
      }

      return ApiResponse.error('Invalid authentication action').toResponse(400);
    },

    // GET /integrations/auth/tokens - List API tokens
    get: async (context) => {
      try {
        const { data: tokens, error } = await supabaseAdminClient
          .from('integration_tokens')
          .select('id, name, permissions, expires_at, last_used_at, active, created_at')
          .order('created_at', { ascending: false });

        if (error) {
          return ApiResponse.error(error.message).toResponse(500);
        }

        return ApiResponse.success({ tokens }).toResponse();

      } catch (error) {
        return ApiResponse.error(error.message).toResponse(500);
      }
    },

    // DELETE /integrations/auth/tokens - Revoke API token
    delete: async (context) => {
      const url = new URL(context.request.url);
      const tokenId = url.searchParams.get('id');

      if (!tokenId) {
        return ApiResponse.error('Token ID is required').toResponse(400);
      }

      try {
        const { error } = await supabaseAdminClient
          .from('integration_tokens')
          .update({ active: false })
          .eq('id', tokenId);

        if (error) {
          return ApiResponse.error(error.message).toResponse(500);
        }

        // Log token revocation
        await integrationAuditTrail.logActivity({
          integration_name: 'api_tokens',
          action: 'token_revoked',
          user_id: context.auth.user.id,
          ip_address: context.request.headers.get('CF-Connecting-IP'),
          user_agent: context.request.headers.get('User-Agent'),
          request_method: 'DELETE',
          request_url: context.request.url,
          metadata: { token_id: tokenId }
        });

        return ApiResponse.success(null, {
          message: 'API token revoked successfully'
        }).toResponse();

      } catch (error) {
        return ApiResponse.error(error.message).toResponse(500);
      }
    }
  }
});

/**
 * Handle API key generation
 */
async function handleApiKeyGeneration(context) {
  const body = await context.request.json();
  const { name, permissions = [], expiresIn = null } = body;

  if (!name) {
    return ApiResponse.error('Token name is required').toResponse(400);
  }

  try {
    const apiKeyData = await authenticationManager.generateApiKey(
      name,
      permissions,
      expiresIn
    );

    // Log API key generation
    await integrationAuditTrail.logActivity({
      integration_name: 'api_tokens',
      action: 'api_key_generated',
      user_id: context.auth.user.id,
      ip_address: context.request.headers.get('CF-Connecting-IP'),
      user_agent: context.request.headers.get('User-Agent'),
      request_method: 'POST',
      request_url: context.request.url,
      metadata: { 
        token_name: name, 
        permissions,
        expires_in: expiresIn
      }
    });

    return ApiResponse.success(apiKeyData, {
      message: 'API key generated successfully',
      warning: 'Store this key securely - it will not be shown again'
    }).toResponse(201);

  } catch (error) {
    return ApiResponse.error(error.message).toResponse(500);
  }
}

/**
 * Handle OAuth2 flow initiation
 */
async function handleOAuth2Initiation(context) {
  const body = await context.request.json();
  const { systemId, redirectUri, scopes = [] } = body;

  if (!systemId || !redirectUri) {
    return ApiResponse.error('System ID and redirect URI are required').toResponse(400);
  }

  try {
    const oauthData = await authenticationManager.initiateOAuth2Flow(
      systemId,
      redirectUri,
      scopes
    );

    // Log OAuth2 initiation
    await integrationAuditTrail.logActivity({
      integration_name: 'oauth2',
      action: 'oauth2_initiated',
      user_id: context.auth.user.id,
      ip_address: context.request.headers.get('CF-Connecting-IP'),
      user_agent: context.request.headers.get('User-Agent'),
      request_method: 'POST',
      request_url: context.request.url,
      metadata: { 
        system_id: systemId,
        redirect_uri: redirectUri,
        scopes
      }
    });

    return ApiResponse.success(oauthData, {
      message: 'OAuth2 flow initiated successfully'
    }).toResponse();

  } catch (error) {
    return ApiResponse.error(error.message).toResponse(500);
  }
}

/**
 * Handle OAuth2 callback
 */
async function handleOAuth2Callback(context) {
  const body = await context.request.json();
  const { code, state } = body;

  if (!code || !state) {
    return ApiResponse.error('Authorization code and state are required').toResponse(400);
  }

  try {
    const result = await authenticationManager.completeOAuth2Flow(code, state);

    // Log OAuth2 completion
    await integrationAuditTrail.logActivity({
      integration_name: 'oauth2',
      action: 'oauth2_completed',
      user_id: context.auth.user.id,
      ip_address: context.request.headers.get('CF-Connecting-IP'),
      user_agent: context.request.headers.get('User-Agent'),
      request_method: 'POST',
      request_url: context.request.url,
      metadata: { 
        system_id: result.system_id,
        state
      }
    });

    return ApiResponse.success(result, {
      message: 'OAuth2 authentication completed successfully'
    }).toResponse();

  } catch (error) {
    return ApiResponse.error(error.message).toResponse(500);
  }
}

/**
 * Handle token refresh
 */
async function handleTokenRefresh(context) {
  const body = await context.request.json();
  const { systemId } = body;

  if (!systemId) {
    return ApiResponse.error('System ID is required').toResponse(400);
  }

  try {
    const result = await authenticationManager.refreshOAuth2Token(systemId);

    // Log token refresh
    await integrationAuditTrail.logActivity({
      integration_name: 'oauth2',
      action: 'token_refreshed',
      user_id: context.auth.user.id,
      ip_address: context.request.headers.get('CF-Connecting-IP'),
      user_agent: context.request.headers.get('User-Agent'),
      request_method: 'POST',
      request_url: context.request.url,
      metadata: { system_id: systemId }
    });

    return ApiResponse.success(result, {
      message: 'Token refreshed successfully'
    }).toResponse();

  } catch (error) {
    return ApiResponse.error(error.message).toResponse(500);
  }
}