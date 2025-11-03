import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState } from 'react'
import { S3UploadServiceSecure as S3UploadService } from '../utils/s3UploadSecure'
import SmartImage from './SmartImage'
import MediaPlayer from './MediaPlayer'
import AIEnhancementModal from './AIEnhancementModal'
import { processQuestionImage } from '../utils/imageProcessor'

// Reusable component for adding questions

/**
 * Reusable single question adder component
 * Used in both Admin and Loader pages
 *
 * @param {Array} categories - List of available categories
 * @param {Array} pendingCategories - List of pending categories for this loader (default: [])
 * @param {Function} onQuestionAdded - Callback when question is submitted (receives questionData)
 * @param {Object} initialQuestion - Optional initial question data for editing
 * @param {Boolean} showAI - Whether to show AI enhancement button (default: false)
 * @param {String} inviteCode - Optional invite code for loader authentication
 */
function SingleQuestionAdder({ categories, pendingCategories = [], onQuestionAdded, initialQuestion = null, showAI = false, inviteCode = null }) {
  const [questionData, setQuestionData] = useState(initialQuestion ? {
    categoryId: initialQuestion.categoryId || '',
    difficulty: initialQuestion.difficulty || 'easy',
    text: initialQuestion.question || initialQuestion.text || '',
    answer: initialQuestion.answer || '',
    choices: initialQuestion.options || initialQuestion.choices || ['', '', '', ''],
    explanation: initialQuestion.explanation || '',
    imageUrl: initialQuestion.imageUrl || null,
    answerImageUrl: initialQuestion.answerImageUrl || null,
    audioUrl: initialQuestion.audioUrl || null,
    answerAudioUrl: initialQuestion.answerAudioUrl || null,
    videoUrl: initialQuestion.videoUrl || null,
    answerVideoUrl: initialQuestion.answerVideoUrl || null,
    type: initialQuestion.type || 'text'
  } : {
    categoryId: '',
    difficulty: 'easy',
    text: '',
    answer: '',
    choices: ['', '', '', ''],
    explanation: '',
    imageUrl: null,
    answerImageUrl: null,
    audioUrl: null,
    answerAudioUrl: null,
    videoUrl: null,
    answerVideoUrl: null,
    type: 'text'
  })

  const [uploading, setUploading] = useState(false)
  const [uploadingField, setUploadingField] = useState(null)
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showAIModal, setShowAIModal] = useState(false)

  const handleMediaUpload = async (file, field) => {
    if (!file) return

    try {
      setUploading(true)
      setUploadingField(field)

      let uploadFile = file

      // Compress images before uploading
      if (file.type.startsWith('image/')) {
        try {
          devLog(`📸 Compressing image: ${file.name}`)
          const { blob, info } = await processQuestionImage(file)

          // Convert blob to file
          uploadFile = new File([blob], file.name.replace(/\.\w+$/, '.webp'), {
            type: 'image/webp',
            lastModified: Date.now(),
          })

          devLog(`✅ Image compressed: ${info.originalSize} → ${info.newSize} (${info.compression})`)
        } catch (compressionError) {
          devWarn('Image compression failed, uploading original:', compressionError.message)
          uploadFile = file
        }
      }

      // Upload to S3 using the unified uploadQuestionMedia method
      // This handles images, audio, and video automatically
      // Pass invite code if available (for loader users)
      const downloadURL = await S3UploadService.uploadQuestionMedia(uploadFile, null, inviteCode)

      setQuestionData(prev => ({ ...prev, [field]: downloadURL }))
      devLog(`✅ ${field} uploaded:`, downloadURL)
    } catch (error) {
      prodError(`Error uploading ${field}:`, error)
      alert('فشل رفع الملف: ' + error.message)
    } finally {
      setUploading(false)
      setUploadingField(null)
    }
  }

  const handleMediaDelete = async (field) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الملف؟')) return

    try {
      const mediaUrl = questionData[field]
      if (mediaUrl) {
        // Delete from S3 (pass invite code if available for loader users)
        await S3UploadService.deleteFile(mediaUrl, inviteCode)
      }
      setQuestionData(prev => ({ ...prev, [field]: null }))
    } catch (error) {
      prodError(`Error deleting ${field}:`, error)
      alert('فشل حذف الملف: ' + error.message)
    }
  }

  const handleAIChanges = (changes) => {
    setQuestionData(prev => ({ ...prev, ...changes }))
  }

  const getCategoryName = () => {
    if (showNewCategoryInput) {
      return newCategoryName || 'فئة جديدة'
    }

    // Check if it's a pending category
    if (questionData.categoryId?.startsWith('pending-')) {
      const pendingId = questionData.categoryId.replace('pending-', '')
      const pendingCategory = pendingCategories.find(cat => cat.id === pendingId)
      return pendingCategory?.name || ''
    }

    // Check approved categories
    const selectedCategory = categories.find(cat => cat.id === questionData.categoryId)
    return selectedCategory?.name || ''
  }

  const handleSubmit = async () => {
    // Validation
    if (!questionData.categoryId && !showNewCategoryInput) {
      alert('الرجاء اختيار الفئة أو إنشاء فئة جديدة')
      return
    }
    if (showNewCategoryInput && !newCategoryName.trim()) {
      alert('الرجاء إدخال اسم الفئة الجديدة')
      return
    }
    if (!questionData.text || !questionData.text.trim()) {
      alert('الرجاء إدخال نص السؤال')
      return
    }
    if (!questionData.answer || !questionData.answer.trim()) {
      alert('الرجاء إدخال الإجابة الصحيحة')
      return
    }

    try {
      let categoryId = questionData.categoryId
      let categoryName = ''
      let isNewCategory = false
      let isPendingCategory = false

      // Handle new category creation
      if (showNewCategoryInput) {
        // Use a temporary ID for new categories (will be marked as pending)
        categoryId = `new_${Date.now()}`
        categoryName = newCategoryName.trim()
        isNewCategory = true
      } else if (questionData.categoryId?.startsWith('pending-')) {
        // Using an existing pending category
        const pendingId = questionData.categoryId.replace('pending-', '')
        const pendingCategory = pendingCategories.find(cat => cat.id === pendingId)
        categoryId = pendingCategory.id
        categoryName = pendingCategory.name
        isPendingCategory = true
      } else {
        // Using an approved category
        const selectedCategory = categories.find(cat => cat.id === questionData.categoryId)
        categoryId = selectedCategory.id
        categoryName = selectedCategory?.name || questionData.categoryId
      }

      // Determine question type based on media presence
      let type = 'text'
      if (questionData.imageUrl) type = 'image'
      if (questionData.audioUrl) type = 'audio'
      if (questionData.videoUrl) type = 'video'

      // Prepare question data
      const preparedData = {
        categoryId: categoryId,
        category: categoryName, // Category name
        isNewCategory: isNewCategory, // Flag to indicate if this is a new category
        isPendingCategory: isPendingCategory, // Flag to indicate if using a pending category
        difficulty: questionData.difficulty,
        question: questionData.text, // Use 'question' field instead of 'text'
        answer: questionData.answer,
        type,
        options: questionData.choices.filter(choice => choice.trim() !== ''),
        explanation: questionData.explanation || '',
        imageUrl: questionData.imageUrl || null,
        answerImageUrl: questionData.answerImageUrl || null,
        audioUrl: questionData.audioUrl || null,
        answerAudioUrl: questionData.answerAudioUrl || null,
        videoUrl: questionData.videoUrl || null,
        answerVideoUrl: questionData.answerVideoUrl || null
      }

      // Call the callback with prepared data
      const success = await onQuestionAdded(preparedData)

      if (success) {
        // Reset form after successful submission
        setQuestionData({
          categoryId: '',
          difficulty: 'easy',
          text: '',
          answer: '',
          choices: ['', '', '', ''],
          explanation: '',
          imageUrl: null,
          answerImageUrl: null,
          audioUrl: null,
          answerAudioUrl: null,
          videoUrl: null,
          answerVideoUrl: null,
          type: 'text'
        })
        setShowNewCategoryInput(false)
        setNewCategoryName('')
        alert('✅ تم إضافة السؤال بنجاح!')
      }
    } catch (error) {
      prodError('Error submitting question:', error)
      alert('فشل في إضافة السؤال: ' + error.message)
    }
  }

  return (
    <div>
      {/* Category and Difficulty */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Category Selection */}
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">الفئة *</label>

          {!showNewCategoryInput ? (
            <>
              <select
                value={questionData.categoryId}
                onChange={(e) => setQuestionData(prev => ({ ...prev, categoryId: e.target.value }))}
                className="w-full p-2 border rounded-lg text-sm text-gray-900 bg-white"
                required={!showNewCategoryInput}
              >
                <option value="">اختر الفئة</option>

                {/* Approved categories */}
                {categories.length > 0 && (
                  <optgroup label="✅ فئات معتمدة">
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </optgroup>
                )}

                {/* Pending categories (only for loaders) */}
                {pendingCategories.length > 0 && (
                  <optgroup label="⏳ فئاتي قيد المراجعة">
                    {pendingCategories.map(category => (
                      <option
                        key={`pending-${category.id}`}
                        value={`pending-${category.id}`}
                        className="text-orange-600"
                      >
                        {category.name} (قيد المراجعة)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                type="button"
                onClick={() => setShowNewCategoryInput(true)}
                className="mt-2 text-blue-600 text-sm hover:underline"
              >
                + إنشاء فئة جديدة
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="w-full p-2 border rounded-lg text-sm text-gray-900 bg-white"
                placeholder="اسم الفئة الجديدة..."
                required={showNewCategoryInput}
              />
              <button
                type="button"
                onClick={() => {
                  setShowNewCategoryInput(false)
                  setNewCategoryName('')
                }}
                className="mt-2 text-gray-600 text-sm hover:underline"
              >
                إلغاء - اختر فئة موجودة
              </button>
            </>
          )}
        </div>

        {/* Difficulty */}
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">مستوى الصعوبة:</label>
          <select
            value={questionData.difficulty}
            onChange={(e) => setQuestionData(prev => ({ ...prev, difficulty: e.target.value }))}
            className="w-full p-2 border rounded-lg text-sm text-gray-900 bg-white"
          >
            <option value="easy">سهل (200 نقطة)</option>
            <option value="medium">متوسط (400 نقطة)</option>
            <option value="hard">صعب (600 نقطة)</option>
          </select>
        </div>
      </div>

      {/* Question Text */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-bold text-gray-700">نص السؤال *</label>
          {showAI && (
            <button
              type="button"
              onClick={() => setShowAIModal(true)}
              className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:from-purple-700 hover:to-blue-700 transition-all flex items-center gap-1"
              title="تحسين السؤال بالذكاء الاصطناعي"
            >
              ✨ AI
            </button>
          )}
        </div>
        <textarea
          value={questionData.text}
          onChange={(e) => setQuestionData(prev => ({ ...prev, text: e.target.value }))}
          className="w-full p-2 border rounded-lg text-sm text-gray-900 bg-white"
          rows={3}
          placeholder="اكتب نص السؤال هنا..."
          required
        />
      </div>

      {/* Answer */}
      <div className="mb-4">
        <label className="block text-xs font-bold mb-1 text-gray-700">الإجابة الصحيحة *</label>
        <input
          type="text"
          value={questionData.answer}
          onChange={(e) => setQuestionData(prev => ({ ...prev, answer: e.target.value }))}
          className="w-full p-2 border rounded-lg text-sm text-gray-900 bg-white"
          placeholder="الإجابة الصحيحة..."
          required
        />
      </div>

      {/* Multiple Choice Options */}
      <div className="mb-4">
        <label className="block text-xs font-bold mb-1 text-gray-700">خيارات الإجابة (اختياري)</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {questionData.choices.map((choice, index) => (
            <input
              key={index}
              type="text"
              value={choice}
              onChange={(e) => {
                const newChoices = [...questionData.choices]
                newChoices[index] = e.target.value
                setQuestionData(prev => ({ ...prev, choices: newChoices }))
              }}
              className="p-2 border rounded text-xs text-gray-900 bg-white"
              placeholder={`الخيار ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Question Media Section */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-bold mb-3 text-blue-800">🎯 وسائط السؤال</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Question Image */}
          <div>
            <label className="block text-xs font-bold mb-1 text-blue-700">صورة السؤال:</label>
            <div className="flex gap-1">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) handleMediaUpload(file, 'imageUrl')
                }}
                className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                disabled={uploading && uploadingField === 'imageUrl'}
              />
              {questionData.imageUrl && (
                <button
                  type="button"
                  onClick={() => handleMediaDelete('imageUrl')}
                  className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                  title="حذف الصورة"
                >
                  ✕
                </button>
              )}
            </div>
            {uploading && uploadingField === 'imageUrl' && (
              <div className="mt-2 text-xs text-blue-600">جاري الرفع...</div>
            )}
            {questionData.imageUrl && (
              <div className="mt-2">
                <SmartImage
                  src={questionData.imageUrl}
                  alt="معاينة"
                  size="thumb"
                  context="question"
                  className="w-20 h-20 object-cover rounded border"
                />
              </div>
            )}
          </div>

          {/* Question Audio */}
          <div>
            <label className="block text-xs font-bold mb-1 text-blue-700">صوت السؤال:</label>
            <div className="flex gap-1">
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) handleMediaUpload(file, 'audioUrl')
                }}
                className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                disabled={uploading && uploadingField === 'audioUrl'}
              />
              {questionData.audioUrl && (
                <button
                  type="button"
                  onClick={() => handleMediaDelete('audioUrl')}
                  className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                  title="حذف الصوت"
                >
                  ✕
                </button>
              )}
            </div>
            {uploading && uploadingField === 'audioUrl' && (
              <div className="mt-2 text-xs text-blue-600">جاري الرفع...</div>
            )}
            {questionData.audioUrl && (
              <div className="mt-2">
                <MediaPlayer
                  src={questionData.audioUrl}
                  type="audio"
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Question Video */}
          <div>
            <label className="block text-xs font-bold mb-1 text-blue-700">فيديو السؤال:</label>
            <div className="flex gap-1">
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) handleMediaUpload(file, 'videoUrl')
                }}
                className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                disabled={uploading && uploadingField === 'videoUrl'}
              />
              {questionData.videoUrl && (
                <button
                  type="button"
                  onClick={() => handleMediaDelete('videoUrl')}
                  className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                  title="حذف الفيديو"
                >
                  ✕
                </button>
              )}
            </div>
            {uploading && uploadingField === 'videoUrl' && (
              <div className="mt-2 text-xs text-blue-600">جاري الرفع...</div>
            )}
            {questionData.videoUrl && (
              <div className="mt-2">
                <MediaPlayer
                  src={questionData.videoUrl}
                  type="video"
                  className="w-full"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Answer Media Section */}
      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
        <h4 className="text-sm font-bold mb-3 text-green-800">✅ وسائط الإجابة</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Answer Image */}
          <div>
            <label className="block text-xs font-bold mb-1 text-green-700">صورة الإجابة:</label>
            <div className="flex gap-1">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) handleMediaUpload(file, 'answerImageUrl')
                }}
                className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                disabled={uploading && uploadingField === 'answerImageUrl'}
              />
              {questionData.answerImageUrl && (
                <button
                  type="button"
                  onClick={() => handleMediaDelete('answerImageUrl')}
                  className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                  title="حذف الصورة"
                >
                  ✕
                </button>
              )}
            </div>
            {uploading && uploadingField === 'answerImageUrl' && (
              <div className="mt-2 text-xs text-green-600">جاري الرفع...</div>
            )}
            {questionData.answerImageUrl && (
              <div className="mt-2">
                <img
                  src={questionData.answerImageUrl}
                  alt="معاينة"
                  className="w-20 h-20 object-cover rounded border"
                />
              </div>
            )}
          </div>

          {/* Answer Audio */}
          <div>
            <label className="block text-xs font-bold mb-1 text-green-700">صوت الإجابة:</label>
            <div className="flex gap-1">
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) handleMediaUpload(file, 'answerAudioUrl')
                }}
                className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                disabled={uploading && uploadingField === 'answerAudioUrl'}
              />
              {questionData.answerAudioUrl && (
                <button
                  type="button"
                  onClick={() => handleMediaDelete('answerAudioUrl')}
                  className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                  title="حذف الصوت"
                >
                  ✕
                </button>
              )}
            </div>
            {uploading && uploadingField === 'answerAudioUrl' && (
              <div className="mt-2 text-xs text-green-600">جاري الرفع...</div>
            )}
            {questionData.answerAudioUrl && (
              <div className="mt-2">
                <MediaPlayer
                  src={questionData.answerAudioUrl}
                  type="audio"
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Answer Video */}
          <div>
            <label className="block text-xs font-bold mb-1 text-green-700">فيديو الإجابة:</label>
            <div className="flex gap-1">
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) handleMediaUpload(file, 'answerVideoUrl')
                }}
                className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                disabled={uploading && uploadingField === 'answerVideoUrl'}
              />
              {questionData.answerVideoUrl && (
                <button
                  type="button"
                  onClick={() => handleMediaDelete('answerVideoUrl')}
                  className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                  title="حذف الفيديو"
                >
                  ✕
                </button>
              )}
            </div>
            {uploading && uploadingField === 'answerVideoUrl' && (
              <div className="mt-2 text-xs text-green-600">جاري الرفع...</div>
            )}
            {questionData.answerVideoUrl && (
              <div className="mt-2">
                <MediaPlayer
                  src={questionData.answerVideoUrl}
                  type="video"
                  className="w-full"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end mt-6 pt-4 border-t">
        <button
          onClick={handleSubmit}
          disabled={uploading}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded-lg transition-colors"
        >
          {uploading ? 'جاري الرفع...' : initialQuestion ? 'حفظ التعديلات' : 'إضافة السؤال'}
        </button>
      </div>

      {/* AI Enhancement Modal */}
      <AIEnhancementModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        questionData={questionData}
        categoryName={getCategoryName()}
        onApplyChanges={handleAIChanges}
      />
    </div>
  )
}

export default SingleQuestionAdder
