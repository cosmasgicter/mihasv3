/**
 * Mobile Responsiveness Audit Script
 * Analyzes all pages for mobile responsiveness issues
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const MOBILE_BREAKPOINTS = {
  mobile: { min: 320, max: 767 },
  tablet: { min: 768, max: 1023 },
  desktop: { min: 1024, max: 9999 }
};

const ISSUES = {
  FIXED_WIDTH: 'Fixed width without responsive breakpoints',
  HORIZONTAL_SCROLL: 'Potential horizontal scroll (width > 100vw)',
  SMALL_TOUCH_TARGET: 'Touch target smaller than 44x44px',
  FIXED_FONT_SIZE: 'Fixed font size without responsive scaling',
  NO_VIEWPORT_META: 'Missing viewport meta tag',
  OVERFLOW_HIDDEN: 'Overflow hidden may hide content on mobile',
  ABSOLUTE_POSITIONING: 'Absolute positioning may break on mobile',
  LARGE_IMAGES: 'Large images without responsive sizing',
  COMPLEX_GRID: 'Complex grid layout without mobile fallback',
  MISSING_MOBILE_NAV: 'Navigation not optimized for mobile'
};

class ResponsivenessAuditor {
  constructor() {
    this.results = {
      student: [],
      admin: [],
      auth: [],
      public: [],
      summary: {
        totalPages: 0,
        pagesWithIssues: 0,
        criticalIssues: 0,
        warningIssues: 0
      }
    };
  }

  /**
   * Recursively find all .tsx files in a directory
   */
  findTsxFiles(dir, fileList = []) {
    const files = readdirSync(dir);
    
    files.forEach(file => {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      
      if (stat.isDirectory()) {
        this.findTsxFiles(filePath, fileList);
      } else if (file.endsWith('.tsx') && !file.includes('.bak') && !file.includes('.old')) {
        fileList.push(filePath);
      }
    });
    
    return fileList;
  }

  /**
   * Analyze a single file for responsiveness issues
   */
  analyzeFile(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const issues = [];
    const warnings = [];

    // Check for fixed widths without responsive breakpoints
    const fixedWidthRegex = /width:\s*['"]?\d+px['"]?/g;
    const fixedWidthMatches = content.match(fixedWidthRegex);
    if (fixedWidthMatches && fixedWidthMatches.length > 3) {
      // More than 3 fixed widths might indicate non-responsive design
      const hasResponsive = /sm:|md:|lg:|xl:|@media|useMediaQuery|useBreakpoint/.test(content);
      if (!hasResponsive) {
        issues.push({
          type: 'FIXED_WIDTH',
          severity: 'warning',
          message: `Found ${fixedWidthMatches.length} fixed width declarations without responsive breakpoints`,
          suggestion: 'Use Tailwind responsive classes (sm:, md:, lg:) or CSS media queries'
        });
      }
    }

    // Check for potential horizontal scroll
    const wideWidthRegex = /width:\s*['"]?(\d{4,})px['"]?/g;
    const wideWidthMatches = content.match(wideWidthRegex);
    if (wideWidthMatches) {
      issues.push({
        type: 'HORIZONTAL_SCROLL',
        severity: 'critical',
        message: `Found very wide fixed widths: ${wideWidthMatches.join(', ')}`,
        suggestion: 'Use max-width with percentage or viewport units'
      });
    }

    // Check for small touch targets
    const smallSizeRegex = /(width|height|w-|h-):\s*['"]?([1-3]?\d)px['"]?/g;
    const smallSizeMatches = content.match(smallSizeRegex);
    if (smallSizeMatches && smallSizeMatches.length > 5) {
      warnings.push({
        type: 'SMALL_TOUCH_TARGET',
        severity: 'warning',
        message: 'Multiple small dimensions found - verify touch targets are at least 44x44px',
        suggestion: 'Use min-w-11 min-h-11 (44px) for interactive elements on mobile'
      });
    }

    // Check for fixed font sizes
    const fixedFontRegex = /fontSize:\s*['"]?\d+px['"]?/g;
    const fixedFontMatches = content.match(fixedFontRegex);
    if (fixedFontMatches && fixedFontMatches.length > 5) {
      const hasResponsiveFonts = /text-xs|text-sm|text-base|text-lg|text-xl/.test(content);
      if (!hasResponsiveFonts) {
        warnings.push({
          type: 'FIXED_FONT_SIZE',
          severity: 'warning',
          message: `Found ${fixedFontMatches.length} fixed font sizes`,
          suggestion: 'Use Tailwind text utilities (text-sm, text-base, etc.) for responsive typography'
        });
      }
    }

    // Check for overflow hidden
    if (/overflow:\s*['"]?hidden['"]?/.test(content) || /overflow-hidden/.test(content)) {
      warnings.push({
        type: 'OVERFLOW_HIDDEN',
        severity: 'info',
        message: 'Uses overflow-hidden - verify content is not cut off on mobile',
        suggestion: 'Test on mobile devices to ensure no content is hidden'
      });
    }

    // Check for absolute positioning
    const absoluteRegex = /position:\s*['"]?absolute['"]?|absolute\s+/g;
    const absoluteMatches = content.match(absoluteRegex);
    if (absoluteMatches && absoluteMatches.length > 3) {
      warnings.push({
        type: 'ABSOLUTE_POSITIONING',
        severity: 'warning',
        message: `Found ${absoluteMatches.length} absolute positioned elements`,
        suggestion: 'Verify absolute positioning works on all screen sizes'
      });
    }

    // Check for complex grid layouts
    if (/grid-cols-\d+/.test(content)) {
      const hasResponsiveGrid = /grid-cols-1\s+.*?(sm|md|lg):grid-cols-/.test(content);
      if (!hasResponsiveGrid) {
        warnings.push({
          type: 'COMPLEX_GRID',
          severity: 'warning',
          message: 'Grid layout without mobile-first responsive breakpoints',
          suggestion: 'Start with grid-cols-1 and add sm:grid-cols-2, md:grid-cols-3, etc.'
        });
      }
    }

    // Check for mobile navigation patterns
    if (content.includes('nav') || content.includes('Navigation')) {
      const hasMobileNav = /hamburger|menu-icon|mobile.*menu|drawer|sidebar/i.test(content);
      const hasHiddenOnMobile = /hidden\s+.*?(sm|md|lg):block/.test(content);
      
      if (!hasMobileNav && !hasHiddenOnMobile) {
        warnings.push({
          type: 'MISSING_MOBILE_NAV',
          severity: 'warning',
          message: 'Navigation component may not be optimized for mobile',
          suggestion: 'Implement hamburger menu or mobile-friendly navigation pattern'
        });
      }
    }

    // Check for responsive image handling
    if (/<img|<Image/.test(content)) {
      const hasResponsiveImages = /w-full|max-w-|object-cover|object-contain/.test(content);
      if (!hasResponsiveImages) {
        warnings.push({
          type: 'LARGE_IMAGES',
          severity: 'info',
          message: 'Images without responsive sizing classes',
          suggestion: 'Add w-full, max-w-full, or object-cover for responsive images'
        });
      }
    }

    return { issues, warnings };
  }

  /**
   * Categorize file by type
   */
  categorizeFile(filePath) {
    if (filePath.includes('/student/')) return 'student';
    if (filePath.includes('/admin/')) return 'admin';
    if (filePath.includes('/auth/')) return 'auth';
    if (filePath.includes('/public/')) return 'public';
    return 'other';
  }

  /**
   * Run audit on all pages
   */
  audit() {
    console.log('🔍 Starting Mobile Responsiveness Audit...\n');

    const pagesDir = 'src/pages';
    const files = this.findTsxFiles(pagesDir);

    console.log(`Found ${files.length} page files to analyze\n`);

    files.forEach(filePath => {
      const relativePath = relative(process.cwd(), filePath);
      const { issues, warnings } = this.analyzeFile(filePath);
      const category = this.categorizeFile(filePath);

      this.results.summary.totalPages++;

      if (issues.length > 0 || warnings.length > 0) {
        this.results.summary.pagesWithIssues++;
        this.results.summary.criticalIssues += issues.filter(i => i.severity === 'critical').length;
        this.results.summary.warningIssues += issues.filter(i => i.severity === 'warning').length + warnings.length;

        const pageResult = {
          file: relativePath,
          issues: [...issues, ...warnings]
        };

        if (category === 'other') {
          // Add to most relevant category or create general category
          this.results.public.push(pageResult);
        } else {
          this.results[category].push(pageResult);
        }
      }
    });

    return this.results;
  }

  /**
   * Generate report
   */
  generateReport() {
    const report = [];
    
    report.push('# Mobile Responsiveness Audit Report');
    report.push('');
    report.push(`**Generated:** ${new Date().toISOString()}`);
    report.push('');
    
    report.push('## Summary');
    report.push('');
    report.push(`- **Total Pages Analyzed:** ${this.results.summary.totalPages}`);
    report.push(`- **Pages with Issues:** ${this.results.summary.pagesWithIssues}`);
    report.push(`- **Critical Issues:** ${this.results.summary.criticalIssues}`);
    report.push(`- **Warning Issues:** ${this.results.summary.warningIssues}`);
    report.push('');

    // Student pages
    if (this.results.student.length > 0) {
      report.push('## Student Pages');
      report.push('');
      this.results.student.forEach(page => {
        report.push(`### ${page.file}`);
        report.push('');
        page.issues.forEach(issue => {
          const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
          report.push(`${icon} **${issue.type}** (${issue.severity})`);
          report.push(`   - ${issue.message}`);
          report.push(`   - *Suggestion:* ${issue.suggestion}`);
          report.push('');
        });
      });
    }

    // Admin pages
    if (this.results.admin.length > 0) {
      report.push('## Admin Pages');
      report.push('');
      this.results.admin.forEach(page => {
        report.push(`### ${page.file}`);
        report.push('');
        page.issues.forEach(issue => {
          const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
          report.push(`${icon} **${issue.type}** (${issue.severity})`);
          report.push(`   - ${issue.message}`);
          report.push(`   - *Suggestion:* ${issue.suggestion}`);
          report.push('');
        });
      });
    }

    // Auth pages
    if (this.results.auth.length > 0) {
      report.push('## Auth Pages');
      report.push('');
      this.results.auth.forEach(page => {
        report.push(`### ${page.file}`);
        report.push('');
        page.issues.forEach(issue => {
          const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
          report.push(`${icon} **${issue.type}** (${issue.severity})`);
          report.push(`   - ${issue.message}`);
          report.push(`   - *Suggestion:* ${issue.suggestion}`);
          report.push('');
        });
      });
    }

    // Public pages
    if (this.results.public.length > 0) {
      report.push('## Public Pages');
      report.push('');
      this.results.public.forEach(page => {
        report.push(`### ${page.file}`);
        report.push('');
        page.issues.forEach(issue => {
          const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
          report.push(`${icon} **${issue.type}** (${issue.severity})`);
          report.push(`   - ${issue.message}`);
          report.push(`   - *Suggestion:* ${issue.suggestion}`);
          report.push('');
        });
      });
    }

    report.push('## Recommendations');
    report.push('');
    report.push('### Priority Actions');
    report.push('');
    report.push('1. **Fix Critical Issues First** - Address horizontal scroll and very wide fixed widths');
    report.push('2. **Implement Mobile-First Approach** - Start with mobile layout, then enhance for larger screens');
    report.push('3. **Use Tailwind Responsive Classes** - Leverage sm:, md:, lg:, xl: prefixes');
    report.push('4. **Test on Real Devices** - Verify fixes on actual mobile devices');
    report.push('5. **Ensure Touch Targets** - All interactive elements should be at least 44x44px');
    report.push('');
    report.push('### Mobile-First Best Practices');
    report.push('');
    report.push('- Start with single column layouts (grid-cols-1)');
    report.push('- Use responsive breakpoints: sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4');
    report.push('- Implement hamburger menu for mobile navigation');
    report.push('- Use relative units (%, rem, em) instead of fixed px');
    report.push('- Test with Chrome DevTools mobile emulation');
    report.push('- Verify on real devices (iOS and Android)');
    report.push('');

    return report.join('\n');
  }

  /**
   * Save report to file
   */
  saveReport(filename = 'mobile-responsiveness-audit-report.md') {
    const report = this.generateReport();
    writeFileSync(filename, report);
    console.log(`\n✅ Report saved to ${filename}`);
  }

  /**
   * Print summary to console
   */
  printSummary() {
    console.log('\n📊 Audit Summary');
    console.log('================');
    console.log(`Total Pages: ${this.results.summary.totalPages}`);
    console.log(`Pages with Issues: ${this.results.summary.pagesWithIssues}`);
    console.log(`Critical Issues: ${this.results.summary.criticalIssues}`);
    console.log(`Warning Issues: ${this.results.summary.warningIssues}`);
    console.log('');

    if (this.results.summary.criticalIssues > 0) {
      console.log('🔴 Critical issues found! These should be addressed immediately.');
    } else if (this.results.summary.warningIssues > 0) {
      console.log('⚠️  Warning issues found. Review and address as needed.');
    } else {
      console.log('✅ No major responsiveness issues detected!');
    }
  }
}

// Run audit
const auditor = new ResponsivenessAuditor();
auditor.audit();
auditor.printSummary();
auditor.saveReport('mobile-responsiveness-audit-report.md');
