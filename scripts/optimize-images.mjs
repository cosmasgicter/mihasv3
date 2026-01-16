#!/usr/bin/env node
/**
 * Image Optimization Script
 * 
 * This script:
 * 1. Converts images to WebP format
 * 2. Generates multiple sizes for responsive images
 * 3. Creates blur placeholders for lazy loading
 * 4. Compresses images for optimal file size
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');
const imagesDir = path.join(publicDir, 'images');

// Configuration for different image types
const imageConfigs = {
  accreditation: {
    dir: 'accreditation',
    images: [
      { input: 'eczlogo.png', maxWidth: 168, maxHeight: 168 },
      { input: 'unza.jpg', maxWidth: 168, maxHeight: 168 },
      { input: 'hpc_logobig.png', maxWidth: 168, maxHeight: 84 },
      { input: 'GNCLogo.png', maxWidth: 168, maxHeight: 138 }
    ],
    quality: 85
  },
  logos: {
    dir: 'logos',
    images: [
      { input: 'mihas-logo.png', maxWidth: 200, maxHeight: 80 },
      { input: 'katc-logo.png', maxWidth: 200, maxHeight: 80 }
    ],
    quality: 90
  },
  programs: {
    dir: 'programs',
    images: [
      { input: 'mihas-campus.webp', maxWidth: 800, maxHeight: 600 },
      { input: 'katc-campus.webp', maxWidth: 800, maxHeight: 600 }
    ],
    quality: 80,
    generateSizes: [320, 640, 768, 1024]
  }
};

// WebP quality settings
const WEBP_QUALITY = 85;
const BLUR_PLACEHOLDER_SIZE = 10;

/**
 * Generate a blur placeholder for an image
 */
async function generateBlurPlaceholder(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      .resize(BLUR_PLACEHOLDER_SIZE, BLUR_PLACEHOLDER_SIZE, { fit: 'inside' })
      .blur(5)
      .webp({ quality: 20 })
      .toFile(outputPath);
    return true;
  } catch (error) {
    console.error(`Error generating blur placeholder: ${error.message}`);
    return false;
  }
}

/**
 * Convert image to WebP format
 */
async function convertToWebP(inputPath, outputPath, options = {}) {
  const { maxWidth, maxHeight, quality = WEBP_QUALITY } = options;
  
  try {
    let pipeline = sharp(inputPath);
    
    if (maxWidth || maxHeight) {
      pipeline = pipeline.resize(maxWidth, maxHeight, { 
        fit: 'inside', 
        withoutEnlargement: true 
      });
    }
    
    await pipeline.webp({ quality }).toFile(outputPath);
    return true;
  } catch (error) {
    console.error(`Error converting to WebP: ${error.message}`);
    return false;
  }
}

/**
 * Generate multiple sizes for responsive images
 */
async function generateResponsiveSizes(inputPath, baseName, outputDir, sizes, quality = WEBP_QUALITY) {
  const results = [];
  
  for (const width of sizes) {
    const outputPath = path.join(outputDir, `${baseName}-${width}w.webp`);
    
    try {
      await sharp(inputPath)
        .resize(width, null, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toFile(outputPath);
      
      const stats = fs.statSync(outputPath);
      results.push({ width, size: stats.size, path: outputPath });
    } catch (error) {
      console.error(`Error generating ${width}w size: ${error.message}`);
    }
  }
  
  return results;
}

/**
 * Get file size in human readable format
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Process a single image configuration
 */
async function processImageConfig(config) {
  const { dir, images, quality = WEBP_QUALITY, generateSizes } = config;
  const dirPath = path.join(imagesDir, dir);
  
  console.log(`\n📁 Processing ${dir}/`);
  
  for (const img of images) {
    const inputPath = path.join(dirPath, img.input);
    
    if (!fs.existsSync(inputPath)) {
      console.log(`  ⚠️  ${img.input} not found, skipping`);
      continue;
    }
    
    const originalSize = fs.statSync(inputPath).size;
    const baseName = path.basename(img.input, path.extname(img.input));
    
    // Convert to WebP
    const webpPath = path.join(dirPath, `${baseName}.webp`);
    const webpSuccess = await convertToWebP(inputPath, webpPath, {
      maxWidth: img.maxWidth,
      maxHeight: img.maxHeight,
      quality
    });
    
    if (webpSuccess) {
      const newSize = fs.statSync(webpPath).size;
      const saved = ((originalSize - newSize) / originalSize * 100).toFixed(1);
      console.log(`  ✅ ${img.input} → ${baseName}.webp (${formatFileSize(originalSize)} → ${formatFileSize(newSize)}, ${saved}% smaller)`);
    }
    
    // Generate responsive sizes if configured
    if (generateSizes && generateSizes.length > 0) {
      const responsiveResults = await generateResponsiveSizes(
        inputPath, 
        baseName, 
        dirPath, 
        generateSizes, 
        quality
      );
      
      for (const result of responsiveResults) {
        console.log(`    📐 ${baseName}-${result.width}w.webp (${formatFileSize(result.size)})`);
      }
    }
    
    // Generate blur placeholder
    const blurPath = path.join(dirPath, `${baseName}-blur.webp`);
    const blurSuccess = await generateBlurPlaceholder(inputPath, blurPath);
    
    if (blurSuccess) {
      const blurSize = fs.statSync(blurPath).size;
      console.log(`    🔵 ${baseName}-blur.webp (${formatFileSize(blurSize)} blur placeholder)`);
    }
  }
}

/**
 * Create placeholder SVG if it doesn't exist
 */
function createPlaceholderSVG() {
  const placeholderPath = path.join(imagesDir, 'placeholder.svg');
  
  if (!fs.existsSync(placeholderPath)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#e2e8f0"/>
  <text x="50" y="50" text-anchor="middle" dominant-baseline="middle" fill="#94a3b8" font-family="system-ui" font-size="12">
    Image
  </text>
</svg>`;
    
    fs.writeFileSync(placeholderPath, svg);
    console.log('✅ Created placeholder.svg');
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🖼️  Starting image optimization...\n');
  
  // Ensure images directory exists
  if (!fs.existsSync(imagesDir)) {
    console.error('❌ Images directory not found:', imagesDir);
    process.exit(1);
  }
  
  // Create placeholder if needed
  createPlaceholderSVG();
  
  // Process each image configuration
  for (const [name, config] of Object.entries(imageConfigs)) {
    await processImageConfig(config);
  }
  
  console.log('\n✅ Image optimization complete!');
}

main().catch(console.error);
