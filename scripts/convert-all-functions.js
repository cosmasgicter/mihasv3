#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const apiDir = path.join(rootDir, 'api');
const functionsDir = path.join(rootDir, 'functions');

function convertNetlifyToCloudflare(code, functionName) {
  // Remove Netlify-specific imports
  code = code.replace(/import.*withNetlifyHandler.*\n/g, '');
  code = code.replace(/const netlifyHandler.*\n/g, '');
  code = code.replace(/export.*netlifyHandler.*\n/g, '');
  code = code.replace(/export.*expressHandler.*\n/g, '');
  code = code.replace(/export default netlifyHandler/g, '');
  
  // Update imports to use _lib
  code = code.replace(/from '\.\.\/\_lib\//g, "from '../_lib/");
  code = code.replace(/from '\.\/\_lib\//g, "from '../_lib/");
  
  // Convert handler function to Cloudflare format
  if (code.includes('async function handler(req, res)')) {
    code = `import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  // Create req/res compatible objects
  const req = {
    method: request.method,
    headers: Object.fromEntries(request.headers),
    query: Object.fromEntries(url.searchParams),
    url: url.pathname + url.search,
    body: request.method !== 'GET' ? await request.json().catch(() => ({})) : {}
  };
  
  const res = {
    statusCode: 200,
    headers: corsHeaders,
    setHeader: (key, value) => { res.headers[key] = value; },
    status: (code) => { res.statusCode = code; return res; },
    json: (data) => {
      return new Response(JSON.stringify(data), {
        status: res.statusCode,
        headers: { ...res.headers, 'Content-Type': 'application/json' }
      });
    },
    end: () => new Response(null, { status: res.statusCode, headers: res.headers })
  };
  
  try {
${code.split('async function handler(req, res)')[1].split('export {')[0].trim()}
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}`;
  }
  
  return code;
}

// Get all stub functions
const stubs = [];
function findStubs(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !file.startsWith('_')) {
      findStubs(fullPath);
    } else if (file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('Auto-generated function entry point')) {
        const match = content.match(/from '(.+)'/);
        if (match) {
          stubs.push({
            functionPath: fullPath,
            apiPath: path.join(rootDir, match[1])
          });
        }
      }
    }
  });
}

findStubs(functionsDir);

console.log(`Found ${stubs.length} stub functions to convert\n`);

let converted = 0;
let failed = 0;

stubs.forEach(({ functionPath, apiPath }) => {
  try {
    if (!fs.existsSync(apiPath)) {
      console.log(`⚠️  ${path.relative(functionsDir, functionPath)} - API file not found`);
      failed++;
      return;
    }
    
    const apiCode = fs.readFileSync(apiPath, 'utf8');
    const functionName = path.basename(functionPath, '.js');
    const converted = convertNetlifyToCloudflare(apiCode, functionName);
    
    fs.writeFileSync(functionPath, convertedCode);
    console.log(`✓ ${path.relative(functionsDir, functionPath)}`);
    converted++;
  } catch (error) {
    console.log(`❌ ${path.relative(functionsDir, functionPath)} - ${error.message}`);
    failed++;
  }
});

console.log(`\n✅ Converted: ${converted}`);
console.log(`❌ Failed: ${failed}`);
