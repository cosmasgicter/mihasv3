#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.html');
const cssFiles = fs.readdirSync(path.join(distPath, 'assets'))
  .filter(f => f.endsWith('.css'));

if (cssFiles.length === 0) {
  console.error('No CSS file found');
  process.exit(1);
}

const cssPath = path.join(distPath, 'assets', cssFiles[0]);
const css = fs.readFileSync(cssPath, 'utf8');

// Extract critical CSS (first 10KB)
const criticalCSS = css.slice(0, 10240);

// Read index.html
let html = fs.readFileSync(indexPath, 'utf8');

// Inline critical CSS
html = html.replace(
  '</head>',
  `<style>${criticalCSS}</style>\n    <link rel="preload" href="/assets/${cssFiles[0]}" as="style" onload="this.onload=null;this.rel='stylesheet'">\n    <noscript><link rel="stylesheet" href="/assets/${cssFiles[0]}"></noscript>\n  </head>`
);

// Remove original CSS link
html = html.replace(/<link[^>]*\.css[^>]*>/g, '');

// Find main bundle
const jsFiles = fs.readdirSync(path.join(distPath, 'assets/js'))
  .filter(f => f.startsWith('index-') && f.endsWith('.js') && !f.includes('vendor'));
const mainBundle = jsFiles.length > 0 ? jsFiles[jsFiles.length - 1] : null;

if (mainBundle) {
  const scriptTag = `
    <script type="module">
      requestIdleCallback(() => import('/assets/js/${mainBundle}'), { timeout: 100 });
    </script>
  </body>`;
  html = html.replace('</body>', scriptTag);
}

fs.writeFileSync(indexPath, html);
console.log('✅ Critical CSS inlined:', (criticalCSS.length / 1024).toFixed(2), 'KB');
console.log('✅ Main bundle deferred');
