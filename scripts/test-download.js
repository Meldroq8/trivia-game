#!/usr/bin/env node

import { Storage } from '@google-cloud/storage';

// Initialize Google Cloud Storage
const storage = new Storage({
  keyFilename: 'service-account.json',
  projectId: 'lamah-357f3'
});

async function testDownload() {
  try {
    console.log('🔍 Testing Firebase Storage connection...');

    // Try both bucket names
    const buckets = [
      'lamah-357f3.firebasestorage.app',
      'lamah-357f3.appspot.com',
      'gs://lamah-357f3.appspot.com'
    ];

    for (const bucketName of buckets) {
      console.log(`\n📍 Testing bucket: ${bucketName}`);

      try {
        const [files] = await storage.bucket(bucketName).getFiles({
          prefix: 'categories/',
          maxResults: 1
        });

        if (files.length > 0) {
          console.log(`✅ Found files in bucket: ${bucketName}`);
          console.log(`📁 First file: ${files[0].name}`);

          // Try to download one file
          const testFile = files[0];
          const fileName = testFile.name.split('/').pop();
          const destination = `test-${fileName}`;

          console.log(`🔽 Downloading ${testFile.name} to ${destination}...`);
          await testFile.download({ destination });
          console.log(`✅ Successfully downloaded: ${destination}`);
          break;
        } else {
          console.log(`❌ No files found in bucket: ${bucketName}`);
        }
      } catch (error) {
        console.log(`❌ Error with bucket ${bucketName}:`, error.message);
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDownload();