/**
 * Script to fix the question text in أغاني انمي category
 * Changes: "ما اسم الانمي الذي يبدء بهذة الموسيقي؟" → "ما اسم الانمي الذي يبدأ بهذه الموسيقى؟"
 *
 * Run with: node scripts/fix-anime-questions.js
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load service account key
const serviceAccountPath = join(__dirname, '..', 'serviceAccountKey.json')

let serviceAccount
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
} catch (error) {
  console.error('❌ Could not load serviceAccountKey.json')
  console.error('   Please download it from Firebase Console:')
  console.error('   Project Settings > Service Accounts > Generate New Private Key')
  console.error('   Save it as: trivia-game/serviceAccountKey.json')
  process.exit(1)
}

initializeApp({
  credential: cert(serviceAccount)
})

const db = getFirestore()

async function fixAnimeQuestions() {
  // Direct category ID for "أغاني انمي"
  const categoryId = '5RdsUKtYcgKABQs55fP9'
  const oldText = 'ما اسم الانمي الذي يبدء بهذة الموسيقي؟'
  const newText = 'ما اسم الانمي الذي يبدأ بهذه الموسيقى؟'

  console.log('🔍 Using category ID:', categoryId)
  console.log('📝 Old text:', oldText)
  console.log('✨ New text:', newText)
  console.log('')

  try {
    console.log(`🔍 Searching for questions with categoryId: ${categoryId}`)

    // Query all questions in this category
    const questionsRef = db.collection('questions')
    const snapshot = await questionsRef.where('categoryId', '==', categoryId).get()

    if (snapshot.empty) {
      console.log('❌ No questions found in this category')
      process.exit(1)
    }

    console.log(`📚 Found ${snapshot.size} questions in category`)
    console.log('')

    let updatedCount = 0
    let skippedCount = 0
    let alreadyFixedCount = 0

    const batch = db.batch()

    snapshot.forEach(doc => {
      const data = doc.data()
      const currentText = data.text || ''

      if (currentText === oldText) {
        console.log(`  ✅ Will update: ${doc.id}`)
        batch.update(doc.ref, { text: newText })
        updatedCount++
      } else if (currentText === newText) {
        console.log(`  ⏭️ Already fixed: ${doc.id}`)
        alreadyFixedCount++
      } else {
        console.log(`  ⚠️ Different text in ${doc.id}: "${currentText.substring(0, 50)}..."`)
        skippedCount++
      }
    })

    if (updatedCount > 0) {
      console.log('')
      console.log(`🔄 Committing ${updatedCount} updates...`)
      await batch.commit()
      console.log('✅ Done!')
    } else {
      console.log('')
      console.log('ℹ️ No updates needed')
    }

    console.log('')
    console.log('📊 Summary:')
    console.log(`   Updated: ${updatedCount}`)
    console.log(`   Already fixed: ${alreadyFixedCount}`)
    console.log(`   Different text: ${skippedCount}`)
    console.log(`   Total in category: ${snapshot.size}`)

  } catch (error) {
    console.error('❌ Error:', error)
  }

  process.exit(0)
}

fixAnimeQuestions()
