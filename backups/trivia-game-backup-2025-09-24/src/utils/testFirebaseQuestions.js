import { FirebaseQuestionsService } from './firebaseQuestions'

/**
 * Test Firebase question import functionality
 * This can be run from the browser console to test the implementation
 */
export const testFirebaseImport = async () => {
  console.log('🧪 Testing Firebase Questions Service...')

  try {
    // Test data
    const testQuestions = [
      {
        text: 'ما هي عاصمة مصر؟',
        answer: 'القاهرة',
        difficulty: 'easy',
        points: 200,
        type: 'text',
        categoryId: 'geography',
        categoryName: 'جغرافيا'
      },
      {
        text: 'ما هي عاصمة فرنسا؟',
        answer: 'باريس',
        difficulty: 'easy',
        points: 200,
        type: 'multiple_choice',
        options: ['باريس', 'لندن', 'روما', 'برلين'],
        categoryId: 'geography',
        categoryName: 'جغرافيا'
      },
      {
        text: 'ما هي عاصمة مصر؟', // Duplicate question
        answer: 'القاهرة',
        difficulty: 'easy',
        points: 200,
        type: 'text',
        categoryId: 'geography',
        categoryName: 'جغرافيا'
      },
      {
        text: 'ما هي عاصمة مصر؟', // Same question, different answer
        answer: 'الإسكندرية',
        difficulty: 'medium',
        points: 400,
        type: 'text',
        categoryId: 'geography',
        categoryName: 'جغرافيا'
      }
    ]

    console.log('📊 Test data prepared:', testQuestions)

    // Test 1: Create categories
    console.log('\n🧪 Test 1: Creating categories...')
    const categoryResult = await FirebaseQuestionsService.createCategoriesFromQuestions(testQuestions)
    console.log('✅ Category creation result:', categoryResult)

    // Test 2: Import questions with duplicate detection
    console.log('\n🧪 Test 2: Importing questions...')
    const importResult = await FirebaseQuestionsService.importQuestions(testQuestions)
    console.log('✅ Import result:', importResult)

    // Test 3: Get question statistics
    console.log('\n🧪 Test 3: Getting statistics...')
    const stats = await FirebaseQuestionsService.getQuestionStats()
    console.log('✅ Statistics:', stats)

    // Test 4: Get all questions
    console.log('\n🧪 Test 4: Getting all questions...')
    const allQuestions = await FirebaseQuestionsService.getAllQuestions()
    console.log('✅ All questions:', allQuestions)

    // Test 5: Test duplicate detection
    console.log('\n🧪 Test 5: Testing duplicate detection...')
    const duplicate = await FirebaseQuestionsService.findDuplicateQuestion('ما هي عاصمة مصر؟', 'القاهرة')
    console.log('✅ Duplicate found:', duplicate)

    const similar = await FirebaseQuestionsService.findSimilarQuestions('ما هي عاصمة مصر؟')
    console.log('✅ Similar questions:', similar)

    console.log('\n🎉 All tests completed successfully!')

    return {
      categoryResult,
      importResult,
      stats,
      allQuestions,
      duplicate,
      similar
    }

  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

/**
 * Test bulk import functionality
 */
export const testBulkImport = async () => {
  console.log('🧪 Testing bulk import functionality...')

  const testBulkText = `من هو مؤسس شركة مايكروسوفت؟؛بيل غيتس؛بيل غيتس؛ستيف جوبز؛مارك زوكربيرغ؛إيلون ماسك؛تكنولوجيا؛؛سهل
ما هي عاصمة اليابان؟؛طوكيو؛طوكيو؛كيوتو؛أوساكا؛هيروشيما؛جغرافيا؛؛متوسط
كم عدد أيام السنة الميلادية؟؛365؛؛؛؛؛عام؛؛سهل`

  try {
    const { importBulkQuestionsToFirebase } = await import('./importQuestions')
    const result = await importBulkQuestionsToFirebase(testBulkText)
    console.log('✅ Bulk import result:', result)
    return result
  } catch (error) {
    console.error('❌ Bulk import test failed:', error)
    throw error
  }
}

// Make functions available in browser console for manual testing
if (typeof window !== 'undefined') {
  window.testFirebaseImport = testFirebaseImport
  window.testBulkImport = testBulkImport
  window.FirebaseQuestionsService = FirebaseQuestionsService
}