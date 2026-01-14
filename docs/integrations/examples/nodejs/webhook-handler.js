/**
 * MIHAS Webhook Handler Example - Node.js/Express
 * 
 * This example shows how to handle MIHAS webhooks in a Node.js application
 * using Express.js framework.
 */

const express = require('express');
const crypto = require('crypto');
const app = express();

// Middleware to capture raw body for signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());

// Your webhook secret (keep this secure!)
const WEBHOOK_SECRET = process.env.MIHAS_WEBHOOK_SECRET || 'your-webhook-secret';

/**
 * Verify webhook signature
 */
function verifySignature(payload, signature, secret) {
  if (!signature) return false;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  
  return signature === `sha256=${expectedSignature}`;
}

/**
 * Main webhook handler
 */
app.post('/webhooks/mihas', (req, res) => {
  const signature = req.headers['x-mihas-signature'];
  const payload = req.body;
  
  // Verify the signature
  if (!verifySignature(payload, signature, WEBHOOK_SECRET)) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  try {
    // Parse the JSON payload
    const event = JSON.parse(payload.toString());
    
    console.log(`Received webhook: ${event.event}`, {
      timestamp: event.timestamp,
      webhook_id: event.webhook_id
    });
    
    // Route to appropriate handler based on event type
    switch (event.event) {
      case 'application.submitted':
        handleApplicationSubmitted(event.data);
        break;
        
      case 'application.approved':
        handleApplicationApproved(event.data);
        break;
        
      case 'application.rejected':
        handleApplicationRejected(event.data);
        break;
        
      case 'payment.verified':
        handlePaymentVerified(event.data);
        break;
        
      case 'user.registered':
        handleUserRegistered(event.data);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.event}`);
    }
    
    // Always respond with 200 to acknowledge receipt
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(400).json({ error: 'Invalid payload' });
  }
});

/**
 * Event Handlers
 */

function handleApplicationSubmitted(data) {
  console.log('Application submitted:', {
    applicationNumber: data.application_number,
    program: data.program,
    studentName: data.full_name
  });
  
  // Example: Send notification to admissions team
  // sendEmailNotification('admissions@university.edu', 'New Application', data);
  
  // Example: Update external CRM system
  // updateCRMSystem('application_submitted', data);
}

function handleApplicationApproved(data) {
  console.log('Application approved:', {
    applicationNumber: data.application_number,
    program: data.program
  });
  
  // Example: Trigger enrollment process
  // triggerEnrollmentProcess(data);
  
  // Example: Send welcome package
  // sendWelcomePackage(data.user_id, data.program);
}

function handleApplicationRejected(data) {
  console.log('Application rejected:', {
    applicationNumber: data.application_number,
    reason: data.rejection_reason
  });
  
  // Example: Send feedback to student
  // sendRejectionFeedback(data.user_id, data.rejection_reason);
}

function handlePaymentVerified(data) {
  console.log('Payment verified:', {
    applicationNumber: data.application_number,
    amount: data.amount
  });
  
  // Example: Update accounting system
  // updateAccountingSystem('payment_received', data);
  
  // Example: Generate receipt
  // generatePaymentReceipt(data);
}

function handleUserRegistered(data) {
  console.log('User registered:', {
    userId: data.id,
    email: data.email,
    fullName: data.full_name
  });
  
  // Example: Add to mailing list
  // addToMailingList(data.email, data.full_name);
  
  // Example: Create user in external system
  // createExternalUserAccount(data);
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Test endpoint to verify webhook setup
 */
app.post('/webhooks/test', (req, res) => {
  console.log('Test webhook received:', req.body);
  res.json({ message: 'Test webhook received successfully' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/mihas`);
});

module.exports = app;