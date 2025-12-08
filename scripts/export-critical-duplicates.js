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

async function exportCriticalDuplicates() {
  console.log('🔍 Analyzing critical duplicate files...\n');

  const questionsRef = collection(db, 'questions');
  const snapshot = await getDocs(questionsRef);

  const mediaUrlMap = new Map();

  // Build URL map
  snapshot.forEach((doc) => {
    const data = doc.data();
    const questionId = doc.id;

    [data.audioUrl, data.videoUrl].forEach(url => {
      if (!url) return;

      if (!mediaUrlMap.has(url)) {
        mediaUrlMap.set(url, []);
      }

      mediaUrlMap.get(url).push({
        id: questionId,
        category: data.category || 'Unknown',
        text: data.text || '',
        answer: data.answer || '',
        difficulty: data.difficulty || 'medium',
        audioUrl: data.audioUrl,
        videoUrl: data.videoUrl
      });
    });
  });

  // Find duplicates
  const duplicates = [];
  for (const [url, questions] of mediaUrlMap.entries()) {
    if (questions.length > 1) {
      duplicates.push({ url, questions });
    }
  }

  console.log(`Found ${duplicates.length} shared media files\n`);

  // Generate detailed report
  let markdown = '# Critical Duplicate Media Files - Action Required\n\n';
  markdown += '**Generated:** ' + new Date().toISOString() + '\n';
  markdown += `**Total Duplicate Files:** ${duplicates.length}\n`;
  markdown += `**Total Affected Questions:** ${duplicates.reduce((sum, d) => sum + d.questions.length, 0)}\n\n`;
  markdown += '---\n\n';

  duplicates.forEach((dup, index) => {
    const filename = extractFilename(dup.url);
    markdown += `## ${index + 1}. ${filename}\n\n`;
    markdown += `**URL:** \`${dup.url}\`\n\n`;
    markdown += `**Shared by ${dup.questions.length} questions:**\n\n`;

    dup.questions.forEach((q, qIndex) => {
      markdown += `### Question ${qIndex + 1}\n\n`;
      markdown += `- **ID:** \`${q.id}\`\n`;
      markdown += `- **Category:** ${q.category}\n`;
      markdown += `- **Difficulty:** ${q.difficulty}\n`;
      markdown += `- **Question:** ${q.text}\n`;
      markdown += `- **Answer:** ${q.answer}\n`;

      if (q.audioUrl) {
        markdown += `- **Audio:** ${extractFilename(q.audioUrl)}\n`;
      }
      if (q.videoUrl) {
        markdown += `- **Video:** ${extractFilename(q.videoUrl)}\n`;
      }

      markdown += '\n**Action Required:**\n';
      markdown += '- [ ] Review if this question should have this media\n';
      markdown += '- [ ] If correct: Mark as verified\n';
      markdown += '- [ ] If incorrect: Find/upload correct media file\n';
      markdown += '- [ ] Update Firebase document with new URL\n';
      markdown += `- [ ] Test in application\n\n`;

      markdown += `**Firebase Console Link:**\n`;
      markdown += `https://console.firebase.google.com/project/lamah-357f3/firestore/data/questions/${q.id}\n\n`;
    });

    markdown += '**Recommended Fix:**\n\n';
    markdown += '1. Listen to/watch the current file at the URL above\n';
    markdown += '2. Determine which question it actually belongs to\n';
    markdown += '3. For the correct question: Leave as-is or re-upload with timestamp\n';
    markdown += '4. For incorrect questions: Upload correct media with unique timestamp name\n';
    markdown += '5. Update all affected Firebase documents\n';
    markdown += '6. Verify all questions play correct media\n\n';
    markdown += '---\n\n';
  });

  // Generate checklist
  markdown += '## Progress Checklist\n\n';
  duplicates.forEach((dup, index) => {
    const filename = extractFilename(dup.url);
    markdown += `- [ ] ${index + 1}. ${filename} (${dup.questions.length} questions)\n`;
  });

  markdown += '\n---\n\n';
  markdown += '## Summary Statistics\n\n';
  markdown += `- Total duplicate files: ${duplicates.length}\n`;
  markdown += `- Total affected questions: ${duplicates.reduce((sum, d) => sum + d.questions.length, 0)}\n`;
  markdown += `- Average questions per file: ${(duplicates.reduce((sum, d) => sum + d.questions.length, 0) / duplicates.length).toFixed(1)}\n`;

  // Write markdown file
  writeFileSync('CRITICAL_DUPLICATES_ACTION_PLAN.md', markdown, 'utf8');
  console.log('✅ Generated: CRITICAL_DUPLICATES_ACTION_PLAN.md');

  // Generate simple CSV for tracking
  const csvRows = ['Index,Filename,URL,Question Count,Question IDs,Firebase Links'];
  duplicates.forEach((dup, index) => {
    const filename = extractFilename(dup.url);
    const ids = dup.questions.map(q => q.id).join('; ');
    const links = dup.questions.map(q =>
      `https://console.firebase.google.com/project/lamah-357f3/firestore/data/questions/${q.id}`
    ).join('; ');

    csvRows.push(`${index + 1},"${filename}","${dup.url}",${dup.questions.length},"${ids}","${links}"`);
  });

  writeFileSync('critical-duplicates-tracking.csv', csvRows.join('\n'), 'utf8');
  console.log('✅ Generated: critical-duplicates-tracking.csv');

  console.log('\n📋 Files ready for manual review and fixing!');
}

exportCriticalDuplicates().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
