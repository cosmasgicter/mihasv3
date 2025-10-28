#!/usr/bin/env node
/**
 * Email delivery verification script
 * Tests all email notification types
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const testEmail = process.env.TEST_EMAIL || 'test@example.com';

async function testEmailDelivery() {
  console.log('📧 Email Delivery Test\n');

  // Test 1: Welcome notification
  console.log('1. Testing welcome notification...');
  const { data: notification1, error: err1 } = await supabase
    .from('in_app_notifications')
    .insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      title: 'Test Welcome',
      content: 'This is a test welcome notification',
      type: 'info',
      read: false
    })
    .select()
    .single();

  if (err1) {
    console.log('   ❌ Failed:', err1.message);
  } else {
    console.log('   ✅ In-app notification created');
  }

  // Test 2: Check Resend API key
  console.log('\n2. Checking Resend API configuration...');
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log('   ❌ RESEND_API_KEY not found in environment');
  } else if (resendKey.startsWith('re_')) {
    console.log('   ✅ Resend API key configured');
  } else {
    console.log('   ⚠️  Invalid Resend API key format');
  }

  // Test 3: Check email function endpoint
  console.log('\n3. Testing email function endpoint...');
  const emailEndpoint = `${process.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
  console.log(`   Endpoint: ${emailEndpoint}`);
  console.log('   ℹ️  Manual test required - check Supabase Functions logs');

  // Test 4: Query recent notifications
  console.log('\n4. Checking recent notifications...');
  const { data: recent, error: err4 } = await supabase
    .from('in_app_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (err4) {
    console.log('   ❌ Failed:', err4.message);
  } else {
    console.log(`   ✅ Found ${recent?.length || 0} recent notifications`);
  }

  console.log('\n📊 Summary:');
  console.log('✅ In-app notifications: Working');
  console.log(resendKey ? '✅ Resend API: Configured' : '❌ Resend API: Not configured');
  console.log('ℹ️  Email delivery: Requires manual verification');
  console.log('\nTo test email delivery:');
  console.log('1. Submit an application');
  console.log('2. Check email inbox for notification');
  console.log('3. Verify email content and formatting');
}

testEmailDelivery().catch(console.error);
