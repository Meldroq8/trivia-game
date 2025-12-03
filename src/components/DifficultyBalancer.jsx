import { useState, useRef } from 'react'
import { FirebaseQuestionsService } from '../utils/firebaseQuestions'
import { questionVerificationService } from '../services/questionVerificationService'
import { devLog, prodError } from '../utils/devLog'

/**
 * Difficulty Balancer - Analyzes and redistributes question difficulties equally
 */
function DifficultyBalancer({ categories, categoryMap }) {
  const [selectedCategory, setSelectedCategory] = useState('')
  const [questions, setQuestions] = useState([])
  const [analyzedQuestions, setAnalyzedQuestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState(null)
  const [distribution, setDistribution] = useState({ easy: 0, medium: 0, hard: 0 })
  const [suggestedDistribution, setSuggestedDistribution] = useState({ easy: 0, medium: 0, hard: 0 })
  const shouldStopRef = useRef(false)
  const [mediaPreview, setMediaPreview] = useState({ show: false, type: null, url: null })

  // Load questions from selected category
  const loadCategoryQuestions = async () => {
    if (!selectedCategory) {
      setError('يرجى اختيار فئة')
      return
    }

    try {
      setLoading(true)
      setError(null)
      setAnalyzedQuestions([])

      const categoryQuestions = await FirebaseQuestionsService.getQuestionsByCategory(selectedCategory)
      setQuestions(categoryQuestions)

      // Calculate current distribution
      const dist = { easy: 0, medium: 0, hard: 0 }
      categoryQuestions.forEach(q => {
        const diff = q.difficulty || 'medium'
        if (dist[diff] !== undefined) dist[diff]++
      })
      setDistribution(dist)

      devLog(`Loaded ${categoryQuestions.length} questions from category`)
    } catch (err) {
      prodError('Error loading questions:', err)
      setError('خطأ في تحميل الأسئلة')
    } finally {
      setLoading(false)
    }
  }

  // Analyze all questions for difficulty (two-pass approach with parallel processing)
  const analyzeAllQuestions = async () => {
    if (questions.length === 0) {
      setError('لا توجد أسئلة للتحليل')
      return
    }

    shouldStopRef.current = false
    setAnalyzing(true)
    setError(null)

    const BATCH_SIZE = 10 // Smaller batches for more reliable JSON
    const PARALLEL_LIMIT = 4 // Run 4 batches in parallel

    // Split questions into batches
    const batches = []
    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      batches.push(questions.slice(i, i + BATCH_SIZE))
    }

    // Total progress = batches + 1 for rebalancing step
    const totalSteps = batches.length + 1
    setProgress({ current: 0, total: totalSteps, phase: 'analyzing' })

    const results = []
    let completedBatches = 0

    try {
      // === PASS 1: Analyze all questions in parallel batches ===
      // Process batches in chunks of PARALLEL_LIMIT
      for (let i = 0; i < batches.length; i += PARALLEL_LIMIT) {
        if (shouldStopRef.current) break

        const parallelBatches = batches.slice(i, i + PARALLEL_LIMIT)

        // Fire all parallel requests
        const promises = parallelBatches.map(batch =>
          questionVerificationService.analyzeDifficultyBatch(batch)
        )

        // Wait for all parallel batches to complete
        const batchResults = await Promise.all(promises)

        // Collect results
        batchResults.forEach(br => results.push(...br))
        completedBatches += parallelBatches.length

        setProgress({
          current: completedBatches,
          total: totalSteps,
          phase: 'analyzing'
        })

        // Small delay between parallel chunks to avoid rate limiting
        if (i + PARALLEL_LIMIT < batches.length && !shouldStopRef.current) {
          await new Promise(r => setTimeout(r, 500))
        }
      }

      if (shouldStopRef.current) {
        setAnalyzedQuestions(results)
        return
      }

      // === PASS 2: Intelligent rebalancing ===
      setProgress({
        current: batches.length,
        total: totalSteps,
        phase: 'rebalancing'
      })

      const targetPerDiff = Math.floor(questions.length / 3)
      const rebalancedResults = await questionVerificationService.rebalanceDifficulties(results, targetPerDiff)

      setProgress({
        current: totalSteps,
        total: totalSteps,
        phase: 'done'
      })

      setAnalyzedQuestions(rebalancedResults)

      // Calculate suggested distribution after rebalancing
      const sugDist = { easy: 0, medium: 0, hard: 0 }
      rebalancedResults.forEach(r => {
        const diff = r.suggestedDifficulty || 'medium'
        if (sugDist[diff] !== undefined) sugDist[diff]++
      })
      setSuggestedDistribution(sugDist)

      devLog(`Analyzed and rebalanced ${rebalancedResults.length} questions`)
    } catch (err) {
      prodError('Error analyzing questions:', err)
      setError('خطأ في تحليل الأسئلة')
    } finally {
      setAnalyzing(false)
    }
  }

  // Apply suggested difficulties
  const applySuggestedDifficulties = async () => {
    const toUpdate = analyzedQuestions.filter(q => q.needsChange)
    if (toUpdate.length === 0) {
      setError('لا توجد تغييرات للتطبيق')
      return
    }

    if (!window.confirm(`هل تريد تحديث صعوبة ${toUpdate.length} سؤال؟`)) return

    setLoading(true)
    setError(null)

    try {
      let updated = 0
      for (const q of toUpdate) {
        await FirebaseQuestionsService.updateQuestion(q.questionId, {
          difficulty: q.suggestedDifficulty
        })
        updated++
        setProgress({ current: updated, total: toUpdate.length })
      }

      // Reload questions
      await loadCategoryQuestions()
      setAnalyzedQuestions([])

      devLog(`Updated ${updated} questions`)
    } catch (err) {
      prodError('Error applying changes:', err)
      setError('خطأ في تطبيق التغييرات')
    } finally {
      setLoading(false)
    }
  }

  // Calculate target distribution (equal thirds)
  const totalQuestions = questions.length
  const targetPerDifficulty = Math.floor(totalQuestions / 3)
  const remainder = totalQuestions % 3

  const getDifficultyColor = (diff) => {
    switch (diff) {
      case 'easy': return 'bg-emerald-500'
      case 'medium': return 'bg-amber-500'
      case 'hard': return 'bg-rose-500'
      default: return 'bg-gray-500'
    }
  }

  const getDifficultyLabel = (diff) => {
    switch (diff) {
      case 'easy': return 'سهل'
      case 'medium': return 'متوسط'
      case 'hard': return 'صعب'
      default: return 'غير محدد'
    }
  }

  const changesCount = analyzedQuestions.filter(q => q.needsChange).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">موازن الصعوبات</h2>
        <p className="opacity-90">تحليل وتوزيع صعوبات الأسئلة بالتساوي باستخدام الذكاء الاصطناعي</p>
      </div>

      {/* Category Selection */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700 dark:text-gray-300">اختر الفئة:</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={analyzing || loading}
              className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-w-[200px]"
            >
              <option value="">-- اختر فئة --</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name || cat.id}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={loadCategoryQuestions}
            disabled={!selectedCategory || analyzing || loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg"
          >
            تحميل الأسئلة
          </button>

          {questions.length > 0 && (
            <>
              {!analyzing ? (
                <button
                  onClick={analyzeAllQuestions}
                  disabled={loading}
                  className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  تحليل الصعوبات ({questions.length})
                </button>
              ) : (
                <button
                  onClick={() => shouldStopRef.current = true}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  إيقاف
                </button>
              )}
            </>
          )}

          {changesCount > 0 && (
            <button
              onClick={applySuggestedDifficulties}
              disabled={loading || analyzing}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg"
            >
              تطبيق التغييرات ({changesCount})
            </button>
          )}
        </div>

        {/* Progress */}
        {(analyzing || (loading && progress.total > 0)) && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-2">
              <span>
                {analyzing
                  ? (progress.phase === 'rebalancing'
                    ? '🔄 جاري إعادة التوازن الذكي...'
                    : '📊 جاري تحليل الصعوبات...')
                  : 'جاري التطبيق...'}
              </span>
              <span>
                {progress.phase === 'rebalancing'
                  ? 'المرحلة الثانية'
                  : `${progress.current} / ${progress.total - 1}`}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  progress.phase === 'rebalancing' ? 'bg-blue-500' : 'bg-amber-500'
                }`}
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            {progress.phase === 'rebalancing' && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                الذكاء الاصطناعي يختار الأسئلة للنقل بين الصعوبات لتحقيق التوازن التام...
              </p>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Distribution Stats */}
      {questions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Current Distribution */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">التوزيع الحالي</h3>
            <div className="space-y-3">
              {['easy', 'medium', 'hard'].map(diff => (
                <div key={diff} className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${getDifficultyColor(diff)}`}></span>
                  <span className="text-gray-700 dark:text-gray-300 w-20">{getDifficultyLabel(diff)}</span>
                  <div className="flex-1 bg-gray-200 dark:bg-slate-700 rounded-full h-4">
                    <div
                      className={`${getDifficultyColor(diff)} h-4 rounded-full transition-all`}
                      style={{ width: `${totalQuestions > 0 ? (distribution[diff] / totalQuestions) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-gray-800 dark:text-gray-200 font-bold w-12 text-left">
                    {distribution[diff]}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t dark:border-slate-600">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                الإجمالي: <span className="font-bold text-gray-800 dark:text-gray-200">{totalQuestions}</span>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                الهدف لكل صعوبة: <span className="font-bold text-gray-800 dark:text-gray-200">{targetPerDifficulty}</span>
                {remainder > 0 && <span className="text-xs"> (+{remainder} زيادة)</span>}
              </div>
            </div>
          </div>

          {/* Suggested Distribution (after analysis) */}
          {analyzedQuestions.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">التوزيع المقترح (بعد التحليل)</h3>
              <div className="space-y-3">
                {['easy', 'medium', 'hard'].map(diff => (
                  <div key={diff} className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${getDifficultyColor(diff)}`}></span>
                    <span className="text-gray-700 dark:text-gray-300 w-20">{getDifficultyLabel(diff)}</span>
                    <div className="flex-1 bg-gray-200 dark:bg-slate-700 rounded-full h-4">
                      <div
                        className={`${getDifficultyColor(diff)} h-4 rounded-full transition-all`}
                        style={{ width: `${totalQuestions > 0 ? (suggestedDistribution[diff] / totalQuestions) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-gray-800 dark:text-gray-200 font-bold w-12 text-left">
                      {suggestedDistribution[diff]}
                    </span>
                    {suggestedDistribution[diff] !== distribution[diff] && (
                      <span className={`text-xs ${suggestedDistribution[diff] > distribution[diff] ? 'text-green-500' : 'text-red-500'}`}>
                        ({suggestedDistribution[diff] > distribution[diff] ? '+' : ''}{suggestedDistribution[diff] - distribution[diff]})
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t dark:border-slate-600">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  أسئلة تحتاج تغيير: <span className="font-bold text-orange-600">{changesCount}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Questions List with Changes */}
      {analyzedQuestions.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md overflow-hidden">
          <div className="p-4 border-b dark:border-slate-700">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
              الأسئلة التي تحتاج تغيير ({changesCount})
            </h3>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {analyzedQuestions.filter(q => q.needsChange).length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                جميع الأسئلة بالصعوبة المناسبة
              </div>
            ) : (
              <div className="divide-y dark:divide-slate-700">
                {analyzedQuestions.filter(q => q.needsChange).map((q, idx) => (
                  <div key={q.questionId} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <div className="flex items-start gap-3">
                      <span className="text-gray-400 text-sm">{idx + 1}</span>
                      <div className="flex-1">
                        {/* Question text */}
                        <p className="text-gray-800 dark:text-gray-200 text-sm mb-2">{q.questionText}</p>

                        {/* Answer */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">الإجابة:</span>
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">
                            {Array.isArray(q.answer) ? q.answer[0] : q.answer}
                          </span>
                        </div>

                        {/* Media buttons */}
                        {(q.imageUrl || q.audioUrl || q.videoUrl) && (
                          <div className="flex items-center gap-2 mb-2">
                            {q.imageUrl && (
                              <button
                                onClick={() => setMediaPreview({ show: true, type: 'image', url: q.imageUrl })}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                              >
                                <span>🖼️</span>
                                <span>صورة</span>
                              </button>
                            )}
                            {q.audioUrl && (
                              <button
                                onClick={() => setMediaPreview({ show: true, type: 'audio', url: q.audioUrl })}
                                className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                              >
                                <span>🔊</span>
                                <span>صوت</span>
                              </button>
                            )}
                            {q.videoUrl && (
                              <button
                                onClick={() => setMediaPreview({ show: true, type: 'video', url: q.videoUrl })}
                                className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                              >
                                <span>🎬</span>
                                <span>فيديو</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* Difficulty change */}
                        <div className="flex items-center gap-4 text-sm">
                          <span className={`px-2 py-1 rounded ${getDifficultyColor(q.currentDifficulty)} text-white`}>
                            {getDifficultyLabel(q.currentDifficulty)}
                          </span>
                          <span className="text-gray-400">←</span>
                          <span className={`px-2 py-1 rounded ${getDifficultyColor(q.suggestedDifficulty)} text-white`}>
                            {getDifficultyLabel(q.suggestedDifficulty)}
                          </span>
                          {q.reason && (
                            <span className="text-gray-500 dark:text-gray-400 text-xs">
                              ({q.reason})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Media Preview Modal */}
      {mediaPreview.show && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setMediaPreview({ show: false, type: null, url: null })}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white dark:bg-slate-800 rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setMediaPreview({ show: false, type: null, url: null })}
              className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            >
              ✕
            </button>

            {/* Media content */}
            <div className="p-4">
              {mediaPreview.type === 'image' && (
                <img
                  src={mediaPreview.url}
                  alt="Preview"
                  className="max-w-full max-h-[80vh] object-contain mx-auto"
                />
              )}
              {mediaPreview.type === 'audio' && (
                <div className="p-8 flex flex-col items-center gap-4">
                  <div className="text-6xl">🔊</div>
                  <audio
                    src={mediaPreview.url}
                    controls
                    autoPlay
                    className="w-full max-w-md"
                  />
                </div>
              )}
              {mediaPreview.type === 'video' && (
                <video
                  src={mediaPreview.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[80vh] mx-auto"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DifficultyBalancer
