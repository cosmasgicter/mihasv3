#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const apiDir = path.join(rootDir, 'api');
const functionsDir = path.join(rootDir, 'functions');

// Simple functions that just query Supabase
const simpleEndpoints = {
  'catalog/programs': 'programs',
  'catalog/intakes': 'intakes',
  'catalog/subjects': 'subjects',
  'health': null
};

// Create simple catalog functions
Object.entries(simpleEndpoints).forEach(([endpoint, table]) => {
  const filePath = path.join(functionsDir, `${endpoint}.js`);
  const dir = path.dirname(filePath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  let content;
  
  if (endpoint === 'health') {
    content = `export async function onRequestGet() {
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    platform: 'cloudflare-pages'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}`;
  } else {
    content = `import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export async function onRequestGet() {
  try {
    const { data, error } = await supabaseAdminClient
      .from('${table}')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(data || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}`;
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`✓ Created ${endpoint}.js`);
});

console.log('\n✅ Simple functions created');
