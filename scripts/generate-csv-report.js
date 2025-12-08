#!/usr/bin/env node

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { writeFileSync } from 'fs';

// Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyCt9vd2uOISntPQ4EM6o1K9_iiaDeiFtJs',
  authDomain: 'lamah-357f3.firebaseapp.com',
  projectId: 'lamah-357f3',
  storageBucket: 'lamah-357f3.firebasestorage.app',
  messagingSenderId: '482087427045',
  appId: '1:482087427045:web:9120b8ed276c8b84ed6d0c',
  measurementId: 'G-V3MBTTVH14'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function extractFilename(url) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.split('/').pop();
  } catch (e) {
    return url;
  }
}

function hasTimestamp(filename) {
  if (!filename) return false;
  return /_\d{13}/.test(filename);
}

function escapeCSV(str) {
  if (!str) return '';
  str = String(str);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function generateCSV() {
  console.log('Generating CSV reports...\n');

  const questionsRef = collection(db, 'questions');
  const snapshot = await getDocs(questionsRef);

  // CSV 1: All questions with media
  const allMediaRows = [
    'Question ID,Category,Question Text,Media Type,Media URL,Filename,Has Timestamp'
  ];

  // CSV 2: Only questions with non-unique filenames
  const nonUniqueRows = [
    'Question ID,Category,Question Text,Media Type,Media URL,Filename'
  ];

  // CSV 3: Duplicate URLs
  const mediaUrlMap = new Map();

  snapshot.forEach((doc) => {
    const data = doc.data();
    const questionId = doc.id;
    const category = data.category || 'Unknown';
    const text = data.text || '';

    if (data.audioUrl) {
      const filename = extractFilename(data.audioUrl);
      const hasTS = hasTimestamp(filename);

      allMediaRows.push(
        `${escapeCSV(questionId)},${escapeCSV(category)},${escapeCSV(text)},audio,${escapeCSV(data.audioUrl)},${escapeCSV(filename)},${hasTS}`
      );

      if (!hasTS) {
        nonUniqueRows.push(
          `${escapeCSV(questionId)},${escapeCSV(category)},${escapeCSV(text)},audio,${escapeCSV(data.audioUrl)},${escapeCSV(filename)}`
        );
      }

      if (!mediaUrlMap.has(data.audioUrl)) {
        mediaUrlMap.set(data.audioUrl, []);
      }
      mediaUrlMap.get(data.audioUrl).push({ id: questionId, category, text });
    }

    if (data.videoUrl) {
      const filename = extractFilename(data.videoUrl);
      const hasTS = hasTimestamp(filename);

      allMediaRows.push(
        `${escapeCSV(questionId)},${escapeCSV(category)},${escapeCSV(text)},video,${escapeCSV(data.videoUrl)},${escapeCSV(filename)},${hasTS}`
      );

      if (!hasTS) {
        nonUniqueRows.push(
          `${escapeCSV(questionId)},${escapeCSV(category)},${escapeCSV(text)},video,${escapeCSV(data.videoUrl)},${escapeCSV(filename)}`
        );
      }

      if (!mediaUrlMap.has(data.videoUrl)) {
        mediaUrlMap.set(data.videoUrl, []);
      }
      mediaUrlMap.get(data.videoUrl).push({ id: questionId, category, text });
    }
  });

  // CSV 3: Duplicate URLs
  const duplicateRows = [
    'Media URL,Filename,Share Count,Question IDs,Categories,Question Texts'
  ];

  for (const [url, questions] of mediaUrlMap.entries()) {
    if (questions.length > 1) {
      const filename = extractFilename(url);
      const ids = questions.map(q => q.id).join('; ');
      const categories = questions.map(q => q.category).join('; ');
      const texts = questions.map(q => q.text.substring(0, 50)).join('; ');

      duplicateRows.push(
        `${escapeCSV(url)},${escapeCSV(filename)},${questions.length},${escapeCSV(ids)},${escapeCSV(categories)},${escapeCSV(texts)}`
      );
    }
  }

  // Write CSV files
  writeFileSync('media-analysis-all.csv', allMediaRows.join('\n'), 'utf8');
  writeFileSync('media-analysis-non-unique.csv', nonUniqueRows.join('\n'), 'utf8');
  writeFileSync('media-analysis-duplicates.csv', duplicateRows.join('\n'), 'utf8');

  console.log('✅ Generated 3 CSV files:');
  console.log('   1. media-analysis-all.csv - All questions with media');
  console.log('   2. media-analysis-non-unique.csv - Questions with non-unique filenames');
  console.log('   3. media-analysis-duplicates.csv - Shared/duplicate media URLs');
  console.log();
  console.log(`   Total media questions: ${allMediaRows.length - 1}`);
  console.log(`   Non-unique filenames: ${nonUniqueRows.length - 1}`);
  console.log(`   Duplicate URLs: ${duplicateRows.length - 1}`);
}

generateCSV();
