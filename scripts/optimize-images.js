import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imageDirs = [
  'public/images/logos',
  'src/assets/images'
];

async function optimizeImages() {
  let totalSaved = 0;
  let filesProcessed = 0;

  for (const dir of imageDirs) {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      if (!/\.(png|jpg|jpeg)$/i.test(file)) continue;

      const inputPath = path.join(dirPath, file);
      const outputPath = path.join(dirPath, file.replace(/\.(png|jpg|jpeg)$/i, '.webp'));
      
      const originalSize = fs.statSync(inputPath).size;
      
      await sharp(inputPath)
        .webp({ quality: 85 })
        .toFile(outputPath);
      
      const newSize = fs.statSync(outputPath).size;
      const saved = originalSize - newSize;
      totalSaved += saved;
      filesProcessed++;
      
      console.log(`✓ ${file} → ${path.basename(outputPath)} (${(saved / 1024).toFixed(1)}KB saved)`);
    }
  }

  console.log(`\n✅ Optimized ${filesProcessed} images`);
  console.log(`💾 Total saved: ${(totalSaved / 1024).toFixed(1)}KB`);
}

optimizeImages().catch(console.error);
