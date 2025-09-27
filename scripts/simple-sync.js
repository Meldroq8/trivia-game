#!/usr/bin/env node

import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

// Initialize Google Cloud Storage
const storage = new Storage({
  keyFilename: 'service-account.json',
  projectId: 'lamah-357f3'
});
const bucketName = 'lamah-357f3.firebasestorage.app';

async function simpleSyncFirebaseImages() {
  try {
    console.log('🔥 Starting simple Firebase Storage image sync...');
    console.log(`📍 Using bucket: ${bucketName}`);

    // Create directories
    const dirs = ['public/images/categories', 'public/images/questions'];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      } else {
        console.log(`📁 Directory exists: ${dir}`);
      }
    });

    // Process category images
    console.log('📥 Downloading category images...');

    try {
      const [categoryFiles] = await storage.bucket(bucketName).getFiles({
        prefix: 'categories/'
      });

      console.log(`📊 Found ${categoryFiles.length} files in categories/ folder`);

      let processedCount = 0;

      for (const file of categoryFiles) {
        console.log(`🔍 Checking file: ${file.name}`);

        if (file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
          const filename = path.basename(file.name);

          // Use URL-encoded filename to avoid Arabic character issues in file systems
          const safeFilename = encodeURIComponent(filename).replace(/%/g, '_');

          console.log(`🖼️ Downloading: ${filename} -> ${safeFilename}`);

          // Download with URL-encoded filename for compatibility
          const outputPath = `public/images/categories/${safeFilename}`;

          try {
            await file.download({ destination: outputPath });
            console.log(`✅ Downloaded: ${filename} as ${safeFilename}`);
            processedCount++;
          } catch (downloadError) {
            console.error(`❌ Failed to download ${filename}:`, downloadError.message);
          }
        } else {
          console.log(`⏭️ Skipping non-image file: ${file.name}`);
        }
      }

      console.log(`📊 Processed ${processedCount} category images`);
    } catch (listError) {
      console.error('❌ Failed to list category files:', listError.message);
    }

    // Process question images
    console.log('📥 Downloading question images...');
    const [questionFiles] = await storage.bucket(bucketName).getFiles({
      prefix: 'questions/'
    });

    for (const file of questionFiles) {
      if (file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
        const filename = path.basename(file.name);

        console.log(`🖼️ Downloading: ${filename}`);

        const outputPath = `public/images/questions/${filename}`;
        await file.download({ destination: outputPath });

        console.log(`✅ Downloaded: ${filename}`);
        processedCount++;
      }
    }

    console.log(`🎉 Simple Firebase Storage sync complete! Downloaded ${processedCount} images.`);

  } catch (error) {
    console.error('❌ Firebase Storage sync failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  simpleSyncFirebaseImages();
}

export { simpleSyncFirebaseImages };