#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mylgegkqoddcrxtwcclb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUxMjA4MywiZXhwIjoyMDczMDg4MDgzfQ.FsspKE5bjcG4TW8IvG-N0o7W0E7ljxznwlzJCm50ZRE';

async function testAuthentication() {
  console.log('🔐 Testing Authentication...');
  
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  // Test 1: Check if user exists
  try {
    const { data: users, error } = await adminClient.auth.admin.listUsers();
    const targetUser = users.users?.find(u => u.email === 'alexisstar8@gmail.com');
    
    if (targetUser) {
      console.log(`✅ User exists: ${targetUser.email}`);
      console.log(`   ID: ${targetUser.id}`);
      console.log(`   Confirmed: ${targetUser.email_confirmed_at ? 'Yes' : 'No'}`);
      console.log(`   Created: ${targetUser.created_at}`);
    } else {
      console.log(`❌ User not found`);
      return;
    }
  } catch (error) {
    console.log(`❌ Error checking user: ${error.message}`);
    return;
  }
  
  // Test 2: Try direct sign in
  try {
    const { data, error } = await anonClient.auth.signInWithPassword({
      email: 'alexisstar8@gmail.com',
      password: 'Skyl3rL0m1s'
    });
    
    if (error) {
      console.log(`❌ Sign in failed: ${error.message}`);
      
      // Try to reset password
      console.log(`🔄 Attempting password reset...`);
      const { data: resetData, error: resetError } = await adminClient.auth.admin.updateUserById(
        (await adminClient.auth.admin.listUsers()).data.users.find(u => u.email === 'alexisstar8@gmail.com').id,
        { password: 'Skyl3rL0m1s' }
      );
      
      if (resetError) {
        console.log(`❌ Password reset failed: ${resetError.message}`);
      } else {
        console.log(`✅ Password reset successful`);
        
        // Try sign in again
        const { data: retryData, error: retryError } = await anonClient.auth.signInWithPassword({
          email: 'alexisstar8@gmail.com',
          password: 'Skyl3rL0m1s'
        });
        
        if (retryError) {
          console.log(`❌ Sign in still failed: ${retryError.message}`);
        } else {
          console.log(`✅ Sign in successful after reset!`);
          console.log(`   Access Token: ${retryData.session?.access_token ? 'Present' : 'Missing'}`);
        }
      }
    } else {
      console.log(`✅ Sign in successful!`);
      console.log(`   User ID: ${data.user?.id}`);
      console.log(`   Access Token: ${data.session?.access_token ? 'Present' : 'Missing'}`);
    }
  } catch (error) {
    console.log(`❌ Sign in error: ${error.message}`);
  }
  
  // Test 3: Create fresh user for testing
  try {
    console.log(`\n🆕 Creating fresh test user...`);
    const { data, error } = await adminClient.auth.admin.createUser({
      email: 'test-fresh@mihas.edu.zm',
      password: 'TestPass123!',
      user_metadata: { full_name: 'Fresh Test User' },
      email_confirm: true
    });
    
    if (error) {
      console.log(`❌ Fresh user creation: ${error.message}`);
    } else {
      console.log(`✅ Fresh user created: ${data.user?.email}`);
      
      // Try to sign in with fresh user
      const { data: freshSignIn, error: freshError } = await anonClient.auth.signInWithPassword({
        email: 'test-fresh@mihas.edu.zm',
        password: 'TestPass123!'
      });
      
      if (freshError) {
        console.log(`❌ Fresh user sign in failed: ${freshError.message}`);
      } else {
        console.log(`✅ Fresh user sign in successful!`);
      }
      
      // Clean up
      await adminClient.auth.admin.deleteUser(data.user.id);
      console.log(`🧹 Fresh user cleaned up`);
    }
  } catch (error) {
    console.log(`❌ Fresh user test failed: ${error.message}`);
  }
}

testAuthentication().catch(console.error);