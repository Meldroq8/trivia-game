/**
 * One-time migration script to fix gamesPlayed count for all users
 *
 * Run with: node scripts/fix-games-count.js
 *
 * This script:
 * 1. Gets all users from the users collection
 * 2. Counts their actual games in the games collection
 * 3. Updates their gameStats.gamesPlayed to match the real count
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

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccount)
})

const db = getFirestore()

async function fixGamesCounts() {
  console.log('🔧 Starting games count fix...\n')

  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get()
    console.log(`📊 Found ${usersSnapshot.size} users\n`)

    let fixed = 0
    let alreadyCorrect = 0
    let noGames = 0

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id
      const userData = userDoc.data()
      const currentCount = userData.gameStats?.gamesPlayed || 0

      // Count actual games for this user
      const gamesSnapshot = await db.collection('games')
        .where('userId', '==', userId)
        .get()

      const actualCount = gamesSnapshot.size

      if (actualCount === 0) {
        noGames++
        continue
      }

      const userName = userData.displayName || userData.email?.split('@')[0] || userId.slice(0, 8)

      if (currentCount !== actualCount) {
        // Update the count
        await db.collection('users').doc(userId).update({
          'gameStats.gamesPlayed': actualCount
        })
        console.log(`✅ ${userName}: ${currentCount} → ${actualCount} (fixed +${actualCount - currentCount})`)
        fixed++
      } else {
        console.log(`✓ ${userName}: ${currentCount} (correct)`)
        alreadyCorrect++
      }
    }

    console.log('\n' + '='.repeat(50))
    console.log('📊 Summary:')
    console.log(`   Fixed: ${fixed} users`)
    console.log(`   Already correct: ${alreadyCorrect} users`)
    console.log(`   No games: ${noGames} users`)
    console.log('='.repeat(50))
    console.log('\n✅ Done!')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

fixGamesCounts()
