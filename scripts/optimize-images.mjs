#!/usr/bin/env node
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.join(__dirname, '../public/images/accreditation');

const images = [
  { input: 'eczlogo.png', width: 168, height: 168 },
  { input: 'unza.jpg', width: 168, height: 168 },
  { input: 'hpc_logobig.png', width: 168, height: 84 },
  { input: 'GNCLogo.png', width: 168, height: 138 }
];

console.log('🖼️  Optimizing images...');

for (const img of images) {
  const inputPath = path.join(imagesDir, img.input);
  const outputPath = inputPath.replace(/\.(png|jpg)$/, '.webp');
  
  if (!fs.existsSync(inputPath)) {
    console.log(`⚠️  ${img.input} not found, skipping`);
    continue;
  }
  
  await sharp(inputPath)
    .resize(img.width, img.height, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(outputPath);
  
  const originalSize = fs.statSync(inputPath).size;
  const newSize = fs.statSync(outputPath).size;
  const saved = ((originalSize - newSize) / originalSize * 100).toFixed(1);
  
  console.log(`✅ ${img.input} → ${path.basename(outputPath)} (${saved}% smaller)`);
}

console.log('✅ Image optimization complete!');
