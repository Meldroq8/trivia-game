import { devLog, devWarn, prodError } from "./devLog.js"
import { FirebaseQuestionsService } from './firebaseQuestions'

/**
 * Parse media string with Q: and A: prefixes
 * Format: "Q:image.jpg|A:answer.mp3|Q:video.mp4"
 * Supports: QI/Q_IMG (question image), QA/Q_AUDIO (question audio), QV/Q_VIDEO (question video)
 *          AI/A_IMG (answer image), AA/A_AUDIO (answer audio), AV/A_VIDEO (answer video)
 */
function parseMediaString(mediaString) {
  const result = {
    questionImage: '',
    questionAudio: '',
    questionVideo: '',
    answerImage: '',
    answerAudio: '',
    answerVideo: ''
  }

  if (!mediaString || !mediaString.trim()) {
    return result
  }

  // Split by | to get individual media items
  const mediaItems = mediaString.split('|').filter(item => item.trim())

  mediaItems.forEach((item) => {
    const trimmedItem = item.trim()
    if (!trimmedItem.includes(':')) return

    const [prefix, url] = trimmedItem.split(':', 2)
    const cleanPrefix = prefix.trim().toUpperCase()
    const cleanUrl = url.trim()

    if (!cleanUrl) return

    // Question media prefixes
    if (cleanPrefix === 'Q' || cleanPrefix === 'QI' || cleanPrefix === 'Q_IMG') {
      // Smart detection: if URL contains video extensions, it's video; audio extensions, it's audio; otherwise image
      if (isVideoUrl(cleanUrl)) {
        result.questionVideo = cleanUrl
      } else if (isAudioUrl(cleanUrl)) {
        result.questionAudio = cleanUrl
      } else {
        result.questionImage = cleanUrl
      }
    } else if (cleanPrefix === 'QA' || cleanPrefix === 'Q_AUDIO') {
      result.questionAudio = cleanUrl
    } else if (cleanPrefix === 'QV' || cleanPrefix === 'Q_VIDEO') {
      result.questionVideo = cleanUrl
    }
    // Answer media prefixes
    else if (cleanPrefix === 'A' || cleanPrefix === 'AI' || cleanPrefix === 'A_IMG') {
      // Smart detection for answer media
      if (isVideoUrl(cleanUrl)) {
        result.answerVideo = cleanUrl
      } else if (isAudioUrl(cleanUrl)) {
        result.answerAudio = cleanUrl
      } else {
        result.answerImage = cleanUrl
      }
    } else if (cleanPrefix === 'AA' || cleanPrefix === 'A_AUDIO') {
      result.answerAudio = cleanUrl
    } else if (cleanPrefix === 'AV' || cleanPrefix === 'A_VIDEO') {
      result.answerVideo = cleanUrl
    }
  })

  return result
}

/**
 * Check if URL is a video file
 */
function isVideoUrl(url) {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv']
  const lowerUrl = url.toLowerCase()
  return videoExtensions.some(ext => lowerUrl.includes(ext)) || lowerUrl.includes('video')
}

/**
 * Check if URL is an audio file
 */
function isAudioUrl(url) {
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']
  const lowerUrl = url.toLowerCase()
  return audioExtensions.some(ext => lowerUrl.includes(ext)) || lowerUrl.includes('audio')
}

// Parse bulk questions from text input and import to Firebase
export const importBulkQuestionsToFirebase = async (bulkQuestionsText) => {
  devLog('Starting bulk question import to Firebase...')

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

      // Prefix Notation Format: السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛الوسائط؛مستوى الصعوبة
      // Legacy Format: السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛رابط الصوت؛رابط الصورة؛مستوى الصعوبة
      if (parts.length >= 2) {
        const questionText = parts[0] || ''
        const correctAnswer = parts[1] || ''
        const option1 = parts[2] || ''
        const option2 = parts[3] || ''
        const option3 = parts[4] || ''
        const option4 = parts[5] || ''
        const questionCategory = parts[6] || ''

        // Parse media based on format
        let audioUrl = '', imageUrl = '', videoUrl = ''
        let answerAudioUrl = '', answerImageUrl = '', answerVideoUrl = ''
        let difficultyText = 'سهل'

        if (parts.length === 9) {
          // New Prefix Notation Format: السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛الوسائط؛مستوى الصعوبة
          const mediaString = parts[7] || ''
          difficultyText = parts[8] || 'سهل'

          // Parse media string with Q: and A: prefixes
          const mediaUrls = parseMediaString(mediaString)
          audioUrl = mediaUrls.questionAudio
          imageUrl = mediaUrls.questionImage
          videoUrl = mediaUrls.questionVideo
          answerAudioUrl = mediaUrls.answerAudio
          answerImageUrl = mediaUrls.answerImage
          answerVideoUrl = mediaUrls.answerVideo


        } else if (parts.length >= 10) {
          // Legacy format - audio and image for questions only
          audioUrl = parts[7] || ''
          imageUrl = parts[8] || ''
          difficultyText = parts[9] || 'سهل'
        } else {
          // Basic format - no media
          difficultyText = parts[7] || 'سهل'
        }

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
          categoryId: categoryId,
          categoryName: questionCategory || 'عام'
        }

        // Only add media fields if they have values (Firebase doesn't accept undefined)
        if (audioUrl && audioUrl.trim()) questionObj.audioUrl = audioUrl.trim()
        if (imageUrl && imageUrl.trim()) questionObj.imageUrl = imageUrl.trim()
        if (videoUrl && videoUrl.trim()) questionObj.videoUrl = videoUrl.trim()
        if (answerAudioUrl && answerAudioUrl.trim()) questionObj.answerAudioUrl = answerAudioUrl.trim()
        if (answerImageUrl && answerImageUrl.trim()) questionObj.answerImageUrl = answerImageUrl.trim()
        if (answerVideoUrl && answerVideoUrl.trim()) questionObj.answerVideoUrl = answerVideoUrl.trim()


        // Add multiple choice options if more than just the correct answer
        if (options.length > 1) {
          questionObj.options = options
          questionObj.type = 'multiple_choice'
        } else {
          questionObj.type = 'text'
        }

        if (questionText && correctAnswer) {
          // Debug log for media questions
          if (audioUrl || videoUrl || answerAudioUrl || answerImageUrl || answerVideoUrl) {
            devLog('🎵🎬 Importing question with media:', {
              text: questionText.substring(0, 50) + '...',
              questionMedia: {
                audio: audioUrl || 'none',
                image: imageUrl || 'none',
                video: videoUrl || 'none'
              },
              answerMedia: {
                audio: answerAudioUrl || 'none',
                image: answerImageUrl || 'none',
                video: answerVideoUrl || 'none'
              }
            })
          }


          parsedQuestions.push(questionObj)
        }
      }
    })

    if (parsedQuestions.length === 0) {
      throw new Error('لم يتم العثور على أسئلة صالحة')
    }

    devLog(`Parsed ${parsedQuestions.length} questions for Firebase import`)

    // Create categories first
    devLog('Creating categories in Firebase...')
    const categoryResults = await FirebaseQuestionsService.createCategoriesFromQuestions(parsedQuestions)

    // Import questions to Firebase with duplicate detection
    devLog('Importing questions to Firebase...')
    const importResults = await FirebaseQuestionsService.importQuestions(parsedQuestions)

    devLog('Bulk import to Firebase completed successfully')

    return {
      parsedQuestions,
      firebaseResults: {
        categories: categoryResults,
        questions: importResults
      }
    }

  } catch (error) {
    prodError('Error in bulk import to Firebase:', error)
    throw error
  }
}

// Utility to import questions from CSV data
export const importAllQuestions = async () => {
  devLog('Starting automatic question import...')

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

    devLog(`Found ${questionLines.length} questions to import`)

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
        prodError(`Error parsing line ${index + 2}:`, error, line)
      }
    })

    devLog(`Parsed ${allQuestions.length} valid questions`)
    devLog(`Found ${newCategories.size} unique categories:`, Array.from(newCategories))

    // Create categories first
    devLog('Creating categories in Firebase...')
    const categoryResults = await FirebaseQuestionsService.createCategoriesFromQuestions(allQuestions)

    // Import questions to Firebase with duplicate detection
    devLog('Importing questions to Firebase...')
    const importResults = await FirebaseQuestionsService.importQuestions(allQuestions)

    // Also save to localStorage for backward compatibility
    const parsedData = {
      questions: allQuestions,
      categories: Array.from(newCategories)
    }
    addQuestionsToStorage(parsedData)
    devLog('✅ CSV data also saved to localStorage for backward compatibility')

    // Return combined results
    return {
      parsedData,
      firebaseResults: {
        categories: categoryResults,
        questions: importResults
      }
    }

  } catch (error) {
    prodError('Error importing questions:', error)
    throw error
  }
}

export const addQuestionsToStorage = (parsedData) => {
  devLog('Adding questions to localStorage...')

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

    devLog(`Adding ${newQuestions.length} new questions to ${categoryId} (${questionsByCategory[categoryId].length - newQuestions.length} duplicates skipped)`)

    data.questions[categoryId] = [
      ...data.questions[categoryId],
      ...newQuestions
    ]
  })

  // Save to localStorage with quota handling
  try {
    const dataString = JSON.stringify(data)
    const dataSize = new Blob([dataString]).size
    devLog(`Data size: ${(dataSize / 1024 / 1024).toFixed(2)} MB`)

    // Check if data is too large (localStorage limit is typically 5-10MB)
    if (dataSize > 5 * 1024 * 1024) { // 5MB limit
      devWarn('Data too large for localStorage, compressing...')

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
      devLog('Saved compressed data with limited questions per category')
    } else {
      localStorage.setItem('triviaData', dataString)
    }
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      prodError('localStorage quota exceeded. Trying to save with reduced data...')

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
        devLog('Saved minimal data set (20 questions per category)')
      } catch (e) {
        prodError('Cannot save even minimal data:', e)
        alert('Storage full. Please clear browser data or use fewer questions.')
        throw e
      }
    } else {
      throw error
    }
  }

  devLog(`Added ${parsedData.questions.length} questions`)
  devLog(`Created ${createdCategories.length} new categories:`, createdCategories)

  return {
    questionsAdded: parsedData.questions.length,
    categoriesCreated: createdCategories.length,
    newCategories: createdCategories
  }
}

// Force import version that bypasses duplicate detection
export const importBulkQuestionsToFirebaseForced = async (bulkQuestionsText) => {
  devLog('Starting FORCED bulk question import to Firebase (bypassing duplicate detection)...')

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

      // Prefix Notation Format: السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛الوسائط؛مستوى الصعوبة
      // Legacy Format: السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛رابط الصوت؛رابط الصورة؛مستوى الصعوبة
      if (parts.length >= 2) {
        const questionText = parts[0] || ''
        const correctAnswer = parts[1] || ''
        const option1 = parts[2] || ''
        const option2 = parts[3] || ''
        const option3 = parts[4] || ''
        const option4 = parts[5] || ''
        const questionCategory = parts[6] || ''

        // Parse media based on format
        let audioUrl = '', imageUrl = '', videoUrl = ''
        let answerAudioUrl = '', answerImageUrl = '', answerVideoUrl = ''
        let difficultyText = 'سهل'

        if (parts.length === 9) {
          // New Prefix Notation Format: السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛الوسائط؛مستوى الصعوبة
          const mediaString = parts[7] || ''
          difficultyText = parts[8] || 'سهل'

          // Parse media string with Q: and A: prefixes
          const mediaUrls = parseMediaString(mediaString)
          audioUrl = mediaUrls.questionAudio
          imageUrl = mediaUrls.questionImage
          videoUrl = mediaUrls.questionVideo
          answerAudioUrl = mediaUrls.answerAudio
          answerImageUrl = mediaUrls.answerImage
          answerVideoUrl = mediaUrls.answerVideo

        } else if (parts.length >= 10) {
          // Legacy format - audio and image for questions only
          audioUrl = parts[7] || ''
          imageUrl = parts[8] || ''
          difficultyText = parts[9] || 'سهل'
        } else {
          // Basic format - no media
          difficultyText = parts[7] || 'سهل'
        }

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
          categoryId: categoryId,
          categoryName: questionCategory || 'عام'
        }

        // Only add media fields if they have values (Firebase doesn't accept undefined)
        if (audioUrl && audioUrl.trim()) questionObj.audioUrl = audioUrl.trim()
        if (imageUrl && imageUrl.trim()) questionObj.imageUrl = imageUrl.trim()
        if (videoUrl && videoUrl.trim()) questionObj.videoUrl = videoUrl.trim()
        if (answerAudioUrl && answerAudioUrl.trim()) questionObj.answerAudioUrl = answerAudioUrl.trim()
        if (answerImageUrl && answerImageUrl.trim()) questionObj.answerImageUrl = answerImageUrl.trim()
        if (answerVideoUrl && answerVideoUrl.trim()) questionObj.answerVideoUrl = answerVideoUrl.trim()

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
            devLog('🎵 Force importing question with audio:', {
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

    devLog(`Parsed ${parsedQuestions.length} questions for FORCED Firebase import`)

    // Create categories first
    devLog('Creating categories in Firebase...')
    const categoryResults = await FirebaseQuestionsService.createCategoriesFromQuestions(parsedQuestions)

    // Import questions to Firebase WITHOUT duplicate detection - force add all
    devLog('FORCE importing questions to Firebase (bypassing duplicate detection)...')
    const importResults = await FirebaseQuestionsService.forceImportQuestions(parsedQuestions)

    devLog('FORCED bulk import to Firebase completed successfully')

    return {
      firebaseResults: {
        questions: importResults,
        categories: categoryResults
      }
    }

  } catch (error) {
    prodError('Error in forced bulk import to Firebase:', error)
    throw error
  }
}