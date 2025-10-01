/**
 * Media Migration Script - Firebase Storage to CloudFront
 *
 * This script migrates all media URLs in Firestore from Firebase Storage
 * to CloudFront URLs, utilizing the existing files already uploaded to S3.
 *
 * Usage: node scripts/migrateMediaToCloudFront.js
 */

import admin from 'firebase-admin'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// CloudFront configuration
const CLOUDFRONT_DOMAIN = process.env.VITE_CLOUDFRONT_DOMAIN
const CLOUDFRONT_BASE_URL = `https://${CLOUDFRONT_DOMAIN}`

// Initialize Firebase Admin SDK with service account
const serviceAccount = JSON.parse(JSON.stringify({
  type: "service_account",
  project_id: process.env.VITE_FIREBASE_PROJECT_ID,
  private_key_id: "dummy", // Not needed for this operation
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n", // Placeholder
  client_email: `firebase-adminsdk@${process.env.VITE_FIREBASE_PROJECT_ID}.iam.gserviceaccount.com`,
  client_id: "dummy",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
}))

// Initialize using the existing service account file
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./service-account.json'),
    projectId: process.env.VITE_FIREBASE_PROJECT_ID
  })
}

const db = admin.firestore()

console.log('🚀 Starting Media Migration to CloudFront...')
console.log(`📡 CloudFront Domain: ${CLOUDFRONT_DOMAIN}`)

/**
 * Convert Firebase Storage URL to CloudFront URL
 */
function convertToCloudFrontUrl(firebaseUrl) {
  if (!firebaseUrl || !firebaseUrl.includes('firebasestorage.googleapis.com')) {
    return firebaseUrl // Not a Firebase Storage URL
  }

  try {
    const url = new URL(firebaseUrl)
    const pathPart = url.pathname.split('/o/')[1]
    if (!pathPart) {
      console.warn('⚠️ Invalid Firebase Storage URL format:', firebaseUrl)
      return firebaseUrl
    }

    // Decode the URL-encoded path
    const decodedPath = decodeURIComponent(pathPart.split('?')[0])

    // Convert path to CloudFront format
    const cloudFrontPath = decodedPath.startsWith('/') ? decodedPath.substring(1) : decodedPath
    const cloudFrontUrl = `${CLOUDFRONT_BASE_URL}/${cloudFrontPath}`

    console.log(`🔄 Converting: ${firebaseUrl} → ${cloudFrontUrl}`)
    return cloudFrontUrl
  } catch (error) {
    console.error('❌ Error converting URL:', firebaseUrl, error)
    return firebaseUrl
  }
}

/**
 * Process field recursively to find and convert Firebase Storage URLs
 */
function processField(value, fieldPath = '') {
  if (typeof value === 'string' && value.includes('firebasestorage.googleapis.com')) {
    return convertToCloudFrontUrl(value)
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => processField(item, `${fieldPath}[${index}]`))
  }

  if (value && typeof value === 'object') {
    const processedObj = {}
    for (const [key, val] of Object.entries(value)) {
      processedObj[key] = processField(val, `${fieldPath}.${key}`)
    }
    return processedObj
  }

  return value
}

/**
 * Migrate categories collection
 */
async function migrateCategories() {
  console.log('\n📂 Migrating categories...')

  const categoriesRef = db.collection('categories')
  const categoriesSnapshot = await categoriesRef.get()

  const batch = db.batch()
  let updateCount = 0

  categoriesSnapshot.forEach((docSnapshot) => {
    const categoryData = docSnapshot.data()
    const originalData = JSON.stringify(categoryData)

    // Process all fields
    const processedData = processField(categoryData)
    const processedString = JSON.stringify(processedData)

    // Only update if data changed
    if (originalData !== processedString) {
      batch.update(docSnapshot.ref, processedData)
      updateCount++
      console.log(`✅ Category updated: ${docSnapshot.id} (${categoryData.name || 'unnamed'})`)
    }
  })

  if (updateCount > 0) {
    await batch.commit()
    console.log(`🎉 Categories migration complete! Updated ${updateCount} documents.`)
  } else {
    console.log('ℹ️ No categories needed updating.')
  }
}

/**
 * Migrate questions collection
 */
async function migrateQuestions() {
  console.log('\n❓ Migrating questions...')

  const questionsRef = db.collection('questions')
  const questionsSnapshot = await questionsRef.get()

  const batch = db.batch()
  let updateCount = 0

  questionsSnapshot.forEach((docSnapshot) => {
    const questionData = docSnapshot.data()
    const originalData = JSON.stringify(questionData)

    // Process all fields recursively
    const processedData = processField(questionData)
    const processedString = JSON.stringify(processedData)

    // Only update if data changed
    if (originalData !== processedString) {
      batch.update(docSnapshot.ref, processedData)
      updateCount++
      console.log(`✅ Question updated: ${docSnapshot.id} (${questionData.category || 'no category'})`)
    }
  })

  if (updateCount > 0) {
    await batch.commit()
    console.log(`🎉 Questions migration complete! Updated ${updateCount} documents.`)
  } else {
    console.log('ℹ️ No questions needed updating.')
  }
}

/**
 * Migrate gameData collection
 */
async function migrateGameData() {
  console.log('\n🎮 Migrating gameData...')

  const gameDataRef = db.collection('gameData')
  const gameDataSnapshot = await gameDataRef.get()

  const batch = db.batch()
  let updateCount = 0

  gameDataSnapshot.forEach((docSnapshot) => {
    const gameData = docSnapshot.data()
    const originalData = JSON.stringify(gameData)

    // Process all fields recursively
    const processedData = processField(gameData)
    const processedString = JSON.stringify(processedData)

    // Only update if data changed
    if (originalData !== processedString) {
      batch.update(docSnapshot.ref, processedData)
      updateCount++
      console.log(`✅ GameData updated: ${docSnapshot.id}`)
    }
  })

  if (updateCount > 0) {
    await batch.commit()
    console.log(`🎉 GameData migration complete! Updated ${updateCount} documents.`)
  } else {
    console.log('ℹ️ No gameData needed updating.')
  }
}

/**
 * Main migration function
 */
async function main() {
  try {
    console.log('🔍 Starting comprehensive media migration...\n')

    // Migrate all collections
    await migrateCategories()
    await migrateQuestions()
    await migrateGameData()

    console.log('\n🎊 Migration Complete!')
    console.log('✅ All Firebase Storage URLs have been converted to CloudFront URLs')
    console.log('🚀 Your application now uses CloudFront for all media delivery')

  } catch (error) {
    console.error('💥 Migration failed:', error)
    process.exit(1)
  }
}

// Run the migration
main()