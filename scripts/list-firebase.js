#!/usr/bin/env node

import { Storage } from '@google-cloud/storage';

// Initialize Google Cloud Storage
const storage = new Storage({
  keyFilename: 'service-account.json',
  projectId: 'lamah-357f3'
});
const bucketName = 'lamah-357f3.firebasestorage.app';

async function listFirebaseFiles() {
  try {
    console.log('🔥 Listing Firebase Storage files...');

    const [files] = await storage.bucket(bucketName).getFiles();

    console.log('\n📁 All files in Firebase Storage:');
    for (const file of files) {
      console.log(`  - ${file.name}`);
    }

    console.log('\n📷 Category images:');
    const [categoryFiles] = await storage.bucket(bucketName).getFiles({
      prefix: 'categories/'
    });
    for (const file of categoryFiles) {
      if (file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
        console.log(`  - ${file.name}`);
      }
    }

    console.log('\n❓ Question images:');
    const [questionFiles] = await storage.bucket(bucketName).getFiles({
      prefix: 'questions/'
    });
    for (const file of questionFiles) {
      if (file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
        console.log(`  - ${file.name}`);
      }
    }

  } catch (error) {
    console.error('❌ Failed to list files:', error);
  }
}

listFirebaseFiles();