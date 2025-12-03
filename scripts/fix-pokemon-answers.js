/**
 * Script to fix Pokemon category answers
 * Transforms: "✓ جوززلورد (Guzzlord)" → "Guzzlord"
 * Only affects category: "من هذا البوكيمون؟"
 */

import admin from 'firebase-admin'
import { readFileSync } from 'fs'

// Load service account
const serviceAccount = JSON.parse(
  readFileSync('C:/Users/f17/Downloads/Jm3a/service-account.json', 'utf8')
)

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

const TARGET_CATEGORY = "من هذا البوكيمون؟"
const TARGET_CATEGORY_ID = "DHF17YVoB7brRUPBlk1Q"

/**
 * Extract English name from answer like "✓ جوززلورد (Guzzlord)" → "Guzzlord"
 */
function extractEnglishName(answer) {
  if (!answer) return null

  // Match text inside parentheses
  const match = answer.match(/\(([^)]+)\)/)
  if (match && match[1]) {
    return match[1].trim()
  }

  return null // Return null if no match found
}

async function fixPokemonAnswers() {
  console.log('🔍 Fetching questions from category:', TARGET_CATEGORY)
  console.log('=' .repeat(60))

  try {
    // Get all questions with the target category ID
    const questionsRef = db.collection('questions')
    const snapshot = await questionsRef.where('categoryId', '==', TARGET_CATEGORY_ID).get()

    if (snapshot.empty) {
      console.log('❌ No questions found in this category')
      process.exit(1)
    }

    const questions = []
    snapshot.forEach(doc => {
      questions.push({ id: doc.id, ...doc.data() })
    })

    console.log(`✅ Found ${questions.length} questions in Pokemon category`)
    await processQuestions(questions)

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

async function processQuestions(questions) {
  console.log('\n📋 Preview of changes:')
  console.log('=' .repeat(60))

  const updates = []
  let skipped = 0

  for (const q of questions) {
    const oldAnswer = q.answer
    const newAnswer = extractEnglishName(oldAnswer)

    if (newAnswer && newAnswer !== oldAnswer) {
      updates.push({
        id: q.id,
        oldAnswer,
        newAnswer
      })
      console.log(`\n📝 Question: ${q.text?.substring(0, 50)}...`)
      console.log(`   Old: "${oldAnswer}"`)
      console.log(`   New: "${newAnswer}"`)
    } else if (!newAnswer) {
      skipped++
      console.log(`\n⏭️  Skipped (no parentheses found): "${oldAnswer}"`)
    } else {
      skipped++
    }
  }

  console.log('\n' + '=' .repeat(60))
  console.log(`📊 Summary:`)
  console.log(`   - Total questions: ${questions.length}`)
  console.log(`   - Will update: ${updates.length}`)
  console.log(`   - Skipped: ${skipped}`)

  if (updates.length === 0) {
    console.log('\n✅ No updates needed!')
    process.exit(0)
  }

  // Check for --apply flag
  const shouldApply = process.argv.includes('--apply')

  if (!shouldApply) {
    console.log('\n⚠️  DRY RUN - No changes made')
    console.log('Run with --apply flag to apply changes:')
    console.log('  node scripts/fix-pokemon-answers.js --apply')
    process.exit(0)
  }

  // Apply changes
  console.log('\n🔄 Applying changes...')

  const BATCH_SIZE = 500
  let processed = 0

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = db.batch()
    const batchUpdates = updates.slice(i, i + BATCH_SIZE)

    for (const update of batchUpdates) {
      const questionRef = db.collection('questions').doc(update.id)
      batch.update(questionRef, {
        answer: update.newAnswer,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      })
    }

    await batch.commit()
    processed += batchUpdates.length
    console.log(`   ✅ Updated ${processed}/${updates.length} questions`)
  }

  console.log('\n🎉 All changes applied successfully!')
  process.exit(0)
}

// Run the script
fixPokemonAnswers()
