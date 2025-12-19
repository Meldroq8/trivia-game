/**
 * Check all recent games across all users
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

async function checkRecentGames() {
  console.log('🔍 Checking all recent games...\n')

  // Get all games, sorted by createdAt descending
  const gamesSnapshot = await db.collection('games')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get()

  console.log('📊 Most recent 20 games across ALL users:\n')
  console.log('='.repeat(70))

  let i = 0
  for (const doc of gamesSnapshot.docs) {
    i++
    const game = doc.data()
    const date = game.createdAt?.toDate?.() || game.createdAt || 'Unknown'
    const dateStr = date instanceof Date ? date.toLocaleString() : String(date)

    // Get user info
    const userId = game.userId
    let userName = 'Unknown'
    if (userId) {
      const userDoc = await db.collection('users').doc(userId).get()
      if (userDoc.exists) {
        const userData = userDoc.data()
        userName = userData.displayName || userData.email?.split('@')[0] || userId.slice(0, 8)
      }
    }

    const gameName = game.gameData?.gameName || 'Unnamed'
    const team1Score = game.gameData?.team1?.score || 0
    const team2Score = game.gameData?.team2?.score || 0
    const isComplete = game.isComplete !== false

    console.log(i + '. ' + gameName + ' by ' + userName)
    console.log('   Date: ' + dateStr)
    console.log('   Score: ' + team1Score + ' vs ' + team2Score)
    console.log('   Complete: ' + (isComplete ? '✅' : '❌'))
    console.log('')
  }

  // Also check if there are ANY games from December 2025
  console.log('='.repeat(70))
  console.log('\n🔍 Checking for December 2025 games...\n')

  const dec2025Start = new Date('2025-12-01T00:00:00Z')
  const decGamesSnapshot = await db.collection('games')
    .where('createdAt', '>=', dec2025Start)
    .orderBy('createdAt', 'desc')
    .get()

  console.log('Found ' + decGamesSnapshot.size + ' games from December 2025')

  if (decGamesSnapshot.size > 0) {
    decGamesSnapshot.forEach(doc => {
      const game = doc.data()
      const date = game.createdAt?.toDate?.()
      console.log('  - ' + (game.gameData?.gameName || 'Unnamed') + ' on ' + date?.toLocaleString())
    })
  }
}

checkRecentGames().catch(console.error)
