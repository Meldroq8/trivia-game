/**
 * Script to fix mismatched difficulty/points in questions
 * easy = 200, medium = 400, hard = 600
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

// Point values by difficulty
const POINTS_BY_DIFFICULTY = {
  easy: 200,
  medium: 400,
  hard: 600
}

async function fixDifficultyPoints() {
  console.log('Scanning for mismatched difficulty/points...')
  console.log('=' .repeat(60))

  try {
    const questionsRef = db.collection('questions')
    const snapshot = await questionsRef.get()

    console.log(`Total questions: ${snapshot.size}`)

    const mismatched = []

    snapshot.forEach(doc => {
      const data = doc.data()
      const difficulty = data.difficulty || 'medium'
      const currentPoints = data.points
      const expectedPoints = POINTS_BY_DIFFICULTY[difficulty]

      if (currentPoints !== expectedPoints) {
        mismatched.push({
          id: doc.id,
          text: data.text?.substring(0, 50) + '...',
          difficulty,
          currentPoints,
          expectedPoints
        })
      }
    })

    console.log(`\nFound ${mismatched.length} questions with mismatched points:`)
    console.log('=' .repeat(60))

    if (mismatched.length === 0) {
      console.log('All questions have correct points!')
      process.exit(0)
    }

    // Show summary by difficulty
    const bySummary = {
      easy: mismatched.filter(q => q.difficulty === 'easy').length,
      medium: mismatched.filter(q => q.difficulty === 'medium').length,
      hard: mismatched.filter(q => q.difficulty === 'hard').length
    }

    console.log('\nMismatch summary:')
    console.log(`  - Easy questions with wrong points: ${bySummary.easy}`)
    console.log(`  - Medium questions with wrong points: ${bySummary.medium}`)
    console.log(`  - Hard questions with wrong points: ${bySummary.hard}`)

    // Show some examples
    console.log('\nExamples:')
    mismatched.slice(0, 10).forEach(({ id, text, difficulty, currentPoints, expectedPoints }) => {
      console.log(`\n  ID: ${id}`)
      console.log(`  Text: ${text}`)
      console.log(`  Difficulty: ${difficulty}`)
      console.log(`  Current Points: ${currentPoints} -> Should be: ${expectedPoints}`)
    })

    // Check for --apply flag
    const shouldApply = process.argv.includes('--apply')

    if (!shouldApply) {
      console.log('\n' + '=' .repeat(60))
      console.log('DRY RUN - No changes made')
      console.log('Run with --apply flag to fix all mismatched points:')
      console.log('  node scripts/fix-difficulty-points.js --apply')
      process.exit(0)
    }

    // Apply fixes
    console.log('\n' + '=' .repeat(60))
    console.log('Applying fixes...')

    const BATCH_SIZE = 500
    let fixed = 0

    for (let i = 0; i < mismatched.length; i += BATCH_SIZE) {
      const batch = db.batch()
      const batchItems = mismatched.slice(i, i + BATCH_SIZE)

      for (const item of batchItems) {
        const questionRef = db.collection('questions').doc(item.id)
        batch.update(questionRef, {
          points: item.expectedPoints,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
      }

      await batch.commit()
      fixed += batchItems.length
      console.log(`  Fixed ${fixed}/${mismatched.length} questions`)
    }

    console.log('\n' + '=' .repeat(60))
    console.log(`Successfully fixed ${fixed} questions!`)
    process.exit(0)

  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

fixDifficultyPoints()
