/**
 * Clean up duplicate games
 * Games are considered duplicates if they have the same:
 * - userId
 * - gameName
 * - team1 score
 * - team2 score
 * - createdAt within 5 seconds of each other
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serviceAccountPath = join(__dirname, '..', 'serviceAccountKey.json')

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

async function cleanupDuplicates() {
  console.log('🧹 Starting duplicate cleanup...\n')

  // Get all users
  const usersSnapshot = await db.collection('users').get()

  let totalDeleted = 0
  let totalKept = 0

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id
    const userData = userDoc.data()
    const userName = userData.displayName || userData.email?.split('@')[0] || userId.slice(0, 8)

    // Get all games for this user (without orderBy to avoid index requirement)
    const gamesSnapshot = await db.collection('games')
      .where('userId', '==', userId)
      .get()

    if (gamesSnapshot.size === 0) continue

    console.log(`\n📊 Processing ${userName} (${gamesSnapshot.size} games)...`)

    // Group games by signature (gameName + scores)
    const gameGroups = new Map()

    gamesSnapshot.forEach(doc => {
      const game = doc.data()
      const createdAt = game.createdAt?.toDate?.() || new Date(0)
      const gameName = game.gameData?.gameName || 'Unnamed'
      const team1Score = game.gameData?.team1?.score || 0
      const team2Score = game.gameData?.team2?.score || 0

      // Create a signature for grouping (rounded to 10-second windows)
      const timeWindow = Math.floor(createdAt.getTime() / 10000) // 10-second windows
      const signature = `${gameName}|${team1Score}|${team2Score}|${timeWindow}`

      if (!gameGroups.has(signature)) {
        gameGroups.set(signature, [])
      }
      gameGroups.get(signature).push({
        id: doc.id,
        createdAt,
        game
      })
    })

    // Find and delete duplicates (keep the first one in each group)
    let userDeleted = 0
    let userKept = 0

    for (const [signature, games] of gameGroups) {
      if (games.length > 1) {
        // Sort by createdAt to keep the earliest
        games.sort((a, b) => a.createdAt - b.createdAt)

        // Keep first, delete rest
        const [keep, ...duplicates] = games
        userKept++

        console.log(`   Keeping: ${keep.game.gameData?.gameName} (${keep.createdAt.toLocaleString()})`)
        console.log(`   Deleting ${duplicates.length} duplicates`)

        for (const dup of duplicates) {
          await db.collection('games').doc(dup.id).delete()
          userDeleted++
        }
      } else {
        userKept++
      }
    }

    totalDeleted += userDeleted
    totalKept += userKept

    if (userDeleted > 0) {
      // Update user's game count
      const newCount = userKept
      const oldCount = userData.gameStats?.gamesPlayed || 0

      await db.collection('users').doc(userId).update({
        'gameStats.gamesPlayed': newCount
      })

      console.log(`   ✅ ${userName}: ${oldCount} → ${newCount} games (deleted ${userDeleted} duplicates)`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 Summary:')
  console.log(`   Total games kept: ${totalKept}`)
  console.log(`   Total duplicates deleted: ${totalDeleted}`)
  console.log('='.repeat(60))
  console.log('\n✅ Cleanup complete!')
}

cleanupDuplicates().catch(console.error)
