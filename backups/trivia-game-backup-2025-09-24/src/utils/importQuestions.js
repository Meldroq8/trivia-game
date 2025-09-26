import { FirebaseQuestionsService } from './firebaseQuestions'

// Parse bulk questions from text input and import to Firebase
export const importBulkQuestionsToFirebase = async (bulkQuestionsText) => {
  console.log('Starting bulk question import to Firebase...')

  try {
    if (!bulkQuestionsText || typeof bulkQuestionsText !== 'string') {
      throw new Error('Invalid bulk questions text provided')
    }
    const lines = bulkQuestionsText.trim().split('\n').filter(line => line && line.trim())
    const parsedQuestions = []

    lines.forEach((line, index) => {
      if (!line || !line.trim()) return

      // Split by semicolon
      const parts = line.split('؛').map(part => (part || '').trim())

      // Expected format: السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛رابط الصوت؛رابط الصورة؛مستوى الصعوبة
      if (parts.length >= 2) {
        const questionText = parts[0] || ''
        const correctAnswer = parts[1] || ''
        const option1 = parts[2] || ''
        const option2 = parts[3] || ''
        const option3 = parts[4] || ''
        const option4 = parts[5] || ''
        const questionCategory = parts[6] || ''
        const audioUrl = parts[7] || ''
        const imageUrl = parts[8] || ''
        const difficultyText = parts[9] || 'سهل'

        // Parse difficulty
        let difficulty = 'easy'
        let points = 200
        if (difficultyText.toLowerCase().includes('medium') || difficultyText.includes('متوسط')) {
          difficulty = 'medium'
          points = 400
        } else if (difficultyText.toLowerCase().includes('hard') || difficultyText.includes('صعب')) {
          difficulty = 'hard'
          points = 600
        }

        // Create options array (remove empty options)
        const options = [option1, option2, option3, option4].filter(opt => opt && opt.trim())

        // Generate category ID from name
        const categoryId = questionCategory ?
          questionCategory.toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^\w\u0600-\u06FF]/g, '')
            .substring(0, 20) : 'general'

        const questionObj = {
          text: questionText,
          answer: correctAnswer,
          difficulty: difficulty,
          points: points,
          audioUrl: audioUrl || undefined,
          imageUrl: imageUrl || undefined,
          categoryId: categoryId,
          categoryName: questionCategory || 'عام'
        }

        // Add multiple choice options if more than just the correct answer
        if (options.length > 1) {
          questionObj.options = options
          questionObj.type = 'multiple_choice'
        } else {
          questionObj.type = 'text'
        }

        if (questionText && correctAnswer) {
          // Debug log for audio questions
          if (audioUrl) {
            console.log('🎵 Importing question with audio:', {
              text: questionText,
              audioUrl: audioUrl,
              imageUrl: imageUrl
            })
          }
          parsedQuestions.push(questionObj)
        }
      }
    })

    if (parsedQuestions.length === 0) {
      throw new Error('لم يتم العثور على أسئلة صالحة')
    }

    console.log(`Parsed ${parsedQuestions.length} questions for Firebase import`)

    // Create categories first
    console.log('Creating categories in Firebase...')
    const categoryResults = await FirebaseQuestionsService.createCategoriesFromQuestions(parsedQuestions)

    // Import questions to Firebase with duplicate detection
    console.log('Importing questions to Firebase...')
    const importResults = await FirebaseQuestionsService.importQuestions(parsedQuestions)

    console.log('Bulk import to Firebase completed successfully')

    return {
      parsedQuestions,
      firebaseResults: {
        categories: categoryResults,
        questions: importResults
      }
    }

  } catch (error) {
    console.error('Error in bulk import to Firebase:', error)
    throw error
  }
}

// Utility to import questions from CSV data
export const importAllQuestions = async () => {
  console.log('Starting automatic question import...')

  try {
    // Read the CSV file content
    const response = await fetch('/all_questions_2025-09-11.csv')
    const csvContent = await response.text()

    if (!csvContent || typeof csvContent !== 'string') {
      throw new Error('Failed to read CSV content or invalid content received')
    }

    // Parse CSV lines (skip header)
    const lines = csvContent.trim().split('\n').filter(line => line && line.trim())
    const questionLines = lines.slice(1) // Skip header

    console.log(`Found ${questionLines.length} questions to import`)

    // Parse each question line
    const allQuestions = []
    const newCategories = new Set()

    questionLines.forEach((line, index) => {
      try {
        const parts = line.split('؛').map(part => (part || '').trim())

        if (parts.length >= 2) {
          const questionText = parts[0] || ''
          const correctAnswer = parts[1] || ''
          const option1 = parts[2] || ''
          const option2 = parts[3] || ''
          const option3 = parts[4] || ''
          const option4 = parts[5] || ''
          const questionCategory = parts[6] || ''
          const imageUrl = parts[7] || ''
          const difficultyText = parts[8] || 'سهل'

          // Parse difficulty
          let difficulty = 'easy'
          let points = 200
          if (difficultyText.toLowerCase().includes('medium') || difficultyText.includes('متوسط')) {
            difficulty = 'medium'
            points = 400
          } else if (difficultyText.toLowerCase().includes('hard') || difficultyText.includes('صعب')) {
            difficulty = 'hard'
            points = 600
          }

          // Create options array
          const options = [option1, option2, option3, option4].filter(opt => opt && opt.trim())

          // Generate category ID from name
          const categoryId = questionCategory ?
            questionCategory.toLowerCase()
              .replace(/\s+/g, '_')
              .replace(/[^\w\u0600-\u06FF]/g, '')
              .substring(0, 20) : 'general'

          const questionObj = {
            text: questionText,
            answer: correctAnswer,
            difficulty: difficulty,
            points: points,
            imageUrl: imageUrl || undefined,
            categoryId: categoryId,
            categoryName: questionCategory || 'عام'
          }

          // Add multiple choice options if more than just the correct answer
          if (options.length > 1) {
            questionObj.options = options
            questionObj.type = 'multiple_choice'
          } else {
            questionObj.type = 'text'
          }

          if (questionText && correctAnswer) {
            allQuestions.push(questionObj)
            if (questionCategory) {
              newCategories.add(questionCategory)
            }
          }
        }
      } catch (error) {
        console.error(`Error parsing line ${index + 2}:`, error, line)
      }
    })

    console.log(`Parsed ${allQuestions.length} valid questions`)
    console.log(`Found ${newCategories.size} unique categories:`, Array.from(newCategories))

    // Create categories first
    console.log('Creating categories in Firebase...')
    const categoryResults = await FirebaseQuestionsService.createCategoriesFromQuestions(allQuestions)

    // Import questions to Firebase with duplicate detection
    console.log('Importing questions to Firebase...')
    const importResults = await FirebaseQuestionsService.importQuestions(allQuestions)

    // Also save to localStorage for backward compatibility
    const parsedData = {
      questions: allQuestions,
      categories: Array.from(newCategories)
    }
    addQuestionsToStorage(parsedData)
    console.log('✅ CSV data also saved to localStorage for backward compatibility')

    // Return combined results
    return {
      parsedData,
      firebaseResults: {
        categories: categoryResults,
        questions: importResults
      }
    }

  } catch (error) {
    console.error('Error importing questions:', error)
    throw error
  }
}

export const addQuestionsToStorage = (parsedData) => {
  console.log('Adding questions to localStorage...')

  // Get current data
  const savedData = localStorage.getItem('triviaData')
  let data = savedData ? JSON.parse(savedData) : {}

  // Ensure structure exists
  if (!data.categories) data.categories = []
  if (!data.questions) data.questions = {}

  // Group questions by category
  const questionsByCategory = {}
  const createdCategories = []

  parsedData.questions.forEach(question => {
    const categoryName = question.category || 'عام'

    // Create category if it doesn't exist
    const existingCategory = data.categories.find(cat =>
      cat.name === categoryName || cat.id === categoryName.toLowerCase().replace(/\s+/g, '_')
    )

    if (!existingCategory) {
      const categoryId = categoryName.toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\w\u0600-\u06FF]/g, '')
        .substring(0, 20)

      const newCategory = {
        id: categoryId,
        name: categoryName,
        color: 'bg-gray-500',
        image: '📝',
        imageUrl: ''
      }

      data.categories.push(newCategory)
      createdCategories.push(categoryName)

      if (!questionsByCategory[categoryId]) {
        questionsByCategory[categoryId] = []
      }
      questionsByCategory[categoryId].push(question)
    } else {
      const categoryId = existingCategory.id
      if (!questionsByCategory[categoryId]) {
        questionsByCategory[categoryId] = []
      }
      questionsByCategory[categoryId].push(question)
    }
  })

  // Add questions to existing questions (avoiding duplicates)
  Object.keys(questionsByCategory).forEach(categoryId => {
    if (!data.questions[categoryId]) {
      data.questions[categoryId] = []
    }

    // Filter out duplicates by checking question text and answer
    const newQuestions = questionsByCategory[categoryId].filter(newQuestion => {
      return !data.questions[categoryId].some(existingQuestion =>
        existingQuestion.text === newQuestion.text &&
        existingQuestion.answer === newQuestion.answer
      )
    })

    console.log(`Adding ${newQuestions.length} new questions to ${categoryId} (${questionsByCategory[categoryId].length - newQuestions.length} duplicates skipped)`)

    data.questions[categoryId] = [
      ...data.questions[categoryId],
      ...newQuestions
    ]
  })

  // Save to localStorage with quota handling
  try {
    const dataString = JSON.stringify(data)
    const dataSize = new Blob([dataString]).size
    console.log(`Data size: ${(dataSize / 1024 / 1024).toFixed(2)} MB`)

    // Check if data is too large (localStorage limit is typically 5-10MB)
    if (dataSize > 5 * 1024 * 1024) { // 5MB limit
      console.warn('Data too large for localStorage, compressing...')

      // Try to reduce data by removing unnecessary fields or limiting questions per category
      const compressedData = {
        ...data,
        questions: {}
      }

      // Limit to 50 questions per category to avoid quota
      Object.keys(data.questions).forEach(categoryId => {
        const questions = data.questions[categoryId]
        compressedData.questions[categoryId] = questions.slice(0, 50)
      })

      localStorage.setItem('triviaData', JSON.stringify(compressedData))
      console.log('Saved compressed data with limited questions per category')
    } else {
      localStorage.setItem('triviaData', dataString)
    }
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded. Trying to save with reduced data...')

      // Emergency fallback: save only essential data
      const minimalData = {
        categories: data.categories,
        questions: {}
      }

      // Keep only 20 questions per category as emergency fallback
      Object.keys(data.questions).forEach(categoryId => {
        const questions = data.questions[categoryId]
        minimalData.questions[categoryId] = questions.slice(0, 20)
      })

      try {
        localStorage.setItem('triviaData', JSON.stringify(minimalData))
        console.log('Saved minimal data set (20 questions per category)')
      } catch (e) {
        console.error('Cannot save even minimal data:', e)
        alert('Storage full. Please clear browser data or use fewer questions.')
        throw e
      }
    } else {
      throw error
    }
  }

  console.log(`Added ${parsedData.questions.length} questions`)
  console.log(`Created ${createdCategories.length} new categories:`, createdCategories)

  return {
    questionsAdded: parsedData.questions.length,
    categoriesCreated: createdCategories.length,
    newCategories: createdCategories
  }
}

// Force import version that bypasses duplicate detection
export const importBulkQuestionsToFirebaseForced = async (bulkQuestionsText) => {
  console.log('Starting FORCED bulk question import to Firebase (bypassing duplicate detection)...')

  try {
    if (!bulkQuestionsText || typeof bulkQuestionsText !== 'string') {
      throw new Error('Invalid bulk questions text provided')
    }
    const lines = bulkQuestionsText.trim().split('\n').filter(line => line && line.trim())
    const parsedQuestions = []

    lines.forEach((line, index) => {
      if (!line || !line.trim()) return

      // Split by semicolon
      const parts = line.split('؛').map(part => (part || '').trim())

      // Expected format: السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛رابط الصوت؛رابط الصورة؛مستوى الصعوبة
      if (parts.length >= 2) {
        const questionText = parts[0] || ''
        const correctAnswer = parts[1] || ''
        const option1 = parts[2] || ''
        const option2 = parts[3] || ''
        const option3 = parts[4] || ''
        const option4 = parts[5] || ''
        const questionCategory = parts[6] || ''
        const audioUrl = parts[7] || ''
        const imageUrl = parts[8] || ''
        const difficultyText = parts[9] || 'سهل'

        // Parse difficulty
        let difficulty = 'easy'
        let points = 200
        if (difficultyText.toLowerCase().includes('medium') || difficultyText.includes('متوسط')) {
          difficulty = 'medium'
          points = 400
        } else if (difficultyText.toLowerCase().includes('hard') || difficultyText.includes('صعب')) {
          difficulty = 'hard'
          points = 600
        }

        // Create options array (remove empty options)
        const options = [option1, option2, option3, option4].filter(opt => opt && opt.trim())

        // Generate category ID from name
        const categoryId = questionCategory ?
          questionCategory.toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^\w\u0600-\u06FF]/g, '')
            .substring(0, 20) : 'general'

        const questionObj = {
          text: questionText,
          answer: correctAnswer,
          difficulty: difficulty,
          points: points,
          audioUrl: audioUrl || undefined,
          imageUrl: imageUrl || undefined,
          categoryId: categoryId,
          categoryName: questionCategory || 'عام'
        }

        // Add multiple choice options if more than just the correct answer
        if (options.length > 1) {
          questionObj.options = options
          questionObj.type = 'multiple_choice'
        } else {
          questionObj.type = 'text'
        }

        if (questionText && correctAnswer) {
          // Debug log for audio questions
          if (audioUrl) {
            console.log('🎵 Force importing question with audio:', {
              text: questionText,
              audioUrl: audioUrl,
              imageUrl: imageUrl
            })
          }
          parsedQuestions.push(questionObj)
        }
      }
    })

    if (parsedQuestions.length === 0) {
      throw new Error('لم يتم العثور على أسئلة صالحة')
    }

    console.log(`Parsed ${parsedQuestions.length} questions for FORCED Firebase import`)

    // Create categories first
    console.log('Creating categories in Firebase...')
    const categoryResults = await FirebaseQuestionsService.createCategoriesFromQuestions(parsedQuestions)

    // Import questions to Firebase WITHOUT duplicate detection - force add all
    console.log('FORCE importing questions to Firebase (bypassing duplicate detection)...')
    const importResults = await FirebaseQuestionsService.forceImportQuestions(parsedQuestions)

    console.log('FORCED bulk import to Firebase completed successfully')

    return {
      firebaseResults: {
        questions: importResults,
        categories: categoryResults
      }
    }

  } catch (error) {
    console.error('Error in forced bulk import to Firebase:', error)
    throw error
  }
}