// Script to check if questions in "أنا منو (انمي)" category have answer2 and answerImageUrl2
// Run with: node scripts/check-headband-questions.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Firebase config - same as in the app
const firebaseConfig = {
  apiKey: "AIzaSyA3lEvp32lVJs7SrnLfzDDr0fGuPlyWQDI",
  authDomain: "lamah-357f3.firebaseapp.com",
  projectId: "lamah-357f3",
  storageBucket: "lamah-357f3.firebasestorage.app",
  messagingSenderId: "770888972498",
  appId: "1:770888972498:web:0da63d01e08aa44feefac0",
  measurementId: "G-MLHPG2P6YL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkHeadbandQuestions() {
  try {
    // First, find the category ID for "أنا منو (انمي)"
    const categoriesRef = collection(db, 'categories');
    const categoriesSnapshot = await getDocs(categoriesRef);

    let targetCategoryId = null;
    categoriesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.name && data.name.includes('أنا منو')) {
        console.log(`Found category: ${doc.id} - ${data.name}`);
        targetCategoryId = doc.id;
      }
    });

    if (!targetCategoryId) {
      console.log('Category "أنا منو (انمي)" not found. Listing all categories:');
      categoriesSnapshot.forEach(doc => {
        console.log(`  - ${doc.id}: ${doc.data().name}`);
      });
      return;
    }

    // Get questions for this category
    const questionsRef = collection(db, 'questions');
    const q = query(questionsRef, where('categoryId', '==', targetCategoryId));
    const questionsSnapshot = await getDocs(q);

    console.log(`\nFound ${questionsSnapshot.size} questions in category "${targetCategoryId}"\n`);
    console.log('Checking for answer2 and answerImageUrl2 fields:\n');

    let withAnswer2 = 0;
    let withAnswerImage2 = 0;
    let withBoth = 0;

    questionsSnapshot.forEach((doc, index) => {
      const data = doc.data();
      const hasAnswer2 = !!data.answer2;
      const hasAnswerImage2 = !!data.answerImageUrl2;

      if (hasAnswer2) withAnswer2++;
      if (hasAnswerImage2) withAnswerImage2++;
      if (hasAnswer2 && hasAnswerImage2) withBoth++;

      console.log(`Question ${index + 1}: ${data.text?.substring(0, 50)}...`);
      console.log(`  - answer: ${data.answer}`);
      console.log(`  - answer2: ${data.answer2 || '❌ NOT SET'}`);
      console.log(`  - answerImageUrl: ${data.answerImageUrl ? '✅ SET' : '❌ NOT SET'}`);
      console.log(`  - answerImageUrl2: ${data.answerImageUrl2 ? '✅ SET' : '❌ NOT SET'}`);
      console.log('');
    });

    console.log('\n=== SUMMARY ===');
    console.log(`Total questions: ${questionsSnapshot.size}`);
    console.log(`With answer2: ${withAnswer2}`);
    console.log(`With answerImageUrl2: ${withAnswerImage2}`);
    console.log(`With both: ${withBoth}`);

  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

checkHeadbandQuestions();
