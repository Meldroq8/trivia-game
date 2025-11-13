import { devLog, devWarn, prodError } from "./devLog.js"
import {
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  orderBy,
  writeBatch,
  arrayUnion,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { createProgressTracker } from './progressTracker'

export class FirebaseQuestionsService {
  static COLLECTIONS = {
    QUESTIONS: 'questions',
    CATEGORIES: 'categories',
    PENDING_QUESTIONS: 'pending-questions',
    MASTER_CATEGORIES: 'masterCategories'
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
      if (categoryData.id) {
        // Update existing category
        const categoryRef = doc(db, this.COLLECTIONS.CATEGORIES, categoryData.id)
        await updateDoc(categoryRef, {
          ...categoryData,
          updatedAt: serverTimestamp()
        })
        return categoryData.id
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
        return categoryId
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
        return docRef.id
      }
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
}