/**
 * Script to find corrupted URLs in the database
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

async function findCorruptedUrls() {
  console.log('🔍 Searching for corrupted URLs in questions...')
  console.log('=' .repeat(60))

  try {
    const questionsRef = db.collection('questions')
    const snapshot = await questionsRef.get()

    console.log(`📊 Total questions: ${snapshot.size}`)

    const corrupted = []
    const hayalaQuestions = []
    const urlFields = ['imageUrl', 'audioUrl', 'videoUrl', 'answerImageUrl', 'answerAudioUrl', 'answerVideoUrl']

    snapshot.forEach(doc => {
      const data = doc.data()

      // Find the specific hayala question
      for (const field of urlFields) {
        const url = data[field]
        if (url && url.includes('hayala')) {
          hayalaQuestions.push({
            questionId: doc.id,
            questionText: data.text?.substring(0, 80),
            field,
            url
          })
        }
      }

      for (const field of urlFields) {
        const url = data[field]
        if (url) {
          // Check for various corruption patterns
          const isCorrupted =
            url.includes('drcqhttps') ||           // The specific corruption we saw
            url.includes('https//') ||              // Missing colon
            url.includes('httpshttps') ||           // Doubled protocol
            url.match(/https?:\/\/[^/]*https?/) ||  // Protocol in middle of URL
            url.includes('://://') ||               // Double protocol separator
            !url.startsWith('http') && !url.startsWith('/') && !url.startsWith('images/')  // Invalid start

          if (isCorrupted) {
            corrupted.push({
              questionId: doc.id,
              questionText: data.text?.substring(0, 50) + '...',
              field,
              corruptedUrl: url
            })
          }
        }
      }
    })

    // Show hayala questions first
    if (hayalaQuestions.length > 0) {
      console.log(`\n🔍 Found ${hayalaQuestions.length} 'hayala' questions:`)
      hayalaQuestions.forEach(({ questionId, questionText, field, url }) => {
        console.log(`\n  ID: ${questionId}`)
        console.log(`  Text: ${questionText}`)
        console.log(`  Field: ${field}`)
        console.log(`  URL: ${url}`)
      })
    }

    console.log(`\n❌ Found ${corrupted.length} corrupted URLs:`)
    console.log('=' .repeat(60))

    if (corrupted.length === 0) {
      console.log('✅ No corrupted URLs found!')
    } else {
      corrupted.forEach(({ questionId, questionText, field, corruptedUrl }) => {
        console.log(`\n📝 Question ID: ${questionId}`)
        console.log(`   Text: ${questionText}`)
        console.log(`   Field: ${field}`)
        console.log(`   URL: ${corruptedUrl}`)
      })

      console.log('\n' + '=' .repeat(60))
      console.log('📊 Summary by corruption type:')

      const byPattern = {}
      corrupted.forEach(({ corruptedUrl }) => {
        if (corruptedUrl.includes('drcqhttps')) byPattern['drcqhttps'] = (byPattern['drcqhttps'] || 0) + 1
        else if (corruptedUrl.includes('https//')) byPattern['https//'] = (byPattern['https//'] || 0) + 1
        else byPattern['other'] = (byPattern['other'] || 0) + 1
      })

      Object.entries(byPattern).forEach(([pattern, count]) => {
        console.log(`   - ${pattern}: ${count}`)
      })
    }

    process.exit(0)

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

findCorruptedUrls()
