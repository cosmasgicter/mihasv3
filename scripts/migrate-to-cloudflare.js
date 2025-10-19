#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const sourceDir = path.join(rootDir, 'api-functions');
const targetDir = path.join(rootDir, 'functions');

// Create functions directory
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy utils
const utilsSource = path.join(sourceDir, 'utils');
const utilsTarget = path.join(targetDir, '_lib');
if (fs.existsSync(utilsSource)) {
  fs.cpSync(utilsSource, utilsTarget, { recursive: true });
  console.log('✓ Copied utils to _lib');
}

// Copy shared libs
const libSource = path.join(rootDir, 'api', '_lib');
if (fs.existsSync(libSource)) {
  fs.cpSync(libSource, path.join(targetDir, '_lib'), { recursive: true });
  console.log('✓ Copied shared libraries');
}

// Get all function files
const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.js') && !f.startsWith('_'));

console.log(`\nMigrating ${files.length} functions...\n`);

files.forEach(file => {
  const content = fs.readFileSync(path.join(sourceDir, file), 'utf8');
  const converted = convertFunction(content, file);
  
  // Map to Cloudflare route structure
  const targetPath = mapToRoute(file);
  const targetFile = path.join(targetDir, targetPath);
  
  // Create subdirectories if needed
  const targetSubdir = path.dirname(targetFile);
  if (!fs.existsSync(targetSubdir)) {
    fs.mkdirSync(targetSubdir, { recursive: true });
  }
  
  fs.writeFileSync(targetFile, converted);
  console.log(`✓ ${file} → ${targetPath}`);
});

console.log(`\n✅ Migration complete! ${files.length} functions converted.\n`);

function convertFunction(content, filename) {
  let converted = content;
  
  // Convert imports
  converted = converted.replace(/const \{ logger \} = require\('\.\/utils\/logger\.js'\)/g, 
    "import { logger } from '../_lib/logger.js'");
  converted = converted.replace(/import \{ logger \} from '\.\/utils\/logger\.js'/g,
    "import { logger } from '../_lib/logger.js'");
  converted = converted.replace(/from '\.\.\/api\/_lib\//g, "from '../_lib/");
  
  // Convert handler export
  if (converted.includes('export async function handler')) {
    converted = convertToCloudflare(converted);
  } else if (converted.includes('exports.handler')) {
    converted = convertCommonJSToCloudflare(converted);
  }
  
  return converted;
}

function convertToCloudflare(content) {
  // Extract handler function body
  const handlerMatch = content.match(/export async function handler\(event(?:, context)?\) \{([\s\S]*)\}/);
  if (!handlerMatch) return content;
  
  const body = handlerMatch[1];
  
  // Build new function
  return content.replace(
    /export async function handler\(event(?:, context)?\) \{[\s\S]*\}/,
    `export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }
  
  try {
    // Get query params
    const queryStringParameters = Object.fromEntries(url.searchParams);
    
    // Get body for POST/PUT
    let body = null;
    if (request.method === 'POST' || request.method === 'PUT') {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        body = await request.json();
      } else {
        body = await request.text();
      }
    }
    
    // Get headers
    const headers = Object.fromEntries(request.headers);
    
    // Create event-like object for compatibility
    const event = {
      httpMethod: request.method,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers,
      queryStringParameters
    };
${body}
  } catch (error) {
    logger.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}`
  ).replace(/return \{[\s\S]*?statusCode: (\d+),[\s\S]*?body: (.*?)\n\s*\}/g, 
    (match, status, body) => {
      return `return new Response(${body}, {
      status: ${status},
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })`;
  });
}

function convertCommonJSToCloudflare(content) {
  // Convert to ES modules first
  let converted = content.replace(/exports\.handler/g, 'export async function handler');
  converted = converted.replace(/const (.*?) = require\((.*?)\)/g, 'import $1 from $2');
  return convertToCloudflare(converted);
}

function mapToRoute(filename) {
  // admin-users-id.js → admin/users/[id].js
  // applications-id.js → applications/[id].js
  // auth-login.js → auth/login.js
  
  const name = filename.replace('.js', '');
  const parts = name.split('-');
  
  // Handle dynamic routes
  if (parts[parts.length - 1] === 'id') {
    parts[parts.length - 1] = '[id]';
  }
  
  // Build path
  if (parts.length === 1) {
    return `${name}.js`;
  }
  
  const dir = parts.slice(0, -1).join('/');
  const file = parts[parts.length - 1];
  return `${dir}/${file}.js`;
}
