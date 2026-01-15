/**
 * Mobile Layout Fixes Script
 * Automatically fixes common mobile responsiveness issues
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

class MobileFixer {
  constructor() {
    this.fixes = {
      gridLayouts: 0,
      touchTargets: 0,
      fontSizes: 0,
      overflowIssues: 0
    };
  }

  /**
   * Find all .tsx files recursively
   */
  findTsxFiles(dir, fileList = []) {
    const files = readdirSync(dir);
    
    files.forEach(file => {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      
      if (stat.isDirectory() && !file.includes('node_modules') && !file.includes('.git')) {
        this.findTsxFiles(filePath, fileList);
      } else if (file.endsWith('.tsx') && !file.includes('.bak') && !file.includes('.old')) {
        fileList.push(filePath);
      }
    });
    
    return fileList;
  }

  /**
   * Fix grid layouts to be mobile-first
   */
  fixGridLayouts(content) {
    let modified = content;
    let changesMade = false;

    // Pattern: grid gap-X lg:grid-cols-Y (missing mobile-first)
    const pattern1 = /className="([^"]*?)grid\s+gap-\d+\s+lg:grid-cols-\d+([^"]*?)"/g;
    modified = modified.replace(pattern1, (match, before, after) => {
      if (!before.includes('grid-cols-1') && !before.includes('grid-cols-')) {
        changesMade = true;
        this.fixes.gridLayouts++;
        return `className="${before}grid grid-cols-1 gap-${match.match(/gap-(\d+)/)[1]} lg:grid-cols-${match.match(/lg:grid-cols-(\d+)/)[1]}${after}"`;
      }
      return match;
    });

    // Pattern: grid gap-X md:grid-cols-Y (missing mobile-first)
    const pattern2 = /className="([^"]*?)grid\s+gap-\d+\s+md:grid-cols-\d+([^"]*?)"/g;
    modified = modified.replace(pattern2, (match, before, after) => {
      if (!before.includes('grid-cols-1') && !before.includes('grid-cols-')) {
        changesMade = true;
        this.fixes.gridLayouts++;
        return `className="${before}grid grid-cols-1 gap-${match.match(/gap-(\d+)/)[1]} md:grid-cols-${match.match(/md:grid-cols-(\d+)/)[1]}${after}"`;
      }
      return match;
    });

    return { content: modified, changed: changesMade };
  }

  /**
   * Ensure touch targets are at least 44x44px
   */
  fixTouchTargets(content) {
    let modified = content;
    let changesMade = false;

    // Add min-w-11 min-h-11 (44px) to buttons without minimum size
    const buttonPattern = /<button([^>]*?)className="([^"]*?)"([^>]*?)>/g;
    modified = modified.replace(buttonPattern, (match, before, className, after) => {
      if (!className.includes('min-w-') && !className.includes('min-h-') && 
          (className.includes('p-1') || className.includes('p-2'))) {
        changesMade = true;
        this.fixes.touchTargets++;
        return `<button${before}className="${className} min-w-11 min-h-11"${after}>`;
      }
      return match;
    });

    return { content: modified, changed: changesMade };
  }

  /**
   * Fix font sizes to use responsive utilities
   */
  fixFontSizes(content) {
    let modified = content;
    let changesMade = false;

    // Replace fixed fontSize with Tailwind classes
    const fontSizePattern = /fontSize:\s*['"]?(\d+)px['"]?/g;
    const matches = content.match(fontSizePattern);
    
    if (matches && matches.length > 5) {
      // Only suggest fix, don't auto-replace as it requires manual review
      console.log('  ⚠️  Found multiple fixed font sizes - consider using Tailwind text utilities');
    }

    return { content: modified, changed: changesMade };
  }

  /**
   * Add responsive padding/margin
   */
  fixSpacing(content) {
    let modified = content;
    let changesMade = false;

    // Pattern: p-8 without responsive variants
    const spacingPattern = /className="([^"]*?)(p|m|px|py|mx|my)-(\d+)([^"]*?)"/g;
    modified = modified.replace(spacingPattern, (match, before, type, size, after) => {
      const sizeNum = parseInt(size);
      if (sizeNum >= 8 && !match.includes('sm:') && !match.includes('md:')) {
        // Large spacing without responsive variants
        const smallerSize = Math.max(4, Math.floor(sizeNum / 2));
        changesMade = true;
        return `className="${before}${type}-${smallerSize} sm:${type}-${size}${after}"`;
      }
      return match;
    });

    return { content: modified, changed: changesMade };
  }

  /**
   * Process a single file
   */
  processFile(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileChanged = false;

    // Apply fixes
    const gridFix = this.fixGridLayouts(modified);
    if (gridFix.changed) {
      modified = gridFix.content;
      fileChanged = true;
    }

    const touchFix = this.fixTouchTargets(modified);
    if (touchFix.changed) {
      modified = touchFix.content;
      fileChanged = true;
    }

    const fontFix = this.fixFontSizes(modified);
    if (fontFix.changed) {
      modified = fontFix.content;
      fileChanged = true;
    }

    const spacingFix = this.fixSpacing(modified);
    if (spacingFix.changed) {
      modified = spacingFix.content;
      fileChanged = true;
    }

    // Write back if changed
    if (fileChanged) {
      writeFileSync(filePath, modified);
      console.log(`  ✅ Fixed: ${filePath}`);
    }

    return fileChanged;
  }

  /**
   * Run fixes on all pages
   */
  run() {
    console.log('🔧 Starting Mobile Layout Fixes...\n');

    const pagesDir = 'src/pages';
    const files = this.findTsxFiles(pagesDir);

    console.log(`Found ${files.length} page files to process\n`);

    let filesModified = 0;
    files.forEach(filePath => {
      if (this.processFile(filePath)) {
        filesModified++;
      }
    });

    console.log('\n📊 Fix Summary');
    console.log('==============');
    console.log(`Files Modified: ${filesModified}`);
    console.log(`Grid Layouts Fixed: ${this.fixes.gridLayouts}`);
    console.log(`Touch Targets Fixed: ${this.fixes.touchTargets}`);
    console.log(`Font Sizes Fixed: ${this.fixes.fontSizes}`);
    console.log(`Spacing Fixed: ${this.fixes.overflowIssues}`);
    console.log('');

    if (filesModified > 0) {
      console.log('✅ Mobile layout fixes applied successfully!');
      console.log('⚠️  Please review changes and test on mobile devices.');
    } else {
      console.log('✅ No automatic fixes needed - layouts are already mobile-friendly!');
    }
  }
}

// Run fixer
const fixer = new MobileFixer();
fixer.run();
