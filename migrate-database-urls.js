#!/usr/bin/env node

/**
 * Database URL Migration Script (Server-side with Service Account)
 * Migrates local image paths in Firestore to CloudFront URLs
 *
 * Usage: node migrate-database-urls.js
 *
 * This script uses Firebase Admin SDK with service account authentication
 * to update image URLs in the questions and categories collections.
 *
 * Requirements:
 * - service-account.json file in the project root
 * - npm install firebase-admin
 */

import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// CloudFront configuration
const CLOUDFRONT_DOMAIN = 'drcqcbq3desis.cloudfront.net'
const CLOUDFRONT_BASE_URL = `https://${CLOUDFRONT_DOMAIN}`

// Initialize Firebase Admin SDK
let db
try {
  const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'service-account.json'), 'utf8'))

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  })

  db = admin.firestore()
  console.log('✅ Firebase Admin SDK initialized successfully')
} catch (error) {
  console.error('❌ Error initializing Firebase Admin SDK:', error.message)
  console.log('📋 Please ensure service-account.json is in the project root directory')
  process.exit(1)
}

/**
 * Convert local path to CloudFront URL
 */
function convertToCloudFrontUrl(localPath) {
  if (!localPath) return null

  // Skip if it's already a CloudFront or Firebase URL
  if (localPath.includes('cloudfront') || localPath.includes('firebasestorage')) {
    return localPath
  }

  // Ensure path starts without slash for CloudFront
  const cleanPath = localPath.startsWith('/') ? localPath.substring(1) : localPath

  // URL encode the path to handle special characters
  const encodedPath = encodeURI(cleanPath)

  return `${CLOUDFRONT_BASE_URL}/${encodedPath}`
}

/**
 * Update image URLs in a document
 */
function updateImageUrls(docData) {
  const updates = {}
  let hasUpdates = false

  // Fields that might contain image URLs
  const imageFields = [
    'imageUrl', 'image', 'imagePath',
    'answerImageUrl', 'answerImage', 'answerImagePath',
    'question.imageUrl', 'question.image', 'question.imagePath',
    'answer.imageUrl', 'answer.image', 'answer.imagePath'
  ]

  imageFields.forEach(field => {
    const fieldParts = field.split('.')
    let value = docData

    // Navigate nested fields
    for (const part of fieldParts) {
      if (value && typeof value === 'object' && value[part] !== undefined) {
        value = value[part]
      } else {
        value = null
        break
      }
    }

    // If we found a local image path, convert it
    if (value && typeof value === 'string' && !value.includes('http')) {
      const cloudFrontUrl = convertToCloudFrontUrl(value)
      if (cloudFrontUrl && cloudFrontUrl !== value) {
        if (fieldParts.length === 1) {
          updates[field] = cloudFrontUrl
        } else {
          // Handle nested fields
          const nestedUpdate = { ...docData }
          let current = nestedUpdate
          for (let i = 0; i < fieldParts.length - 1; i++) {
            current = current[fieldParts[i]]
          }
          current[fieldParts[fieldParts.length - 1]] = cloudFrontUrl
          Object.assign(updates, nestedUpdate)
        }
        hasUpdates = true
        console.log(`  Converting: ${value} → ${cloudFrontUrl}`)
      }
    }
  })

  return hasUpdates ? updates : null
}

/**
 * Migrate questions collection
 */
async function migrateQuestions() {
  console.log('🔄 Migrating questions collection...')

  try {
    const questionsSnapshot = await db.collection('questions').get()
    let updatedCount = 0

    for (const docSnap of questionsSnapshot.docs) {
      const docData = docSnap.data()
      const updates = updateImageUrls(docData)

      if (updates) {
        console.log(`📝 Updating question: ${docSnap.id}`)
        await db.collection('questions').doc(docSnap.id).update(updates)
        updatedCount++
      }
    }

    console.log(`✅ Questions migration complete. Updated ${updatedCount} documents.`)
  } catch (error) {
    console.error('❌ Error migrating questions:', error)
  }
}

/**
 * Migrate categories collection
 */
async function migrateCategories() {
  console.log('🔄 Migrating categories collection...')

  try {
    const categoriesSnapshot = await db.collection('categories').get()
    let updatedCount = 0

    for (const docSnap of categoriesSnapshot.docs) {
      const docData = docSnap.data()
      const updates = updateImageUrls(docData)

      if (updates) {
        console.log(`📝 Updating category: ${docSnap.id}`)
        await db.collection('categories').doc(docSnap.id).update(updates)
        updatedCount++
      }
    }

    console.log(`✅ Categories migration complete. Updated ${updatedCount} documents.`)
  } catch (error) {
    console.error('❌ Error migrating categories:', error)
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting database URL migration...')
  console.log(`🌐 CloudFront domain: ${CLOUDFRONT_DOMAIN}`)

  try {
    // Run migrations (admin privileges through service account)
    await migrateQuestions()
    await migrateCategories()

    console.log('🎉 Migration completed successfully!')

  } catch (error) {
    console.error('💥 Migration failed:', error)
    process.exit(1)
  }
}

// Always run migration when script is executed directly
migrate().then(() => {
  console.log('✨ All done!')
  process.exit(0)
}).catch(error => {
  console.error('Migration failed:', error)
  process.exit(1)
})

export { migrate, convertToCloudFrontUrl }