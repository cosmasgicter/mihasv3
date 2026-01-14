/**
 * MIHAS API Client Example - Node.js
 * 
 * This example shows how to interact with the MIHAS Integration API
 * to manage webhooks and external systems.
 */

const axios = require('axios');

class MihasApiClient {
  constructor(baseUrl, apiToken) {
    this.baseUrl = baseUrl || '***REMOVED***';
    this.apiToken = apiToken;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error('API Error:', error.response?.data || error.message);
        throw error;
      }
    );
  }

  /**
   * Webhook Management
   */
  
  async listWebhooks(page = 1, limit = 20) {
    const response = await this.client.get('/integrations/webhooks', {
      params: { page, limit }
    });
    return response.data;
  }
  
  async createWebhook(config) {
    const response = await this.client.post('/integrations/webhooks', config);
    return response.data;
  }
  
  async updateWebhook(id, updates) {
    const response = await this.client.put('/integrations/webhooks', updates, {
      params: { id }
    });
    return response.data;
  }
  
  async deleteWebhook(id) {
    const response = await this.client.delete('/integrations/webhooks', {
      params: { id }
    });
    return response.data;
  }
  
  async testWebhook(webhookId, event, testPayload = null) {
    const response = await this.client.post('/integrations/test-webhook', {
      webhookId,
      event,
      testPayload
    });
    return response.data;
  }

  /**
   * Delivery Logs
   */
  
  async getDeliveries(filters = {}) {
    const response = await this.client.get('/integrations/deliveries', {
      params: filters
    });
    return response.data;
  }
  
  async getWebhookDeliveries(webhookId, page = 1, limit = 20) {
    return this.getDeliveries({
      webhook_id: webhookId,
      page,
      limit
    });
  }

  /**
   * External Systems
   */
  
  async listExternalSystems() {
    const response = await this.client.get('/integrations/systems');
    return response.data;
  }
  
  async registerExternalSystem(config) {
    const response = await this.client.post('/integrations/systems', config);
    return response.data;
  }
  
  async updateExternalSystem(id, updates) {
    const response = await this.client.put(`/integrations/systems/${id}`, updates);
    return response.data;
  }
  
  async deleteExternalSystem(id) {
    const response = await this.client.delete(`/integrations/systems/${id}`);
    return response.data;
  }

  /**
   * Integration Events
   */
  
  async triggerEvent(eventType, payload, targetSystem = null) {
    const response = await this.client.post('/integrations/events', {
      event_type: eventType,
      target_system: targetSystem,
      payload
    });
    return response.data;
  }
  
  async getEventHistory(filters = {}) {
    const response = await this.client.get('/integrations/events', {
      params: filters
    });
    return response.data;
  }
}

/**
 * Usage Examples
 */

async function examples() {
  const client = new MihasApiClient(
    '***REMOVED***',
    process.env.MIHAS_API_TOKEN
  );

  try {
    // Create a webhook
    const webhook = await client.createWebhook({
      name: 'Student Information System',
      url: 'https://sis.university.edu/webhooks/mihas',
      events: ['application.submitted', 'application.approved', 'payment.verified'],
      secret: 'secure-webhook-secret-123',
      metadata: {
        system: 'SIS',
        version: '2.1',
        contact: 'admin@university.edu'
      }
    });
    
    console.log('Webhook created:', webhook.data);

    // Test the webhook
    const testResult = await client.testWebhook(
      webhook.data.id,
      'application.submitted',
      {
        test: true,
        application_number: 'TEST001',
        program: 'Test Program'
      }
    );
    
    console.log('Test result:', testResult);

    // Get delivery logs
    const deliveries = await client.getWebhookDeliveries(webhook.data.id);
    console.log('Recent deliveries:', deliveries.data.deliveries);

    // Register external system
    const externalSystem = await client.registerExternalSystem({
      name: 'University CRM',
      type: 'crm',
      base_url: 'https://crm.university.edu/api',
      authentication_type: 'api_key',
      credentials: {
        api_key: 'encrypted-api-key'
      },
      configuration: {
        sync_interval: 3600,
        batch_size: 100
      }
    });
    
    console.log('External system registered:', externalSystem.data);

    // Trigger custom event
    const eventResult = await client.triggerEvent(
      'custom.student_enrolled',
      {
        student_id: 'STU001',
        program: 'Registered Nursing',
        enrollment_date: new Date().toISOString()
      },
      'University CRM'
    );
    
    console.log('Event triggered:', eventResult);

  } catch (error) {
    console.error('Example failed:', error.message);
  }
}

// Export the client class
module.exports = MihasApiClient;

// Run examples if this file is executed directly
if (require.main === module) {
  examples();
}