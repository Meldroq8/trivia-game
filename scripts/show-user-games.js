/**
 * Show game history for a specific user
 * Run with: node scripts/show-user-games.js
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

const TARGET_USER = 'LORD6PANDA'

async function getGames() {
  // First find the user's ID
  const usersSnapshot = await db.collection('users').get()
  let userId = null
  let userName = null

  for (const doc of usersSnapshot.docs) {
    const data = doc.data()
    if (data.displayName === TARGET_USER ||
        data.displayName?.toLowerCase().includes(TARGET_USER.toLowerCase()) ||
        data.email?.toLowerCase().includes(TARGET_USER.toLowerCase())) {
      userId = doc.id
      userName = data.displayName
      console.log('Found user:', userName, '- ID:', userId)
      console.log('Email:', data.email || 'N/A')
      console.log('gameStats:', JSON.stringify(data.gameStats || {}, null, 2))
      break
    }
  }

  if (!userId) {
    console.log('User not found:', TARGET_USER)
    return
  }

  // Get their games
  const gamesSnapshot = await db.collection('games')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get()

  console.log('\n' + '='.repeat(60))
  console.log('📊 Game History for', userName, '(' + gamesSnapshot.size + ' total games)')
  console.log('='.repeat(60) + '\n')

  let i = 0
  gamesSnapshot.forEach((doc) => {
    i++
    const game = doc.data()
    const date = game.createdAt?.toDate?.() || game.createdAt || 'Unknown'
    const team1Score = game.gameData?.team1?.score || 0
    const team2Score = game.gameData?.team2?.score || 0
    const team1Name = game.gameData?.team1?.name || 'Team 1'
    const team2Name = game.gameData?.team2?.name || 'Team 2'
    const gameName = game.gameData?.gameName || 'Unnamed Game'
    const isComplete = game.isComplete !== false
    const statsCounted = game.statsCounted || false

    const dateStr = date instanceof Date ? date.toLocaleString() : String(date)

    console.log(i + '. ' + gameName)
    console.log('   Date: ' + dateStr)
    console.log('   ' + team1Name + ': ' + team1Score + ' vs ' + team2Name + ': ' + team2Score)
    console.log('   Complete: ' + (isComplete ? '✅' : '❌') + ' | Stats Counted: ' + (statsCounted ? '✅' : '❌'))
    console.log('   Doc ID: ' + doc.id)
    console.log('')
  })
}

getGames().catch(console.error)
