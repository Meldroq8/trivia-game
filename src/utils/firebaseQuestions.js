import { devLog, devWarn, prodError } from "./devLog.js"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  arrayUnion,
  serverTimestamp,
  increment
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { createProgressTracker } from './progressTracker'

export class FirebaseQuestionsService {
  static COLLECTIONS = {
    QUESTIONS: 'questions',
    CATEGORIES: 'categories',
    PENDING_QUESTIONS: 'pending-questions',
    MASTER_CATEGORIES: 'masterCategories',
    QUESTION_REPORTS: 'questionReports',
    NOTIFICATIONS: 'notifications'
  }

  /**
   * Generate a tracking ID for a question (must match questionUsageTracker.getQuestionId)
   * @param {Object} question - Question object
   * @param {string} categoryId - Category ID
   * @returns {string} Tracking ID
   */
  static generateTrackingId(question, categoryId) {
    // PREFERRED: Use Firebase document ID if available (most unique)
    if (question.id && typeof question.id === 'string' && question.id.length > 5) {
      return `${categoryId}-${question.id}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
    }
    // FALLBACK: Use text + answer combination
    const text = String(question.text || '')
    const answer = String(question.answer || '')
    const textPart = text.substring(0, 100)
    const answerPart = answer.substring(0, 50)
    return `${categoryId}-${textPart}-${answerPart}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
  }

  /**
   * Get all questions from Firebase
   * @returns {Promise<Array>} Array of questions with their IDs
   */
  static async getAllQuestions() {
    try {
      const questionsRef = collection(db, this.COLLECTIONS.QUESTIONS)
      const snapshot = await getDocs(questionsRef)

      const questions = []
      snapshot.forEach(doc => {
        questions.push({
          id: doc.id,
          ...doc.data()
        })
      })

      devLog(`Retrieved ${questions.length} questions from Firebase`)
      return questions
    } catch (error) {
      prodError('Error getting questions from Firebase:', error)
      throw error
    }
  }

  /**
   * Get questions by category
   * @param {string} categoryId - The category ID
   * @returns {Promise<Array>} Array of questions for the category
   */
  static async getQuestionsByCategory(categoryId) {
    try {
      const questionsRef = collection(db, this.COLLECTIONS.QUESTIONS)
      const q = query(questionsRef, where('categoryId', '==', categoryId))
      const snapshot = await getDocs(q)

      const questions = []
      snapshot.forEach(doc => {
        questions.push({
          id: doc.id,
          ...doc.data()
        })
      })

      return questions
    } catch (error) {
      prodError('Error getting questions by category:', error)
      throw error
    }
  }

  /**
   * Get a single question by ID
   * @param {string} questionId - The question ID
   * @returns {Promise<Object|null>} Question data or null if not found
   */
  static async getQuestionById(questionId) {
    try {
      const questionRef = doc(db, this.COLLECTIONS.QUESTIONS, questionId)
      const questionDoc = await getDoc(questionRef)

      if (questionDoc.exists()) {
        return {
          id: questionDoc.id,
          ...questionDoc.data()
        }
      }

      return null
    } catch (error) {
      prodError('Error getting question by ID:', error)
      throw error
    }
  }

  /**
   * Check for duplicate questions based on text and answer
   * @param {string} questionText - The question text
   * @param {string} answer - The answer text
   * @returns {Promise<Object|null>} Existing question if found, null otherwise
   */
  static async findDuplicateQuestion(questionText, answer) {
    try {
      const questionsRef = collection(db, this.COLLECTIONS.QUESTIONS)
      const q = query(
        questionsRef,
        where('text', '==', questionText),
        where('answer', '==', answer)
      )
      const snapshot = await getDocs(q)

      if (!snapshot.empty) {
        const doc = snapshot.docs[0]
        return {
          id: doc.id,
          ...doc.data()
        }
      }

      return null
    } catch (error) {
      prodError('Error checking for duplicate question:', error)
      throw error
    }
  }

  /**
   * Check for questions with same text but different answers
   * @param {string} questionText - The question text
   * @returns {Promise<Array>} Array of questions with same text
   */
  static async findSimilarQuestions(questionText) {
    try {
      const questionsRef = collection(db, this.COLLECTIONS.QUESTIONS)
      const q = query(questionsRef, where('text', '==', questionText))
      const snapshot = await getDocs(q)

      const questions = []
      snapshot.forEach(doc => {
        questions.push({
          id: doc.id,
          ...doc.data()
        })
      })

      return questions
    } catch (error) {
      prodError('Error finding similar questions:', error)
      throw error
    }
  }

  /**
   * Add a single question to Firebase
   * @param {Object} questionData - The question data
   * @returns {Promise<string>} The document ID of the added question
   */
  static async addQuestion(questionData) {
    try {

      // Add timestamp and default fields
      const questionWithTimestamp = {
        ...questionData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      const docRef = await addDoc(collection(db, this.COLLECTIONS.QUESTIONS), questionWithTimestamp)
      devLog('Question added with ID:', docRef.id)
      return docRef.id
    } catch (error) {
      prodError('Error adding question:', error)
      throw error
    }
  }

  /**
   * Add a single question to a specific category
   * @param {string} categoryId - The category ID to add the question to
   * @param {Object} questionData - The question data
   * @returns {Promise<string>} The ID of the added question
   */
  static async addSingleQuestion(categoryId, questionData) {
    try {
      devLog('Adding single question to category:', categoryId, questionData)

      // Prepare the question data with all required fields
      const questionWithMetadata = {
        ...questionData,
        categoryId: categoryId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      // Add the question to Firebase
      const docRef = await addDoc(collection(db, this.COLLECTIONS.QUESTIONS), questionWithMetadata)
      devLog('Single question added with ID:', docRef.id)

      return docRef.id
    } catch (error) {
      prodError('Error adding single question:', error)
      throw error
    }
  }

  /**
   * Import questions with duplicate detection (optimized version)
   * @param {Array} questions - Array of question objects
   * @returns {Promise<Object>} Import results with statistics
   */
  static async importQuestions(questions) {
    devLog(`Starting optimized import of ${questions.length} questions...`)

    const results = {
      total: questions.length,
      added: 0,
      duplicatesSkipped: 0,
      similarQuestionsAdded: 0,
      errors: [],
      addedQuestions: [],
      skippedQuestions: []
    }

    try {
      // Step 1: Get all existing questions in one batch to check for duplicates
      devLog('📥 Loading existing questions for duplicate detection...')
      const existingQuestions = await this.getAllQuestions()

      // Create lookup maps for faster duplicate detection
      const exactDuplicateMap = new Map() // key: "text|answer", value: question
      const textMap = new Map() // key: text, value: array of questions

      existingQuestions.forEach(q => {
        const exactKey = `${q.text}|${q.answer}`
        exactDuplicateMap.set(exactKey, q)

        if (!textMap.has(q.text)) {
          textMap.set(q.text, [])
        }
        textMap.get(q.text).push(q)
      })

      devLog(`📊 Found ${existingQuestions.length} existing questions`)

      // Step 2: Process questions in memory to determine what to import
      devLog('🔍 Processing questions for duplicate detection...')
      const questionsToImport = []
      const processTracker = createProgressTracker(questions.length, 'Duplicate Detection')

      for (let i = 0; i < questions.length; i++) {
        const question = questions[i]
        const exactKey = `${question.text}|${question.answer}`

        try {
          // Check for exact duplicate
          if (exactDuplicateMap.has(exactKey)) {
            results.duplicatesSkipped++
            results.skippedQuestions.push({
              question: question.text,
              reason: 'Exact duplicate',
              existingId: exactDuplicateMap.get(exactKey).id
            })
            processTracker.update(1, `Skipped duplicate: "${question.text.substring(0, 30)}..."`)
            continue
          }

          // Check for similar questions (same text, different answer)
          const similarQuestions = textMap.get(question.text) || []
          const hasExactAnswer = similarQuestions.some(q => q.answer === question.answer)

          if (hasExactAnswer) {
            // Double-check - this should be caught above but just in case
            results.duplicatesSkipped++
            results.skippedQuestions.push({
              question: question.text,
              reason: 'Same question and answer already exists',
              existingAnswers: similarQuestions.map(q => q.answer)
            })
            processTracker.update(1, `Skipped duplicate answer: "${question.text.substring(0, 30)}..."`)
            continue
          }

          // If same question text but different answer, allow it
          if (similarQuestions.length > 0) {
            results.similarQuestionsAdded++
            processTracker.update(1, `Similar question: "${question.text.substring(0, 30)}..."`)
          } else {
            processTracker.update(1, `New question: "${question.text.substring(0, 30)}..."`)
          }

          // This question will be imported
          questionsToImport.push(question)

          // Update our local maps to prevent duplicates within this import batch
          exactDuplicateMap.set(exactKey, question)
          if (!textMap.has(question.text)) {
            textMap.set(question.text, [])
          }
          textMap.get(question.text).push(question)

        } catch (error) {
          prodError(`Error processing question ${i + 1}:`, error)
          results.errors.push({
            questionIndex: i,
            question: question.text,
            error: error.message
          })
          processTracker.update(1, `Error processing question`)
        }
      }

      processTracker.complete(`${questionsToImport.length} questions ready for import`)

      devLog(`📋 Prepared ${questionsToImport.length} questions for import`)

      // Step 3: Import questions in batches
      if (questionsToImport.length > 0) {
        devLog('💾 Starting batch import to Firebase...')
        const importTracker = createProgressTracker(questionsToImport.length, 'Firebase Import')

        const batch = writeBatch(db)
        let batchOperations = 0
        const maxBatchSize = 500 // Firestore batch limit

        for (let i = 0; i < questionsToImport.length; i++) {
          const question = questionsToImport[i]

          try {
            // Prepare question data for Firestore
            const questionData = {
              text: question.text,
              answer: question.answer,
              difficulty: question.difficulty || 'easy',
              points: question.points || 200,
              type: question.type || 'text',
              categoryId: question.categoryId || question.category || 'general',
              categoryName: question.categoryName || question.category || 'عام',
              imageUrl: question.imageUrl || null,
              audioUrl: question.audioUrl || null,
              videoUrl: question.videoUrl || null,
              answerImageUrl: question.answerImageUrl || null,
              answerAudioUrl: question.answerAudioUrl || null,
              answerVideoUrl: question.answerVideoUrl || null,
              options: question.options || [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            }

            // Add to batch
            const docRef = doc(collection(db, this.COLLECTIONS.QUESTIONS))
            batch.set(docRef, questionData)
            batchOperations++

            results.addedQuestions.push({
              tempId: docRef.id,
              question: question.text,
              answer: question.answer,
              categoryId: questionData.categoryId
            })

            // Commit batch if it reaches the limit
            if (batchOperations >= maxBatchSize) {
              await batch.commit()
              results.added += batchOperations
              importTracker.update(batchOperations, `Committed batch of ${batchOperations} questions`)
              batchOperations = 0

              // Create a new batch for remaining operations
              const newBatch = writeBatch(db)
              Object.setPrototypeOf(batch, Object.getPrototypeOf(newBatch))
              Object.assign(batch, newBatch)
            }

          } catch (error) {
            prodError(`Error preparing question ${i + 1} for batch:`, error)
            results.errors.push({
              questionIndex: i,
              question: question.text,
              error: error.message
            })
            importTracker.update(1, `Error: ${error.message}`)
          }
        }

        // Commit remaining batch operations
        if (batchOperations > 0) {
          try {
            await batch.commit()
            results.added += batchOperations
            importTracker.update(batchOperations, `Committed final batch of ${batchOperations} questions`)
          } catch (error) {
            prodError('Error committing final batch:', error)
            results.errors.push({
              error: `Failed to commit final batch: ${error.message}`
            })
          }
        }

        importTracker.complete(`Successfully imported ${results.added} questions`)
      }

      devLog('✅ Import completed:', results)
      return results

    } catch (error) {
      prodError('❌ Import failed:', error)
      results.errors.push({
        error: `Import process failed: ${error.message}`
      })
      return results
    }
  }

  /**
   * Get all categories from Firebase
   * @returns {Promise<Array>} Array of categories
   */
  static async getAllCategories() {
    try {
      const categoriesRef = collection(db, this.COLLECTIONS.CATEGORIES)
      const snapshot = await getDocs(categoriesRef)

      const categories = []
      snapshot.forEach(doc => {
        categories.push({
          id: doc.id,
          ...doc.data()
        })
      })

      return categories
    } catch (error) {
      prodError('Error getting categories from Firebase:', error)
      throw error
    }
  }

  /**
   * Get category count from Firebase (lightweight query for cache validation)
   * @returns {Promise<number>} Number of categories
   */
  static async getCategoryCount() {
    try {
      const categoriesRef = collection(db, this.COLLECTIONS.CATEGORIES)
      const snapshot = await getDocs(categoriesRef)
      return snapshot.size
    } catch (error) {
      prodError('Error getting category count:', error)
      throw error
    }
  }

  /**
   * Get the current data version from Firebase (for cache validation)
   * @returns {Promise<number>} Current data version
   */
  static async getDataVersion() {
    try {
      const versionDoc = await getDoc(doc(db, 'settings', 'dataVersion'))
      if (versionDoc.exists()) {
        return versionDoc.data().version || 0
      }
      return 0
    } catch (error) {
      prodError('Error getting data version:', error)
      return 0
    }
  }

  /**
   * Increment the data version (call this when categories change)
   * @returns {Promise<void>}
   */
  static async incrementDataVersion() {
    try {
      const versionRef = doc(db, 'settings', 'dataVersion')
      await setDoc(versionRef, {
        version: increment(1),
        lastUpdated: serverTimestamp()
      }, { merge: true })
      devLog('📈 Data version incremented')
    } catch (error) {
      prodError('Error incrementing data version:', error)
    }
  }

  /**
   * Create a new category
   * @param {Object} categoryData - The category data
   * @returns {Promise<string>} The document ID of the created category
   */
  static async createCategory(categoryData) {
    try {
      devLog('Creating new category:', categoryData)

      const categoryWithTimestamp = {
        ...categoryData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        showImageInQuestion: categoryData.showImageInQuestion !== false, // Default to true
        showImageInAnswer: categoryData.showImageInAnswer !== false       // Default to true
      }

      // Remove any categoryId from the data to avoid storing it as a field
      delete categoryWithTimestamp.categoryId

      const docRef = await addDoc(collection(db, this.COLLECTIONS.CATEGORIES), categoryWithTimestamp)
      devLog(`✅ Category created with ID: ${docRef.id}`)
      // Increment data version so clients refresh their cache
      await this.incrementDataVersion()
      return docRef.id
    } catch (error) {
      prodError('Error creating category:', error)
      throw error
    }
  }

  /**
   * Create or update a category
   * @param {Object} categoryData - The category data
   * @param {string} categoryId - Optional specific document ID for the category
   * @returns {Promise<string>} The document ID
   */
  static async saveCategory(categoryData, categoryId = null) {
    try {
      let resultId
      if (categoryData.id) {
        // Update existing category
        const categoryRef = doc(db, this.COLLECTIONS.CATEGORIES, categoryData.id)
        await updateDoc(categoryRef, {
          ...categoryData,
          updatedAt: serverTimestamp()
        })
        resultId = categoryData.id
      } else if (categoryId) {
        // Create new category with specific ID
        const categoryRef = doc(db, this.COLLECTIONS.CATEGORIES, categoryId)
        const categoryWithTimestamp = {
          ...categoryData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
        // Remove categoryId from the data to avoid storing it as a field
        delete categoryWithTimestamp.categoryId
        await setDoc(categoryRef, categoryWithTimestamp)
        resultId = categoryId
      } else {
        // Create new category with auto-generated ID
        const categoryWithTimestamp = {
          ...categoryData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
        // Remove categoryId from the data to avoid storing it as a field
        delete categoryWithTimestamp.categoryId
        const docRef = await addDoc(collection(db, this.COLLECTIONS.CATEGORIES), categoryWithTimestamp)
        resultId = docRef.id
      }
      // Increment data version so clients refresh their cache
      await this.incrementDataVersion()
      return resultId
    } catch (error) {
      prodError('Error saving category:', error)
      throw error
    }
  }

  /**
   * Create categories from question data
   * @param {Array} questions - Array of questions with category info
   * @returns {Promise<Object>} Results with created categories
   */
  static async createCategoriesFromQuestions(questions) {
    devLog('Creating categories from questions...')

    // Get existing categories
    const existingCategories = await this.getAllCategories()
    const existingCategoryIds = new Set(existingCategories.map(cat => cat.id))
    const existingCategoryNames = new Set(existingCategories.map(cat => cat.name))

    // Extract unique categories from questions
    const categoryMap = new Map()

    questions.forEach(question => {
      const categoryId = question.categoryId || question.category || 'general'
      const categoryName = question.categoryName || question.category || 'عام'

      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          name: categoryName,
          color: 'bg-gray-500',
          image: '📝',
          imageUrl: '',
          showImageInQuestion: true, // Default to true
          showImageInAnswer: true,   // Default to true
          categoryId: categoryId // Store the intended ID separately
        })
      }
    })

    const results = {
      total: categoryMap.size,
      created: 0,
      skipped: 0,
      createdCategories: []
    }

    // Create new categories
    for (const [categoryId, categoryData] of categoryMap) {
      if (!existingCategoryIds.has(categoryId) && !existingCategoryNames.has(categoryData.name)) {
        try {
          const docId = await this.saveCategory(categoryData, categoryId)
          results.created++
          results.createdCategories.push({
            id: docId,
            name: categoryData.name
          })
          devLog(`Created category: ${categoryData.name} with ID: ${docId}`)
        } catch (error) {
          prodError(`Error creating category ${categoryData.name}:`, error)
        }
      } else {
        results.skipped++
        devLog(`Skipped existing category: ${categoryData.name}`)
      }
    }

    devLog('Category creation completed:', results)
    return results
  }

  /**
   * Force import questions without duplicate detection
   * @param {Array} questions - Array of question objects
   * @returns {Promise<Object>} Import results with statistics
   */
  static async forceImportQuestions(questions) {
    devLog(`Starting FORCE import of ${questions.length} questions (bypassing duplicate detection)...`)

    const results = {
      total: questions.length,
      added: 0,
      duplicatesSkipped: 0, // Will always be 0 in force mode
      similarQuestionsAdded: 0,
      errors: [],
      addedQuestions: [],
      skippedQuestions: []
    }

    try {
      const progressTracker = createProgressTracker(questions.length, 'Force Import')
      const batch = writeBatch(db)
      let batchCount = 0
      const BATCH_SIZE = 300

      for (let i = 0; i < questions.length; i++) {
        const question = questions[i]

        try {
          // Add timestamp and default fields
          const questionWithTimestamp = {
            ...question,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }

          // Add to batch without any duplicate checking
          const docRef = doc(collection(db, this.COLLECTIONS.QUESTIONS))
          batch.set(docRef, questionWithTimestamp)
          batchCount++

          results.added++
          results.addedQuestions.push({
            question: question.text,
            answer: question.answer,
            category: question.categoryName
          })

          progressTracker.update(1, `Force added: "${question.text.substring(0, 30)}..."`)

          // Commit batch when it reaches size limit
          if (batchCount >= BATCH_SIZE) {
            await batch.commit()
            devLog(`✅ Committed batch of ${batchCount} questions`)
            // Create new batch
            const newBatch = writeBatch(db)
            Object.assign(batch, newBatch)
            batchCount = 0
          }

        } catch (error) {
          results.errors.push({
            question: question.text,
            error: error.message
          })
          prodError(`Error force importing question "${question.text}":`, error)
          progressTracker.update(1, `Error: "${question.text.substring(0, 30)}..."`)
        }
      }

      // Commit remaining questions in batch
      if (batchCount > 0) {
        await batch.commit()
        devLog(`✅ Committed final batch of ${batchCount} questions`)
      }

      progressTracker.complete()

      devLog(`✅ Force import completed: ${results.added} questions added, ${results.errors.length} errors`)

      return results

    } catch (error) {
      prodError('Error in force import:', error)
      throw error
    }
  }

  /**
   * Delete a question
   * @param {string} questionId - The question document ID
   * @returns {Promise<void>}
   */
  static async deleteQuestion(questionId) {
    try {
      await deleteDoc(doc(db, this.COLLECTIONS.QUESTIONS, questionId))
      devLog(`Question ${questionId} deleted successfully`)
    } catch (error) {
      prodError('Error deleting question:', error)
      throw error
    }
  }

  /**
   * Update a question
   * @param {string} questionId - The question document ID
   * @param {Object} updateData - The data to update
   * @returns {Promise<void>}
   */
  static async updateQuestion(questionId, updateData) {
    try {
      const questionRef = doc(db, this.COLLECTIONS.QUESTIONS, questionId)
      await updateDoc(questionRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      })
      devLog(`Question ${questionId} updated successfully`)
    } catch (error) {
      prodError('Error updating question:', error)
      throw error
    }
  }

  /**
   * Batch update multiple questions efficiently
   * @param {Array} updates - Array of {questionId, updateData} objects
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Object>} Result with success count and errors
   */
  static async batchUpdateQuestions(updates, progressCallback = null) {
    try {
      devLog(`🔄 Starting batch update of ${updates.length} questions...`)

      const results = {
        total: updates.length,
        success: 0,
        errors: []
      }

      const BATCH_SIZE = 500 // Firestore batch limit
      const batches = []

      // Split updates into batches
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        batches.push(updates.slice(i, i + BATCH_SIZE))
      }

      devLog(`📦 Split into ${batches.length} batches`)

      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const currentBatch = batches[batchIndex]
        const batch = writeBatch(db)
        let batchOps = 0

        for (const update of currentBatch) {
          try {
            if (!update.questionId) {
              results.errors.push({
                questionId: 'unknown',
                error: 'Missing question ID'
              })
              continue
            }

            const questionRef = doc(db, this.COLLECTIONS.QUESTIONS, update.questionId)
            batch.update(questionRef, {
              ...update.updateData,
              updatedAt: serverTimestamp()
            })
            batchOps++
          } catch (error) {
            results.errors.push({
              questionId: update.questionId,
              error: error.message
            })
          }
        }

        // Commit the batch
        if (batchOps > 0) {
          try {
            await batch.commit()
            results.success += batchOps
            devLog(`✅ Batch ${batchIndex + 1}/${batches.length}: ${batchOps} questions updated`)

            if (progressCallback) {
              progressCallback(batchIndex + 1, batches.length, batchOps)
            }

            // Add small delay between batches to avoid rate limiting
            if (batchIndex < batches.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          } catch (error) {
            prodError(`Error committing batch ${batchIndex + 1}:`, error)
            results.errors.push({
              batch: batchIndex + 1,
              error: error.message
            })
          }
        }
      }

      devLog(`✅ Batch update complete: ${results.success}/${results.total} successful, ${results.errors.length} errors`)
      return results

    } catch (error) {
      prodError('Error in batch update:', error)
      throw error
    }
  }

  /**
   * Get question statistics
   * @returns {Promise<Object>} Statistics about questions and categories
   */
  static async getQuestionStats() {
    try {
      const questions = await this.getAllQuestions()
      const categories = await this.getAllCategories()

      const stats = {
        totalQuestions: questions.length,
        totalCategories: categories.length,
        questionsByCategory: {},
        questionsByDifficulty: {
          easy: 0,
          medium: 0,
          hard: 0
        }
      }

      // Count questions by category and difficulty
      questions.forEach(question => {
        // By category
        const categoryId = question.categoryId || 'unknown'
        if (!stats.questionsByCategory[categoryId]) {
          stats.questionsByCategory[categoryId] = 0
        }
        stats.questionsByCategory[categoryId]++

        // By difficulty
        const difficulty = question.difficulty || 'easy'
        if (stats.questionsByDifficulty[difficulty] !== undefined) {
          stats.questionsByDifficulty[difficulty]++
        }
      })

      return stats
    } catch (error) {
      prodError('Error getting question stats:', error)
      throw error
    }
  }

  /**
   * Delete a category and all its questions
   * @param {string} categoryId - The category ID to delete
   * @returns {Promise<Object>} Result with count of deleted questions
   */
  static async deleteCategory(categoryId) {
    try {
      devLog(`🗑️ Deleting category: ${categoryId}`)

      // First, get all questions in this category
      const questionsRef = collection(db, this.COLLECTIONS.QUESTIONS)
      const categoryQuestionsQuery = query(questionsRef, where('categoryId', '==', categoryId))
      const questionsSnapshot = await getDocs(categoryQuestionsQuery)

      // Delete all questions in this category using a batch
      const batch = writeBatch(db)
      let deletedQuestionsCount = 0

      questionsSnapshot.forEach((doc) => {
        batch.delete(doc.ref)
        deletedQuestionsCount++
      })

      // Delete the category itself
      const categoryRef = doc(db, this.COLLECTIONS.CATEGORIES, categoryId)
      batch.delete(categoryRef)

      // Commit the batch
      await batch.commit()

      // Increment data version so clients refresh their cache
      await this.incrementDataVersion()

      devLog(`✅ Category ${categoryId} deleted with ${deletedQuestionsCount} questions`)

      return {
        categoryId,
        deletedQuestionsCount,
        success: true
      }
    } catch (error) {
      prodError('Error deleting category:', error)
      throw error
    }
  }

  /**
   * Update a category in Firebase
   * @param {string} categoryId - The category ID
   * @param {Object} updateData - The data to update
   * @returns {Promise<void>}
   */
  static async updateCategory(categoryId, updateData) {
    try {
      const categoryRef = doc(db, this.COLLECTIONS.CATEGORIES, categoryId)
      await updateDoc(categoryRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      })
      devLog(`✅ Category ${categoryId} updated in Firebase`)
    } catch (error) {
      prodError('Error updating category:', error)
      throw error
    }
  }

  /**
   * Create categories from data array
   * @param {Array} categoriesData - Array of category objects
   * @returns {Promise<Object>} Result of category creation
   */
  static async createCategoriesFromData(categoriesData) {
    try {
      const result = {
        created: 0,
        errors: []
      }

      for (const categoryData of categoriesData) {
        try {
          const categoryRef = doc(db, this.COLLECTIONS.CATEGORIES, categoryData.id)
          await setDoc(categoryRef, {
            ...categoryData,
            showImageInQuestion: categoryData.showImageInQuestion !== false, // Default to true
            showImageInAnswer: categoryData.showImageInAnswer !== false,     // Default to true
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true })
          result.created++
          devLog(`✅ Category ${categoryData.id} created/updated in Firebase`)
        } catch (error) {
          prodError(`❌ Error creating category ${categoryData.id}:`, error)
          result.errors.push({
            categoryId: categoryData.id,
            error: error.message
          })
        }
      }

      return result
    } catch (error) {
      prodError('Error creating categories from data:', error)
      throw error
    }
  }

  // ===== PENDING QUESTIONS METHODS =====

  /**
   * Submit a question for approval (moderators use this instead of direct add)
   * @param {string} categoryId - The category ID
   * @param {Object} questionData - The question data
   * @returns {Promise<string>} The document ID of the pending question
   */
  static async submitQuestionForApproval(categoryId, questionData) {
    try {
      devLog('📤 Submitting question for approval:', questionData)

      const pendingQuestion = {
        ...questionData,
        categoryId: categoryId,
        status: 'pending',
        submittedAt: serverTimestamp(),
        submittedBy: questionData.submittedBy || null
      }

      const docRef = await addDoc(collection(db, this.COLLECTIONS.PENDING_QUESTIONS), pendingQuestion)
      devLog('✅ Question submitted for approval with ID:', docRef.id)
      return docRef.id
    } catch (error) {
      prodError('❌ Error submitting question for approval:', error)
      throw error
    }
  }

  /**
   * Get all pending questions for admin review
   * @returns {Promise<Array>} Array of pending questions
   */
  static async getPendingQuestions() {
    try {
      devLog('📥 Fetching pending questions...')

      const q = query(
        collection(db, this.COLLECTIONS.PENDING_QUESTIONS),
        where('status', '==', 'pending'),
        orderBy('submittedAt', 'desc')
      )

      const querySnapshot = await getDocs(q)
      const pendingQuestions = []

      querySnapshot.forEach((doc) => {
        pendingQuestions.push({
          id: doc.id,
          ...doc.data(),
          submittedAt: doc.data().submittedAt?.toDate?.() || new Date()
        })
      })

      devLog(`✅ Loaded ${pendingQuestions.length} pending questions`)
      return pendingQuestions
    } catch (error) {
      prodError('❌ Error fetching pending questions:', error)
      throw error
    }
  }

  /**
   * Approve a pending question (admin only)
   * @param {string} pendingQuestionId - The pending question ID
   * @returns {Promise<string>} The ID of the approved question
   */
  static async approveQuestion(pendingQuestionId) {
    try {
      devLog('✅ Approving question:', pendingQuestionId)

      // Get the pending question data
      const pendingDoc = await this.getDocument(this.COLLECTIONS.PENDING_QUESTIONS, pendingQuestionId)
      if (!pendingDoc) {
        throw new Error('Pending question not found')
      }

      const questionData = { ...pendingDoc }
      delete questionData.id
      delete questionData.status
      delete questionData.submittedAt
      delete questionData.submittedBy

      // Add to questions collection
      const docRef = await addDoc(collection(db, this.COLLECTIONS.QUESTIONS), {
        ...questionData,
        approvedAt: serverTimestamp()
      })

      // Update pending question status
      await updateDoc(doc(db, this.COLLECTIONS.PENDING_QUESTIONS, pendingQuestionId), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        questionId: docRef.id
      })

      devLog('✅ Question approved and added with ID:', docRef.id)
      return docRef.id
    } catch (error) {
      prodError('❌ Error approving question:', error)
      throw error
    }
  }

  /**
   * Deny a pending question (admin only)
   * @param {string} pendingQuestionId - The pending question ID
   * @param {string} reason - Optional reason for denial
   * @returns {Promise<void>}
   */
  static async denyQuestion(pendingQuestionId, reason = '') {
    try {
      devLog('❌ Denying question:', pendingQuestionId, reason ? `Reason: ${reason}` : '')

      await updateDoc(doc(db, this.COLLECTIONS.PENDING_QUESTIONS, pendingQuestionId), {
        status: 'denied',
        deniedAt: serverTimestamp(),
        denialReason: reason
      })

      devLog('✅ Question denied')
    } catch (error) {
      prodError('❌ Error denying question:', error)
      throw error
    }
  }

  /**
   * Delete a pending question (admin only)
   * @param {string} pendingQuestionId - The pending question ID
   * @returns {Promise<void>}
   */
  static async deletePendingQuestion(pendingQuestionId) {
    try {
      devLog('🗑️ Deleting pending question:', pendingQuestionId)

      await deleteDoc(doc(db, this.COLLECTIONS.PENDING_QUESTIONS, pendingQuestionId))

      devLog('✅ Pending question deleted')
    } catch (error) {
      prodError('❌ Error deleting pending question:', error)
      throw error
    }
  }

  /**
   * Get all master categories from Firebase
   * @returns {Promise<Array>} Array of master categories
   */
  static async getAllMasterCategories() {
    try {
      const masterCategoriesRef = collection(db, this.COLLECTIONS.MASTER_CATEGORIES)
      const q = query(masterCategoriesRef, orderBy('order', 'asc'))
      const snapshot = await getDocs(q)

      const masterCategories = []
      snapshot.forEach(doc => {
        masterCategories.push({
          id: doc.id,
          ...doc.data()
        })
      })

      devLog('✅ Loaded master categories:', masterCategories.length)
      return masterCategories
    } catch (error) {
      prodError('Error getting master categories:', error)
      return []
    }
  }

  /**
   * Create a new master category
   * @param {Object} masterData - {name, order}
   * @returns {Promise<string>} Document ID
   */
  static async createMasterCategory(masterData) {
    try {
      devLog('Creating master category:', masterData)

      const docRef = await addDoc(collection(db, this.COLLECTIONS.MASTER_CATEGORIES), {
        name: masterData.name,
        order: masterData.order || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      devLog(`✅ Master category created with ID: ${docRef.id}`)
      return docRef.id
    } catch (error) {
      prodError('Error creating master category:', error)
      throw error
    }
  }

  /**
   * Update a master category
   * @param {string} masterId - Master category ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<void>}
   */
  static async updateMasterCategory(masterId, updateData) {
    try {
      const masterRef = doc(db, this.COLLECTIONS.MASTER_CATEGORIES, masterId)
      await updateDoc(masterRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      })
      devLog(`✅ Master category ${masterId} updated`)
    } catch (error) {
      prodError('Error updating master category:', error)
      throw error
    }
  }

  /**
   * Delete a master category
   * @param {string} masterId - Master category ID
   * @returns {Promise<void>}
   */
  static async deleteMasterCategory(masterId) {
    try {
      // Note: Categories with this masterCategoryId will remain but show under "فئات عامة"
      await deleteDoc(doc(db, this.COLLECTIONS.MASTER_CATEGORIES, masterId))
      devLog(`✅ Master category ${masterId} deleted`)
    } catch (error) {
      prodError('Error deleting master category:', error)
      throw error
    }
  }

  /**
   * Submit a question report
   * @param {Object} reportData - Report data
   * @returns {Promise<string>} Report ID
   */
  static async submitQuestionReport(reportData) {
    try {
      const docRef = await addDoc(collection(db, this.COLLECTIONS.QUESTION_REPORTS), {
        questionId: reportData.questionId,
        questionText: reportData.questionText,
        answerText: reportData.answerText,
        category: reportData.category,
        userMessage: reportData.userMessage,
        reportTypes: reportData.reportTypes || [],
        userId: reportData.userId,
        userName: reportData.userName,
        status: 'pending',
        createdAt: serverTimestamp()
      })
      devLog(`✅ Question report submitted: ${docRef.id}`)
      return docRef.id
    } catch (error) {
      prodError('Error submitting question report:', error)
      throw error
    }
  }

  /**
   * Get all question reports
   * @returns {Promise<Array>} Array of reports
   */
  static async getAllQuestionReports() {
    try {
      const reportsRef = collection(db, this.COLLECTIONS.QUESTION_REPORTS)
      const q = query(reportsRef, orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)

      const reports = []
      snapshot.forEach(doc => {
        reports.push({
          id: doc.id,
          ...doc.data()
        })
      })

      devLog('✅ Loaded question reports:', reports.length)
      return reports
    } catch (error) {
      prodError('Error getting question reports:', error)
      return []
    }
  }

  /**
   * Update question report status
   * @param {string} reportId - Report ID
   * @param {string} status - 'pending' or 'resolved'
   * @returns {Promise<void>}
   */
  static async updateReportStatus(reportId, status) {
    try {
      const reportRef = doc(db, this.COLLECTIONS.QUESTION_REPORTS, reportId)
      await updateDoc(reportRef, {
        status,
        updatedAt: serverTimestamp()
      })
      devLog(`✅ Report ${reportId} marked as ${status}`)
    } catch (error) {
      prodError('Error updating report status:', error)
      throw error
    }
  }

  /**
   * Delete a question report
   * @param {string} reportId - Report ID
   * @returns {Promise<void>}
   */
  static async deleteQuestionReport(reportId) {
    try {
      await deleteDoc(doc(db, this.COLLECTIONS.QUESTION_REPORTS, reportId))
      devLog(`✅ Report ${reportId} deleted`)
    } catch (error) {
      prodError('Error deleting report:', error)
      throw error
    }
  }

  // ===== USER NOTIFICATIONS METHODS =====

  /**
   * Create a notification for a user
   * @param {Object} notificationData - Notification data
   * @returns {Promise<string>} Notification ID
   */
  static async createNotification(notificationData) {
    try {
      const docRef = await addDoc(collection(db, this.COLLECTIONS.NOTIFICATIONS), {
        userId: notificationData.userId,
        type: notificationData.type, // 'report_resolved', 'report_deleted', etc.
        title: notificationData.title,
        message: notificationData.message,
        relatedId: notificationData.relatedId || null, // questionId, reportId, etc.
        read: false,
        createdAt: serverTimestamp()
      })
      devLog(`✅ Notification created for user ${notificationData.userId}: ${docRef.id}`)
      return docRef.id
    } catch (error) {
      prodError('Error creating notification:', error)
      throw error
    }
  }

  /**
   * Get notifications for a user
   * @param {string} userId - User ID
   * @param {number} limit - Max notifications to return (default 20)
   * @returns {Promise<Array>} Array of notifications
   */
  static async getUserNotifications(userId, limitCount = 20) {
    try {
      const notifRef = collection(db, this.COLLECTIONS.NOTIFICATIONS)
      const q = query(
        notifRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      )
      const snapshot = await getDocs(q)

      const notifications = []
      snapshot.forEach(doc => {
        const data = doc.data()
        notifications.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date()
        })
      })

      devLog(`✅ Loaded ${notifications.length} notifications for user ${userId}`)
      return notifications
    } catch (error) {
      prodError('Error getting user notifications:', error)
      return []
    }
  }

  /**
   * Get unread notification count for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Unread count
   */
  static async getUnreadNotificationCount(userId) {
    try {
      const notifRef = collection(db, this.COLLECTIONS.NOTIFICATIONS)
      const q = query(
        notifRef,
        where('userId', '==', userId),
        where('read', '==', false)
      )
      const snapshot = await getDocs(q)
      return snapshot.size
    } catch (error) {
      prodError('Error getting unread count:', error)
      return 0
    }
  }

  /**
   * Mark a notification as read
   * @param {string} notificationId - Notification ID
   * @returns {Promise<void>}
   */
  static async markNotificationAsRead(notificationId) {
    try {
      const notifRef = doc(db, this.COLLECTIONS.NOTIFICATIONS, notificationId)
      await updateDoc(notifRef, { read: true })
      devLog(`✅ Notification ${notificationId} marked as read`)
    } catch (error) {
      prodError('Error marking notification as read:', error)
      throw error
    }
  }

  /**
   * Mark all notifications as read for a user
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  static async markAllNotificationsAsRead(userId) {
    try {
      const notifRef = collection(db, this.COLLECTIONS.NOTIFICATIONS)
      const q = query(
        notifRef,
        where('userId', '==', userId),
        where('read', '==', false)
      )
      const snapshot = await getDocs(q)

      const batch = writeBatch(db)
      snapshot.forEach(docSnap => {
        batch.update(docSnap.ref, { read: true })
      })
      await batch.commit()

      devLog(`✅ Marked ${snapshot.size} notifications as read for user ${userId}`)
    } catch (error) {
      prodError('Error marking all notifications as read:', error)
      throw error
    }
  }

  /**
   * Delete a notification
   * @param {string} notificationId - Notification ID
   * @returns {Promise<void>}
   */
  static async deleteNotification(notificationId) {
    try {
      await deleteDoc(doc(db, this.COLLECTIONS.NOTIFICATIONS, notificationId))
      devLog(`✅ Notification ${notificationId} deleted`)
    } catch (error) {
      prodError('Error deleting notification:', error)
      throw error
    }
  }

  // ===== QUESTION VERIFICATION METHODS =====

  /**
   * Get questions by verification status
   * @param {string} status - 'unverified', 'ai_reviewed', 'flagged', 'approved'
   * @returns {Promise<Array>} Array of questions
   */
  static async getQuestionsByVerificationStatus(status) {
    try {
      const questionsRef = collection(db, this.COLLECTIONS.QUESTIONS)
      let q

      if (status === 'unverified') {
        // Questions without verificationStatus field or with 'unverified' value
        q = query(questionsRef, where('verificationStatus', '==', 'unverified'))
      } else {
        q = query(questionsRef, where('verificationStatus', '==', status))
      }

      const snapshot = await getDocs(q)
      const questions = []
      snapshot.forEach(doc => {
        questions.push({
          id: doc.id,
          ...doc.data()
        })
      })

      devLog(`✅ Loaded ${questions.length} questions with status: ${status}`)
      return questions
    } catch (error) {
      prodError('Error getting questions by verification status:', error)
      return []
    }
  }

  /**
   * Get unverified questions (no verificationStatus field)
   * @param {number} limit - Maximum number of questions to return
   * @returns {Promise<Array>} Array of unverified questions
   */
  static async getUnverifiedQuestions(limitCount = 100) {
    try {
      // Get all questions and filter those without verificationStatus
      const allQuestions = await this.getAllQuestions()
      const unverified = allQuestions.filter(q =>
        !q.verificationStatus || q.verificationStatus === 'unverified'
      )

      devLog(`✅ Found ${unverified.length} unverified questions`)
      return unverified.slice(0, limitCount)
    } catch (error) {
      prodError('Error getting unverified questions:', error)
      return []
    }
  }

  /**
   * Get flagged questions that need review
   * @returns {Promise<Array>} Array of flagged questions
   */
  static async getFlaggedQuestions() {
    try {
      const questionsRef = collection(db, this.COLLECTIONS.QUESTIONS)
      const q = query(questionsRef, where('verificationStatus', '==', 'flagged'))

      const snapshot = await getDocs(q)
      const questions = []
      snapshot.forEach(doc => {
        questions.push({
          id: doc.id,
          ...doc.data()
        })
      })

      devLog(`✅ Loaded ${questions.length} flagged questions`)
      return questions
    } catch (error) {
      prodError('Error getting flagged questions:', error)
      return []
    }
  }

  /**
   * Update question verification status
   * @param {string} questionId - Question ID
   * @param {string} status - New status: 'ai_reviewed', 'flagged', 'approved'
   * @param {Object} aiNotes - AI verification notes
   * @returns {Promise<void>}
   */
  static async updateVerificationStatus(questionId, status, aiNotes = null) {
    try {
      const updateData = {
        verificationStatus: status,
        updatedAt: serverTimestamp()
      }

      if (status === 'ai_reviewed' || status === 'flagged') {
        updateData.aiReviewedAt = serverTimestamp()
        if (aiNotes) {
          updateData.aiNotes = aiNotes
        }
      }

      if (status === 'approved') {
        updateData.approvedAt = serverTimestamp()
      }

      const questionRef = doc(db, this.COLLECTIONS.QUESTIONS, questionId)
      await updateDoc(questionRef, updateData)

      devLog(`✅ Question ${questionId} verification status updated to: ${status}`)
    } catch (error) {
      prodError('Error updating verification status:', error)
      throw error
    }
  }

  /**
   * Batch update verification status for multiple questions
   * @param {Array} updates - Array of {questionId, status, aiNotes}
   * @returns {Promise<Object>} Results
   */
  static async batchUpdateVerificationStatus(updates) {
    try {
      devLog(`🔄 Batch updating verification status for ${updates.length} questions...`)

      const results = {
        total: updates.length,
        success: 0,
        errors: []
      }

      const BATCH_SIZE = 500
      const batches = []

      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        batches.push(updates.slice(i, i + BATCH_SIZE))
      }

      for (const batchUpdates of batches) {
        const batch = writeBatch(db)

        for (const update of batchUpdates) {
          try {
            const questionRef = doc(db, this.COLLECTIONS.QUESTIONS, update.questionId)

            const updateData = {
              verificationStatus: update.status,
              updatedAt: serverTimestamp()
            }

            if (update.status === 'ai_reviewed' || update.status === 'flagged') {
              updateData.aiReviewedAt = serverTimestamp()
              if (update.aiNotes) {
                updateData.aiNotes = update.aiNotes
              }
            }

            batch.update(questionRef, updateData)
            results.success++
          } catch (error) {
            results.errors.push({
              questionId: update.questionId,
              error: error.message
            })
          }
        }

        await batch.commit()
      }

      devLog(`✅ Batch verification update complete: ${results.success} updated, ${results.errors.length} errors`)
      return results
    } catch (error) {
      prodError('Error in batch verification update:', error)
      throw error
    }
  }

  /**
   * Approve a flagged question after review
   * @param {string} questionId - Question ID
   * @param {string} adminId - Admin user ID who approved
   * @param {Object} corrections - Any corrections made {text, answer}
   * @returns {Promise<void>}
   */
  static async approveVerifiedQuestion(questionId, adminId, corrections = null) {
    try {
      const updateData = {
        verificationStatus: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: adminId,
        updatedAt: serverTimestamp()
      }

      // Apply corrections if provided
      if (corrections) {
        if (corrections.text) updateData.text = corrections.text
        if (corrections.answer) updateData.answer = corrections.answer
      }

      const questionRef = doc(db, this.COLLECTIONS.QUESTIONS, questionId)
      await updateDoc(questionRef, updateData)

      devLog(`✅ Question ${questionId} approved by ${adminId}`)
    } catch (error) {
      prodError('Error approving verified question:', error)
      throw error
    }
  }

  /**
   * Get verification statistics
   * @returns {Promise<Object>} Statistics object
   */
  static async getVerificationStats() {
    try {
      const allQuestions = await this.getAllQuestions()

      const stats = {
        total: allQuestions.length,
        unverified: 0,
        aiReviewed: 0,
        flagged: 0,
        approved: 0
      }

      allQuestions.forEach(q => {
        const status = q.verificationStatus || 'unverified'
        switch (status) {
          case 'ai_reviewed':
            stats.aiReviewed++
            break
          case 'flagged':
            stats.flagged++
            break
          case 'approved':
            stats.approved++
            break
          default:
            stats.unverified++
        }
      })

      return stats
    } catch (error) {
      prodError('Error getting verification stats:', error)
      return {
        total: 0,
        unverified: 0,
        aiReviewed: 0,
        flagged: 0,
        approved: 0
      }
    }
  }

  // ===== LAZY LOADING METHODS (questionIds) =====

  /**
   * Get all categories with their questionIds arrays (for lazy loading)
   * This is a lightweight load - just categories + their tracking IDs, no full questions
   * @returns {Promise<Array>} Array of categories with questionIds
   */
  static async getCategoriesWithQuestionIds() {
    try {
      const categoriesRef = collection(db, this.COLLECTIONS.CATEGORIES)
      const snapshot = await getDocs(categoriesRef)

      const categories = []
      snapshot.forEach(doc => {
        const data = doc.data()
        categories.push({
          id: doc.id,
          ...data,
          questionIds: data.questionIds || [], // Array of tracking IDs
          questionCount: data.questionIds?.length || 0
        })
      })

      devLog(`✅ Loaded ${categories.length} categories with questionIds`)
      return categories
    } catch (error) {
      prodError('Error getting categories with questionIds:', error)
      throw error
    }
  }

  /**
   * Backfill questionIds for all existing categories
   * This is a one-time migration function to populate questionIds arrays
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Object>} Results with stats
   */
  static async backfillQuestionIds(progressCallback = null) {
    try {
      devLog('🔄 Starting questionIds backfill...')

      const results = {
        categoriesUpdated: 0,
        questionsProcessed: 0,
        errors: []
      }

      // Get all categories
      const categories = await this.getAllCategories()
      devLog(`📦 Found ${categories.length} categories to process`)

      // Process each category
      for (let i = 0; i < categories.length; i++) {
        const category = categories[i]

        try {
          // Get all questions for this category
          const questions = await this.getQuestionsByCategory(category.id)

          // Generate tracking IDs for all questions
          const questionIds = questions.map(q => this.generateTrackingId(q, category.id))

          // Update category document with questionIds
          const categoryRef = doc(db, this.COLLECTIONS.CATEGORIES, category.id)
          await updateDoc(categoryRef, {
            questionIds: questionIds,
            updatedAt: serverTimestamp()
          })

          results.categoriesUpdated++
          results.questionsProcessed += questions.length

          devLog(`✅ Updated ${category.name}: ${questions.length} questionIds`)

          if (progressCallback) {
            progressCallback(i + 1, categories.length, category.name, questions.length)
          }
        } catch (error) {
          prodError(`Error processing category ${category.id}:`, error)
          results.errors.push({
            categoryId: category.id,
            error: error.message
          })
        }
      }

      devLog(`✅ Backfill complete: ${results.categoriesUpdated} categories, ${results.questionsProcessed} questions`)
      return results
    } catch (error) {
      prodError('Error in backfillQuestionIds:', error)
      throw error
    }
  }

  /**
   * Add a tracking ID to a category's questionIds array
   * Call this after adding a new question
   * @param {string} categoryId - Category ID
   * @param {string} trackingId - Tracking ID to add
   * @returns {Promise<void>}
   */
  static async addQuestionIdToCategory(categoryId, trackingId) {
    try {
      const categoryRef = doc(db, this.COLLECTIONS.CATEGORIES, categoryId)
      await updateDoc(categoryRef, {
        questionIds: arrayUnion(trackingId),
        updatedAt: serverTimestamp()
      })
      devLog(`✅ Added tracking ID to category ${categoryId}`)
    } catch (error) {
      prodError('Error adding questionId to category:', error)
      throw error
    }
  }

  /**
   * Remove a tracking ID from a category's questionIds array
   * Call this after deleting a question
   * @param {string} categoryId - Category ID
   * @param {string} trackingId - Tracking ID to remove
   * @returns {Promise<void>}
   */
  static async removeQuestionIdFromCategory(categoryId, trackingId) {
    try {
      // arrayRemove is needed - import it
      const { arrayRemove } = await import('firebase/firestore')

      const categoryRef = doc(db, this.COLLECTIONS.CATEGORIES, categoryId)
      await updateDoc(categoryRef, {
        questionIds: arrayRemove(trackingId),
        updatedAt: serverTimestamp()
      })
      devLog(`✅ Removed tracking ID from category ${categoryId}`)
    } catch (error) {
      prodError('Error removing questionId from category:', error)
      throw error
    }
  }

  /**
   * Add a single question and update category's questionIds
   * @param {string} categoryId - The category ID to add the question to
   * @param {Object} questionData - The question data
   * @returns {Promise<string>} The ID of the added question
   */
  static async addSingleQuestionWithTracking(categoryId, questionData) {
    try {
      devLog('Adding single question with tracking to category:', categoryId)

      // Prepare the question data with all required fields
      const questionWithMetadata = {
        ...questionData,
        categoryId: categoryId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      // Add the question to Firebase
      const docRef = await addDoc(collection(db, this.COLLECTIONS.QUESTIONS), questionWithMetadata)
      devLog('Single question added with ID:', docRef.id)

      // Generate tracking ID and add to category
      const questionWithId = { ...questionWithMetadata, id: docRef.id }
      const trackingId = this.generateTrackingId(questionWithId, categoryId)
      await this.addQuestionIdToCategory(categoryId, trackingId)

      return docRef.id
    } catch (error) {
      prodError('Error adding single question with tracking:', error)
      throw error
    }
  }

  /**
   * Delete a question and update category's questionIds
   * @param {string} questionId - The question document ID
   * @param {string} categoryId - The category ID
   * @param {Object} questionData - The question data (needed to generate tracking ID)
   * @returns {Promise<void>}
   */
  static async deleteQuestionWithTracking(questionId, categoryId, questionData) {
    try {
      devLog('Deleting question with tracking:', questionId)

      // Generate tracking ID before deletion
      const trackingId = this.generateTrackingId({ id: questionId, ...questionData }, categoryId)

      // Delete the question
      await deleteDoc(doc(db, this.COLLECTIONS.QUESTIONS, questionId))
      devLog(`Question ${questionId} deleted successfully`)

      // Remove tracking ID from category
      await this.removeQuestionIdFromCategory(categoryId, trackingId)
    } catch (error) {
      prodError('Error deleting question with tracking:', error)
      throw error
    }
  }

  /**
   * Get questions for specific categories only (lazy loading)
   * Use this when user starts a game - load only selected categories
   * @param {Array<string>} categoryIds - Array of category IDs to load
   * @returns {Promise<Object>} Questions grouped by category
   */
  static async getQuestionsForCategories(categoryIds) {
    try {
      devLog(`📥 Loading questions for ${categoryIds.length} categories...`)

      const questionsByCategory = {}

      // Load questions for each category in parallel
      const promises = categoryIds.map(async (categoryId) => {
        const questions = await this.getQuestionsByCategory(categoryId)
        questionsByCategory[categoryId] = questions
        return { categoryId, count: questions.length }
      })

      const results = await Promise.all(promises)
      const totalQuestions = results.reduce((sum, r) => sum + r.count, 0)

      devLog(`✅ Loaded ${totalQuestions} questions for ${categoryIds.length} categories`)
      return questionsByCategory
    } catch (error) {
      prodError('Error loading questions for categories:', error)
      throw error
    }
  }
}