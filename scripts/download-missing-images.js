#!/usr/bin/env node

import https from 'https';
import fs from 'fs';
import path from 'path';

// List of missing images we need to download from the console output
const missingImages = [
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/lamah-357f3.firebasestorage.app/o/categories%2Fcategory_%D8%A3%D8%B9%D9%84%D8%A7%D9%85_1758937981500.webp?alt=media&token=56d56812-17f5-478a-a41c-ce7ad8fa72a2',
    filename: 'category_أعلام_1758937981500.webp'
  },
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/lamah-357f3.firebasestorage.app/o/categories%2Fcategory_%D8%A7%D8%BA%D8%A7%D9%86%D9%8A_%D8%A7%D8%AC%D9%86%D8%A8%D9%8A%D8%A9_1758937999337.webp?alt=media&token=7ffea44f-d7a3-4b6c-b7b9-38da21441d72',
    filename: 'category_اغاني_اجنبية_1758937999337.webp'
  },
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/lamah-357f3.firebasestorage.app/o/categories%2Fcategory_%D8%B9%D9%88%D8%A7%D8%B5%D9%85_%D9%88_%D8%AF%D9%88%D9%84_1758878626063.webp?alt=media&token=ca14ce5c-aae9-4bbd-b30f-f2bf70d42b9e',
    filename: 'category_عواصم_و_دول_1758878626063.webp'
  },
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/lamah-357f3.firebasestorage.app/o/categories%2Fcategory_%D8%A7%D9%85%D8%AB%D8%A7%D9%84_%D9%88_%D8%A7%D9%84%D8%BA%D8%A7%D8%B2_1758939077627.webp?alt=media&token=9e11e2ca-d6bf-4d11-b72f-02a8a6475bc2',
    filename: 'category_امثال_و_الغاز_1758939077627.webp'
  },
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/lamah-357f3.firebasestorage.app/o/categories%2Fcategory_%D9%85%D8%B3%D9%8A%D8%B1%D8%A9_%D9%84%D8%A7%D8%B9%D8%A8_%D9%83%D8%B1%D8%A9_%D9%82%D8%AF%D9%85_1758878652116.webp?alt=media&token=c50c6b8d-83d5-47fb-a726-89b7529ce7c7',
    filename: 'category_مسيرة_لاعب_كرة_قدم_1758878652116.webp'
  }
];

function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join('public', 'images', 'categories', filename);

    console.log(`🔄 Downloading: ${filename}`);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const fileStream = fs.createWriteStream(outputPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`✅ Downloaded: ${filename}`);
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(outputPath, () => {}); // Delete partial file
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function downloadMissingImages() {
  console.log('🚀 Starting download of missing category images...');

  // Ensure directory exists
  const categoriesDir = path.join('public', 'images', 'categories');
  if (!fs.existsSync(categoriesDir)) {
    fs.mkdirSync(categoriesDir, { recursive: true });
  }

  let downloaded = 0;
  let failed = 0;

  for (const { url, filename } of missingImages) {
    try {
      await downloadImage(url, filename);
      downloaded++;
    } catch (error) {
      console.error(`❌ Failed to download ${filename}:`, error.message);
      failed++;
    }
  }

  console.log(`\n📊 Download Summary:`);
  console.log(`✅ Downloaded: ${downloaded}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📁 Total files in categories:`, fs.readdirSync(categoriesDir).length);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  downloadMissingImages().catch(console.error);
}

export { downloadMissingImages };