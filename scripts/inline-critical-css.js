#!/usr/bin/env node
// Extract and inline critical CSS for instant first paint

const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.html');
const cssFiles = fs.readdirSync(path.join(distPath, 'assets'))
  .filter(f => f.startsWith('index-') && f.endsWith('.css'));

if (cssFiles.length === 0) {
  console.error('No CSS file found');
  process.exit(1);
}

const cssPath = path.join(distPath, 'assets', cssFiles[0]);
const css = fs.readFileSync(cssPath, 'utf8');

// Extract critical CSS (first 10KB - above fold styles)
const criticalCSS = css.slice(0, 10240);

// Read index.html
let html = fs.readFileSync(indexPath, 'utf8');

// Inline critical CSS
html = html.replace(
  '</head>',
  `<style>${criticalCSS}</style>\n    <link rel="preload" href="/assets/${cssFiles[0]}" as="style" onload="this.onload=null;this.rel='stylesheet'">\n    <noscript><link rel="stylesheet" href="/assets/${cssFiles[0]}"></noscript>\n  </head>`
);

// Remove original CSS link
html = html.replace(/<link[^>]*index-[^>]*\.css[^>]*>/g, '');

// Write back
fs.writeFileSync(indexPath, html);
console.log('✅ Critical CSS inlined');
console.log(`   Size: ${(criticalCSS.length / 1024).toFixed(2)}KB`);
