#!/usr/bin/env node

/**
 * Edge Function Performance Audit Script
 * 
 * Audits Cloudflare Pages Functions for:
 * - CPU time < 50ms target
 * - Memory usage < 128MB target
 * - Code complexity
 * - Potential optimizations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FUNCTIONS_DIR = path.join(__dirname, '..', 'functions');
const CPU_TIME_TARGET_MS = 50;
const MEMORY_TARGET_MB = 128;

// Performance thresholds
const THRESHOLDS = {
  fileSize: 100 * 1024, // 100KB
  complexity: 20, // Cyclomatic complexity
  dependencies: 10, // Number of imports
  nestedCallbacks: 3, // Max nested callbacks
};

class FunctionAuditor {
  constructor() {
    this.results = [];
    this.warnings = [];
    this.errors = [];
  }

  /**
   * Analyze a single function file
   */
  analyzeFunction(filePath, relativePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);
    
    const analysis = {
      path: relativePath,
      size: stats.size,
      sizeKB: (stats.size / 1024).toFixed(2),
      lines: content.split('\n').length,
      issues: [],
      suggestions: [],
      score: 100,
    };

    // Check file size
    if (stats.size > THRESHOLDS.fileSize) {
      analysis.issues.push(`Large file size: ${analysis.sizeKB}KB (target: <100KB)`);
      analysis.score -= 10;
    }

    // Count imports/dependencies
    const imports = content.match(/^import .+ from .+$/gm) || [];
    const requires = content.match(/require\(['"]/g) || [];
    const totalDeps = imports.length + requires.length;
    
    if (totalDeps > THRESHOLDS.dependencies) {
      analysis.issues.push(`Many dependencies: ${totalDeps} (target: <${THRESHOLDS.dependencies})`);
      analysis.score -= 5;
      analysis.suggestions.push('Consider lazy loading or splitting dependencies');
    }

    // Check for synchronous operations
    const syncOps = [
      { pattern: /fs\.readFileSync/g, name: 'fs.readFileSync' },
      { pattern: /fs\.writeFileSync/g, name: 'fs.writeFileSync' },
      { pattern: /JSON\.parse\([^)]{100,}\)/g, name: 'Large JSON.parse' },
    ];

    syncOps.forEach(({ pattern, name }) => {
      const matches = content.match(pattern);
      if (matches) {
        analysis.issues.push(`Synchronous operation: ${name} (${matches.length} occurrences)`);
        analysis.score -= 5;
        analysis.suggestions.push(`Replace ${name} with async alternative`);
      }
    });

    // Check for potential memory issues
    const memoryPatterns = [
      { pattern: /new Array\(\d{4,}\)/g, name: 'Large array allocation' },
      { pattern: /\.map\(.*\.map\(/g, name: 'Nested map operations' },
      { pattern: /while\s*\(true\)/g, name: 'Infinite loop' },
    ];

    memoryPatterns.forEach(({ pattern, name }) => {
      if (pattern.test(content)) {
        analysis.issues.push(`Memory concern: ${name}`);
        analysis.score -= 10;
      }
    });

    // Check for database query optimization
    if (content.includes('supabase')) {
      const selectAll = content.match(/\.select\(['"]?\*['"]?\)/g);
      if (selectAll && selectAll.length > 0) {
        analysis.suggestions.push('Use specific column selection instead of SELECT *');
        analysis.score -= 3;
      }

      const noLimit = !content.includes('.limit(') && !content.includes('.range(');
      if (noLimit && content.includes('.select(')) {
        analysis.suggestions.push('Add .limit() or .range() to queries to prevent large result sets');
        analysis.score -= 5;
      }
    }

    // Check for error handling
    const hasTryCatch = content.includes('try') && content.includes('catch');
    if (!hasTryCatch && content.includes('await')) {
      analysis.issues.push('Missing error handling for async operations');
      analysis.score -= 5;
    }

    // Check for CORS headers
    if (content.includes('onRequest') && !content.includes('Access-Control-Allow-Origin')) {
      analysis.suggestions.push('Consider adding CORS headers for API endpoints');
    }

    // Check for response caching
    if (content.includes('onRequestGet') && !content.includes('Cache-Control')) {
      analysis.suggestions.push('Consider adding Cache-Control headers for GET requests');
    }

    // Estimate complexity (simple heuristic)
    const complexity = this.estimateComplexity(content);
    if (complexity > THRESHOLDS.complexity) {
      analysis.issues.push(`High complexity: ${complexity} (target: <${THRESHOLDS.complexity})`);
      analysis.score -= 10;
      analysis.suggestions.push('Consider breaking into smaller functions');
    }

    analysis.complexity = complexity;
    analysis.dependencies = totalDeps;

    return analysis;
  }

  /**
   * Simple complexity estimation
   */
  estimateComplexity(content) {
    let complexity = 1; // Base complexity

    // Count decision points
    const patterns = [
      /if\s*\(/g,
      /else\s+if/g,
      /\?\s*.*\s*:/g, // Ternary
      /case\s+/g,
      /while\s*\(/g,
      /for\s*\(/g,
      /catch\s*\(/g,
      /&&/g,
      /\|\|/g,
    ];

    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });

    return complexity;
  }

  /**
   * Recursively scan functions directory
   */
  scanDirectory(dir, baseDir = dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          this.scanDirectory(fullPath, baseDir);
        }
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        // Skip middleware and lib files for now (analyze separately)
        if (!entry.name.startsWith('_')) {
          try {
            const analysis = this.analyzeFunction(fullPath, relativePath);
            this.results.push(analysis);
          } catch (error) {
            this.errors.push({
              path: relativePath,
              error: error.message,
            });
          }
        }
      }
    }
  }

  /**
   * Generate audit report
   */
  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('CLOUDFLARE PAGES FUNCTIONS PERFORMANCE AUDIT');
    console.log('='.repeat(80) + '\n');

    console.log(`Total functions analyzed: ${this.results.length}`);
    console.log(`Errors encountered: ${this.errors.length}\n`);

    // Sort by score (lowest first - most issues)
    const sortedResults = [...this.results].sort((a, b) => a.score - b.score);

    // Summary statistics
    const avgScore = this.results.reduce((sum, r) => sum + r.score, 0) / this.results.length;
    const avgSize = this.results.reduce((sum, r) => sum + r.size, 0) / this.results.length;
    const avgComplexity = this.results.reduce((sum, r) => sum + r.complexity, 0) / this.results.length;

    console.log('SUMMARY STATISTICS:');
    console.log(`  Average Score: ${avgScore.toFixed(1)}/100`);
    console.log(`  Average Size: ${(avgSize / 1024).toFixed(2)}KB`);
    console.log(`  Average Complexity: ${avgComplexity.toFixed(1)}`);
    console.log('');

    // Functions needing attention (score < 80)
    const needsAttention = sortedResults.filter(r => r.score < 80);
    if (needsAttention.length > 0) {
      console.log(`⚠️  FUNCTIONS NEEDING ATTENTION (${needsAttention.length}):\n`);
      
      needsAttention.forEach(result => {
        console.log(`📄 ${result.path}`);
        console.log(`   Score: ${result.score}/100 | Size: ${result.sizeKB}KB | Complexity: ${result.complexity}`);
        
        if (result.issues.length > 0) {
          console.log('   Issues:');
          result.issues.forEach(issue => console.log(`     ❌ ${issue}`));
        }
        
        if (result.suggestions.length > 0) {
          console.log('   Suggestions:');
          result.suggestions.forEach(suggestion => console.log(`     💡 ${suggestion}`));
        }
        console.log('');
      });
    }

    // Top performers
    const topPerformers = sortedResults.filter(r => r.score >= 95).slice(0, 5);
    if (topPerformers.length > 0) {
      console.log(`✅ TOP PERFORMERS (${topPerformers.length}):\n`);
      topPerformers.forEach(result => {
        console.log(`   ${result.path} - Score: ${result.score}/100`);
      });
      console.log('');
    }

    // Errors
    if (this.errors.length > 0) {
      console.log('❌ ERRORS:\n');
      this.errors.forEach(error => {
        console.log(`   ${error.path}: ${error.error}`);
      });
      console.log('');
    }

    // Recommendations
    console.log('GENERAL RECOMMENDATIONS:\n');
    console.log('  1. Target CPU time: <50ms per request');
    console.log('  2. Target memory usage: <128MB');
    console.log('  3. Use async operations for I/O');
    console.log('  4. Implement proper error handling');
    console.log('  5. Add caching headers for GET requests');
    console.log('  6. Limit database query result sets');
    console.log('  7. Minimize dependencies and bundle size');
    console.log('  8. Use specific column selection in queries');
    console.log('');

    console.log('='.repeat(80) + '\n');

    // Return summary for programmatic use
    return {
      totalFunctions: this.results.length,
      averageScore: avgScore,
      needsAttention: needsAttention.length,
      errors: this.errors.length,
      results: sortedResults,
    };
  }
}

// Run audit
const auditor = new FunctionAuditor();
auditor.scanDirectory(FUNCTIONS_DIR);
const summary = auditor.generateReport();

// Exit with error code if there are critical issues
const criticalIssues = summary.results.filter(r => r.score < 60).length;
if (criticalIssues > 0) {
  console.log(`⚠️  ${criticalIssues} function(s) have critical performance issues (score < 60)\n`);
  process.exit(1);
}

process.exit(0);
