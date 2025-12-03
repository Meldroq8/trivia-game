import { useState, useEffect, useCallback, useRef } from 'react'
import { FirebaseQuestionsService } from '../utils/firebaseQuestions'
import { questionVerificationService } from '../services/questionVerificationService'
import { devLog, prodError } from '../utils/devLog'
import QuestionReviewCard from './QuestionReviewCard'
import DifficultyBalancer from './DifficultyBalancer'

/**
 * Dashboard for AI-powered question verification
 * Allows admins to verify questions in batch and review flagged ones
 */
function VerificationDashboard({ userId }) {
  // Main tab: 'verification' or 'difficulty'
  const [mainTab, setMainTab] = useState('verification')
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    unverified: 0,
    aiReviewed: 0,
    flagged: 0,
    approved: 0
  })

  // Questions list
  const [questions, setQuestions] = useState([])
  const [filter, setFilter] = useState('flagged') // 'all', 'unverified', 'flagged', 'ai_reviewed', 'approved'

  // Verification state
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationProgress, setVerificationProgress] = useState({ current: 0, total: 0, skipped: 0 })
  const [currentVerifying, setCurrentVerifying] = useState(null)
  const shouldStopRef = useRef(false) // Ref to signal cancellation

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [batchSize, setBatchSize] = useState(50)
  const [categoryMap, setCategoryMap] = useState({}) // Map of categoryId -> categoryName
  const [categories, setCategories] = useState([]) // List of all categories
  const [selectedCategory, setSelectedCategory] = useState('') // Selected category for verification
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)

  // Load categories once on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const allCategories = await FirebaseQuestionsService.getAllCategories()
        const map = {}
        allCategories.forEach(cat => {
          map[cat.id] = cat.name || cat.id
        })
        setCategoryMap(map)
        setCategories(allCategories)
        setCategoriesLoaded(true)
        devLog('Loaded category map:', Object.keys(map).length, 'categories')
      } catch (err) {
        prodError('Error loading categories:', err)
        setCategoriesLoaded(true) // Still allow loading even if categories fail
      }
    }
    loadCategories()
  }, [])

  // Map category names to questions - takes map as parameter to avoid stale closure
  const mapCategoryNames = useCallback((questions, map) => {
    return questions.map(q => ({
      ...q,
      categoryName: q.categoryName || map[q.categoryId] || q.categoryId || 'غير محدد'
    }))
  }, [])

  // Load stats and questions
  const loadData = useCallback(async () => {
    // Wait until categories are loaded
    if (!categoriesLoaded) return

    try {
      setLoading(true)
      setError(null)

      // Load stats
      const verificationStats = await FirebaseQuestionsService.getVerificationStats()
      setStats(verificationStats)

      // Load questions based on filter
      let loadedQuestions = []
      if (filter === 'all') {
        loadedQuestions = await FirebaseQuestionsService.getAllQuestions()
      } else if (filter === 'unverified') {
        loadedQuestions = await FirebaseQuestionsService.getUnverifiedQuestions(500)
      } else if (filter === 'flagged') {
        loadedQuestions = await FirebaseQuestionsService.getFlaggedQuestions()
      } else {
        loadedQuestions = await FirebaseQuestionsService.getQuestionsByVerificationStatus(filter)
      }

      // Map category names - pass categoryMap as parameter
      loadedQuestions = mapCategoryNames(loadedQuestions, categoryMap)

      setQuestions(loadedQuestions)
      devLog(`Loaded ${loadedQuestions.length} questions with filter: ${filter}`)

    } catch (err) {
      prodError('Error loading verification data:', err)
      setError('حدث خطأ في تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }, [filter, categoryMap, categoriesLoaded, mapCategoryNames])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Unique tab ID to avoid reacting to own broadcasts
  const tabIdRef = useRef(`tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)

  // Cross-tab sync using BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel('question-sync')

    const handleMessage = (event) => {
      // Ignore messages from this same tab
      if (event.data.senderId === tabIdRef.current) return

      if (event.data.type === 'QUESTION_UPDATED') {
        devLog('📡 VerificationDashboard: Received cross-tab update, reloading data...')
        loadData()
      }
    }

    channel.addEventListener('message', handleMessage)

    return () => {
      channel.removeEventListener('message', handleMessage)
      channel.close()
    }
  }, [loadData])

  // Helper function to broadcast question update to other tabs
  const broadcastQuestionUpdate = () => {
    try {
      const channel = new BroadcastChannel('question-sync')
      channel.postMessage({ type: 'QUESTION_UPDATED', senderId: tabIdRef.current, timestamp: Date.now() })
      channel.close()
      devLog('📡 Broadcasted question update to other tabs')
    } catch (err) {
      devLog('BroadcastChannel not supported:', err)
    }
  }

  // Update stats locally without full reload
  const updateStatsLocally = (fromStatus, toStatus) => {
    setStats(prev => {
      const newStats = { ...prev }

      // Decrement from status
      if (fromStatus === 'unverified') newStats.unverified--
      else if (fromStatus === 'ai_reviewed') newStats.aiReviewed--
      else if (fromStatus === 'flagged') newStats.flagged--
      else if (fromStatus === 'approved') newStats.approved--

      // Increment to status
      if (toStatus === 'unverified') newStats.unverified++
      else if (toStatus === 'ai_reviewed') newStats.aiReviewed++
      else if (toStatus === 'flagged') newStats.flagged++
      else if (toStatus === 'approved') newStats.approved++

      return newStats
    })
  }

  // Remove question from list locally
  const removeQuestionLocally = (questionId) => {
    setQuestions(prev => prev.filter(q => q.id !== questionId))
  }

  // Update question in list locally
  const updateQuestionLocally = (questionId, updates) => {
    setQuestions(prev => prev.map(q =>
      q.id === questionId ? { ...q, ...updates } : q
    ))
  }

  // Start batch verification - processes 5 questions per API call
  const BATCH_SIZE_PER_CALL = 5

  const startBatchVerification = async () => {
    // Reset stop flag
    shouldStopRef.current = false

    try {
      setIsVerifying(true)
      setError(null)

      // Get unverified questions - filter by category if selected
      let unverified
      if (selectedCategory) {
        const categoryQuestions = await FirebaseQuestionsService.getQuestionsByCategory(selectedCategory)
        unverified = categoryQuestions.filter(q =>
          !q.verificationStatus || q.verificationStatus === 'unverified'
        ).slice(0, batchSize)
      } else {
        unverified = await FirebaseQuestionsService.getUnverifiedQuestions(batchSize)
      }
      unverified = mapCategoryNames(unverified, categoryMap)

      if (unverified.length === 0) {
        setError(selectedCategory ? 'لا توجد أسئلة تحتاج للتحقق في هذه الفئة' : 'لا توجد أسئلة تحتاج للتحقق')
        setIsVerifying(false)
        return
      }

      setVerificationProgress({ current: 0, total: unverified.length, skipped: 0 })

      let processedCount = 0
      let skippedCount = 0

      // Process in batches of 5 questions per API call
      for (let batchStart = 0; batchStart < unverified.length; batchStart += BATCH_SIZE_PER_CALL) {
        // Check if we should stop
        if (shouldStopRef.current) {
          devLog('Verification stopped by user')
          break
        }

        const batchQuestions = unverified.slice(batchStart, batchStart + BATCH_SIZE_PER_CALL)
        devLog(`🔄 Processing batch ${Math.floor(batchStart / BATCH_SIZE_PER_CALL) + 1}: ${batchQuestions.length} questions`)

        setCurrentVerifying({
          questionText: `جاري التحقق من ${batchQuestions.length} أسئلة...`,
          statusIcon: '🔄'
        })

        let results
        try {
          results = await questionVerificationService.verifyQuestionsBatch(batchQuestions)
        } catch (err) {
          prodError('Error in batch verification:', err)
          results = batchQuestions.map(q => ({
            questionId: q.id,
            status: 'error',
            error: err.message
          }))
        }

        // Check again after async operation
        if (shouldStopRef.current) {
          devLog('Verification stopped by user')
          break
        }

        // Process each result in the batch
        for (const result of results) {
          if (result.status === 'skip' || result.skipped) {
            skippedCount++
            try {
              await FirebaseQuestionsService.updateVerificationStatus(
                result.questionId,
                'approved',
                {
                  grammarIssues: [],
                  factualAccuracy: 'not_applicable',
                  notes: 'سؤال تعليمات - تم تخطيه تلقائياً',
                  sources: []
                }
              )
              updateStatsLocally('unverified', 'approved')
            } catch (err) {
              prodError('Error auto-approving skipped question:', err)
            }
          } else if (result.status !== 'error') {
            const status = result.status === 'pass' ? 'ai_reviewed' : 'flagged'
            try {
              await FirebaseQuestionsService.updateVerificationStatus(
                result.questionId,
                status,
                {
                  grammarIssues: result.grammarIssues || [],
                  factualAccuracy: result.factualAccuracy || 'unknown',
                  difficultyMatch: result.difficultyMatch !== false,
                  actualDifficulty: result.actualDifficulty || null,
                  suggestedQuestion: result.suggestedQuestion || null,
                  suggestedAnswer: result.suggestedAnswer || null,
                  suggestedCorrection: result.suggestedCorrection || '',
                  notes: result.notes || '',
                  sources: result.sources || []
                }
              )
              updateStatsLocally('unverified', status)
            } catch (err) {
              prodError('Error saving verification result:', err)
            }
          }
          processedCount++
        }

        setVerificationProgress({
          current: processedCount,
          total: unverified.length,
          skipped: skippedCount
        })

        // Show last result from batch
        const lastResult = results[results.length - 1]
        if (lastResult) {
          setCurrentVerifying({
            ...lastResult,
            statusIcon: lastResult.status === 'pass' ? '✅' : lastResult.status === 'skip' ? '⏭️' : '⚠️'
          })
        }

        // Rate limiting delay between batches (except for last batch)
        if (batchStart + BATCH_SIZE_PER_CALL < unverified.length && !shouldStopRef.current) {
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      // Reload data to sync with server
      await loadData()

      // Broadcast update to other tabs
      broadcastQuestionUpdate()

    } catch (err) {
      prodError('Batch verification error:', err)
      setError(`خطأ في التحقق: ${err.message}`)
    } finally {
      setIsVerifying(false)
      setCurrentVerifying(null)
      setVerificationProgress({ current: 0, total: 0, skipped: 0 })
    }
  }

  // Stop verification
  const stopVerification = () => {
    shouldStopRef.current = true
    setIsVerifying(false)
  }

  // Approve question - dynamic update
  const handleApprove = async (questionId, corrections = null) => {
    try {
      // Find current question to get its status
      const question = questions.find(q => q.id === questionId)
      const oldStatus = question?.verificationStatus || 'unverified'

      // Optimistic update - remove from list immediately
      removeQuestionLocally(questionId)
      updateStatsLocally(oldStatus, 'approved')

      // Then save to Firebase
      await FirebaseQuestionsService.approveVerifiedQuestion(questionId, userId, corrections)

      // Broadcast update to other tabs
      broadcastQuestionUpdate()

    } catch (err) {
      prodError('Error approving question:', err)
      setError('فشل في الموافقة على السؤال')
      // Reload on error to sync state
      await loadData()
    }
  }

  // Delete question - dynamic update
  const handleDelete = async (questionId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السؤال؟')) return

    try {
      // Find current question to get its status
      const question = questions.find(q => q.id === questionId)
      const oldStatus = question?.verificationStatus || 'unverified'

      // Optimistic update - remove from list immediately
      removeQuestionLocally(questionId)

      // Update stats (decrement total and status count)
      setStats(prev => ({
        ...prev,
        total: prev.total - 1,
        [oldStatus === 'ai_reviewed' ? 'aiReviewed' : oldStatus]: prev[oldStatus === 'ai_reviewed' ? 'aiReviewed' : oldStatus] - 1
      }))

      // Then delete from Firebase
      await FirebaseQuestionsService.deleteQuestion(questionId)

      // Broadcast update to other tabs
      broadcastQuestionUpdate()

    } catch (err) {
      prodError('Error deleting question:', err)
      setError('فشل في حذف السؤال')
      // Reload on error to sync state
      await loadData()
    }
  }

  // Re-verify a single question - dynamic update
  const handleReVerify = async (question) => {
    try {
      // Show loading state on the card
      updateQuestionLocally(question.id, { isVerifying: true })

      const result = await questionVerificationService.verifyQuestion(question)

      // Handle skipped questions
      if (result.status === 'skip' || result.skipped) {
        await FirebaseQuestionsService.updateVerificationStatus(
          question.id,
          'approved',
          {
            grammarIssues: [],
            factualAccuracy: 'not_applicable',
            notes: 'سؤال تعليمات - تم تخطيه تلقائياً',
            sources: []
          }
        )

        const oldStatus = question.verificationStatus || 'unverified'
        removeQuestionLocally(question.id)
        updateStatsLocally(oldStatus, 'approved')
        return
      }

      const newStatus = result.status === 'pass' ? 'ai_reviewed' : 'flagged'
      const oldStatus = question.verificationStatus || 'unverified'

      // Update in Firebase
      await FirebaseQuestionsService.updateVerificationStatus(
        question.id,
        newStatus,
        {
          grammarIssues: result.grammarIssues || [],
          factualAccuracy: result.factualAccuracy || 'unknown',
          difficultyMatch: result.difficultyMatch !== false,
          actualDifficulty: result.actualDifficulty || null,
          suggestedQuestion: result.suggestedQuestion || null,
          suggestedAnswer: result.suggestedAnswer || null,
          suggestedCorrection: result.suggestedCorrection || '',
          notes: result.notes || '',
          sources: result.sources || []
        }
      )

      // Update locally
      if (filter !== 'all' && filter !== newStatus) {
        // Remove from current list if status changed
        removeQuestionLocally(question.id)
      } else {
        // Update in place
        updateQuestionLocally(question.id, {
          verificationStatus: newStatus,
          aiNotes: {
            grammarIssues: result.grammarIssues || [],
            factualAccuracy: result.factualAccuracy || 'unknown',
            difficultyMatch: result.difficultyMatch !== false,
            actualDifficulty: result.actualDifficulty || null,
            suggestedQuestion: result.suggestedQuestion || null,
            suggestedAnswer: result.suggestedAnswer || null,
            suggestedCorrection: result.suggestedCorrection || '',
            notes: result.notes || '',
            sources: result.sources || []
          },
          isVerifying: false
        })
      }

      updateStatsLocally(oldStatus, newStatus)

      // Broadcast update to other tabs
      broadcastQuestionUpdate()

    } catch (err) {
      prodError('Error re-verifying question:', err)
      setError('فشل في إعادة التحقق')
      updateQuestionLocally(question.id, { isVerifying: false })
    }
  }

  // Retry all questions in current tab - uses batch verification (5 per API call)
  const retryAllInCurrentTab = async () => {
    if (questions.length === 0) return
    if (!window.confirm(`هل تريد إعادة التحقق من ${questions.length} سؤال؟`)) return

    // Reset stop flag
    shouldStopRef.current = false

    try {
      setIsVerifying(true)
      setError(null)
      setVerificationProgress({ current: 0, total: questions.length, skipped: 0 })

      let processedCount = 0
      let skippedCount = 0
      const questionsToVerify = [...questions]

      // Process in batches of 5
      for (let batchStart = 0; batchStart < questionsToVerify.length; batchStart += BATCH_SIZE_PER_CALL) {
        if (shouldStopRef.current) {
          devLog('Retry all stopped by user')
          break
        }

        const batchQuestions = questionsToVerify.slice(batchStart, batchStart + BATCH_SIZE_PER_CALL)
        devLog(`🔄 Retrying batch: ${batchQuestions.length} questions`)

        setCurrentVerifying({
          questionText: `جاري إعادة التحقق من ${batchQuestions.length} أسئلة...`,
          statusIcon: '🔄'
        })

        let results
        try {
          results = await questionVerificationService.verifyQuestionsBatch(batchQuestions)
        } catch (err) {
          prodError('Error in batch retry:', err)
          results = batchQuestions.map(q => ({
            questionId: q.id,
            status: 'error',
            error: err.message
          }))
        }

        if (shouldStopRef.current) break

        // Process results
        for (let i = 0; i < results.length; i++) {
          const result = results[i]
          const question = batchQuestions[i]
          const oldStatus = question.verificationStatus || 'unverified'

          if (result.status === 'skip' || result.skipped) {
            skippedCount++
            try {
              await FirebaseQuestionsService.updateVerificationStatus(
                result.questionId,
                'approved',
                {
                  grammarIssues: [],
                  factualAccuracy: 'not_applicable',
                  notes: 'سؤال تعليمات - تم تخطيه تلقائياً',
                  sources: []
                }
              )
              updateStatsLocally(oldStatus, 'approved')
              removeQuestionLocally(question.id)
            } catch (err) {
              prodError('Error auto-approving skipped question:', err)
            }
          } else if (result.status !== 'error') {
            const newStatus = result.status === 'pass' ? 'ai_reviewed' : 'flagged'
            try {
              await FirebaseQuestionsService.updateVerificationStatus(
                question.id,
                newStatus,
                {
                  grammarIssues: result.grammarIssues || [],
                  factualAccuracy: result.factualAccuracy || 'unknown',
                  difficultyMatch: result.difficultyMatch !== false,
                  actualDifficulty: result.actualDifficulty || null,
                  suggestedQuestion: result.suggestedQuestion || null,
                  suggestedAnswer: result.suggestedAnswer || null,
                  suggestedCorrection: result.suggestedCorrection || '',
                  notes: result.notes || '',
                  sources: result.sources || []
                }
              )

              if (newStatus !== filter && filter !== 'all') {
                removeQuestionLocally(question.id)
              } else {
                updateQuestionLocally(question.id, {
                  verificationStatus: newStatus,
                  aiNotes: {
                    grammarIssues: result.grammarIssues || [],
                    factualAccuracy: result.factualAccuracy || 'unknown',
                    difficultyMatch: result.difficultyMatch !== false,
                    actualDifficulty: result.actualDifficulty || null,
                    suggestedQuestion: result.suggestedQuestion || null,
                    suggestedAnswer: result.suggestedAnswer || null,
                    suggestedCorrection: result.suggestedCorrection || '',
                    notes: result.notes || '',
                    sources: result.sources || []
                  }
                })
              }
              updateStatsLocally(oldStatus, newStatus)
            } catch (err) {
              prodError('Error saving verification result:', err)
            }
          }
          processedCount++
        }

        setVerificationProgress({
          current: processedCount,
          total: questionsToVerify.length,
          skipped: skippedCount
        })

        // Rate limiting between batches
        if (batchStart + BATCH_SIZE_PER_CALL < questionsToVerify.length && !shouldStopRef.current) {
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      await loadData()

      // Broadcast update to other tabs
      broadcastQuestionUpdate()

    } catch (err) {
      prodError('Retry all error:', err)
      setError(`خطأ في إعادة التحقق: ${err.message}`)
    } finally {
      setIsVerifying(false)
      setCurrentVerifying(null)
      setVerificationProgress({ current: 0, total: 0, skipped: 0 })
    }
  }

  // Bulk approve all ai_reviewed questions
  const bulkApproveReviewed = async () => {
    if (!window.confirm('هل تريد الموافقة على جميع الأسئلة التي تم التحقق منها؟')) return

    try {
      const reviewed = await FirebaseQuestionsService.getQuestionsByVerificationStatus('ai_reviewed')

      for (const q of reviewed) {
        await FirebaseQuestionsService.approveVerifiedQuestion(q.id, userId)
      }

      // Update stats
      setStats(prev => ({
        ...prev,
        aiReviewed: 0,
        approved: prev.approved + reviewed.length
      }))

      // If viewing ai_reviewed, clear the list
      if (filter === 'ai_reviewed') {
        setQuestions([])
      }

      // Broadcast update to other tabs
      broadcastQuestionUpdate()

    } catch (err) {
      prodError('Error bulk approving:', err)
      setError('فشل في الموافقة الجماعية')
      await loadData()
    }
  }

  return (
    <div className="space-y-6">
      {/* Main Tab Selector */}
      <div className="flex gap-2 bg-white dark:bg-slate-800 rounded-xl p-2 shadow-md">
        <button
          onClick={() => setMainTab('verification')}
          className={`flex-1 py-3 px-6 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
            mainTab === 'verification'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          التحقق من الأسئلة
        </button>
        <button
          onClick={() => setMainTab('difficulty')}
          className={`flex-1 py-3 px-6 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
            mainTab === 'difficulty'
              ? 'bg-amber-500 text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
          </svg>
          موازن الصعوبات
        </button>
      </div>

      {/* Difficulty Balancer Tab */}
      {mainTab === 'difficulty' && (
        <DifficultyBalancer categories={categories} categoryMap={categoryMap} />
      )}

      {/* Verification Tab */}
      {mainTab === 'verification' && (
        <>
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">التحقق من الأسئلة بالذكاء الاصطناعي</h2>
        <p className="opacity-90">استخدم Gemini AI للتحقق من صحة الأسئلة والإجابات</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-md">
          <div className="text-3xl font-bold text-gray-800 dark:text-gray-100">{stats.total}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">الإجمالي</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-md border-r-4 border-gray-400">
          <div className="text-3xl font-bold text-gray-600 dark:text-gray-300">{stats.unverified}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">غير متحقق</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-md border-r-4 border-blue-500">
          <div className="text-3xl font-bold text-blue-600">{stats.aiReviewed}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">تم المراجعة</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-md border-r-4 border-orange-500">
          <div className="text-3xl font-bold text-orange-600">{stats.flagged}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">يحتاج مراجعة</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-md border-r-4 border-green-500">
          <div className="text-3xl font-bold text-green-600">{stats.approved}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">موافق عليه</div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
        <div className="flex flex-wrap items-center gap-4">
          {/* Category selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700 dark:text-gray-300">الفئة:</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={isVerifying}
              className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-w-[150px]"
            >
              <option value="">كل الفئات</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name || cat.id}
                </option>
              ))}
            </select>
          </div>

          {/* Batch size selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700 dark:text-gray-300">عدد الأسئلة:</label>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              disabled={isVerifying}
              className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>

          {/* Start/Stop verification button */}
          {!isVerifying ? (
            <button
              onClick={startBatchVerification}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {selectedCategory ? `تحقق من ${categoryMap[selectedCategory] || 'الفئة'}` : 'بدء التحقق التلقائي'}
            </button>
          ) : (
            <button
              onClick={stopVerification}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              إيقاف
            </button>
          )}

          {/* Bulk approve button */}
          {stats.aiReviewed > 0 && (
            <button
              onClick={bulkApproveReviewed}
              disabled={isVerifying}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded-lg"
            >
              الموافقة على الكل ({stats.aiReviewed})
            </button>
          )}

          {/* Refresh button */}
          <button
            onClick={loadData}
            disabled={loading || isVerifying}
            className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg"
          >
            تحديث
          </button>
        </div>

        {/* Progress bar */}
        {isVerifying && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-2">
              <span>جاري التحقق... {verificationProgress.skipped > 0 && `(تم تخطي ${verificationProgress.skipped})`}</span>
              <span>{verificationProgress.current} / {verificationProgress.total}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3">
              <div
                className="bg-purple-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${(verificationProgress.current / verificationProgress.total) * 100}%` }}
              />
            </div>
            {currentVerifying && (
              <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 truncate">
                {currentVerifying.statusIcon} {currentVerifying.questionText?.substring(0, 60)}...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md overflow-hidden">
        <div className="flex border-b dark:border-slate-700">
          {[
            { key: 'flagged', label: 'يحتاج مراجعة', count: stats.flagged },
            { key: 'unverified', label: 'غير متحقق', count: stats.unverified },
            { key: 'ai_reviewed', label: 'تم المراجعة', count: stats.aiReviewed },
            { key: 'approved', label: 'موافق عليه', count: stats.approved },
            { key: 'all', label: 'الكل', count: stats.total }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Retry All button for current tab */}
        {questions.length > 0 && filter !== 'approved' && (
          <div className="px-4 pt-4 border-b dark:border-slate-700 pb-4">
            <button
              onClick={retryAllInCurrentTab}
              disabled={isVerifying || loading}
              className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              إعادة التحقق من الكل ({questions.length})
            </button>
          </div>
        )}

        {/* Questions list */}
        <div className="p-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
              <p className="mt-2 text-gray-500 dark:text-gray-400">جاري التحميل...</p>
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              لا توجد أسئلة في هذه الفئة
            </div>
          ) : (
            <div className="space-y-4">
              {questions.map(question => (
                <QuestionReviewCard
                  key={question.id}
                  question={question}
                  onApprove={handleApprove}
                  onDelete={handleDelete}
                  onReVerify={handleReVerify}
                />
              ))}
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  )
}

export default VerificationDashboard
