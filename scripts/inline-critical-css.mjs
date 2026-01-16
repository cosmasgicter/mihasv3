#!/usr/bin/env node
/**
 * Critical CSS Extraction and Inlining Script
 * 
 * Uses critters to extract above-the-fold CSS and inline it in the HTML.
 * This eliminates render-blocking CSS and enables instant first paint.
 * 
 * Target: Critical CSS under 14KB for optimal performance
 * Requirements: 1.3 - Inline critical CSS to eliminate render-blocking resources
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Critters from 'critters';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.html');

// Configuration for critters
const crittersConfig = {
  // Path to the output directory
  path: distPath,
  // Inline critical CSS in <style> tags
  inlineThreshold: 0,
  // Preload remaining CSS
  preload: 'swap',
  // Minimize inlined CSS
  compress: true,
  // Don't remove original CSS links (we handle this manually)
  pruneSource: false,
  // Reduce unused CSS
  reduceInlineStyles: true,
  // Merge inlined styles
  mergeStylesheets: true,
  // Add noscript fallback
  noscriptFallback: true,
  // Fonts handling
  fonts: true,
  // Key selectors for above-the-fold content
  keyframes: 'critical',
  // Log level
  logLevel: 'info',
  // Additional selectors to always include (landing page critical elements)
  additionalStylesheets: [],
};

async function extractCriticalCSS() {
  console.log('🔍 Starting critical CSS extraction...');
  
  // Check if dist exists
  if (!fs.existsSync(distPath)) {
    console.error('❌ dist/ directory not found. Run build first.');
    process.exit(1);
  }
  
  // Read the original HTML
  let html = fs.readFileSync(indexPath, 'utf8');
  
  // Initialize critters
  const critters = new Critters(crittersConfig);
  
  try {
    // Process HTML with critters
    const processedHtml = await critters.process(html);
    
    // Calculate critical CSS size
    const styleMatch = processedHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    const criticalCSSSize = styleMatch ? styleMatch[1].length : 0;
    const criticalCSSKB = (criticalCSSSize / 1024).toFixed(2);
    
    // Verify size is under 14KB target
    if (criticalCSSSize > 14336) {
      console.warn(`⚠️  Critical CSS is ${criticalCSSKB}KB (target: <14KB)`);
      console.warn('   Consider reducing above-the-fold styles');
    } else {
      console.log(`✅ Critical CSS size: ${criticalCSSKB}KB (target: <14KB)`);
    }
    
    // Additional optimizations
    let optimizedHtml = processedHtml;
    
    // Remove Vite's blocking script tags (we defer them)
    optimizedHtml = optimizedHtml.replace(
      /<script type="module" crossorigin src="\/assets\/js\/[^"]+"><\/script>/g, 
      ''
    );
    
    // Remove blocking registerSW (already deferred in main.tsx)
    optimizedHtml = optimizedHtml.replace(
      /<script id="vite-plugin-pwa:register-sw" src="\/registerSW.js"><\/script>/g, 
      ''
    );
    
    // Find main bundle for deferred loading
    const jsDir = path.join(distPath, 'assets/js');
    if (fs.existsSync(jsDir)) {
      const jsFiles = fs.readdirSync(jsDir)
        .filter(f => f.startsWith('main-') && f.endsWith('.js'));
      const mainBundle = jsFiles.length > 0 ? jsFiles[0] : null;
      
      if (mainBundle) {
        // Remove any existing deferred scripts
        optimizedHtml = optimizedHtml.replace(
          /<script type="module">\s*requestIdleCallback[^<]+<\/script>/g, 
          ''
        );
        
        // Add deferred main bundle loading
        const deferredScript = `
    <script type="module">
      // Defer main bundle loading for instant first paint
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => import('/assets/js/${mainBundle}'), { timeout: 100 });
      } else {
        setTimeout(() => import('/assets/js/${mainBundle}'), 0);
      }
    </script>
  </body>`;
        optimizedHtml = optimizedHtml.replace('</body>', deferredScript);
        console.log(`✅ Main bundle deferred: ${mainBundle}`);
      }
    }
    
    // Add resource hints for critical resources
    const resourceHints = `
    <!-- Critical resource hints -->
    <link rel="modulepreload" href="/assets/js/vendor-react-*.js" />
    <link rel="modulepreload" href="/assets/js/vendor-router-*.js" />
  </head>`;
    
    // Only add if not already present
    if (!optimizedHtml.includes('modulepreload')) {
      // Find actual vendor files
      const jsDir = path.join(distPath, 'assets/js');
      if (fs.existsSync(jsDir)) {
        const vendorReact = fs.readdirSync(jsDir).find(f => f.startsWith('vendor-react-'));
        const vendorRouter = fs.readdirSync(jsDir).find(f => f.startsWith('vendor-router-'));
        
        if (vendorReact || vendorRouter) {
          let hints = '\n    <!-- Critical resource hints -->';
          if (vendorReact) {
            hints += `\n    <link rel="modulepreload" href="/assets/js/${vendorReact}" />`;
          }
          if (vendorRouter) {
            hints += `\n    <link rel="modulepreload" href="/assets/js/${vendorRouter}" />`;
          }
          hints += '\n  </head>';
          optimizedHtml = optimizedHtml.replace('</head>', hints);
          console.log('✅ Added modulepreload hints for vendor chunks');
        }
      }
    }
    
    // Write optimized HTML
    fs.writeFileSync(indexPath, optimizedHtml);
    
    console.log('✅ Critical CSS extraction complete!');
    console.log(`   Output: ${indexPath}`);
    
    return {
      success: true,
      criticalCSSSize: criticalCSSKB,
      underTarget: criticalCSSSize <= 14336
    };
    
  } catch (error) {
    console.error('❌ Critical CSS extraction failed:', error.message);
    
    // Fallback to simple extraction if critters fails
    console.log('⚠️  Falling back to simple CSS extraction...');
    return fallbackExtraction(html);
  }
}

/**
 * Fallback extraction method if critters fails
 */
function fallbackExtraction(html) {
  const cssFiles = fs.readdirSync(path.join(distPath, 'assets'))
    .filter(f => f.endsWith('.css'));
  
  if (cssFiles.length === 0) {
    console.error('❌ No CSS file found');
    return { success: false };
  }
  
  const cssPath = path.join(distPath, 'assets', cssFiles[0]);
  const css = fs.readFileSync(cssPath, 'utf8');
  
  // Extract first 14KB as critical CSS
  const criticalCSS = css.slice(0, 14336);
  const criticalCSSKB = (criticalCSS.length / 1024).toFixed(2);
  
  // Inline critical CSS
  let optimizedHtml = html.replace(
    '</head>',
    `<style>${criticalCSS}</style>
    <link rel="preload" href="/assets/${cssFiles[0]}" as="style" onload="this.onload=null;this.rel='stylesheet'">
    <noscript><link rel="stylesheet" href="/assets/${cssFiles[0]}"></noscript>
  </head>`
  );
  
  // Remove original CSS link
  optimizedHtml = optimizedHtml.replace(/<link[^>]*\.css[^>]*>/g, '');
  
  fs.writeFileSync(indexPath, optimizedHtml);
  
  console.log(`✅ Fallback critical CSS inlined: ${criticalCSSKB}KB`);
  
  return {
    success: true,
    criticalCSSSize: criticalCSSKB,
    underTarget: criticalCSS.length <= 14336,
    fallback: true
  };
}

// Run extraction
extractCriticalCSS()
  .then(result => {
    if (result.success) {
      console.log('\n📊 Summary:');
      console.log(`   Critical CSS: ${result.criticalCSSSize}KB`);
      console.log(`   Under 14KB target: ${result.underTarget ? '✅ Yes' : '❌ No'}`);
      if (result.fallback) {
        console.log('   Method: Fallback (simple extraction)');
      } else {
        console.log('   Method: Critters (above-the-fold analysis)');
      }
    }
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
