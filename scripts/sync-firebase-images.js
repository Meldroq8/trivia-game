#!/usr/bin/env node

import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Initialize Google Cloud Storage
const storage = new Storage();
const bucketName = 'lamah-357f3.appspot.com';

async function syncFirebaseImages() {
  try {
    console.log('🔥 Starting Firebase Storage image sync...');

    // Create directories
    const dirs = ['public/images/categories', 'public/images/questions'];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    });

    // Process category images
    console.log('📥 Downloading category images...');
    const [categoryFiles] = await storage.bucket(bucketName).getFiles({
      prefix: 'categories/'
    });

    let processedCount = 0;

    for (const file of categoryFiles) {
      if (file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
        const filename = path.basename(file.name);
        const baseName = filename.split('.')[0];

        console.log(`🖼️ Processing: ${filename}`);

        // Download original
        const tempPath = `temp_${filename}`;
        await file.download({ destination: tempPath });

        try {
          // Generate multiple sizes with ImageMagick
          execSync(`magick "${tempPath}" -resize 800x600^ -gravity center -extent 800x600 -quality 85 "public/images/categories/${baseName}_large.webp"`);
          execSync(`magick "${tempPath}" -resize 400x300^ -gravity center -extent 400x300 -quality 80 "public/images/categories/${baseName}_medium.webp"`);
          execSync(`magick "${tempPath}" -resize 150x113^ -gravity center -extent 150x113 -quality 75 "public/images/categories/${baseName}_thumb.webp"`);
          execSync(`magick "${tempPath}" -quality 90 "public/images/categories/${baseName}_original.webp"`);

          console.log(`✅ Generated 4 sizes for: ${filename}`);
          processedCount++;
        } catch (magickError) {
          console.warn(`⚠️ ImageMagick failed for ${filename}, trying simple copy:`, magickError.message);
          // Fallback: just copy the file
          fs.copyFileSync(tempPath, `public/images/categories/${filename}`);
        }

        // Clean up
        fs.unlinkSync(tempPath);
      }
    }

    // Process question images
    console.log('📥 Downloading question images...');
    const [questionFiles] = await storage.bucket(bucketName).getFiles({
      prefix: 'questions/'
    });

    for (const file of questionFiles) {
      if (file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
        const filename = path.basename(file.name);
        const baseName = filename.split('.')[0];

        console.log(`🖼️ Processing: ${filename}`);

        const tempPath = `temp_${filename}`;
        await file.download({ destination: tempPath });

        try {
          execSync(`magick "${tempPath}" -resize 600x400^ -gravity center -extent 600x400 -quality 85 "public/images/questions/${baseName}_large.webp"`);
          execSync(`magick "${tempPath}" -resize 300x200^ -gravity center -extent 300x200 -quality 80 "public/images/questions/${baseName}_medium.webp"`);
          execSync(`magick "${tempPath}" -resize 150x100^ -gravity center -extent 150x100 -quality 75 "public/images/questions/${baseName}_thumb.webp"`);
          execSync(`magick "${tempPath}" -quality 90 "public/images/questions/${baseName}_original.webp"`);

          console.log(`✅ Generated 4 sizes for: ${filename}`);
          processedCount++;
        } catch (magickError) {
          console.warn(`⚠️ ImageMagick failed for ${filename}, trying simple copy:`, magickError.message);
          fs.copyFileSync(tempPath, `public/images/questions/${filename}`);
        }

        fs.unlinkSync(tempPath);
      }
    }

    console.log(`🎉 Firebase Storage sync complete! Processed ${processedCount} images.`);

  } catch (error) {
    console.error('❌ Firebase Storage sync failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncFirebaseImages();
}

export { syncFirebaseImages };