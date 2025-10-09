import { devLog, devWarn, prodError } from "./devLog.js"
import { auth } from '../firebase/config'
import { FirebaseQuestionsService } from './firebaseQuestions'

/**
 * Debug helper to check Firebase authentication and permissions
 */
export const debugFirebaseAuth = async () => {
  devLog('🔍 Firebase Authentication Debug')
  devLog('================================')

  // Check current user
  const currentUser = auth.currentUser
  if (currentUser) {
    devLog('✅ User is authenticated:')
    devLog('  - UID:', currentUser.uid)
    devLog('  - Email:', currentUser.email)
    devLog('  - Display Name:', currentUser.displayName)

    // Get ID token to check custom claims
    try {
      const idTokenResult = await currentUser.getIdTokenResult()
      devLog('  - Custom Claims:', idTokenResult.claims)
      devLog('  - Is Admin:', idTokenResult.claims.admin || false)
    } catch (error) {
      prodError('  - Error getting ID token:', error)
    }
  } else {
    devLog('❌ No user is currently authenticated')
    return false
  }

  // Test Firebase permissions
  devLog('\n🔥 Testing Firebase Permissions')
  devLog('===============================')

  try {
    // Test reading categories
    devLog('📁 Testing categories read access...')
    const categories = await FirebaseQuestionsService.getAllCategories()
    devLog('✅ Categories read successful:', categories.length, 'categories found')

    // Test reading questions
    devLog('📊 Testing questions read access...')
    const questions = await FirebaseQuestionsService.getAllQuestions()
    devLog('✅ Questions read successful:', questions.length, 'questions found')

    // Test creating a test category
    devLog('📝 Testing category write access...')
    const testCategory = {
      name: 'Test Category ' + Date.now(),
      color: 'bg-gray-500',
      image: '🧪',
      imageUrl: ''
    }
    const categoryId = await FirebaseQuestionsService.saveCategory(testCategory)
    devLog('✅ Category write successful, ID:', categoryId)

    // Test creating a test question
    devLog('❓ Testing question write access...')
    const testQuestion = {
      text: 'Test question ' + Date.now(),
      answer: 'Test answer',
      difficulty: 'easy',
      points: 200,
      type: 'text',
      categoryId: 'test',
      categoryName: 'Test'
    }
    const questionId = await FirebaseQuestionsService.addQuestion(testQuestion)
    devLog('✅ Question write successful, ID:', questionId)

    devLog('\n🎉 All Firebase permissions are working correctly!')
    return true

  } catch (error) {
    prodError('❌ Firebase permission error:', error)
    prodError('   Error code:', error.code)
    prodError('   Error message:', error.message)

    if (error.code === 'permission-denied') {
      devLog('\n💡 Troubleshooting steps:')
      devLog('1. Make sure you are logged in as an authenticated user')
      devLog('2. Check that Firestore rules allow access to questions/categories collections')
      devLog('3. Verify the Firebase project configuration')
      devLog('4. Try running: npx firebase deploy --only firestore:rules')
    }

    return false
  }
}

/**
 * Quick Firebase connection test
 */
export const testFirebaseConnection = async () => {
  devLog('🌐 Testing Firebase Connection...')

  try {
    // Test auth connection
    const user = auth.currentUser
    devLog('Auth status:', user ? 'Connected' : 'Not authenticated')

    // Test Firestore connection by getting stats
    const stats = await FirebaseQuestionsService.getQuestionStats()
    devLog('✅ Firestore connection successful')
    devLog('Database stats:', stats)

    return true
  } catch (error) {
    prodError('❌ Firebase connection failed:', error)
    return false
  }
}

// Make functions available in browser console
if (typeof window !== 'undefined') {
  window.debugFirebaseAuth = debugFirebaseAuth
  window.testFirebaseConnection = testFirebaseConnection
}