import { useState } from 'react'
import { getTextDirection } from '../utils/textDirection'

/**
 * Card component for reviewing a single question during verification
 * Shows question details, AI notes, and action buttons
 */
function QuestionReviewCard({ question, onApprove, onDelete, onReVerify }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedText, setEditedText] = useState(question.text || '')
  const [editedAnswer, setEditedAnswer] = useState(question.answer || '')
  const [isLoading, setIsLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const aiNotes = question.aiNotes || {}
  const status = question.verificationStatus || 'unverified'

  // Status badge styling
  const getStatusBadge = () => {
    switch (status) {
      case 'approved':
        return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-400', label: 'موافق عليه' }
      case 'ai_reviewed':
        return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-400', label: 'تم المراجعة' }
      case 'flagged':
        return { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-800 dark:text-orange-400', label: 'يحتاج مراجعة' }
      default:
        return { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-300', label: 'غير متحقق' }
    }
  }

  // Factual accuracy badge
  const getAccuracyBadge = () => {
    const accuracy = aiNotes.factualAccuracy
    switch (accuracy) {
      case 'verified':
        return { bg: 'bg-green-500', text: 'text-white', label: 'صحيح' }
      case 'incorrect':
        return { bg: 'bg-red-500', text: 'text-white', label: 'خاطئ' }
      case 'uncertain':
        return { bg: 'bg-yellow-500', text: 'text-white', label: 'غير مؤكد' }
      default:
        return null
    }
  }

  // Difficulty badge
  const getDifficultyBadge = () => {
    const difficulty = question.difficulty
    switch (difficulty) {
      case 'easy':
        return { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'سهل' }
      case 'medium':
        return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'متوسط' }
      case 'hard':
        return { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-400', label: 'صعب' }
      default:
        return { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', label: 'غير محدد' }
    }
  }

  // Check if difficulty doesn't match (AI detected different difficulty)
  const hasDifficultyMismatch = aiNotes?.difficultyMatch === false
  const actualDifficulty = aiNotes?.actualDifficulty

  const statusBadge = getStatusBadge()
  const accuracyBadge = getAccuracyBadge()
  const difficultyBadge = getDifficultyBadge()

  // Handle approve with possible edits
  const handleApprove = async () => {
    setIsLoading(true)
    try {
      const corrections = isEditing && (editedText !== question.text || editedAnswer !== question.answer)
        ? { text: editedText, answer: editedAnswer }
        : null

      await onApprove(question.id, corrections)
      setIsEditing(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle re-verification
  const handleReVerify = async () => {
    setIsLoading(true)
    try {
      await onReVerify(question)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    setIsLoading(true)
    try {
      await onDelete(question.id)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={`border rounded-xl p-4 transition-all ${
      status === 'flagged'
        ? 'border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/10'
        : status === 'approved'
        ? 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/10'
        : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800'
    }`}>
      {/* Header with category and status */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Category - always show */}
          <span className="px-3 py-1 bg-purple-600 text-white rounded-full text-xs font-bold">
            {question.categoryName || question.categoryId || 'غير محدد'}
          </span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
            {statusBadge.label}
          </span>
          {accuracyBadge && (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${accuracyBadge.bg} ${accuracyBadge.text}`}>
              {accuracyBadge.label}
            </span>
          )}
          {/* Difficulty badge */}
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${difficultyBadge.bg} ${difficultyBadge.text}`}>
            {difficultyBadge.label}
          </span>
          {/* Difficulty mismatch warning */}
          {hasDifficultyMismatch && (
            <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full text-xs font-medium">
              ⚠️ صعوبة غير متطابقة
            </span>
          )}
          {/* Show loading indicator if verifying */}
          {question.isVerifying && (
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded-full text-xs animate-pulse">
              جاري التحقق...
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Question and Answer */}
      <div className="space-y-2">
        {isEditing ? (
          <>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">السؤال:</label>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 mt-1 bg-white text-gray-900 dark:bg-slate-700 dark:border-slate-600 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                rows={2}
                dir={getTextDirection(editedText)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">الإجابة:</label>
              <input
                type="text"
                value={editedAnswer}
                onChange={(e) => setEditedAnswer(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 mt-1 bg-white text-gray-900 dark:bg-slate-700 dark:border-slate-600 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-right"
                dir="rtl"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400">السؤال: </span>
              <span className="font-medium text-gray-800 dark:text-gray-100" dir={getTextDirection(question.text)}>
                {question.text}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400">الإجابة: </span>
              <span className="font-medium text-green-700 dark:text-green-400" dir={getTextDirection(question.answer)}>
                {question.answer}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Difficulty mismatch details - show when AI detected different difficulty */}
      {hasDifficultyMismatch && (
        <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-orange-700 dark:text-orange-300 font-bold text-sm">⚠️ تنبيه الصعوبة:</span>
            <span className="text-orange-900 dark:text-orange-100">
              الصعوبة المحددة: <strong>{question.difficulty || 'غير محدد'}</strong>
            </span>
            <span className="text-orange-600 dark:text-orange-400">←</span>
            <span className="text-orange-900 dark:text-orange-100">
              الصعوبة الفعلية: <strong>{actualDifficulty || 'غير محدد'}</strong>
            </span>
          </div>
          {aiNotes?.suggestedQuestion && (
            <p className="text-sm text-orange-700 dark:text-orange-300 mt-2">
              💡 تم اقتراح سؤال معدل ليناسب الصعوبة المطلوبة (الإجابة لم تتغير)
            </p>
          )}
        </div>
      )}

      {/* Suggested question - always visible when present (important!) */}
      {aiNotes?.suggestedQuestion && (
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
          <span className="text-blue-700 dark:text-blue-300 font-bold text-sm">
            {hasDifficultyMismatch ? '📊 سؤال معدل للصعوبة: ' : '💡 سؤال مقترح: '}
          </span>
          <span className="text-blue-900 dark:text-blue-100 font-medium" dir={getTextDirection(aiNotes.suggestedQuestion)}>
            {aiNotes.suggestedQuestion}
          </span>
        </div>
      )}

      {/* Suggested answer - always visible when present */}
      {aiNotes?.suggestedAnswer && (
        <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg">
          <span className="text-green-700 dark:text-green-300 font-bold text-sm">💡 إجابة مقترحة: </span>
          <span className="text-green-900 dark:text-green-100 font-medium" dir={getTextDirection(aiNotes.suggestedAnswer)}>
            {aiNotes.suggestedAnswer}
          </span>
        </div>
      )}

      {/* AI Notes (expanded view) */}
      {expanded && aiNotes && Object.keys(aiNotes).length > 0 && (
        <div className="mt-4 p-3 bg-gray-100 dark:bg-slate-700 rounded-lg space-y-2">
          <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">ملاحظات الذكاء الاصطناعي:</h4>

          {/* Difficulty analysis */}
          {(aiNotes.difficultyMatch !== undefined || aiNotes.actualDifficulty) && (
            <div className="text-sm">
              <span className={`font-medium ${hasDifficultyMismatch ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                تحليل الصعوبة:{' '}
              </span>
              <span className="text-gray-700 dark:text-gray-300">
                {hasDifficultyMismatch ? (
                  <>
                    الصعوبة المحددة ({question.difficulty}) لا تتطابق مع الصعوبة الفعلية ({actualDifficulty})
                  </>
                ) : (
                  <>
                    الصعوبة متطابقة ✓ ({question.difficulty || 'غير محدد'})
                  </>
                )}
              </span>
            </div>
          )}

          {/* Grammar issues */}
          {aiNotes.grammarIssues?.length > 0 && (
            <div className="text-sm">
              <span className="text-red-600 dark:text-red-400 font-medium">مشاكل القواعد: </span>
              <span className="text-gray-700 dark:text-gray-300">{aiNotes.grammarIssues.join(', ')}</span>
            </div>
          )}

          {/* Suggested correction */}
          {aiNotes.suggestedCorrection && (
            <div className="text-sm">
              <span className="text-purple-600 dark:text-purple-400 font-medium">التصحيح المقترح: </span>
              <span className="text-gray-700 dark:text-gray-300">{aiNotes.suggestedCorrection}</span>
            </div>
          )}

          {/* Notes */}
          {aiNotes.notes && (
            <div className="text-sm">
              <span className="text-gray-600 dark:text-gray-400 font-medium">ملاحظات: </span>
              <span className="text-gray-700 dark:text-gray-300" dir={getTextDirection(aiNotes.notes)}>
                {aiNotes.notes}
              </span>
            </div>
          )}

          {/* Sources */}
          {aiNotes.sources?.length > 0 && (
            <div className="text-sm">
              <span className="text-gray-600 dark:text-gray-400 font-medium">المصادر: </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {aiNotes.sources.map((source, idx) => {
                  // Handle both string and object {url, name} formats
                  let sourceUrl = typeof source === 'object' ? source?.url : source
                  let sourceName = typeof source === 'object' ? source?.name : null
                  let displayText = sourceName || sourceUrl
                  let isValidUrl = false

                  try {
                    if (sourceUrl && typeof sourceUrl === 'string' && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'))) {
                      displayText = sourceName || new URL(sourceUrl).hostname
                      isValidUrl = true
                    }
                  } catch {
                    // Not a valid URL, use as-is
                  }

                  return isValidUrl ? (
                    <a
                      key={idx}
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded"
                    >
                      {displayText}
                    </a>
                  ) : displayText ? (
                    <span
                      key={idx}
                      className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded"
                    >
                      {displayText}
                    </span>
                  ) : null
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t dark:border-slate-600">
        {status !== 'approved' && (
          <>
            {isEditing ? (
              <>
                <button
                  onClick={handleApprove}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium py-1.5 px-4 rounded-lg flex items-center gap-1"
                >
                  {isLoading ? '...' : 'حفظ والموافقة'}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setEditedText(question.text)
                    setEditedAnswer(question.answer)
                  }}
                  className="bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium py-1.5 px-4 rounded-lg"
                >
                  إلغاء
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleApprove}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium py-1.5 px-4 rounded-lg flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  موافقة
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium py-1.5 px-4 rounded-lg flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  تعديل
                </button>
              </>
            )}
          </>
        )}

        <button
          onClick={handleReVerify}
          disabled={isLoading}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white text-sm font-medium py-1.5 px-4 rounded-lg flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          إعادة التحقق
        </button>

        <button
          onClick={handleDelete}
          disabled={isLoading}
          className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-sm font-medium py-1.5 px-4 rounded-lg flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          حذف
        </button>

        {/* Quick apply AI suggestions */}
        {(aiNotes.suggestedQuestion || aiNotes.suggestedAnswer) && !isEditing && (
          <button
            onClick={() => {
              if (aiNotes.suggestedQuestion) setEditedText(aiNotes.suggestedQuestion)
              // Note: We don't apply suggestedAnswer anymore for difficulty adjustments
              // since the answer is linked to an image and should not change
              if (aiNotes.suggestedAnswer && !hasDifficultyMismatch) setEditedAnswer(aiNotes.suggestedAnswer)
              setIsEditing(true)
            }}
            className={`text-white text-sm font-medium py-1.5 px-4 rounded-lg ${
              hasDifficultyMismatch
                ? 'bg-orange-500 hover:bg-orange-600'
                : 'bg-yellow-500 hover:bg-yellow-600'
            }`}
          >
            {hasDifficultyMismatch
              ? '📊 تطبيق السؤال المعدل للصعوبة'
              : aiNotes.suggestedQuestion && aiNotes.suggestedAnswer
              ? 'تطبيق المقترحات'
              : aiNotes.suggestedQuestion
              ? 'تطبيق السؤال المقترح'
              : 'تطبيق الإجابة المقترحة'}
          </button>
        )}
      </div>
    </div>
  )
}

export default QuestionReviewCard
