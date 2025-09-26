import { auth } from '../firebase/config'
import { FirebaseQuestionsService } from './firebaseQuestions'

/**
 * Debug helper to check Firebase authentication and permissions
 */
export const debugFirebaseAuth = async () => {
  console.log('🔍 Firebase Authentication Debug')
  console.log('================================')

  // Check current user
  const currentUser = auth.currentUser
  if (currentUser) {
    console.log('✅ User is authenticated:')
    console.log('  - UID:', currentUser.uid)
    console.log('  - Email:', currentUser.email)
    console.log('  - Display Name:', currentUser.displayName)

    // Get ID token to check custom claims
    try {
      const idTokenResult = await currentUser.getIdTokenResult()
      console.log('  - Custom Claims:', idTokenResult.claims)
      console.log('  - Is Admin:', idTokenResult.claims.admin || false)
    } catch (error) {
      console.error('  - Error getting ID token:', error)
    }
  } else {
    console.log('❌ No user is currently authenticated')
    return false
  }

  // Test Firebase permissions
  console.log('\n🔥 Testing Firebase Permissions')
  console.log('===============================')

  try {
    // Test reading categories
    console.log('📁 Testing categories read access...')
    const categories = await FirebaseQuestionsService.getAllCategories()
    console.log('✅ Categories read successful:', categories.length, 'categories found')

    // Test reading questions
    console.log('📊 Testing questions read access...')
    const questions = await FirebaseQuestionsService.getAllQuestions()
    console.log('✅ Questions read successful:', questions.length, 'questions found')

    // Test creating a test category
    console.log('📝 Testing category write access...')
    const testCategory = {
      name: 'Test Category ' + Date.now(),
      color: 'bg-gray-500',
      image: '🧪',
      imageUrl: ''
    }
    const categoryId = await FirebaseQuestionsService.saveCategory(testCategory)
    console.log('✅ Category write successful, ID:', categoryId)

    // Test creating a test question
    console.log('❓ Testing question write access...')
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
    console.log('✅ Question write successful, ID:', questionId)

    console.log('\n🎉 All Firebase permissions are working correctly!')
    return true

  } catch (error) {
    console.error('❌ Firebase permission error:', error)
    console.error('   Error code:', error.code)
    console.error('   Error message:', error.message)

    if (error.code === 'permission-denied') {
      console.log('\n💡 Troubleshooting steps:')
      console.log('1. Make sure you are logged in as an authenticated user')
      console.log('2. Check that Firestore rules allow access to questions/categories collections')
      console.log('3. Verify the Firebase project configuration')
      console.log('4. Try running: npx firebase deploy --only firestore:rules')
    }

    return false
  }
}

/**
 * Quick Firebase connection test
 */
export const testFirebaseConnection = async () => {
  console.log('🌐 Testing Firebase Connection...')

  try {
    // Test auth connection
    const user = auth.currentUser
    console.log('Auth status:', user ? 'Connected' : 'Not authenticated')

    // Test Firestore connection by getting stats
    const stats = await FirebaseQuestionsService.getQuestionStats()
    console.log('✅ Firestore connection successful')
    console.log('Database stats:', stats)

    return true
  } catch (error) {
    console.error('❌ Firebase connection failed:', error)
    return false
  }
}

// Make functions available in browser console
if (typeof window !== 'undefined') {
  window.debugFirebaseAuth = debugFirebaseAuth
  window.testFirebaseConnection = testFirebaseConnection
}