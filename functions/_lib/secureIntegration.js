/**
 * Secure Third-Party Integration Module
 * Provides secure authentication, encryption, and audit trails for external integrations
 */

import { supabaseAdminClient } from './supabaseClient.js';
import { AuditLogger } from './auditLogger.js';

/**
 * Encryption utilities for secure data exchange
 */
export class EncryptionManager {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
  }

  /**
   * Generate a secure encryption key
   */
  generateKey() {
    const crypto = require('crypto');
    return crypto.randomBytes(this.keyLength);
  }

  /**
   * Encrypt data for secure transmission
   */
  encrypt(data, key) {
    try {
      const crypto = require('crypto');
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, key, iv);
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data from external systems
   */
  decrypt(encryptedData, key) {
    try {
      const crypto = require('crypto');
      const { encrypted, iv, tag } = encryptedData;
      
      const decipher = crypto.createDecipher(
        this.algorithm, 
        key, 
        Buffer.from(iv, 'hex')
      );
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate secure hash for data integrity
   */
  generateHash(data, secret) {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Verify data integrity
   */
  verifyHash(data, hash, secret) {
    const expectedHash = this.generateHash(data, secret);
    return hash === expectedHash;
  }
}

/**
 * Authentication protocols for external services
 */
export class AuthenticationManager {
  constructor() {
    this.supabase = supabaseAdminClient;
    this.auditLogger = new AuditLogger(this.supabase);
  }

  /**
   * Generate API key for external system
   */
  async generateApiKey(systemName, permissions = [], expiresIn = null) {
    try {
      const crypto = require('crypto');
      const apiKey = crypto.randomBytes(32).toString('hex');
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      
      const expiresAt = expiresIn ? 
        new Date(Date.now() + expiresIn * 1000).toISOString() : 
        null;

      const { data, error } = await this.supabase
        .from('integration_tokens')
        .insert({
          name: systemName,
          token_hash: keyHash,
          permissions,
          expires_at: expiresAt,
          active: true
        })
        .select()
        .single();

      if (error) throw error;

      // Return the actual key only once
      return {
        ...data,
        api_key: apiKey // Only returned on creation
      };

    } catch (error) {
      throw new Error(`API key generation failed: ${error.message}`);
    }
  }

  /**
   * Validate API key
   */
  async validateApiKey(apiKey, requiredPermission = null) {
    try {
      const crypto = require('crypto');
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const { data: token, error } = await this.supabase
        .from('integration_tokens')
        .select('*')
        .eq('token_hash', keyHash)
        .eq('active', true)
        .single();

      if (error || !token) {
        return { valid: false, error: 'Invalid API key' };
      }

      // Check expiration
      if (token.expires_at && new Date(token.expires_at) < new Date()) {
        return { valid: false, error: 'API key expired' };
      }

      // Check permissions
      if (requiredPermission && !token.permissions.includes(requiredPermission)) {
        return { valid: false, error: 'Insufficient permissions' };
      }

      // Update last used timestamp
      await this.supabase
        .from('integration_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', token.id);

      return { valid: true, token };

    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * OAuth2 authentication flow
   */
  async initiateOAuth2Flow(systemId, redirectUri, scopes = []) {
    try {
      const { data: system } = await this.supabase
        .from('external_systems')
        .select('*')
        .eq('id', systemId)
        .single();

      if (!system || system.authentication_type !== 'oauth2') {
        throw new Error('Invalid system or authentication type');
      }

      const crypto = require('crypto');
      const state = crypto.randomBytes(16).toString('hex');
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      // Store OAuth2 state
      await this.supabase
        .from('oauth2_states')
        .insert({
          state,
          system_id: systemId,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          scopes,
          expires_at: new Date(Date.now() + 600000).toISOString() // 10 minutes
        });

      const authUrl = new URL(system.credentials.authorization_url);
      authUrl.searchParams.set('client_id', system.credentials.client_id);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('scope', scopes.join(' '));

      return {
        authorization_url: authUrl.toString(),
        state
      };

    } catch (error) {
      throw new Error(`OAuth2 flow initiation failed: ${error.message}`);
    }
  }

  /**
   * Complete OAuth2 authentication
   */
  async completeOAuth2Flow(code, state) {
    try {
      // Verify state and get OAuth2 details
      const { data: oauthState } = await this.supabase
        .from('oauth2_states')
        .select('*')
        .eq('state', state)
        .single();

      if (!oauthState || new Date(oauthState.expires_at) < new Date()) {
        throw new Error('Invalid or expired OAuth2 state');
      }

      const { data: system } = await this.supabase
        .from('external_systems')
        .select('*')
        .eq('id', oauthState.system_id)
        .single();

      // Exchange code for tokens
      const tokenResponse = await fetch(system.credentials.token_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: system.credentials.client_id,
          client_secret: system.credentials.client_secret,
          code,
          redirect_uri: oauthState.redirect_uri,
          code_verifier: oauthState.code_verifier
        })
      });

      if (!tokenResponse.ok) {
        throw new Error('Token exchange failed');
      }

      const tokens = await tokenResponse.json();

      // Store tokens securely
      const encryptionManager = new EncryptionManager();
      const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
      const encryptedTokens = encryptionManager.encrypt(tokens, encryptionKey);

      await this.supabase
        .from('external_systems')
        .update({
          credentials: {
            ...system.credentials,
            access_token: encryptedTokens,
            token_updated_at: new Date().toISOString()
          }
        })
        .eq('id', system.id);

      // Clean up OAuth2 state
      await this.supabase
        .from('oauth2_states')
        .delete()
        .eq('state', state);

      return { success: true, system_id: system.id };

    } catch (error) {
      throw new Error(`OAuth2 completion failed: ${error.message}`);
    }
  }

  /**
   * Refresh OAuth2 tokens
   */
  async refreshOAuth2Token(systemId) {
    try {
      const { data: system } = await this.supabase
        .from('external_systems')
        .select('*')
        .eq('id', systemId)
        .single();

      if (!system || !system.credentials.access_token) {
        throw new Error('No tokens to refresh');
      }

      // Decrypt current tokens
      const encryptionManager = new EncryptionManager();
      const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
      const currentTokens = encryptionManager.decrypt(
        system.credentials.access_token, 
        encryptionKey
      );

      // Refresh tokens
      const refreshResponse = await fetch(system.credentials.token_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: system.credentials.client_id,
          client_secret: system.credentials.client_secret,
          refresh_token: currentTokens.refresh_token
        })
      });

      if (!refreshResponse.ok) {
        throw new Error('Token refresh failed');
      }

      const newTokens = await refreshResponse.json();
      const encryptedNewTokens = encryptionManager.encrypt(newTokens, encryptionKey);

      await this.supabase
        .from('external_systems')
        .update({
          credentials: {
            ...system.credentials,
            access_token: encryptedNewTokens,
            token_updated_at: new Date().toISOString()
          }
        })
        .eq('id', systemId);

      return { success: true };

    } catch (error) {
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }
}

/**
 * Secure API client for external system communication
 */
export class SecureApiClient {
  constructor(systemId) {
    this.systemId = systemId;
    this.supabase = supabaseAdminClient;
    this.auditLogger = new AuditLogger(this.supabase);
    this.encryptionManager = new EncryptionManager();
    this.authManager = new AuthenticationManager();
  }

  /**
   * Initialize client with system configuration
   */
  async initialize() {
    const { data: system, error } = await this.supabase
      .from('external_systems')
      .select('*')
      .eq('id', this.systemId)
      .single();

    if (error || !system) {
      throw new Error('External system not found');
    }

    this.system = system;
    return this;
  }

  /**
   * Make authenticated request to external system
   */
  async makeRequest(endpoint, options = {}) {
    try {
      if (!this.system) {
        await this.initialize();
      }

      const url = new URL(endpoint, this.system.base_url);
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'MIHAS-Integration/1.0',
        ...options.headers
      };

      // Add authentication
      await this.addAuthentication(headers);

      // Encrypt payload if required
      let body = options.body;
      if (body && this.system.configuration.encrypt_payload) {
        const encryptionKey = this.system.credentials.encryption_key;
        body = JSON.stringify(this.encryptionManager.encrypt(body, encryptionKey));
      } else if (body) {
        body = JSON.stringify(body);
      }

      const requestOptions = {
        method: options.method || 'GET',
        headers,
        body,
        timeout: options.timeout || 30000
      };

      // Log request
      await this.auditLogger.logIntegrationRequest(
        this.systemId,
        'outbound',
        url.toString(),
        requestOptions.method,
        body ? JSON.parse(body) : null
      );

      const response = await fetch(url.toString(), requestOptions);
      
      let responseData = null;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
        
        // Decrypt response if encrypted
        if (this.system.configuration.encrypt_response && responseData.encrypted) {
          const encryptionKey = this.system.credentials.encryption_key;
          responseData = this.encryptionManager.decrypt(responseData, encryptionKey);
        }
      } else {
        responseData = await response.text();
      }

      // Log response
      await this.auditLogger.logIntegrationResponse(
        this.systemId,
        response.status,
        responseData,
        response.ok
      );

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }

      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData
      };

    } catch (error) {
      // Log error
      await this.auditLogger.logIntegrationError(
        this.systemId,
        error.message,
        { endpoint, options }
      );
      
      throw error;
    }
  }

  /**
   * Add authentication headers based on system configuration
   */
  async addAuthentication(headers) {
    switch (this.system.authentication_type) {
      case 'bearer':
        if (this.system.credentials.access_token) {
          headers['Authorization'] = `Bearer ${this.system.credentials.access_token}`;
        }
        break;

      case 'api_key':
        if (this.system.credentials.api_key) {
          const keyHeader = this.system.configuration.api_key_header || 'X-API-Key';
          headers[keyHeader] = this.system.credentials.api_key;
        }
        break;

      case 'oauth2':
        // Handle OAuth2 token refresh if needed
        const tokens = this.encryptionManager.decrypt(
          this.system.credentials.access_token,
          process.env.INTEGRATION_ENCRYPTION_KEY
        );
        
        // Check if token needs refresh
        if (tokens.expires_in && tokens.token_updated_at) {
          const tokenAge = Date.now() - new Date(tokens.token_updated_at).getTime();
          if (tokenAge >= (tokens.expires_in * 1000 * 0.9)) { // Refresh at 90% of expiry
            await this.authManager.refreshOAuth2Token(this.systemId);
            await this.initialize(); // Reload system config
          }
        }
        
        headers['Authorization'] = `Bearer ${tokens.access_token}`;
        break;

      case 'basic':
        if (this.system.credentials.username && this.system.credentials.password) {
          const credentials = Buffer.from(
            `${this.system.credentials.username}:${this.system.credentials.password}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }
        break;
    }
  }
}

/**
 * Integration audit trail manager
 */
export class IntegrationAuditTrail {
  constructor() {
    this.supabase = supabaseAdminClient;
  }

  /**
   * Log integration activity
   */
  async logActivity(activity) {
    try {
      const { data, error } = await this.supabase
        .from('integration_audit_log')
        .insert({
          integration_name: activity.integration_name,
          action: activity.action,
          user_id: activity.user_id,
          ip_address: activity.ip_address,
          user_agent: activity.user_agent,
          request_method: activity.request_method,
          request_url: activity.request_url,
          request_body: activity.request_body,
          response_status: activity.response_status,
          response_body: activity.response_body,
          metadata: activity.metadata || {}
        });

      if (error) throw error;
      return data;

    } catch (error) {
      console.error('Audit logging failed:', error);
      // Don't throw - audit logging failure shouldn't break the main flow
    }
  }

  /**
   * Get audit trail for integration
   */
  async getAuditTrail(integrationName, filters = {}) {
    try {
      let query = this.supabase
        .from('integration_audit_log')
        .select('*')
        .eq('integration_name', integrationName);

      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
      }
      if (filters.action) {
        query = query.eq('action', filters.action);
      }
      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(filters.limit || 100);

      if (error) throw error;
      return data;

    } catch (error) {
      throw new Error(`Audit trail retrieval failed: ${error.message}`);
    }
  }
}

// Export instances
export const encryptionManager = new EncryptionManager();
export const authenticationManager = new AuthenticationManager();
export const integrationAuditTrail = new IntegrationAuditTrail();