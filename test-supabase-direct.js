#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://mylgegkqoddcrxtwcclb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUxMjA4MywiZXhwIjoyMDczMDg4MDgzfQ.FsspKE5bjcG4TW8IvG-N0o7W0E7ljxznwlzJCm50ZRE';

async function testSupabaseConnection() {
  console.log('🔍 Testing Supabase Connection...');
  
  // Test 1: Basic connectivity
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    console.log(`✅ Basic connectivity: ${response.status}`);
  } catch (error) {
    console.log(`❌ Basic connectivity failed: ${error.message}`);
  }

  // Test 2: Service role client
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  try {
    const { data, error } = await adminClient.from('programs').select('count').limit(1);
    if (error) {
      console.log(`❌ Service role test: ${error.message}`);
    } else {
      console.log(`✅ Service role working`);
    }
  } catch (error) {
    console.log(`❌ Service role failed: ${error.message}`);
  }

  // Test 3: Auth admin functions
  try {
    const { data, error } = await adminClient.auth.admin.listUsers();
    if (error) {
      console.log(`❌ Auth admin: ${error.message}`);
    } else {
      console.log(`✅ Auth admin working, users: ${data.users?.length || 0}`);
    }
  } catch (error) {
    console.log(`❌ Auth admin failed: ${error.message}`);
  }

  // Test 4: Create user test
  try {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: 'test@example.com',
      password: 'testpass123',
      email_confirm: true
    });
    
    if (error) {
      console.log(`❌ User creation: ${error.message}`);
    } else {
      console.log(`✅ User creation works`);
      
      // Clean up test user
      if (data.user?.id) {
        await adminClient.auth.admin.deleteUser(data.user.id);
        console.log(`🧹 Test user cleaned up`);
      }
    }
  } catch (error) {
    console.log(`❌ User creation failed: ${error.message}`);
  }

  // Test 5: Try creating the actual user
  try {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: 'alexisstar8@gmail.com',
      password: 'Skyl3rL0m1s',
      user_metadata: { full_name: 'Alexis Star Test User' },
      email_confirm: true
    });
    
    if (error) {
      if (error.message.includes('already registered')) {
        console.log(`✅ User already exists: alexisstar8@gmail.com`);
        
        // Try to sign in
        const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
          email: 'alexisstar8@gmail.com',
          password: 'Skyl3rL0m1s'
        });
        
        if (signInError) {
          console.log(`❌ Sign in failed: ${signInError.message}`);
        } else {
          console.log(`✅ Sign in successful`);
        }
      } else {
        console.log(`❌ User creation: ${error.message}`);
      }
    } else {
      console.log(`✅ User created successfully`);
    }
  } catch (error) {
    console.log(`❌ User creation failed: ${error.message}`);
  }
}

testSupabaseConnection().catch(console.error);