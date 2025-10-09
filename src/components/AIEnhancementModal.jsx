import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import aiService from '../services/aiService'
import S3UploadService from '../utils/s3Upload'
import { processQuestionImage } from '../utils/imageProcessor'

/**
 * Modal for AI-powered question enhancement
 * - Improve question text with ChatGPT
 * - Search and select images from Google
 * - Auto-upload selected images to S3/CloudFront
 */
export default function AIEnhancementModal({
  isOpen,
  onClose,
  questionData,
  categoryName,
  onApplyChanges
}) {
  const [activeTab, setActiveTab] = useState('improve') // 'improve' or 'images'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Question improvement state
  const [improvedQuestion, setImprovedQuestion] = useState('')
  const [improvedAnswer, setImprovedAnswer] = useState('')
  const [suggestedDifficulty, setSuggestedDifficulty] = useState('')
  const [explanation, setExplanation] = useState('')

  // Image search state
  const [searchQuery, setSearchQuery] = useState('')
  const [images, setImages] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageTarget, setImageTarget] = useState('question') // 'question' or answer index
  const [applyToBoth, setApplyToBoth] = useState(false) // Upload to both question and answer
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setActiveTab('improve')
      setError(null)
      setImprovedQuestion('')
      setImprovedAnswer('')
      setSuggestedDifficulty('')
      setExplanation('')
      setImages([])
      setSelectedImage(null)
      setSearchQuery(questionData?.text || '')
      setImageTarget('question')
      setApplyToBoth(false)
      setSuccessMessage('')
    }
  }, [isOpen, questionData])

  if (!isOpen) return null

  const handleImproveQuestion = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await aiService.improveQuestion(
        questionData.text,
        questionData.answer,
        categoryName,
        questionData.difficulty
      )

      setImprovedQuestion(result.improvedQuestion)
      setImprovedAnswer(result.improvedAnswer)
      setSuggestedDifficulty(result.suggestedDifficulty)
      setExplanation(result.explanation)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSearchImages = async (loadMore = false) => {
    setLoading(true)
    setError(null)
    if (!loadMore) {
      setImages([])
    }

    try {
      // Get the correct answer text
      const correctAnswer = questionData?.answer || ''

      let searchContext = ''

      // If user typed custom search query, use it directly (no AI processing)
      if (searchQuery && searchQuery.trim()) {
        searchContext = searchQuery.trim()
      } else {
        // No custom query - use AI to generate optimal search query
        if (imageTarget === 'answer') {
          // Generate English search query - AI knows to focus on ANSWER
          const optimizedQuery = await aiService.generateImageSearchQuery(
            questionData?.text || '',  // Full question for context
            categoryName,
            correctAnswer,  // Answer
            'answer'  // Tell AI we want an ANSWER image
          )
          searchContext = optimizedQuery
        } else {
          // Generate search query - AI knows to focus on QUESTION
          const optimizedQuery = await aiService.generateImageSearchQuery(
            questionData?.text || '',  // Full question
            categoryName,
            correctAnswer,  // Answer for context
            'question'  // Tell AI we want a QUESTION image
          )
          searchContext = optimizedQuery
        }
      }

      // Calculate start index for pagination
      const startIndex = loadMore ? images.length + 1 : 1

      // Search for images
      const results = await aiService.searchImages(searchContext, 8, startIndex)

      if (loadMore) {
        setImages(prev => [...prev, ...results])
      } else {
        setImages(results)
      }

      if (results.length === 0) {
        setError('لم يتم العثور على صور. جرب كلمات بحث مختلفة.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectImage = async (image) => {
    setSelectedImage(image)
    setUploadingImage(true)
    setError(null)

    try {
      // Try multiple strategies to get the highest quality image
      const img = new Image()
      img.crossOrigin = 'anonymous'

      let imageLoaded = false
      let loadedUrl = null

      // Try direct URL first, then fall back to proxy
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      const proxyUrl = isLocalhost
        ? `http://127.0.0.1:5001/lamah-357f3/us-central1/imageProxy?url=${encodeURIComponent(image.url)}`
        : `${window.location.origin}/api/imageProxy?url=${encodeURIComponent(image.url)}`

      const urls = [
        image.url, // Try direct first
        proxyUrl // Use proxy if CORS blocked
      ]

      for (let i = 0; i < urls.length; i++) {
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout after 10 seconds')), 10000)
            img.onload = () => {
              clearTimeout(timeout)
              imageLoaded = true
              loadedUrl = urls[i]
              devLog(`✅ Image loaded (${i === 0 ? 'direct' : 'via proxy'}): ${img.width}x${img.height}px`)
              resolve()
            }
            img.onerror = () => {
              clearTimeout(timeout)
              reject(new Error('Failed to load'))
            }
            img.src = urls[i]
          })
          break // Success, exit loop
        } catch (err) {
          if (i === urls.length - 1) {
            // Last attempt failed
            throw new Error('فشل تحميل الصورة حتى مع استخدام الوكيل.\n\nجرب صورة أخرى من نتائج البحث.')
          }
          devLog(`⚠️ Attempt ${i + 1} failed, trying next method...`)
        }
      }

      if (!imageLoaded) {
        throw new Error('فشل تحميل الصورة بجودة عالية')
      }

      // Create canvas and compress the image
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      // Resize to max dimensions
      const maxWidth = 1920
      const maxHeight = 1080
      let width = img.width
      let height = img.height

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, 0, 0, width, height)

      // Convert to WebP blob with compression
      const compressedBlob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/webp', 0.90)
      })

      // Create a File from the compressed blob
      const compressedFileName = `ai_image_${Date.now()}.webp`
      const compressedFile = new File([compressedBlob], compressedFileName, { type: 'image/webp' })

      // Upload to S3/CloudFront
      const cloudFrontUrl = await S3UploadService.uploadQuestionMedia(compressedFile)

      // Apply the image based on selected target
      if (applyToBoth) {
        // Apply to both question and answer
        onApplyChanges({ imageUrl: cloudFrontUrl, answerImageUrl: cloudFrontUrl })
        setSuccessMessage('✅ تم رفع الصورة للسؤال والجواب بنجاح!')
      } else if (imageTarget === 'question') {
        onApplyChanges({ imageUrl: cloudFrontUrl })
        setSuccessMessage('✅ تم رفع صورة السؤال بنجاح!')
      } else if (imageTarget === 'answer') {
        // Apply to answer image
        onApplyChanges({ answerImageUrl: cloudFrontUrl })
        setSuccessMessage('✅ تم رفع صورة الجواب بنجاح!')
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('')
      }, 3000)
    } catch (err) {
      prodError('Error uploading image:', err)
      setError('فشل رفع الصورة: ' + err.message)
      setSelectedImage(null)
    } finally {
      setUploadingImage(false)
    }
  }

  const handleApplyImprovedQuestion = () => {
    const changes = {
      text: improvedQuestion,
      answer: improvedAnswer
    }

    // Optionally apply suggested difficulty
    if (suggestedDifficulty && suggestedDifficulty !== questionData.difficulty) {
      changes.difficulty = suggestedDifficulty
    }

    onApplyChanges(changes)
    setSuccessMessage('✅ تم تطبيق تحسينات السؤال والإجابة بنجاح!')

    // Clear the improved question state to allow new improvements
    setImprovedQuestion('')
    setImprovedAnswer('')
    setSuggestedDifficulty('')
    setExplanation('')

    // Clear success message after 3 seconds
    setTimeout(() => {
      setSuccessMessage('')
    }, 3000)
  }

  const modalContent = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">✨ تحسين السؤال بالذكاء الاصطناعي</h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => setActiveTab('improve')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                activeTab === 'improve'
                  ? 'bg-white text-purple-600'
                  : 'bg-white bg-opacity-20 text-white hover:bg-opacity-30'
              }`}
            >
              📝 تحسين النص
            </button>
            <button
              onClick={() => setActiveTab('images')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                activeTab === 'images'
                  ? 'bg-white text-purple-600'
                  : 'bg-white bg-opacity-20 text-white hover:bg-opacity-30'
              }`}
            >
              🖼️ البحث عن صور
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {successMessage && (
            <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4 rounded animate-pulse">
              <p className="font-bold">{successMessage}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded">
              <p className="font-bold">خطأ</p>
              <p>{error}</p>
            </div>
          )}

          {/* Improve Question Tab */}
          {activeTab === 'improve' && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg border-2 border-gray-200">
                <h3 className="font-bold text-gray-700 mb-2">السؤال الأصلي:</h3>
                <p className="text-gray-900">{questionData?.text}</p>
                <div className="mt-2 flex gap-2">
                  <span className="text-sm text-gray-600">الفئة: {categoryName}</span>
                  <span className="text-sm text-gray-600">الصعوبة: {questionData?.difficulty}</span>
                </div>
              </div>

              <button
                onClick={handleImproveQuestion}
                disabled={loading}
                className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
              >
                {loading ? '⏳ جاري التحسين...' : '✨ تحسين السؤال'}
              </button>

              {improvedQuestion && (
                <div className="bg-green-50 p-4 rounded-lg border-2 border-green-300">
                  {/* Editable Improved Question */}
                  <div className="mb-4">
                    <h3 className="font-bold text-green-700 mb-2">السؤال المحسّن:</h3>
                    <textarea
                      value={improvedQuestion}
                      onChange={(e) => setImprovedQuestion(e.target.value)}
                      className="w-full p-3 border-2 border-green-300 rounded-lg text-gray-900 text-lg resize-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
                      rows="3"
                      dir="auto"
                    />
                  </div>

                  {/* Editable Improved Answer */}
                  {improvedAnswer && (
                    <div className="mb-4 bg-green-100 p-3 rounded border-2 border-green-400">
                      <h4 className="font-bold text-green-800 mb-2">الإجابة المحسّنة:</h4>
                      <textarea
                        value={improvedAnswer}
                        onChange={(e) => setImprovedAnswer(e.target.value)}
                        className="w-full p-3 border-2 border-green-400 rounded-lg text-gray-900 resize-none focus:border-green-600 focus:ring-2 focus:ring-green-300"
                        rows="2"
                        dir="auto"
                      />
                    </div>
                  )}

                  {/* Editable Suggested Difficulty */}
                  {suggestedDifficulty && (
                    <div className={`p-3 rounded mb-2 border-2 ${
                      suggestedDifficulty !== questionData.difficulty
                        ? 'bg-yellow-100 border-yellow-500'
                        : 'bg-blue-100 border-blue-500'
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className={`font-semibold ${
                          suggestedDifficulty !== questionData.difficulty
                            ? 'text-yellow-800'
                            : 'text-blue-800'
                        }`}>
                          {suggestedDifficulty !== questionData.difficulty ? '💡 الصعوبة المقترحة:' : '✓ الصعوبة المقترحة:'}
                        </span>
                        <select
                          value={suggestedDifficulty}
                          onChange={(e) => setSuggestedDifficulty(e.target.value)}
                          className={`text-lg font-bold px-4 py-2 rounded border-2 cursor-pointer focus:outline-none focus:ring-2 ${
                            suggestedDifficulty !== questionData.difficulty
                              ? 'text-yellow-900 bg-yellow-200 border-yellow-600 focus:ring-yellow-400'
                              : 'text-blue-900 bg-blue-200 border-blue-600 focus:ring-blue-400'
                          }`}
                        >
                          <option value="easy">easy</option>
                          <option value="medium">medium</option>
                          <option value="hard">hard</option>
                        </select>
                        {suggestedDifficulty === questionData.difficulty && (
                          <span className="text-sm text-blue-700">(نفس الصعوبة الحالية)</span>
                        )}
                      </div>
                    </div>
                  )}

                  {explanation && (
                    <div className="text-sm text-gray-600 mt-2 border-t pt-2">
                      <strong>سبب التحسين:</strong> {explanation}
                    </div>
                  )}

                  <button
                    onClick={handleApplyImprovedQuestion}
                    className="mt-4 w-full bg-green-600 text-white py-2 rounded-lg font-bold hover:bg-green-700 transition-colors"
                  >
                    ✅ تطبيق التحسينات
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Search Images Tab */}
          {activeTab === 'images' && (
            <div className="space-y-4">
              {/* Image Target Selector */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border-2 border-blue-300 shadow-sm">
                <label className="block text-base font-bold text-blue-900 mb-3 flex items-center gap-2">
                  <span className="text-2xl">🎯</span>
                  <span>أين تريد إضافة الصورة؟</span>
                </label>
                <select
                  value={imageTarget}
                  onChange={(e) => {
                    setImageTarget(e.target.value)
                    setApplyToBoth(false) // Disable "both" when changing target
                  }}
                  disabled={applyToBoth}
                  className="w-full p-3 border-2 border-blue-400 rounded-lg focus:border-purple-500 outline-none bg-white font-semibold text-gray-800 cursor-pointer hover:border-purple-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="question">🖼️ صورة السؤال</option>
                  <option value="answer">✅ صورة الجواب</option>
                </select>

                {/* Checkbox for both */}
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToBoth}
                    onChange={(e) => setApplyToBoth(e.target.checked)}
                    className="w-5 h-5 text-blue-600 border-2 border-blue-400 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-blue-900">
                    📌 إضافة الصورة للسؤال والجواب معاً
                  </span>
                </label>

                <p className="text-xs text-gray-600 mt-2">
                  💡 {applyToBoth
                    ? 'سيتم إضافة الصورة لكل من السؤال والجواب'
                    : imageTarget === 'question'
                    ? 'سيتم البحث عن صورة للسؤال'
                    : 'سيتم البحث عن صورة للجواب الصحيح'}
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث عن صور... (أو اترك فارغاً للبحث بناءً على السؤال)"
                  className="flex-1 p-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none text-black placeholder-gray-400"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearchImages()}
                />
                <button
                  onClick={handleSearchImages}
                  disabled={loading}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                >
                  {loading ? '⏳' : '🔍 بحث'}
                </button>
              </div>

              {uploadingImage && (
                <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 rounded">
                  <p className="font-bold">⏳ جاري رفع الصورة إلى CloudFront...</p>
                </div>
              )}

              {images.length > 0 && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {images.map((image, index) => (
                      <div
                        key={index}
                        className={`relative group cursor-pointer rounded-lg overflow-hidden border-4 transition-all ${
                          selectedImage?.url === image.url
                            ? 'border-green-500 shadow-lg'
                            : 'border-transparent hover:border-blue-400'
                        }`}
                        onClick={() => handleSelectImage(image)}
                      >
                        <img
                          src={image.thumbnail}
                          alt={image.title}
                          className="w-full h-40 object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-opacity flex items-center justify-center">
                          <span className="text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            اختر
                          </span>
                        </div>
                        {selectedImage?.url === image.url && uploadingImage && (
                          <div className="absolute inset-0 bg-green-500 bg-opacity-80 flex items-center justify-center">
                            <span className="text-white font-bold">⏳ جاري الرفع...</span>
                          </div>
                        )}
                        {selectedImage?.url === image.url && !uploadingImage && (
                          <div className="absolute inset-0 bg-green-500 bg-opacity-80 flex items-center justify-center">
                            <span className="text-white font-bold">✓ تم الرفع</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Load More Button */}
                  <button
                    onClick={() => handleSearchImages(true)}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-3 rounded-lg font-bold hover:from-blue-600 hover:to-purple-600 disabled:from-gray-400 disabled:to-gray-400 transition-all"
                  >
                    {loading ? '⏳ جاري التحميل...' : '📥 تحميل المزيد من الصور'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-4 border-t">
          <button
            onClick={onClose}
            className="w-full bg-gray-300 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-400 transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
