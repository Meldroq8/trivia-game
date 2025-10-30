import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { importAllQuestions, addQuestionsToStorage, importBulkQuestionsToFirebase, importBulkQuestionsToFirebaseForced } from '../utils/importQuestions'
import { FirebaseQuestionsService } from '../utils/firebaseQuestions'
import { debugFirebaseAuth, testFirebaseConnection } from '../utils/firebaseDebug'
import { GameDataLoader } from '../utils/gameDataLoader'
import { deleteField, doc, deleteDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { ImageUploadService } from '../utils/imageUpload'
import { S3UploadServiceSecure as S3UploadService } from '../utils/s3UploadSecure'
import { parseExcelFile, extractZipFile, processBulkQuestions } from '../utils/bulkImport'
import AudioPlayer from '../components/AudioPlayer'
import LazyMediaPlayer from '../components/LazyMediaPlayer'
import SmartImage from '../components/SmartImage'
import BackgroundImage from '../components/BackgroundImage'
import { processCategoryImage, processQuestionImage, isValidImage, createPreviewUrl, cleanupPreviewUrl } from '../utils/imageProcessor'
import { getCategoryImageUrl, getQuestionImageUrl, getThumbnailUrl } from '../utils/mediaUrlConverter'
import MediaUploadManager from '../components/MediaUploadManager'
import loaderService from '../firebase/loaderService'
import AIEnhancementModal from '../components/AIEnhancementModal'
import aiService from '../services/aiServiceSecure'

function Admin() {
  // Load saved tab from localStorage or default to 'categories'
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('adminActiveTab') || 'categories'
  })
  const [pendingCount, setPendingCount] = useState(0)
  const [showAIModal, setShowAIModal] = useState(false)
  const [aiEditingCategory, setAiEditingCategory] = useState(null)
  const navigate = useNavigate()
  const { isAdmin, isModerator, isAdminOrModerator, user, isAuthenticated, loading, userProfile, getAllUsers, updateUserRole, searchUsers } = useAuth()

  // Load pending count for notification badge
  useEffect(() => {
    const loadPendingCount = async () => {
      if (isAdmin) {
        try {
          const count = await loaderService.getPendingCount()
          setPendingCount(count)
        } catch (error) {
          prodError('Error loading pending count:', error)
        }
      }
    }

    loadPendingCount()
    // Refresh count every 30 seconds
    const interval = setInterval(loadPendingCount, 30000)
    return () => clearInterval(interval)
  }, [isAdmin])

  // Function to change tab and save to localStorage
  const changeTab = (newTab) => {
    setActiveTab(newTab)
    localStorage.setItem('adminActiveTab', newTab)
  }

  // Redirect if not admin (but only after loading is complete)
  useEffect(() => {
    // Only redirect if we're completely done loading AND the user is definitely not authorized
    if (!loading && isAuthenticated && !isAdminOrModerator) {
      navigate('/')
    }

    // Redirect if not authenticated at all (after loading completes)
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, isAdminOrModerator, navigate, loading, user, userProfile])

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">جاري التحقق من الصلاحيات...</h1>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    )
  }

  // Show access denied message if not authenticated or not admin/moderator
  if (!isAuthenticated || !isAdminOrModerator) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">غير مصرح لك بالدخول</h1>
          <p className="text-gray-900 mb-6">يجب أن تكون مديراً للوصول إلى هذه الصفحة</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            العودة إلى الصفحة الرئيسية
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">لوحة التحكم</h1>
            <p className="text-gray-900 mt-1">مرحباً، {user?.displayName || user?.email}</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            العودة إلى اللعبة
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg mb-8">
        <div className="flex border-b">
          <button
            onClick={() => changeTab('categories')}
            className={`flex-1 py-4 px-6 font-bold ${
              activeTab === 'categories'
                ? 'bg-blue-600 text-white rounded-tl-2xl'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            إدارة الفئات
          </button>
          <button
            onClick={() => changeTab('questions')}
            className={`flex-1 py-4 px-6 font-bold ${
              activeTab === 'questions'
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            إدارة الأسئلة
          </button>
          {isAdmin && (
            <button
              onClick={() => changeTab('users')}
              className={`flex-1 py-4 px-6 font-bold ${
                activeTab === 'users'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              إدارة المستخدمين
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => changeTab('pending')}
              className={`flex-1 py-4 px-6 font-bold relative ${
                activeTab === 'pending'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              مراجعة الأسئلة
              {pendingCount > 0 && (
                <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => changeTab('invites')}
              className={`flex-1 py-4 px-6 font-bold ${
                activeTab === 'invites'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              إدارة الدعوات
            </button>
          )}
          {isAdminOrModerator && (
            <button
              onClick={() => changeTab('media')}
              className={`flex-1 py-4 px-6 font-bold ${
                activeTab === 'media'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              📁 الوسائط
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => changeTab('settings')}
              className={`flex-1 py-4 px-6 font-bold ${
                activeTab === 'settings'
                  ? 'bg-blue-600 text-white rounded-tr-2xl'
                  : 'text-gray-700 hover:bg-gray-100'
              } rounded-tr-2xl`}
            >
              الإعدادات
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="p-8">
          {activeTab === 'categories' && <CategoriesManager isAdmin={isAdmin} isModerator={isModerator} showAIModal={showAIModal} setShowAIModal={setShowAIModal} setAiEditingCategory={setAiEditingCategory} />}
          {activeTab === 'questions' && <QuestionsManager isAdmin={isAdmin} isModerator={isModerator} user={user} showAIModal={showAIModal} setShowAIModal={setShowAIModal} setAiEditingCategory={setAiEditingCategory} />}
          {activeTab === 'users' && isAdmin && <UsersManager getAllUsers={getAllUsers} updateUserRole={updateUserRole} searchUsers={searchUsers} />}
          {activeTab === 'pending' && isAdmin && <PendingQuestionsManager />}
          {activeTab === 'invites' && isAdmin && <InviteCodesManager user={user} />}
          {activeTab === 'media' && isAdminOrModerator && <MediaUploadManager />}
          {activeTab === 'settings' && isAdmin && <SettingsManager isAdmin={isAdmin} isModerator={isModerator} />}
        </div>
      </div>

      {/* AI Enhancement Modal */}
      {aiEditingCategory && (
        <AIEnhancementModal
          isOpen={showAIModal}
          onClose={() => {
            setShowAIModal(false)
            setAiEditingCategory(null)
          }}
          questionData={aiEditingCategory.questionData}
          categoryName={aiEditingCategory.categoryName}
          onApplyChanges={aiEditingCategory.onApplyChanges}
        />
      )}
    </div>
  )
}

function CategoriesManager({ isAdmin, isModerator, showAIModal, setShowAIModal, setAiEditingCategory }) {
  const [categories, setCategories] = useState([])
  const [questions, setQuestions] = useState({})
  const [uploadingImages, setUploadingImages] = useState({})
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [showCategoryAdd, setShowCategoryAdd] = useState(false)
  const [newCategory, setNewCategory] = useState({
    name: '',
    image: '🧠',
    imageUrl: ''
  })
  const [showCategoryMerge, setShowCategoryMerge] = useState(false)
  const [selectedCategoriesToMerge, setSelectedCategoriesToMerge] = useState([])
  const [mergedCategoryName, setMergedCategoryName] = useState('')
  const [mergedCategoryImage, setMergedCategoryImage] = useState('🔀')
  const [mergedCategoryImageUrl, setMergedCategoryImageUrl] = useState('')

  useEffect(() => {
    // Load directly from Firebase - no localStorage dependency
    loadDataFromFirebase()
  }, [])

  const loadDataFromFirebase = async () => {
    try {
      devLog('🔥 Loading categories manager data from Firebase...')
      const gameData = await GameDataLoader.loadGameData(true) // Force refresh

      if (gameData) {
        setCategories(gameData.categories || [])
        setQuestions(gameData.questions || {})
        devLog('✅ Categories manager data loaded from Firebase')
      }
    } catch (error) {
      prodError('❌ Error loading categories manager data:', error)
      // Only fallback to sample data if Firebase completely fails
      try {
        const module = await import('../data/sampleQuestions.json')
        setCategories(module.default.categories || [])
        setQuestions(module.default.questions || {})
      } catch (sampleError) {
        prodError('❌ Error loading sample data:', sampleError)
      }
    }
  }

  const saveCategories = async (newCategories) => {
    setCategories(newCategories)
    // Save directly to Firebase - no localStorage
    try {
      devLog('🔥 Saving categories to Firebase...')
      // Update each category in Firebase (skip mystery category)
      for (const category of newCategories) {
        // Handle mystery category separately - save to localStorage
        if (category.id === 'mystery') {
          devLog('💾 Saving mystery category to localStorage')
          localStorage.setItem('mystery_category_settings', JSON.stringify({
            name: category.name,
            color: category.color,
            image: category.image,
            imageUrl: category.imageUrl,
            showImageInQuestion: category.showImageInQuestion,
            showImageInAnswer: category.showImageInAnswer,
            enableQrMiniGame: category.enableQrMiniGame || false
          }))
          continue
        }

        try {
          // Try to update existing category
          await FirebaseQuestionsService.updateCategory(category.id, {
            name: category.name,
            color: category.color,
            image: category.image,
            imageUrl: category.imageUrl,
            showImageInQuestion: category.showImageInQuestion,
            showImageInAnswer: category.showImageInAnswer,
            enableQrMiniGame: category.enableQrMiniGame || false // Default to false
          })
        } catch (updateError) {
          // If category doesn't exist in Firebase, create it
          if (updateError.message.includes('No document to update')) {
            devLog(`📝 Category ${category.id} doesn't exist in Firebase, creating it...`)
            await FirebaseQuestionsService.createCategory({
              id: category.id,
              name: category.name,
              color: category.color,
              image: category.image,
              imageUrl: category.imageUrl,
              showImageInQuestion: category.showImageInQuestion,
              showImageInAnswer: category.showImageInAnswer,
              enableQrMiniGame: category.enableQrMiniGame || false
            })
          } else {
            throw updateError
          }
        }
      }
      devLog('✅ Categories saved to Firebase')

      // Clear game data cache to force reload with updated mystery category
      GameDataLoader.clearCache()
    } catch (error) {
      prodError('❌ Error saving categories to Firebase:', error)
    }
  }

  const handleImageChange = (categoryId, newImage) => {
    const updatedCategories = categories.map(cat =>
      cat.id === categoryId ? { ...cat, image: newImage } : cat
    )
    saveCategories(updatedCategories)
  }

  const handleImageUrlChange = (categoryId, newImageUrl) => {
    const updatedCategories = categories.map(cat =>
      cat.id === categoryId ? { ...cat, imageUrl: newImageUrl } : cat
    )
    saveCategories(updatedCategories)
  }

  const handleImageFileUpload = async (categoryId, file) => {
    if (!file) return

    // Validate image file
    if (!isValidImage(file)) {
      alert('نوع الملف غير صحيح. يجب أن يكون الملف صورة (JPG, PNG, WebP) بحجم أقل من 10MB')
      return
    }

    try {
      // Set loading state
      setUploadingImages(prev => ({ ...prev, [categoryId]: true }))

      devLog('Processing category image...')

      // Process the image (resize to 400x300 WebP)
      const { blob, info } = await processCategoryImage(file)

      devLog('Image processed:', info)

      // Convert blob to file for upload
      const processedFile = new File([blob], `category_${categoryId}_${Date.now()}.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      // Upload to CloudFront/S3
      devLog('Uploading processed category image to CloudFront/S3...')
      const downloadURL = await ImageUploadService.uploadCategoryImage(processedFile, categoryId)

      // Update category with new image URL
      handleImageUrlChange(categoryId, downloadURL)

      devLog('Category image uploaded successfully:', downloadURL)
      alert(`تم رفع الصورة بنجاح!\n📏 الأبعاد: ${info.dimensions}\n📦 الحجم الأصلي: ${info.originalSize}\n🗜️ الحجم الجديد: ${info.newSize}\n📉 نسبة الضغط: ${info.compression}`)

    } catch (error) {
      prodError('Error processing/uploading category image:', error)
      alert('فشل في معالجة أو رفع الصورة: ' + error.message)
    } finally {
      // Clear loading state
      setUploadingImages(prev => ({ ...prev, [categoryId]: false }))
    }
  }

  const handleColorChange = (categoryId, newColor) => {
    const updatedCategories = categories.map(cat =>
      cat.id === categoryId ? { ...cat, color: newColor } : cat
    )
    saveCategories(updatedCategories)
  }

  const handleImageDisplayChange = (categoryId, showInQuestion, showInAnswer) => {
    const updatedCategories = categories.map(cat =>
      cat.id === categoryId ? {
        ...cat,
        showImageInQuestion: showInQuestion,
        showImageInAnswer: showInAnswer
      } : cat
    )
    saveCategories(updatedCategories)
  }

  const handleQrMiniGameToggle = (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId)
    const newValue = !category.enableQrMiniGame

    const updatedCategories = categories.map(cat =>
      cat.id === categoryId ? {
        ...cat,
        enableQrMiniGame: newValue
      } : cat
    )
    saveCategories(updatedCategories)

    alert(newValue
      ? 'تم تفعيل وضع اللعبة المصغرة بالكود لهذه الفئة'
      : 'تم إلغاء وضع اللعبة المصغرة بالكود لهذه الفئة'
    )
  }

  const startEditingCategoryName = (categoryId, currentName) => {
    setEditingCategoryId(categoryId)
    setEditingCategoryName(currentName)
  }

  const cancelEditingCategoryName = () => {
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  const saveCategoryName = () => {
    if (!editingCategoryName.trim()) {
      alert('يرجى إدخال اسم الفئة')
      return
    }

    const updatedCategories = categories.map(cat =>
      cat.id === editingCategoryId ? { ...cat, name: editingCategoryName.trim() } : cat
    )
    saveCategories(updatedCategories)
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  const exportCategoryQuestions = (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId)
    const categoryQuestions = questions[categoryId] || []

    if (categoryQuestions.length === 0) {
      alert('لا توجد أسئلة في هذه الفئة للتصدير')
      return
    }

    // Prepare export data - handle different question structures
    const exportData = categoryQuestions.map((q, index) => {
      // Get question text from different possible sources
      const questionText = q.question || q.text || q.questionText || ''

      // Get answer from different possible sources
      const answerText = q.answer || q.correctAnswer || q.correct || ''

      // Get wrong options - handle both array and object formats
      let wrongOptions = []
      if (q.options && Array.isArray(q.options)) {
        wrongOptions = q.options
      } else if (q.wrongOptions && Array.isArray(q.wrongOptions)) {
        wrongOptions = q.wrongOptions
      } else if (q.incorrect && Array.isArray(q.incorrect)) {
        wrongOptions = q.incorrect
      }

      return {
        'الرقم': index + 1,
        'السؤال': questionText,
        'الإجابة الصحيحة': answerText,
        'الإجابة الخاطئة 1': wrongOptions[0] || '',
        'الإجابة الخاطئة 2': wrongOptions[1] || '',
        'الإجابة الخاطئة 3': wrongOptions[2] || '',
        'الصعوبة': q.difficulty || 'متوسط',
        'النقاط': q.points || q.value || 100,
        'نوع السؤال': q.type || 'text'
      }
    })

    // Convert to CSV
    const headers = Object.keys(exportData[0])
    const csvContent = [
      headers.join(','),
      ...exportData.map(row =>
        headers.map(header => {
          const value = row[header]
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        }).join(',')
      )
    ].join('\n')

    // Add BOM for proper UTF-8 encoding in Excel
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `${category.name}_questions_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    alert(`تم تصدير ${categoryQuestions.length} سؤال من فئة "${category.name}" بنجاح!`)
  }

  const deleteCategory = async (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId)
    const questionCount = (questions[categoryId] || []).length

    // Check if this category is used as a source in any merged categories
    const mergedCategoriesUsingThis = categories.filter(cat =>
      cat.isMergedCategory &&
      cat.sourceCategoryIds &&
      cat.sourceCategoryIds.includes(categoryId)
    )

    let confirmMessage = questionCount > 0
      ? `هل أنت متأكد من حذف فئة "${category?.name}" مع جميع أسئلتها (${questionCount} سؤال)؟\n\nلا يمكن التراجع عن هذا الإجراء!`
      : `هل أنت متأكد من حذف فئة "${category?.name}"؟`

    // Add warning if category is used in merged categories
    if (mergedCategoriesUsingThis.length > 0) {
      const mergedNames = mergedCategoriesUsingThis.map(c => c.name).join('، ')
      confirmMessage += `\n\n⚠️ تحذير: هذه الفئة مستخدمة في الفئات المدمجة التالية:\n${mergedNames}\n\nحذف هذه الفئة سيؤثر على الفئات المدمجة!`
    }

    if (window.confirm(confirmMessage)) {
      try {
        devLog(`🗑️ Starting deletion of category: ${categoryId}`)
        devLog(`📊 Category name: ${category?.name}`)
        devLog(`📊 Questions to delete: ${questionCount}`)

        // First, delete all questions with this categoryId
        // This handles both regular categories and "orphaned" categories
        devLog(`🗑️ Deleting all questions with categoryId: ${categoryId}`)
        const categoryQuestions = questions[categoryId] || []
        let deletedQuestionsCount = 0
        const errors = []

        for (const question of categoryQuestions) {
          if (question.id) {
            try {
              await FirebaseQuestionsService.deleteQuestion(question.id)
              deletedQuestionsCount++
              devLog(`  ✅ Deleted question ${deletedQuestionsCount}/${categoryQuestions.length}: ${question.id}`)
            } catch (error) {
              prodError(`  ❌ Failed to delete question ${question.id}:`, error)
              errors.push({ questionId: question.id, error: error.message })
            }
          }
        }

        devLog(`✅ Deleted ${deletedQuestionsCount} out of ${categoryQuestions.length} questions`)
        if (errors.length > 0) {
          prodError(`❌ Failed to delete ${errors.length} questions:`, errors)
        }

        // Now try to delete the category document itself (if it exists)
        // This might fail if the category is "orphaned" (no document in Firebase)
        let categoryDeleted = false
        try {
          devLog(`🗑️ Attempting to delete category document: ${categoryId}`)
          // Check if category document exists in Firebase by looking at our categories list
          const categoryExists = categories.some(c => c.id === categoryId && !c.isMystery)

          if (categoryExists) {
            const categoryRef = doc(db, 'categories', categoryId)
            await deleteDoc(categoryRef)
            categoryDeleted = true
            devLog(`✅ Category document deleted from Firebase`)
          } else {
            devLog(`ℹ️ Category "${categoryId}" is orphaned (no document in Firebase), skipping category deletion`)
          }
        } catch (error) {
          devLog(`⚠️ Could not delete category document:`, error.message)
          // Don't throw - we still successfully deleted the questions
        }

        const result = {
          success: true,
          deletedQuestionsCount,
          categoryId,
          categoryDeleted,
          errors: errors.length
        }

        // Update local state - remove category
        const updatedCategories = categories.filter(cat => cat.id !== categoryId)
        setCategories(updatedCategories)

        // Update local state - remove all questions in this category
        const updatedQuestions = { ...questions }
        delete updatedQuestions[categoryId]
        setQuestions(updatedQuestions)

        // Clear cache and reload data from Firebase to verify deletion
        devLog('🔄 Reloading data from Firebase to verify deletion...')
        GameDataLoader.clearCache()

        // Reload data from Firebase
        const gameData = await GameDataLoader.loadGameData(true) // Force refresh
        if (gameData) {
          setCategories(gameData.categories || [])
          setQuestions(gameData.questions || {})
          devLog('✅ Data reloaded from Firebase')
        }

        alert(`✅ تم حذف فئة "${category?.name}" بنجاح!\n\nتم حذف ${result.deletedQuestionsCount} سؤال من Firebase.`)

      } catch (error) {
        prodError('❌ Error deleting category:', error)
        prodError('Error details:', error.message)
        alert(`حدث خطأ أثناء حذف الفئة: ${error.message}\n\nيرجى المحاولة مرة أخرى.`)
      }
    }
  }

  // Category creation handlers
  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      alert('يرجى إدخال اسم الفئة')
      return
    }

    try {
      // Create category object
      const categoryData = {
        name: newCategory.name,
        image: newCategory.image || '🧠',
        imageUrl: newCategory.imageUrl || '',
        showImageInQuestion: true,
        showImageInAnswer: true
      }

      // Add to Firebase
      await FirebaseQuestionsService.createCategory(categoryData)

      // Clear cache and reload data
      GameDataLoader.clearCache()
      await loadDataFromFirebase()

      // Reset form
      setNewCategory({
        name: '',
        image: '🧠',
        imageUrl: ''
      })

      setShowCategoryAdd(false)
      alert('تم إنشاء الفئة بنجاح!')
    } catch (error) {
      prodError('Error creating category:', error)
      alert('حدث خطأ في إنشاء الفئة')
    }
  }

  // Category merge handlers
  const toggleCategorySelection = (categoryId) => {
    setSelectedCategoriesToMerge(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId)
      } else {
        return [...prev, categoryId]
      }
    })
  }

  const handleMergeCategories = async () => {
    if (!mergedCategoryName.trim()) {
      alert('يرجى إدخال اسم الفئة الجديدة')
      return
    }

    if (selectedCategoriesToMerge.length < 2) {
      alert('يرجى اختيار فئتين على الأقل للدمج')
      return
    }

    try {
      // Create new merged category with dynamic references
      const mergedCategoryData = {
        name: mergedCategoryName,
        image: mergedCategoryImage || '🔀',
        imageUrl: mergedCategoryImageUrl || '',
        showImageInQuestion: true,
        showImageInAnswer: true,
        isMergedCategory: true,
        sourceCategoryIds: selectedCategoriesToMerge // Save references instead of copying
      }

      devLog('🔀 Creating merged category with references:', mergedCategoryData)

      // Add to Firebase with references
      const newCategoryId = await FirebaseQuestionsService.createCategory(mergedCategoryData)

      // Count total questions from source categories for user feedback
      const totalQuestions = selectedCategoriesToMerge.reduce((total, catId) =>
        total + (questions[catId] || []).length, 0
      )

      devLog(`✅ Merged category created with ${selectedCategoriesToMerge.length} source categories (${totalQuestions} total questions)`)

      // Clear cache and reload data
      GameDataLoader.clearCache()
      await loadDataFromFirebase()

      // Reset form
      setMergedCategoryName('')
      setMergedCategoryImage('🔀')
      setMergedCategoryImageUrl('')
      setSelectedCategoriesToMerge([])
      setShowCategoryMerge(false)

      alert(`تم دمج الفئات بنجاح!\nالفئة الجديدة "${mergedCategoryName}" تحتوي على ${totalQuestions} سؤال من ${selectedCategoriesToMerge.length} فئة\n\n✨ أي تغييرات في الفئات الأصلية ستظهر تلقائياً في هذه الفئة!`)
    } catch (error) {
      prodError('Error merging categories:', error)
      alert('حدث خطأ في دمج الفئات: ' + error.message)
    }
  }

  const handleCategoryImageUpload = async (file) => {
    if (!file) return

    // Validate image file
    if (!isValidImage(file)) {
      alert('نوع الملف غير صحيح. يجب أن يكون الملف صورة (JPG, PNG, WebP) بحجم أقل من 10MB')
      return
    }

    try {
      // Show processing message
      const processingMsg = 'جاري معالجة الصورة...'
      devLog(processingMsg)

      // Process the image (resize to 400x300 WebP)
      const { blob, info } = await processCategoryImage(file)

      devLog('Image processed:', info)

      // Convert blob to file for upload
      const processedFile = new File([blob], `category_${Date.now()}.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      // Upload the processed image
      const downloadURL = await ImageUploadService.uploadCategoryImage(processedFile, `category_${Date.now()}`)

      // Update the category with new image URL
      setNewCategory(prev => ({ ...prev, imageUrl: downloadURL }))

      // Success message with compression info
      alert(`تم رفع الصورة بنجاح!\n📏 الأبعاد: ${info.dimensions}\n📦 الحجم الأصلي: ${info.originalSize}\n🗜️ الحجم الجديد: ${info.newSize}\n📉 نسبة الضغط: ${info.compression}`)

    } catch (error) {
      prodError('Error processing/uploading category image:', error)
      alert('فشل في معالجة أو رفع الصورة: ' + error.message)
    }
  }

  const colorOptions = [
    'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500',
    'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500',
    'bg-teal-500', 'bg-gray-500'
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">إدارة الفئات</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((category) => (
          <div key={category.id} className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-center mb-4">
              {category.imageUrl ? (
                <div className="w-16 h-16 mx-auto mb-2 rounded-lg overflow-hidden">
                  <SmartImage
                    src={category.imageUrl}
                    alt={category.name}
                    size="thumb"
                    context="thumbnail"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="text-4xl mb-2">{category.image}</div>
              )}

              {/* Category Name - Editable */}
              {editingCategoryId === category.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    className="w-full p-2 border-2 border-blue-500 rounded-lg text-center font-bold text-lg text-black"
                    placeholder="اسم الفئة"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={saveCategoryName}
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-1 rounded-lg text-sm font-bold transition-colors"
                    >
                      ✓ حفظ
                    </button>
                    <button
                      onClick={cancelEditingCategoryName}
                      className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-1 rounded-lg text-sm font-bold transition-colors"
                    >
                      ✕ إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <h3 className="font-bold text-lg text-black">{category.name}</h3>
                  <button
                    onClick={() => startEditingCategoryName(category.id, category.name)}
                    className="text-blue-500 hover:text-blue-700 transition-colors"
                    title="تعديل اسم الفئة"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Merged Category Indicator */}
              {category.isMergedCategory && category.sourceCategoryIds && (
                <div className="mt-2 mb-2 p-2 bg-blue-50 rounded-lg border border-blue-300">
                  <div className="text-xs font-bold text-blue-900 mb-1 flex items-center gap-1">
                    <span>🔀</span>
                    <span>فئة مدمجة</span>
                  </div>
                  <div className="text-xs text-blue-700">
                    مصادر: {category.sourceCategoryIds.map(sourceId => {
                      const sourceCategory = categories.find(c => c.id === sourceId)
                      return sourceCategory?.name || sourceId
                    }).join(' + ')}
                  </div>
                  <div className="text-xs text-blue-600 mt-1 font-semibold">
                    ✨ يتم تحديث الأسئلة تلقائياً من المصادر
                  </div>
                </div>
              )}

              <p className="text-sm text-gray-900 font-bold">
                {(questions[category.id] || []).length} سؤال
              </p>
            </div>

            {/* Image URL Input */}
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2 text-black">رابط الصورة (URL)</label>
              <input
                type="url"
                value={category.imageUrl || ''}
                onChange={(e) => handleImageUrlChange(category.id, e.target.value)}
                className="w-full p-2 border rounded-lg text-sm mb-2"
                placeholder="https://example.com/image.jpg"
              />

              {/* File Upload to CloudFront/S3 */}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    handleImageFileUpload(category.id, file);
                  }
                }}
                className="w-full p-2 border rounded-lg text-sm"
                disabled={uploadingImages[category.id]}
              />
              {uploadingImages[category.id] && (
                <div className="mt-2 text-center">
                  <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-gray-900 bg-blue-100">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    جاري رفع الصورة...
                  </div>
                </div>
              )}
              <div className="text-xs text-gray-900 mt-1">
                ☁️ <strong>CloudFront/S3:</strong> اختر ملف من جهازك ليتم رفعه تلقائياً إلى السحابة<br/>
                🌐 أو أدخل رابط صورة من الإنترنت (JPG, PNG, WebP) - حد أقصى 5MB
              </div>
            </div>

            {/* Fallback Emoji Editor */}
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2 text-black">إيموجي احتياطي (في حالة عدم تحميل الصورة)</label>
              <input
                type="text"
                value={category.image}
                onChange={(e) => handleImageChange(category.id, e.target.value)}
                className="w-full p-2 border rounded-lg text-center text-2xl"
                placeholder="اختر إيموجي"
              />
              <div className="text-xs text-gray-900 mt-1">
                يظهر عند عدم توفر رابط صورة أو عند فشل تحميلها
              </div>
            </div>

            {/* Color Selector */}
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2">اللون</label>
              <div className="grid grid-cols-5 gap-2">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorChange(category.id, color)}
                    className={`w-8 h-8 rounded-full ${color} ${
                      category.color === color ? 'ring-4 ring-gray-400' : ''
                    }`}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {/* Image Display Settings */}
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2">إعدادات عرض الصورة</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={category.showImageInQuestion !== false}
                    onChange={(e) => handleImageDisplayChange(
                      category.id,
                      e.target.checked,
                      category.showImageInAnswer !== false
                    )}
                    className="mr-2"
                  />
                  <span className="text-sm">إظهار الصورة مع السؤال</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={category.showImageInAnswer !== false}
                    onChange={(e) => handleImageDisplayChange(
                      category.id,
                      category.showImageInQuestion !== false,
                      e.target.checked
                    )}
                    className="mr-2"
                  />
                  <span className="text-sm">إظهار الصورة مع الإجابة</span>
                </label>
              </div>
              <div className="text-xs text-gray-900 mt-1">
                يمكنك التحكم في متى تظهر صور الأسئلة في هذه الفئة
              </div>
            </div>

            {/* QR Mini-Game Toggle */}
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <label className="flex items-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={category.enableQrMiniGame === true}
                  onChange={() => handleQrMiniGameToggle(category.id)}
                  className="mr-3 mt-1 w-5 h-5 text-blue-600 rounded cursor-pointer"
                />
                <div className="flex-1">
                  <div className="font-bold text-blue-900 flex items-center gap-2">
                    <span>🎮</span>
                    <span>تفعيل اللعبة المصغرة بالكود</span>
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    عند التفعيل، سيظهر كود QR بدلاً من الإجابة المباشرة. شخص واحد يمسح الكود ويرى الإجابة، ثم يشرحها للفريق بطريقة إبداعية (تمثيل، رسم، شرح)
                  </div>
                </div>
              </label>
            </div>

            {/* Preview */}
            <div className="text-center mb-4">
              <BackgroundImage
                src={category.imageUrl}
                size="medium"
                context="category"
                categoryId={category.id}
                className={`${category.color} text-white rounded-xl p-4 inline-block relative overflow-hidden`}
              >
                {category.imageUrl && (
                  <div className="absolute inset-0 bg-black/30 rounded-xl"></div>
                )}
                <div className="relative z-10">
                  {!category.imageUrl && <div className="text-2xl mb-1">{category.image}</div>}
                  <div className="font-bold text-black">{category.name}</div>
                </div>
              </BackgroundImage>
            </div>

            {/* Action Buttons */}
            <div className="text-center space-y-2">
              {(questions[category.id] || []).length > 0 && (
                <div className="mb-2 text-xs text-orange-600 font-bold">
                  ⚠️ تحتوي على {(questions[category.id] || []).length} سؤال
                </div>
              )}
              {(questions[category.id] || []).length > 0 && (
                <button
                  onClick={() => exportCategoryQuestions(category.id)}
                  className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors w-full"
                >
                  📥 تصدير الأسئلة
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => deleteCategory(category.id)}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors w-full"
                >
                  🗑️ حذف الفئة
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Category Creation Section - Only for Moderators and Admins */}
      {(isAdmin || isModerator) && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">إنشاء فئة جديدة</h3>
            <button
              onClick={() => setShowCategoryAdd(!showCategoryAdd)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold"
            >
              {showCategoryAdd ? '❌ إلغاء' : '➕ إنشاء فئة جديدة'}
            </button>
          </div>

          {showCategoryAdd && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Category Name */}
                <div>
                  <label className="block text-sm font-bold mb-2 text-black">اسم الفئة *</label>
                  <input
                    type="text"
                    value={newCategory.name}
                    onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="مثال: التاريخ, العلوم, الرياضة..."
                    className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* Category Emoji */}
                <div>
                  <label className="block text-sm font-bold mb-2 text-black">إيموجي الفئة</label>
                  <input
                    type="text"
                    value={newCategory.image}
                    onChange={(e) => setNewCategory(prev => ({ ...prev, image: e.target.value }))}
                    placeholder="🧠"
                    className="w-full p-3 border rounded-lg text-center text-2xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* Category Image URL */}
                <div>
                  <label className="block text-sm font-bold mb-2 text-black">رابط الصورة (اختياري)</label>
                  <input
                    type="url"
                    value={newCategory.imageUrl}
                    onChange={(e) => setNewCategory(prev => ({ ...prev, imageUrl: e.target.value }))}
                    placeholder="https://example.com/image.jpg"
                    className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-bold mb-2 text-black">أو ارفع صورة من جهازك</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0]
                      if (file) {
                        handleCategoryImageUpload(file)
                      }
                    }}
                    className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <div className="text-xs text-gray-900 mt-1">
                    سيتم رفع الصورة إلى CloudFront/S3 تلقائياً
                  </div>
                </div>
              </div>

              {/* Preview */}
              {(newCategory.name || newCategory.image || newCategory.imageUrl) && (
                <div className="mt-6">
                  <label className="block text-sm font-bold mb-2 text-black">معاينة الفئة</label>
                  <div className="text-center">
                    <BackgroundImage
                      src={newCategory.imageUrl}
                      size="medium"
                      context="category"
                      categoryId={newCategory.id}
                      className="bg-gray-500 text-white rounded-xl p-4 inline-block relative overflow-hidden"
                    >
                      {newCategory.imageUrl && (
                        <div className="absolute inset-0 bg-black/30 rounded-xl"></div>
                      )}
                      <div className="relative z-10">
                        {!newCategory.imageUrl && <div className="text-2xl mb-1">{newCategory.image || '🧠'}</div>}
                        <div className="font-bold text-black">{newCategory.name || 'اسم الفئة'}</div>
                      </div>
                    </BackgroundImage>
                  </div>
                </div>
              )}

              {/* Create Button */}
              <div className="mt-6 text-center">
                <button
                  onClick={handleCreateCategory}
                  disabled={!newCategory.name.trim()}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
                >
                  ✨ إنشاء الفئة
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Merge Categories Section */}
      {(isAdmin || isModerator) && (
        <div className="mb-8 bg-blue-50 rounded-xl p-6 border-2 border-blue-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-blue-900">دمج الفئات</h3>
            <button
              onClick={() => {
                setShowCategoryMerge(!showCategoryMerge)
                if (showCategoryMerge) {
                  // Reset when closing
                  setSelectedCategoriesToMerge([])
                  setMergedCategoryName('')
                  setMergedCategoryImage('🔀')
                  setMergedCategoryImageUrl('')
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold"
            >
              {showCategoryMerge ? '❌ إلغاء' : '🔀 دمج الفئات'}
            </button>
          </div>

          {showCategoryMerge && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              {/* Instructions */}
              <div className="mb-6 p-4 bg-blue-100 rounded-lg border border-blue-300">
                <h4 className="font-bold text-blue-900 mb-2">📝 كيف يعمل الدمج؟</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• اختر فئتين أو أكثر من القائمة أدناه</li>
                  <li>• أدخل اسم الفئة الجديدة المدمجة</li>
                  <li>• سيتم نسخ جميع الأسئلة من الفئات المختارة إلى الفئة الجديدة</li>
                  <li>• الفئات الأصلية ستبقى كما هي ولن يتم حذفها</li>
                </ul>
              </div>

              {/* Category Selection */}
              <div className="mb-6">
                <label className="block text-sm font-bold mb-3 text-black">اختر الفئات للدمج *</label>
                <div className="text-xs text-blue-700 mb-2">
                  💡 يمكنك اختيار فئتين أو أكثر. لا يمكن دمج الفئات المدمجة (لتجنب التداخل).
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-2 border-2 border-blue-200 rounded-lg">
                  {categories.filter(cat => cat.id !== 'mystery' && !cat.isMergedCategory).map((category) => (
                    <label
                      key={category.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                        selectedCategoriesToMerge.includes(category.id)
                          ? 'bg-blue-100 border-2 border-blue-500'
                          : 'bg-gray-50 border-2 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategoriesToMerge.includes(category.id)}
                        onChange={() => toggleCategorySelection(category.id)}
                        className="w-5 h-5 text-blue-600"
                      />
                      <div className="flex items-center gap-2 flex-1">
                        {category.imageUrl ? (
                          <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
                            <SmartImage
                              src={category.imageUrl}
                              alt={category.name}
                              size="thumb"
                              context="thumbnail"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <span className="text-2xl flex-shrink-0">{category.image}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-black truncate">{category.name}</div>
                          <div className="text-xs text-gray-600">
                            {(questions[category.id] || []).length} سؤال
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedCategoriesToMerge.length > 0 && (
                  <div className="mt-2 text-sm text-blue-700 font-bold">
                    ✓ تم اختيار {selectedCategoriesToMerge.length} فئة
                    {selectedCategoriesToMerge.length > 0 && ` - إجمالي ${selectedCategoriesToMerge.reduce((total, catId) => total + (questions[catId] || []).length, 0)} سؤال`}
                  </div>
                )}
              </div>

              {/* New Category Details */}
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                {/* Category Name */}
                <div>
                  <label className="block text-sm font-bold mb-2 text-black">اسم الفئة الجديدة *</label>
                  <input
                    type="text"
                    value={mergedCategoryName}
                    onChange={(e) => setMergedCategoryName(e.target.value)}
                    placeholder="مثال: ثقافة عامة, علوم ورياضة..."
                    className="w-full p-3 border-2 border-blue-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Category Emoji */}
                <div>
                  <label className="block text-sm font-bold mb-2 text-black">إيموجي الفئة الجديدة</label>
                  <input
                    type="text"
                    value={mergedCategoryImage}
                    onChange={(e) => setMergedCategoryImage(e.target.value)}
                    placeholder="🔀"
                    className="w-full p-3 border-2 border-blue-300 rounded-lg text-center text-2xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Category Image URL */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold mb-2 text-black">رابط الصورة (اختياري)</label>
                  <input
                    type="url"
                    value={mergedCategoryImageUrl}
                    onChange={(e) => setMergedCategoryImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full p-3 border-2 border-blue-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Preview */}
              {(mergedCategoryName || mergedCategoryImage || mergedCategoryImageUrl) && selectedCategoriesToMerge.length >= 2 && (
                <div className="mb-6">
                  <label className="block text-sm font-bold mb-2 text-black">معاينة الفئة الجديدة</label>
                  <div className="text-center">
                    <BackgroundImage
                      src={mergedCategoryImageUrl}
                      size="medium"
                      context="category"
                      className="bg-blue-500 text-white rounded-xl p-4 inline-block relative overflow-hidden"
                    >
                      {mergedCategoryImageUrl && (
                        <div className="absolute inset-0 bg-black/30 rounded-xl"></div>
                      )}
                      <div className="relative z-10">
                        {!mergedCategoryImageUrl && <div className="text-2xl mb-1">{mergedCategoryImage || '🔀'}</div>}
                        <div className="font-bold text-black">{mergedCategoryName || 'اسم الفئة'}</div>
                        <div className="text-sm text-white mt-1">
                          {selectedCategoriesToMerge.reduce((total, catId) => total + (questions[catId] || []).length, 0)} سؤال من {selectedCategoriesToMerge.length} فئة
                        </div>
                      </div>
                    </BackgroundImage>
                  </div>
                </div>
              )}

              {/* Merge Button */}
              <div className="text-center">
                <button
                  onClick={handleMergeCategories}
                  disabled={!mergedCategoryName.trim() || selectedCategoriesToMerge.length < 2}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
                >
                  🔀 دمج الفئات
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 p-4 bg-green-50 rounded-xl">
        <h3 className="font-bold text-green-800 mb-2">تم الحفظ تلقائياً</h3>
        <p className="text-green-600 text-sm">
          يتم حفظ جميع التغييرات تلقائياً في متصفحك. ستظهر التغييرات في لعبتك على الفور.
        </p>
      </div>

      {isAdmin && (
        <div className="mt-4 p-4 bg-blue-50 rounded-xl">
          <h3 className="font-bold text-blue-800 mb-2">إعدادات متقدمة</h3>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={async () => {
                if (window.confirm('هل تريد مسح البيانات المؤقتة وتحديث البيانات من Firebase؟')) {
                  GameDataLoader.clearCache()
                  await loadDataFromFirebase()
                  alert('تم مسح البيانات المؤقتة وتحديث البيانات من Firebase!')
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm"
            >
              🗑️ مسح البيانات المؤقتة
            </button>

            <button
              onClick={() => {
                if (window.confirm('هل تريد مسح جميع أنواع البيانات المؤقتة (localStorage, sessionStorage, IndexedDB, service workers)؟\n\nسيتم إعادة تحميل الصفحة بعد المسح.')) {
                  GameDataLoader.clearAllCaches()
                  // Page will reload automatically after 1 second
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-sm"
            >
              💣 مسح شامل لجميع البيانات المؤقتة
            </button>
          </div>
          <p className="text-xs text-gray-900 mt-2">
            استخدم "المسح الشامل" إذا كانت البيانات المؤقتة مستمرة رغم المسح العادي
          </p>
        </div>
      )}
    </div>
  )
}

function QuestionsManager({ isAdmin, isModerator, user, showAIModal, setShowAIModal, setAiEditingCategory }) {
  const [questions, setQuestions] = useState({})
  const [categories, setCategories] = useState([])
  const [bulkQuestions, setBulkQuestions] = useState('')
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [showSingleAdd, setShowSingleAdd] = useState(false)
  const [bulkCategoryName, setBulkCategoryName] = useState('') // Category name for bulk import
  const [bulkImportType, setBulkImportType] = useState('text') // 'text', 'xlsx', or 'zip'
  const [bulkFile, setBulkFile] = useState(null) // XLSX or ZIP file
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, message: '' })
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)
  const [singleQuestion, setSingleQuestion] = useState({
    categoryId: '',
    difficulty: 'easy',
    text: '',
    answer: '',
    choices: ['', '', '', ''],
    explanation: '',
    toleranceHint: { enabled: false, value: '1' },
    imageUrl: null,
    answerImageUrl: null,
    audioUrl: null,         // For question audio (MP3)
    answerAudioUrl: null,   // For answer audio (MP3)
    videoUrl: null,         // For question video (MP4)
    answerVideoUrl: null    // For answer video (MP4)
  })
  const [collapsedCategories, setCollapsedCategories] = useState(new Set())
  const [difficultyDropdowns, setDifficultyDropdowns] = useState({})
  const [difficultyFilter, setDifficultyFilter] = useState({})
  const [uploadingQuestionImages, setUploadingQuestionImages] = useState({})
  const [forceImport, setForceImport] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState(null)
  const [editingData, setEditingData] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [lastEditedCategory, setLastEditedCategory] = useState(null)
  const [uploadingMedia, setUploadingMedia] = useState({})
  const [savedScrollPosition, setSavedScrollPosition] = useState(null)

  const loadData = async () => {
    devLog('🔄 Admin loadData called')
    try {
      // Load from Firebase first, with localStorage as cache
      devLog('📥 Loading data from Firebase...')
      const gameData = await GameDataLoader.loadGameData()

      if (gameData) {
        devLog('✅ Admin: Loaded data from Firebase:', {
          categories: gameData.categories?.length || 0,
          questions: Object.keys(gameData.questions || {}).length
        })

        setCategories(gameData.categories || [])

        // Transform Firebase data format to admin format
        const transformedQuestions = gameData.questions || {}

        // Debug: Check if questions have toleranceHint after loading
        let questionsWithTolerance = 0
        Object.entries(transformedQuestions).forEach(([categoryId, categoryQuestions]) => {
          categoryQuestions.forEach((question, index) => {
            if (!question.id) {
              devWarn(`⚠️ Question at ${categoryId}[${index}] has no Firebase ID:`, question.text)
            }
            if (question.toleranceHint) {
              questionsWithTolerance++
              console.log('📌 Question loaded WITH tolerance:', question.text?.substring(0, 50), question.toleranceHint)
            }
          })
        })
        console.log(`📊 Questions loaded with tolerance: ${questionsWithTolerance}`)

        setQuestions(transformedQuestions)

        devLog('📊 Admin data loaded successfully')
      } else {
        throw new Error('No game data received from Firebase')
      }
    } catch (error) {
      prodError('❌ Admin: Error loading from Firebase:', error)

      // Fallback to localStorage
      devLog('🔄 Admin: Falling back to localStorage...')
      const savedData = localStorage.getItem('triviaData')
      if (savedData) {
        try {
          const data = JSON.parse(savedData)
          devLog('📦 Admin: Using localStorage fallback')

          // Ensure questions object exists
          if (!data.questions) {
            data.questions = {}
            localStorage.setItem('triviaData', JSON.stringify(data))
          }

          setQuestions(data.questions || {})
          setCategories(data.categories || [])
        } catch (parseError) {
          prodError('❌ Error parsing localStorage:', parseError)
          await loadSampleDataFallback()
        }
      } else {
        await loadSampleDataFallback()
      }
    }
  }

  const loadSampleDataFallback = async () => {
    devLog('📄 Admin: Loading sample data as final fallback')
    try {
      const module = await import('../data/sampleQuestions.json')
      const sampleData = module.default
      setQuestions(sampleData.questions || {})
      setCategories(sampleData.categories || [])

      // Save sample data to localStorage for future use
      localStorage.setItem('triviaData', JSON.stringify({
        categories: sampleData.categories,
        questions: sampleData.questions
      }))
      devLog('💾 Sample data saved to localStorage')
    } catch (error) {
      prodError('❌ Error loading sample data:', error)
      setQuestions({})
      setCategories([])
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Helper function to get category name from ID
  const getCategoryName = (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId)
    return category ? category.name : 'فئة غير معروفة'
  }


  // Collapse all categories when categories are loaded (but not during editing, saving, or after editing)
  useEffect(() => {
    // Never auto-collapse if any of these conditions are true
    if (editingQuestion || lastEditedCategory || savingEdit) {
      return
    }

    if (categories.length > 0) {
      const allCategoryIds = new Set(categories.map(cat => cat.id))
      setCollapsedCategories(allCategoryIds)
    }
  }, [categories.length, editingQuestion, lastEditedCategory, savingEdit])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.difficulty-dropdown')) {
        setDifficultyDropdowns({})
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const saveQuestions = async (newQuestions) => {
    devLog('💾 saveQuestions called with:', newQuestions)
    devLog('🔍 Current questions state before update:', questions)

    setQuestions(newQuestions)
    devLog('✅ setQuestions called')

    // Save directly to Firebase - no localStorage
    try {
      devLog('🔥 Saving questions to Firebase...')
      // Note: Individual question updates will be handled by the question editing functions
      // This is just for updating the local state
      devLog('✅ Questions state updated')
    } catch (error) {
      prodError('❌ Error updating questions state:', error)
    }
  }

  const loadDataForceRefresh = async () => {
    devLog('🔄 Admin loadDataForceRefresh called - bypassing cache')
    try {
      // Force refresh from Firebase by passing forceRefresh = true
      devLog('📥 Loading data from Firebase with force refresh...')
      const gameData = await GameDataLoader.loadGameData(true)

      if (gameData) {
        devLog('✅ Admin: Loaded data from Firebase (force refresh):', {
          categories: gameData.categories?.length || 0,
          questions: Object.keys(gameData.questions || {}).length
        })

        setCategories(gameData.categories || [])
        setQuestions(gameData.questions || {})

        devLog('📊 Admin data loaded successfully (force refresh)')
      } else {
        throw new Error('No game data received from Firebase')
      }
    } catch (error) {
      prodError('❌ Admin: Error loading from Firebase (force refresh):', error)
      alert('حدث خطأ أثناء تحديث البيانات من Firebase')
    }
  }

  const parseBulkQuestions = (text) => {
    if (!text || typeof text !== 'string') {
      prodError('❌ Invalid text provided to parseBulkQuestions:', text)
      return []
    }
    const lines = text.trim().split('\n').filter(line => line && line.trim())
    const parsedQuestions = []

    lines.forEach((line) => {
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

        const questionObj = {
          text: questionText,
          answer: correctAnswer,
          difficulty: difficulty,
          points: points,
          audioUrl: audioUrl || undefined,
          imageUrl: imageUrl || undefined,
          category: questionCategory || undefined
        }

        // Debug logging for audio questions
        if (audioUrl) {
          devLog('🎵 Importing question with audio:', {
            text: questionText,
            audioUrl: audioUrl,
            imageUrl: imageUrl
          })
        }

        // Add multiple choice options if more than just the correct answer
        if (options.length > 1) {
          questionObj.options = options
          questionObj.type = 'multiple_choice'
        } else {
          questionObj.type = 'text'
        }

        if (questionText && correctAnswer) {
          parsedQuestions.push(questionObj)
        }
      }
    })

    return parsedQuestions
  }

  const createNewCategory = (categoryName) => {
    // Generate a unique ID for the new category
    const categoryId = categoryName.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w\u0600-\u06FF]/g, '')
      .substring(0, 20)

    // Create new category object
    const newCategory = {
      id: categoryId,
      name: categoryName,
      color: 'bg-gray-500',
      image: '📝',
      imageUrl: ''
    }

    return newCategory
  }

  const saveCategories = async (newCategories) => {
    setCategories(newCategories)
    // Save directly to Firebase - no localStorage
    try {
      devLog('🔥 Saving categories to Firebase...')
      // Update each category in Firebase (skip mystery category)
      for (const category of newCategories) {
        // Handle mystery category separately - save to localStorage
        if (category.id === 'mystery') {
          devLog('💾 Saving mystery category to localStorage')
          localStorage.setItem('mystery_category_settings', JSON.stringify({
            name: category.name,
            color: category.color,
            image: category.image,
            imageUrl: category.imageUrl,
            showImageInQuestion: category.showImageInQuestion,
            showImageInAnswer: category.showImageInAnswer,
            enableQrMiniGame: category.enableQrMiniGame || false
          }))
          continue
        }

        try {
          // Try to update existing category
          await FirebaseQuestionsService.updateCategory(category.id, {
            name: category.name,
            color: category.color,
            image: category.image,
            imageUrl: category.imageUrl,
            showImageInQuestion: category.showImageInQuestion,
            showImageInAnswer: category.showImageInAnswer,
            enableQrMiniGame: category.enableQrMiniGame || false // Default to false
          })
        } catch (updateError) {
          // If category doesn't exist in Firebase, create it
          if (updateError.message.includes('No document to update')) {
            devLog(`📝 Category ${category.id} doesn't exist in Firebase, creating it...`)
            await FirebaseQuestionsService.createCategory({
              id: category.id,
              name: category.name,
              color: category.color,
              image: category.image,
              imageUrl: category.imageUrl,
              showImageInQuestion: category.showImageInQuestion,
              showImageInAnswer: category.showImageInAnswer,
              enableQrMiniGame: category.enableQrMiniGame || false
            })
          } else {
            throw updateError
          }
        }
      }
      devLog('✅ Categories saved to Firebase')

      // Clear game data cache to force reload with updated mystery category
      GameDataLoader.clearCache()
    } catch (error) {
      prodError('❌ Error saving categories to Firebase:', error)
    }
  }

  const handleBulkAdd = async () => {
    if (!bulkQuestions || !bulkQuestions.trim()) {
      alert('يرجى إدخال الأسئلة')
      return
    }

    try {
      devLog('🔥 Starting Firebase-only bulk add process...')
      devLog('Bulk questions input length:', bulkQuestions.length)

      // Clear cache before import to ensure fresh data for duplicate detection
      GameDataLoader.clearCache()
      devLog('🗑️ Cleared cache before import for fresh duplicate detection')

      // Small delay to ensure Firebase consistency after recent deletions
      await new Promise(resolve => setTimeout(resolve, 500))

      // Import directly to Firebase - use force import if checkbox is checked
      const firebaseResult = forceImport
        ? await importBulkQuestionsToFirebaseForced(bulkQuestions)
        : await importBulkQuestionsToFirebase(bulkQuestions)
      devLog('Firebase import result:', firebaseResult)

      if (!firebaseResult || !firebaseResult.firebaseResults) {
        throw new Error('فشل في الاستيراد إلى Firebase')
      }

      // Clear input after successful import
      setBulkQuestions('')

      // Show success message with Firebase results only
      const fbResults = firebaseResult.firebaseResults
      let message = `✅ نجح الاستيراد إلى Firebase!

📊 تم إضافة: ${fbResults.questions.added} سؤال جديد
📁 تم إنشاء: ${fbResults.categories.created} فئة جديدة
🔄 تم تخطي: ${fbResults.questions.duplicatesSkipped} سؤال مكرر
⚡ أسئلة مشابهة: ${fbResults.questions.similarQuestionsAdded} سؤال بنفس النص ولكن إجابة مختلفة

🔥 جميع البيانات محفوظة في Firebase وستظهر في اللعبة فوراً!`

      if (fbResults.categories.created > 0) {
        message += `\n\n🆕 الفئات الجديدة: ${fbResults.categories.createdCategories.map(c => c.name).join(', ')}`
      }

      if (fbResults.questions.errors.length > 0) {
        message += `\n\n⚠️ تحذير: ${fbResults.questions.errors.length} خطأ في الاستيراد (راجع وحدة التحكم للتفاصيل)`
        prodError('Import errors:', fbResults.questions.errors)
      }

      alert(message)

      // Refresh data from Firebase to show new questions immediately
      devLog('🔄 Refreshing data from Firebase...')
      await loadDataForceRefresh()

    } catch (error) {
      prodError('❌ Firebase bulk add error:', error)
      alert('فشل في إضافة الأسئلة إلى Firebase: ' + error.message)
    }
  }

  // Handle XLSX/ZIP bulk import
  const handleFileBulkImport = async () => {
    if (!bulkCategoryName || !bulkCategoryName.trim()) {
      alert('يرجى إدخال اسم الفئة')
      return
    }

    if (!bulkFile) {
      alert('يرجى اختيار ملف XLSX أو ZIP')
      return
    }

    try {
      setIsProcessingBulk(true)
      setBulkProgress({ current: 0, total: 0, message: 'جاري التحضير...' })

      let excelData = []
      let mediaFiles = {}

      // Handle ZIP file (contains both XLSX and media)
      if (bulkImportType === 'zip') {
        devLog('📦 Extracting ZIP file...')
        const extracted = await extractZipFile(bulkFile, (progress, total, message) => {
          setBulkProgress({ current: progress, total, message })
        })

        if (!extracted.xlsx) {
          throw new Error('لم يتم العثور على ملف Excel في ملف ZIP')
        }

        excelData = await parseExcelFile(extracted.xlsx)
        mediaFiles = extracted.media
        devLog(`✅ Extracted ${Object.keys(mediaFiles).length} media files from ZIP`)
      }
      // Handle XLSX file only
      else if (bulkImportType === 'xlsx') {
        devLog('📄 Parsing XLSX file...')
        excelData = await parseExcelFile(bulkFile)
      }

      if (excelData.length === 0) {
        throw new Error('لم يتم العثور على أسئلة في الملف')
      }

      devLog(`📊 Processing ${excelData.length} questions...`)

      // Process questions with media upload
      const processedQuestions = await processBulkQuestions(
        excelData,
        mediaFiles,
        (current, total, message) => {
          setBulkProgress({ current, total, message })
        }
      )

      // Check if category exists or create it
      let targetCategoryId = categories.find(c => c.name === bulkCategoryName)?.id

      if (!targetCategoryId) {
        devLog(`🆕 Creating new category: ${bulkCategoryName}`)
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16)

        // createCategory returns just the ID string, not an object
        const newCategoryId = await FirebaseQuestionsService.createCategory({
          name: bulkCategoryName,
          color: randomColor,
          icon: '❓'
        })
        targetCategoryId = newCategoryId
        devLog(`✅ Created category with ID: ${targetCategoryId}`)

        if (!targetCategoryId) {
          throw new Error('Failed to create category - no ID returned')
        }

        // Add category to local state immediately so it doesn't get filtered out
        setCategories(prev => [...prev, {
          id: newCategoryId,
          name: bulkCategoryName,
          color: randomColor,
          icon: '❓'
        }])
      }

      // Double-check we have a valid category ID before proceeding
      if (!targetCategoryId) {
        throw new Error(`Category "${bulkCategoryName}" not found and could not be created`)
      }
      devLog(`📂 Target category ID: ${targetCategoryId}`)

      // Add questions to Firebase
      let addedCount = 0
      let skippedCount = 0
      const errors = []

      for (let i = 0; i < processedQuestions.length; i++) {
        const question = processedQuestions[i]
        setBulkProgress({
          current: i + 1,
          total: processedQuestions.length,
          message: `جاري حفظ السؤال ${i + 1} من ${processedQuestions.length} في قاعدة البيانات...`
        })

        try {
          devLog(`➕ Adding question ${i + 1} to category ${targetCategoryId}:`, {
            text: question.text?.substring(0, 50) + '...',
            categoryId: targetCategoryId,
            categoryName: bulkCategoryName
          })
          // Use addSingleQuestion which properly associates the question with the category
          const addedQuestionId = await FirebaseQuestionsService.addSingleQuestion(targetCategoryId, question)
          devLog(`✅ Question ${i + 1} added with ID:`, addedQuestionId)
          addedCount++
        } catch (error) {
          prodError(`Error adding question ${i + 1}:`, error)
          errors.push({ questionNumber: i + 1, text: question.text, error: error.message })
          skippedCount++

          // Delete uploaded media files for this failed question
          devLog(`🗑️ Cleaning up media files for failed question ${i + 1}...`)
          const mediaUrls = [
            question.imageUrl,
            question.audioUrl,
            question.videoUrl,
            question.answerImageUrl,
            question.answerAudioUrl,
            question.answerVideoUrl
          ].filter(Boolean) // Remove null/undefined values

          for (const url of mediaUrls) {
            try {
              await S3UploadService.deleteFile(url)
              devLog(`✅ Deleted: ${url}`)
            } catch (deleteError) {
              prodError(`Failed to delete ${url}:`, deleteError)
            }
          }
        }
      }

      // Log errors if any
      if (errors.length > 0) {
        prodError('Failed questions:', errors)
      }

      // Reset state
      setBulkFile(null)
      setBulkCategoryName('')
      setIsProcessingBulk(false)
      setBulkProgress({ current: 0, total: 0, message: '' })

      devLog(`📊 Import complete: ${addedCount} added, ${skippedCount} skipped`)
      devLog(`🔄 Refreshing data to show newly added questions in category: ${bulkCategoryName}`)

      alert(`✅ نجح الاستيراد!\n\n📊 تم إضافة: ${addedCount} سؤال\n⚠️ تم تخطي: ${skippedCount} سؤال\n📁 الفئة: ${bulkCategoryName}`)

      // Clear ALL caches to ensure fresh data everywhere
      devLog('🗑️ Clearing all caches to force fresh data load...')
      GameDataLoader.clearCache()

      // Refresh data
      await loadDataForceRefresh()

      devLog(`✅ Data refreshed. Checking questions in category ${targetCategoryId}...`)
      devLog(`Questions in ${bulkCategoryName}:`, questions[targetCategoryId]?.length || 0)

    } catch (error) {
      prodError('❌ File bulk import error:', error)
      const errorMessage = error?.message || error?.toString() || 'خطأ غير معروف'
      alert('فشل في استيراد الملف: ' + errorMessage)
    } finally {
      setIsProcessingBulk(false)
      setBulkProgress({ current: 0, total: 0, message: '' })
    }
  }

  const deleteQuestion = async (categoryId, questionIndex) => {
    if (window.confirm('هل أنت متأكد من حذف هذا السؤال؟')) {
      try {
        // Ensure the category stays expanded during deletion
        setCollapsedCategories(prev => {
          const newSet = new Set(prev)
          newSet.delete(categoryId)
          return newSet
        })

        // Get the question to delete (it should have a Firebase ID)
        const questionToDelete = questions[categoryId][questionIndex]

        if (questionToDelete?.id) {
          devLog(`🗑️ Deleting question from Firebase: ${questionToDelete.id}`)
          // Delete from Firebase first
          await FirebaseQuestionsService.deleteQuestion(questionToDelete.id)
          devLog(`✅ Question deleted from Firebase successfully`)
        } else {
          devWarn('⚠️ Question has no Firebase ID, skipping Firebase deletion')
        }

        // Update local state immediately without page refresh
        const updatedQuestions = { ...questions }
        updatedQuestions[categoryId].splice(questionIndex, 1)
        setQuestions(updatedQuestions)

        devLog(`✅ Question deleted successfully from ${categoryId} at index ${questionIndex}`)

      } catch (error) {
        prodError('❌ Error deleting question:', error)
        alert('حدث خطأ أثناء حذف السؤال. يرجى المحاولة مرة أخرى.')
      }
    }
  }

  // Inline editing functions
  const startEditing = (categoryId, questionIndex) => {
    // Save current scroll position
    setSavedScrollPosition(window.scrollY)

    const question = questions[categoryId][questionIndex]
    setEditingQuestion(`${categoryId}-${questionIndex}`)
    setEditingData({
      text: question.text,
      answer: question.answer,
      difficulty: question.difficulty,
      points: question.points,
      toleranceHint: question.toleranceHint || { enabled: false, value: '1' },
      audioUrl: question.audioUrl || '',
      imageUrl: question.imageUrl || '',
      videoUrl: question.videoUrl || '',
      answerAudioUrl: question.answerAudioUrl || '',
      answerImageUrl: question.answerImageUrl || '',
      answerVideoUrl: question.answerVideoUrl || '',
      options: question.options || []
    })

    // Clear the last edited category flag and ensure current category is expanded
    setLastEditedCategory(null)
    setCollapsedCategories(prev => {
      const newSet = new Set(prev)
      newSet.delete(categoryId)
      return newSet
    })
  }

  const handleMediaUpload = async (file, mediaType, fieldName) => {
    if (!file) return

    try {
      setUploadingMedia(prev => ({ ...prev, [fieldName]: true }))

      let fileToUpload = file
      let compressionInfo = null

      // Process images before upload
      if (mediaType === 'image') {
        devLog('Processing image before upload...')
        const { blob, info } = await processQuestionImage(file)

        // Convert blob to File for upload
        const extension = 'webp'
        const fileName = `question_${Date.now()}.${extension}`
        fileToUpload = new File([blob], fileName, {
          type: 'image/webp',
          lastModified: Date.now(),
        })

        compressionInfo = info
        devLog('Image processed:', info)
      }

      // Determine folder based on media type
      let folder = 'questions'
      if (mediaType === 'audio') {
        folder = 'audio'
      } else if (mediaType === 'video') {
        folder = 'video'
      } else if (mediaType === 'image') {
        folder = 'images/questions'
      }

      // Upload media to S3/CloudFront
      const cloudFrontUrl = await ImageUploadService.uploadMedia(fileToUpload, folder)

      // Update editing data with the new URL
      updateEditingData(fieldName, cloudFrontUrl)

      // Show success message with compression info for images
      if (compressionInfo) {
        alert(`تم رفع الصورة بنجاح!\n📏 الأبعاد الأصلية: ${compressionInfo.originalDimensions}\n📐 الأبعاد الجديدة: ${compressionInfo.dimensions}\n📦 الحجم الأصلي: ${compressionInfo.originalSize}\n🗜️ الحجم الجديد: ${compressionInfo.newSize}\n📉 نسبة الضغط: ${compressionInfo.compression}`)
      } else {
        alert(`تم رفع ${mediaType === 'audio' ? 'الصوت' : 'الفيديو'} بنجاح!`)
      }
    } catch (error) {
      prodError('Error uploading media:', error)
      alert('فشل في رفع الملف: ' + error.message)
    } finally {
      setUploadingMedia(prev => ({ ...prev, [fieldName]: false }))
    }
  }

  // Handle media deletion with confirmation
  const handleMediaDelete = async (fieldName, fileUrl, updateFunction) => {
    if (!fileUrl) return

    // Show confirmation dialog
    const confirmed = window.confirm('هل تريد حذف الملف من التخزين السحابي؟\n\n✅ نعم: سيتم حذف الملف نهائياً من S3/CloudFront\n❌ لا: سيتم إزالة الرابط فقط من السؤال')

    try {
      if (confirmed) {
        // Delete from S3
        await S3UploadService.deleteFile(fileUrl)
        alert('✅ تم حذف الملف من التخزين السحابي بنجاح')
      }

      // Always clear the field regardless of choice
      updateFunction(fieldName, '')
    } catch (error) {
      prodError('Error deleting file:', error)
      alert('⚠️ فشل حذف الملف من التخزين: ' + error.message + '\n\nتم إزالة الرابط من السؤال فقط.')
      // Still clear the field even if deletion failed
      updateFunction(fieldName, '')
    }
  }

  const cancelEditing = (categoryId, questionIndex) => {
    // Set the last edited category to prevent auto-collapse
    setLastEditedCategory(categoryId)

    // Ensure the category stays expanded when canceling edit
    if (categoryId) {
      setCollapsedCategories(prev => {
        const newSet = new Set(prev)
        newSet.delete(categoryId)
        return newSet
      })
    }

    setEditingQuestion(null)
    setEditingData({})

    // Restore scroll position when canceling
    if (savedScrollPosition !== null) {
      setTimeout(() => {
        window.scrollTo({
          top: savedScrollPosition,
          behavior: 'auto'
        })
        setSavedScrollPosition(null)
      }, 100)
    }

    // Don't clear lastEditedCategory - keep category expanded after cancel
  }

  const saveEdit = async (categoryId, questionIndex) => {
    if (savingEdit) return

    try {
      setSavingEdit(true)

      // Ensure the category stays expanded during save
      setCollapsedCategories(prev => {
        const newSet = new Set(prev)
        newSet.delete(categoryId)
        return newSet
      })

      const question = questions[categoryId][questionIndex]

      // Create updated question object (remove undefined fields for Firebase)
      const updatedQuestion = {
        ...question,
        text: editingData.text,
        answer: editingData.answer,
        difficulty: editingData.difficulty,
        points: editingData.points
      }

      // Handle optional fields - create Firebase update object
      const firebaseUpdate = {}

      // Handle required fields
      firebaseUpdate.text = editingData.text
      firebaseUpdate.answer = editingData.answer
      firebaseUpdate.difficulty = editingData.difficulty
      firebaseUpdate.points = editingData.points

      // Handle tolerance hint
      console.log('🔍 Checking tolerance hint before save:', editingData.toleranceHint)
      if (editingData.toleranceHint?.enabled) {
        updatedQuestion.toleranceHint = editingData.toleranceHint
        firebaseUpdate.toleranceHint = editingData.toleranceHint
        console.log('✅ Tolerance hint WILL be saved:', editingData.toleranceHint)
      } else {
        delete updatedQuestion.toleranceHint
        firebaseUpdate.toleranceHint = deleteField()
        console.log('❌ Tolerance hint WILL be deleted (not enabled)')
      }
      console.log('📋 Final firebaseUpdate object:', firebaseUpdate)

      // Handle optional fields - use deleteField() for empty values
      if (editingData.audioUrl && editingData.audioUrl.trim()) {
        updatedQuestion.audioUrl = editingData.audioUrl.trim()
        firebaseUpdate.audioUrl = editingData.audioUrl.trim()
      } else {
        delete updatedQuestion.audioUrl
        firebaseUpdate.audioUrl = deleteField()
      }

      if (editingData.imageUrl && editingData.imageUrl.trim()) {
        updatedQuestion.imageUrl = editingData.imageUrl.trim()
        firebaseUpdate.imageUrl = editingData.imageUrl.trim()
      } else {
        delete updatedQuestion.imageUrl
        firebaseUpdate.imageUrl = deleteField()
        devLog('🗑️ Deleted imageUrl from updatedQuestion')
      }

      if (editingData.videoUrl && editingData.videoUrl.trim()) {
        updatedQuestion.videoUrl = editingData.videoUrl.trim()
        firebaseUpdate.videoUrl = editingData.videoUrl.trim()
      } else {
        delete updatedQuestion.videoUrl
        firebaseUpdate.videoUrl = deleteField()
      }

      if (editingData.answerAudioUrl && editingData.answerAudioUrl.trim()) {
        updatedQuestion.answerAudioUrl = editingData.answerAudioUrl.trim()
        firebaseUpdate.answerAudioUrl = editingData.answerAudioUrl.trim()
      } else {
        delete updatedQuestion.answerAudioUrl
        firebaseUpdate.answerAudioUrl = deleteField()
      }

      if (editingData.answerImageUrl && editingData.answerImageUrl.trim()) {
        updatedQuestion.answerImageUrl = editingData.answerImageUrl.trim()
        firebaseUpdate.answerImageUrl = editingData.answerImageUrl.trim()
      } else {
        delete updatedQuestion.answerImageUrl
        firebaseUpdate.answerImageUrl = deleteField()
      }

      if (editingData.answerVideoUrl && editingData.answerVideoUrl.trim()) {
        updatedQuestion.answerVideoUrl = editingData.answerVideoUrl.trim()
        firebaseUpdate.answerVideoUrl = editingData.answerVideoUrl.trim()
      } else {
        delete updatedQuestion.answerVideoUrl
        firebaseUpdate.answerVideoUrl = deleteField()
      }

      if (editingData.options && editingData.options.length > 0) {
        updatedQuestion.options = editingData.options
        firebaseUpdate.options = editingData.options
      } else {
        delete updatedQuestion.options
        firebaseUpdate.options = deleteField()
      }

      // Update in Firebase if question has ID
      if (question.id) {
        devLog(`💾 Updating question in Firebase: ${question.id}`)
        devLog(`🔥 Firebase update object:`, firebaseUpdate)
        await FirebaseQuestionsService.updateQuestion(question.id, firebaseUpdate)
        devLog(`✅ Question updated in Firebase successfully`)
      }

      // Update local state
      devLog('📝 Final updatedQuestion object:', updatedQuestion)
      devLog('🖼️ imageUrl in updatedQuestion:', updatedQuestion.imageUrl)

      const updatedQuestions = { ...questions }
      updatedQuestions[categoryId][questionIndex] = updatedQuestion

      devLog('📋 Updated questions state:', updatedQuestions[categoryId][questionIndex])

      setQuestions(updatedQuestions)
      saveQuestions(updatedQuestions)

      // Force a re-render by updating state again with new reference
      setTimeout(() => {
        setQuestions({ ...updatedQuestions })
      }, 50)

      // Set the last edited category to prevent auto-collapse
      setLastEditedCategory(categoryId)

      // Clear editing state and ensure category stays expanded
      setEditingQuestion(null)
      setEditingData({})

      // AGGRESSIVELY ensure the category stays expanded after save completion
      setCollapsedCategories(prev => {
        const newSet = new Set(prev)
        newSet.delete(categoryId)
        return newSet
      })

      // Keep forcing the category to stay expanded at multiple intervals
      const keepExpanded = () => {
        setCollapsedCategories(prev => {
          const newSet = new Set(prev)
          newSet.delete(categoryId)
          return newSet
        })
      }

      setTimeout(keepExpanded, 100)
      setTimeout(keepExpanded, 300)
      setTimeout(keepExpanded, 500)
      setTimeout(keepExpanded, 1000)
      setTimeout(keepExpanded, 2000)
      setTimeout(keepExpanded, 3000)

      // Restore scroll position after save with longer delay to ensure DOM is updated
      if (savedScrollPosition !== null) {
        setTimeout(() => {
          window.scrollTo({
            top: savedScrollPosition,
            behavior: 'auto'
          })
          setSavedScrollPosition(null)
        }, 200)
      }

      // Don't clear lastEditedCategory - keep category expanded permanently after save

      devLog('✅ Question updated successfully')
    } catch (error) {
      prodError('❌ Error updating question:', error)
      alert('حدث خطأ أثناء حفظ التعديلات: ' + error.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const updateEditingData = (field, value) => {
    setEditingData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleAIChanges = (changes) => {
    setEditingData(prev => {
      // If difficulty changed, calculate new points BEFORE merging
      let newPoints = prev.points
      if (changes.difficulty) {
        if (changes.difficulty === 'easy') {
          newPoints = 200
        } else if (changes.difficulty === 'medium') {
          newPoints = 400
        } else if (changes.difficulty === 'hard') {
          newPoints = 600
        }
        devLog(`🎯 AI changed difficulty to ${changes.difficulty}, points will be ${newPoints}`)
      }

      // Merge changes and force the new points
      const updated = {
        ...prev,
        ...changes,
        ...(changes.difficulty ? { points: newPoints } : {})
      }

      devLog('📝 AI Changes applied:', updated)
      return updated
    })
  }

  const changeDifficulty = async (categoryId, questionIndex, newDifficulty) => {
    // Ensure the category stays expanded during the operation
    setCollapsedCategories(prev => {
      const newSet = new Set(prev)
      newSet.delete(categoryId)
      return newSet
    })

    const updatedQuestions = { ...questions }
    const question = updatedQuestions[categoryId][questionIndex]

    // Update difficulty and points based on new difficulty
    const oldDifficulty = question.difficulty
    const oldPoints = question.points

    question.difficulty = newDifficulty
    if (newDifficulty === 'easy') {
      question.points = 200
    } else if (newDifficulty === 'medium') {
      question.points = 400
    } else if (newDifficulty === 'hard') {
      question.points = 600
    }

    try {
      // Update in Firebase if question has ID
      if (question.id) {
        devLog(`💾 Updating question difficulty in Firebase: ${question.id}`)
        await FirebaseQuestionsService.updateQuestion(question.id, {
          difficulty: question.difficulty,
          points: question.points
        })
        devLog(`✅ Question difficulty updated in Firebase successfully`)
      } else {
        devWarn(`⚠️ Question has no Firebase ID, cannot save to Firebase`)
      }

      // Update local state immediately
      setQuestions(updatedQuestions)

      // Clear cache to ensure fresh data on next reload
      GameDataLoader.clearCache()

      devLog(`✅ Difficulty changed from ${oldDifficulty} (${oldPoints} pts) to ${newDifficulty} (${question.points} pts)`)
      devLog(`🔥 Firebase update completed, cache cleared for fresh data on reload`)
    } catch (error) {
      prodError('❌ Error updating question difficulty:', error)
      // Revert local changes if Firebase update failed
      question.difficulty = oldDifficulty
      question.points = oldPoints
      alert('حدث خطأ أثناء تحديث مستوى الصعوبة: ' + error.message)
    }

    // Close the dropdown
    const dropdownKey = `${categoryId}-${questionIndex}`
    setDifficultyDropdowns(prev => ({
      ...prev,
      [dropdownKey]: false
    }))
  }

  const toggleDifficultyDropdown = (categoryId, questionIndex) => {
    const dropdownKey = `${categoryId}-${questionIndex}`
    setDifficultyDropdowns(prev => ({
      ...prev,
      [dropdownKey]: !prev[dropdownKey]
    }))
  }

  const distributeDifficultiesEvenly = async (categoryId) => {
    if (!confirm('هل تريد استخدام الذكاء الاصطناعي لتوزيع صعوبة الأسئلة بشكل واقعي؟\n\nسيقوم الذكاء الاصطناعي بتحليل كل سؤال وتحديد صعوبته الحقيقية ثم توزيعها بالتساوي (ثلث سهل، ثلث متوسط، ثلث صعب)')) {
      return
    }

    const categoryQuestions = questions[categoryId] || []
    const totalQuestions = categoryQuestions.length

    if (totalQuestions === 0) {
      alert('لا توجد أسئلة في هذه الفئة')
      return
    }

    const categoryName = categories.find(c => c.id === categoryId)?.name || 'عام'
    const updatedQuestions = { ...questions }

    try {
      // Step 1: Use AI to analyze each question and get realistic difficulty
      devLog(`🤖 AI analyzing ${totalQuestions} questions...`)
      const analyzedQuestions = []

      for (let i = 0; i < categoryQuestions.length; i++) {
        const question = categoryQuestions[i]

        try {
          const result = await aiService.improveQuestion(
            question.text,
            question.answer,
            categoryName,
            question.difficulty
          )

          analyzedQuestions.push({
            index: i,
            question: question,
            aiDifficulty: result.suggestedDifficulty
          })

          devLog(`✓ ${i + 1}/${totalQuestions}: "${question.text.substring(0, 50)}..." → ${result.suggestedDifficulty}`)
        } catch (error) {
          prodError(`Failed to analyze question ${i}:`, error)
          // Fallback to current difficulty
          analyzedQuestions.push({
            index: i,
            question: question,
            aiDifficulty: question.difficulty
          })
        }
      }

      // Step 2: Group by AI-suggested difficulty
      const easyQuestions = analyzedQuestions.filter(q => q.aiDifficulty === 'easy')
      const mediumQuestions = analyzedQuestions.filter(q => q.aiDifficulty === 'medium')
      const hardQuestions = analyzedQuestions.filter(q => q.aiDifficulty === 'hard')

      // Step 3: Calculate target distribution (equal thirds)
      const perDifficulty = Math.floor(totalQuestions / 3)
      const remainder = totalQuestions % 3
      const targetEasy = perDifficulty + (remainder > 0 ? 1 : 0)
      const targetMedium = perDifficulty + (remainder > 1 ? 1 : 0)
      const targetHard = perDifficulty

      devLog(`🎯 Target: ${targetEasy} easy, ${targetMedium} medium, ${targetHard} hard`)
      devLog(`📊 AI suggested: ${easyQuestions.length} easy, ${mediumQuestions.length} medium, ${hardQuestions.length} hard`)

      // Step 4: Adjust to meet target distribution
      const finalAssignments = []

      // Assign easy questions (take AI easy first, then medium if needed, then hard)
      const easyPool = [...easyQuestions, ...mediumQuestions, ...hardQuestions]
      for (let i = 0; i < targetEasy && i < easyPool.length; i++) {
        finalAssignments.push({ ...easyPool[i], finalDifficulty: 'easy' })
      }

      // Assign medium questions (from remaining pool)
      const mediumPool = easyPool.slice(targetEasy)
      for (let i = 0; i < targetMedium && i < mediumPool.length; i++) {
        finalAssignments.push({ ...mediumPool[i], finalDifficulty: 'medium' })
      }

      // Assign hard questions (from remaining pool)
      const hardPool = mediumPool.slice(targetMedium)
      for (let i = 0; i < hardPool.length; i++) {
        finalAssignments.push({ ...hardPool[i], finalDifficulty: 'hard' })
      }

      // Step 5: Prepare batch updates
      devLog('📦 Preparing batch updates for Firebase...')
      const batchUpdates = []

      for (const assignment of finalAssignments) {
        const points = assignment.finalDifficulty === 'easy' ? 200 :
                      assignment.finalDifficulty === 'medium' ? 400 : 600

        // Update local state
        updatedQuestions[categoryId][assignment.index] = {
          ...assignment.question,
          difficulty: assignment.finalDifficulty,
          points: points
        }

        // Prepare Firebase update
        if (assignment.question.id) {
          batchUpdates.push({
            questionId: assignment.question.id,
            updateData: {
              difficulty: assignment.finalDifficulty,
              points: points
            }
          })
        }
      }

      // Update local state first for immediate UI feedback
      setQuestions(updatedQuestions)

      // Perform batch update to Firebase
      devLog(`🔄 Updating ${batchUpdates.length} questions in Firebase...`)
      const updateResult = await FirebaseQuestionsService.batchUpdateQuestions(
        batchUpdates,
        (currentBatch, totalBatches, questionsInBatch) => {
          devLog(`📊 Progress: Batch ${currentBatch}/${totalBatches} (${questionsInBatch} questions)`)
        }
      )

      // Clear cache after updates
      GameDataLoader.clearCache()

      const finalCounts = {
        easy: finalAssignments.filter(a => a.finalDifficulty === 'easy').length,
        medium: finalAssignments.filter(a => a.finalDifficulty === 'medium').length,
        hard: finalAssignments.filter(a => a.finalDifficulty === 'hard').length
      }

      devLog(`✅ Update complete: ${updateResult.success}/${updateResult.total} successful`)
      if (updateResult.errors.length > 0) {
        devWarn(`⚠️ ${updateResult.errors.length} errors occurred during update`)
      }

      alert(`✅ تم توزيع الصعوبات بنجاح باستخدام الذكاء الاصطناعي:\n${finalCounts.easy} سهل، ${finalCounts.medium} متوسط، ${finalCounts.hard} صعب\n\nتم تحديث ${updateResult.success} من ${updateResult.total} سؤال في قاعدة البيانات`)
    } catch (error) {
      prodError('Error distributing difficulties:', error)
      alert('حدث خطأ أثناء توزيع الصعوبات: ' + error.message)
    }
  }

  const toggleCategoryCollapse = (categoryId) => {
    setCollapsedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId)
      } else {
        newSet.add(categoryId)
      }
      return newSet
    })
  }

  const getDifficultyCounts = (categoryId) => {
    const categoryQuestions = questions[categoryId] || []
    const counts = {
      easy: 0,
      medium: 0,
      hard: 0,
      total: categoryQuestions.length
    }

    categoryQuestions.forEach(question => {
      if (question.difficulty === 'easy') counts.easy++
      else if (question.difficulty === 'medium') counts.medium++
      else if (question.difficulty === 'hard') counts.hard++
    })

    return counts
  }

  const toggleDifficultyFilter = (categoryId, difficulty) => {
    setDifficultyFilter(prev => ({
      ...prev,
      [categoryId]: prev[categoryId] === difficulty ? null : difficulty
    }))
  }

  const getFilteredQuestions = (categoryId) => {
    const categoryQuestions = questions[categoryId] || []
    const activeDifficulty = difficultyFilter[categoryId]

    if (!activeDifficulty) {
      return categoryQuestions
    }

    return categoryQuestions.filter(question => question.difficulty === activeDifficulty)
  }


  const handleQuestionImageUpload = async (categoryId, questionIndex, file) => {
    if (!file) return

    // Validate image file
    if (!isValidImage(file)) {
      alert('نوع الملف غير صحيح. يجب أن يكون الملف صورة (JPG, PNG, WebP) بحجم أقل من 10MB')
      return
    }

    const questionKey = `${categoryId}-${questionIndex}`

    try {
      // Set loading state
      setUploadingQuestionImages(prev => ({ ...prev, [questionKey]: true }))

      devLog('Processing question image...')

      // Process the image (resize to 400x300 WebP)
      const { blob, info } = await processCategoryImage(file)

      devLog('Question image processed:', info)

      // Convert blob to file for upload
      const processedFile = new File([blob], `question_${categoryId}_${questionIndex}_${Date.now()}.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      // Upload to CloudFront/S3
      devLog('Uploading processed question image to CloudFront/S3...')
      const downloadURL = await ImageUploadService.uploadQuestionImage(processedFile, `${categoryId}_${questionIndex}`)

      // Update question with new image URL
      updateQuestionField(categoryId, questionIndex, 'imageUrl', downloadURL)

      devLog('Question image uploaded successfully:', downloadURL)
      alert(`تم رفع صورة السؤال بنجاح!\n📏 الأبعاد: ${info.dimensions}\n📦 الحجم الأصلي: ${info.originalSize}\n🗜️ الحجم الجديد: ${info.newSize}\n📉 نسبة الضغط: ${info.compression}`)

    } catch (error) {
      prodError('Error processing/uploading question image:', error)
      alert('فشل في معالجة أو رفع صورة السؤال: ' + error.message)
    } finally {
      // Clear loading state
      setUploadingQuestionImages(prev => ({ ...prev, [questionKey]: false }))
    }
  }

  const updateQuestionField = (categoryId, questionIndex, field, newValue, optionIndex = null) => {
    devLog('🔧 updateQuestionField called:', {
      categoryId,
      questionIndex,
      field,
      newValue,
      optionIndex
    });

    // Special handling for test category
    if (categoryId === 'test') {
      devLog('🧪 Test category detected - just logging the change');
      devLog('📝 Test field update:', field, '=', newValue);
      return;
    }

    const updatedQuestions = { ...questions }
    const categoryQuestions = updatedQuestions[categoryId] ? [...updatedQuestions[categoryId]] : []

    if (!categoryQuestions || categoryQuestions.length === 0) {
      prodError('❌ No questions found for category:', categoryId);
      devLog('🔍 Available categories:', Object.keys(questions));
      return;
    }

    if (questionIndex >= categoryQuestions.length || questionIndex < 0) {
      prodError('❌ Invalid question index:', questionIndex, 'for category with', categoryQuestions.length, 'questions');
      return;
    }

    const question = { ...categoryQuestions[questionIndex] }

    if (field === 'options' && optionIndex !== null) {
      const newOptions = [...(question.options || [])]
      newOptions[optionIndex] = newValue
      question.options = newOptions
      devLog('📝 Updated option:', newOptions);
    } else {
      question[field] = newValue
      devLog('📝 Updated field:', field, '=', newValue);
    }

    categoryQuestions[questionIndex] = question
    updatedQuestions[categoryId] = categoryQuestions

    devLog('💾 Calling saveQuestions...');
    saveQuestions(updatedQuestions)
    devLog('✅ updateQuestionField completed');
  }

  // Simple display component (no editing)
  const DisplayText = ({ value, className = "" }) => {
    return (
      <span className={className}>
        {value || "No value"}
      </span>
    )
  }

  // Single question add handlers
  const handleSingleQuestionSubmit = async () => {
    if (!singleQuestion.categoryId || !singleQuestion.text || !singleQuestion.answer) {
      alert('يرجى ملء جميع الحقول المطلوبة')
      return
    }

    try {
      // Create the question object
      const newQuestion = {
        text: singleQuestion.text,
        answer: singleQuestion.answer,
        options: singleQuestion.choices.filter(choice => choice.trim() !== ''),
        difficulty: singleQuestion.difficulty,
        explanation: singleQuestion.explanation || '',
        imageUrl: singleQuestion.imageUrl || null,
        answerImageUrl: singleQuestion.answerImageUrl || null,
        audioUrl: singleQuestion.audioUrl || null,
        answerAudioUrl: singleQuestion.answerAudioUrl || null,
        videoUrl: singleQuestion.videoUrl || null,
        answerVideoUrl: singleQuestion.answerVideoUrl || null,
        category: singleQuestion.categoryId,
        submittedBy: user?.uid || null
      }

      // Add tolerance hint if enabled
      if (singleQuestion.toleranceHint?.enabled) {
        newQuestion.toleranceHint = singleQuestion.toleranceHint
        console.log('✅ Tolerance hint added to question:', singleQuestion.toleranceHint)
      } else {
        console.log('⚠️ Tolerance hint NOT enabled. Current state:', singleQuestion.toleranceHint)
      }

      console.log('📋 Full question object being saved:', newQuestion)

      devLog('🚀 Submitting question with media:', {
        hasQuestionImage: !!newQuestion.imageUrl,
        hasAnswerImage: !!newQuestion.answerImageUrl,
        hasQuestionAudio: !!newQuestion.audioUrl,
        hasAnswerAudio: !!newQuestion.answerAudioUrl,
        hasQuestionVideo: !!newQuestion.videoUrl,
        hasAnswerVideo: !!newQuestion.answerVideoUrl,
        answerVideoUrl: newQuestion.answerVideoUrl,
        audioUrl: newQuestion.audioUrl,
        hasTolerance: !!newQuestion.toleranceHint,
        fullQuestion: newQuestion
      })

      if (isAdmin) {
        // Admins can directly add questions
        await FirebaseQuestionsService.addSingleQuestion(singleQuestion.categoryId, newQuestion)

        // Clear cache and force refresh to show new question immediately
        GameDataLoader.clearCache()
        await loadDataForceRefresh()

        // Expand the category where the question was added to show it immediately
        setCollapsedCategories(prev => {
          const newSet = new Set(prev)
          newSet.delete(singleQuestion.categoryId)
          return newSet
        })

        alert('تم إضافة السؤال بنجاح!')
      } else if (isModerator) {
        // Moderators submit for approval
        await FirebaseQuestionsService.submitQuestionForApproval(singleQuestion.categoryId, newQuestion)
        alert('تم إرسال السؤال للمراجعة! سيتم إشعارك عند الموافقة عليه.')
      }

      // Reset form
      setSingleQuestion({
        categoryId: '',
        difficulty: 'easy',
        text: '',
        answer: '',
        choices: ['', '', '', ''],
        explanation: '',
        toleranceHint: { enabled: false, value: '1' },
        imageUrl: null,
        answerImageUrl: null,
        audioUrl: null,
        answerAudioUrl: null,
        videoUrl: null,
        answerVideoUrl: null
      })

      setShowSingleAdd(false)
    } catch (error) {
      prodError('Error adding single question:', error)
      alert('حدث خطأ في إضافة السؤال')
    }
  }

  const handleSingleQuestionImageUpload = async (file) => {
    if (!file) return

    // Validate image file
    if (!isValidImage(file)) {
      alert('نوع الملف غير صحيح. يجب أن يكون الملف صورة (JPG, PNG, WebP) بحجم أقل من 10MB')
      return
    }

    try {
      devLog('Processing single question image...')

      // Process the image (resize to 400x300 WebP)
      const { blob, info } = await processCategoryImage(file)

      devLog('Single question image processed:', info)

      // Convert blob to file for upload
      const processedFile = new File([blob], `single_question_${Date.now()}.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      const downloadURL = await ImageUploadService.uploadQuestionImage(processedFile, `single_${Date.now()}`)
      setSingleQuestion(prev => ({ ...prev, imageUrl: downloadURL }))
      alert(`تم رفع الصورة بنجاح!\n📏 الأبعاد: ${info.dimensions}\n📦 الحجم الأصلي: ${info.originalSize}\n🗜️ الحجم الجديد: ${info.newSize}\n📉 نسبة الضغط: ${info.compression}`)
    } catch (error) {
      prodError('Error processing/uploading image:', error)
      alert('فشل في معالجة أو رفع الصورة: ' + error.message)
    }
  }

  const handleSingleAnswerImageUpload = async (file) => {
    if (!file) return

    // Validate image file
    if (!isValidImage(file)) {
      alert('نوع الملف غير صحيح. يجب أن يكون الملف صورة (JPG, PNG, WebP) بحجم أقل من 10MB')
      return
    }

    try {
      devLog('Processing single answer image...')

      // Process the image (resize to 400x300 WebP)
      const { blob, info } = await processCategoryImage(file)

      devLog('Single answer image processed:', info)

      // Convert blob to file for upload
      const processedFile = new File([blob], `single_answer_${Date.now()}.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      const downloadURL = await ImageUploadService.uploadQuestionImage(processedFile, `single_answer_${Date.now()}`)
      setSingleQuestion(prev => ({ ...prev, answerImageUrl: downloadURL }))
      alert(`تم رفع صورة الجواب بنجاح!\n📏 الأبعاد: ${info.dimensions}\n📦 الحجم الأصلي: ${info.originalSize}\n🗜️ الحجم الجديد: ${info.newSize}\n📉 نسبة الضغط: ${info.compression}`)
    } catch (error) {
      prodError('Error processing/uploading answer image:', error)
      alert('فشل في معالجة أو رفع صورة الجواب: ' + error.message)
    }
  }

  // Media upload handlers
  const handleSingleQuestionAudioUpload = async (file) => {
    if (!file) return

    try {
      devLog('Uploading question audio...')
      const downloadURL = await ImageUploadService.uploadQuestionMedia(file, `question_audio_${Date.now()}`)
      setSingleQuestion(prev => ({ ...prev, audioUrl: downloadURL }))
      alert('تم رفع ملف الصوت بنجاح!')
    } catch (error) {
      prodError('Error uploading question audio:', error)
      alert('حدث خطأ في رفع ملف الصوت: ' + error.message)
    }
  }

  const handleSingleAnswerAudioUpload = async (file) => {
    if (!file) return

    try {
      devLog('Uploading answer audio...')
      const downloadURL = await ImageUploadService.uploadQuestionMedia(file, `answer_audio_${Date.now()}`)
      setSingleQuestion(prev => ({ ...prev, answerAudioUrl: downloadURL }))
      alert('تم رفع ملف صوت الجواب بنجاح!')
    } catch (error) {
      prodError('Error uploading answer audio:', error)
      alert('حدث خطأ في رفع ملف صوت الجواب: ' + error.message)
    }
  }

  const handleSingleQuestionVideoUpload = async (file) => {
    if (!file) return

    try {
      devLog('Uploading question video...')
      const downloadURL = await ImageUploadService.uploadQuestionMedia(file, `question_video_${Date.now()}`)
      setSingleQuestion(prev => ({ ...prev, videoUrl: downloadURL }))
      alert('تم رفع ملف الفيديو بنجاح!')
    } catch (error) {
      prodError('Error uploading question video:', error)
      alert('حدث خطأ في رفع ملف الفيديو: ' + error.message)
    }
  }

  const handleSingleAnswerVideoUpload = async (file) => {
    if (!file) return

    try {
      devLog('🎬 Uploading answer video...', file.name)
      const downloadURL = await ImageUploadService.uploadQuestionMedia(file, `answer_video_${Date.now()}`)
      devLog('✅ Answer video uploaded successfully:', downloadURL)
      setSingleQuestion(prev => {
        const newState = { ...prev, answerVideoUrl: downloadURL }
        devLog('📝 Updated singleQuestion state with answerVideoUrl:', newState.answerVideoUrl)
        return newState
      })
      alert('تم رفع فيديو الجواب بنجاح!')
    } catch (error) {
      prodError('❌ Error uploading answer video:', error)
      alert('حدث خطأ في رفع فيديو الجواب: ' + error.message)
    }
  }


  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">إدارة الأسئلة</h2>
          <p className="text-gray-900 text-sm">
            المجموع: {Object.values(questions).flat().length} سؤال في {categories.length} فئة
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={async () => {
                try {
                  const stats = await FirebaseQuestionsService.getQuestionStats()
                  alert(`📊 إحصائيات Firebase:

الأسئلة: ${stats.totalQuestions}
الفئات: ${stats.totalCategories}

توزيع الصعوبة:
• سهل: ${stats.questionsByDifficulty.easy}
• متوسط: ${stats.questionsByDifficulty.medium}
• صعب: ${stats.questionsByDifficulty.hard}

راجع وحدة التحكم لمزيد من التفاصيل.`)
                  devLog('Firebase Stats:', stats)
                } catch (error) {
                  alert('خطأ في جلب إحصائيات Firebase: ' + error.message)
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              🔥 إحصائيات Firebase
            </button>
          )}
          {isAdmin && (
            <button
              onClick={async () => {
                devLog('=== LOCAL DEBUG INFO ===')
                devLog('Questions state:', questions)
                devLog('Categories state:', categories)
                devLog('localStorage:', localStorage.getItem('triviaData'))

                devLog('\n=== FIREBASE DEBUG INFO ===')
                await debugFirebaseAuth()
                await testFirebaseConnection()

                // Check current user's Firestore document
                if (user?.uid) {
                  try {
                    const userDoc = await getDoc(doc(db, 'users', user.uid))
                    devLog('\n=== USER FIRESTORE DOCUMENT ===')
                    devLog('Document exists:', userDoc.exists())
                    if (userDoc.exists()) {
                      devLog('Document data:', userDoc.data())
                      devLog('isAdmin field:', userDoc.data().isAdmin)
                      devLog('isAdmin type:', typeof userDoc.data().isAdmin)
                    }
                  } catch (error) {
                    prodError('Error fetching user document:', error)
                  }
                }

                alert('تم طباعة تفاصيل التصحيح في وحدة التحكم (console)\nراجع Console للحصول على تفاصيل Firebase')
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              🐛 تصحيح Firebase
            </button>
          )}
          {isAdmin && (
            <button
              onClick={async () => {
                if (window.confirm('هل أنت متأكد من حذف جميع البيانات؟ هذا الإجراء لا يمكن التراجع عنه!\n\n⚠️ هذا سيحذف جميع الأسئلة والفئات من Firebase نهائياً!')) {
                  try {
                    // Clear Firebase data by deleting all categories (which will delete all questions)
                    for (const category of categories) {
                      await FirebaseQuestionsService.deleteCategory(category.id)
                    }
                    GameDataLoader.clearCache()
                    await loadData()
                    alert('تم مسح جميع البيانات من Firebase')
                  } catch (error) {
                    prodError('Error clearing Firebase data:', error)
                    alert('حدث خطأ أثناء مسح البيانات')
                  }
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              🗑️ مسح البيانات
            </button>
          )}
          {isAdmin && (
            <button
              onClick={async () => {
                devLog('🔄 Force refreshing from Firebase...')
                await GameDataLoader.refreshFromFirebase()
                await loadData()
                alert('تم تحديث البيانات من Firebase')
              }}
              className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              🔄 تحديث من Firebase
            </button>
          )}
          {isAdmin && (
            <button
              onClick={async () => {
                if (window.confirm('هل تريد تحميل البيانات النموذجية إلى Firebase؟\n\nهذا سيضيف أسئلة وفئات نموذجية إلى قاعدة البيانات.')) {
                  try {
                    devLog('Loading sample data to Firebase...')
                    const module = await import('../data/sampleQuestions.json')
                    const sampleData = module.default

                    // Import sample categories and questions to Firebase
                    await FirebaseQuestionsService.createCategoriesFromData(sampleData.categories)

                    // Convert questions format and import
                    const allQuestions = []
                    Object.entries(sampleData.questions).forEach(([categoryId, questions]) => {
                      questions.forEach(question => {
                        allQuestions.push({
                          ...question,
                          categoryId: categoryId,
                          categoryName: sampleData.categories.find(cat => cat.id === categoryId)?.name || categoryId
                        })
                      })
                    })

                    await FirebaseQuestionsService.importQuestions(allQuestions)

                    GameDataLoader.clearCache()
                    await loadData()
                    alert('تم تحميل البيانات النموذجية إلى Firebase بنجاح!')
                  } catch (error) {
                    prodError('Error loading sample data:', error)
                    alert('حدث خطأ أثناء تحميل البيانات النموذجية')
                  }
                }
              }}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              📥 تحميل البيانات النموذجية إلى Firebase
            </button>
          )}
          <button
            onClick={() => setShowSingleAdd(!showSingleAdd)}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            ➕ إضافة سؤال واحد
          </button>
        </div>
      </div>

      {/* Single Question Add Section */}
      {showSingleAdd && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl shadow-lg p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-yellow-800">➕ إضافة سؤال جديد</h3>
            <button
              onClick={() => setShowSingleAdd(false)}
              className="text-gray-900 hover:text-gray-700 text-2xl font-bold"
            >
              ✕
            </button>
          </div>

          {/* Category and Difficulty */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Category Selection */}
            <div>
              <label className="block text-xs font-bold text-yellow-700 mb-1">الفئة *</label>
              <select
                value={singleQuestion.categoryId}
                onChange={(e) => setSingleQuestion(prev => ({ ...prev, categoryId: e.target.value }))}
                className="w-full p-2 border rounded-lg text-sm text-gray-900 bg-white"
                required
              >
                <option value="">اختر الفئة</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Difficulty */}
            <div>
              <label className="block text-xs font-bold text-yellow-700 mb-1">مستوى الصعوبة:</label>
              <select
                value={singleQuestion.difficulty}
                onChange={(e) => setSingleQuestion(prev => ({ ...prev, difficulty: e.target.value }))}
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
            <label className="block text-xs font-bold mb-1 text-yellow-700">نص السؤال *</label>
            <textarea
              value={singleQuestion.text}
              onChange={(e) => setSingleQuestion(prev => ({ ...prev, text: e.target.value }))}
              className="w-full p-2 border rounded-lg text-sm text-gray-900 bg-white"
              rows={3}
              placeholder="اكتب نص السؤال هنا..."
              required
            />
          </div>

          {/* Answer */}
          <div className="mb-4">
            <label className="block text-xs font-bold mb-1 text-yellow-700">الإجابة الصحيحة *</label>
            <input
              type="text"
              value={singleQuestion.answer}
              onChange={(e) => setSingleQuestion(prev => ({ ...prev, answer: e.target.value }))}
              className="w-full p-2 border rounded-lg text-sm text-gray-900 bg-white"
              placeholder="الإجابة الصحيحة..."
              required
            />
          </div>

          {/* Tolerance Hint */}
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={singleQuestion.toleranceHint?.enabled || false}
                onChange={(e) => setSingleQuestion(prev => ({
                  ...prev,
                  toleranceHint: {
                    enabled: e.target.checked,
                    value: prev.toleranceHint?.value || '1'
                  }
                }))}
                className="w-4 h-4"
              />
              <label className="text-sm font-bold text-amber-700">إظهار هامش خطأ مسموح</label>
            </div>
            {singleQuestion.toleranceHint?.enabled && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={singleQuestion.toleranceHint?.value || '1'}
                  onChange={(e) => setSingleQuestion(prev => ({
                    ...prev,
                    toleranceHint: {
                      ...prev.toleranceHint,
                      value: e.target.value
                    }
                  }))}
                  className="w-32 p-2 border rounded-lg text-sm text-gray-900 bg-white"
                  placeholder="1 أو نص"
                />
                <span className="text-xs text-amber-600">سيظهر تحت نص السؤال للاعبين</span>
              </div>
            )}
          </div>

          {/* Multiple Choice Options */}
          <div className="mb-4">
            <label className="block text-xs font-bold mb-1 text-yellow-700">خيارات الإجابة (اختياري)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {singleQuestion.choices.map((choice, index) => (
                <input
                  key={index}
                  type="text"
                  value={choice}
                  onChange={(e) => {
                    const newChoices = [...singleQuestion.choices]
                    newChoices[index] = e.target.value
                    setSingleQuestion(prev => ({ ...prev, choices: newChoices }))
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
              <div>
                <label className="block text-xs font-bold mb-1 text-blue-700">صورة السؤال:</label>
                <div className="flex gap-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0]
                      if (file) handleSingleQuestionImageUpload(file)
                    }}
                    className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                  />
                  {singleQuestion.imageUrl && (
                    <button
                      type="button"
                      onClick={() => handleMediaDelete('imageUrl', singleQuestion.imageUrl, (field, value) => setSingleQuestion(prev => ({ ...prev, [field]: value })))}
                      className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                      title="حذف الصورة"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {singleQuestion.imageUrl && (
                  <div className="mt-2">
                    <SmartImage
                      src={singleQuestion.imageUrl}
                      alt="معاينة"
                      size="thumb"
                      context="question"
                      className="w-20 h-20 object-cover rounded border"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-blue-700">صوت السؤال:</label>
                <div className="flex gap-1">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      const file = e.target.files[0]
                      if (file) handleSingleQuestionAudioUpload(file)
                    }}
                    className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                  />
                  {singleQuestion.audioUrl && (
                    <button
                      type="button"
                      onClick={() => handleMediaDelete('audioUrl', singleQuestion.audioUrl, (field, value) => setSingleQuestion(prev => ({ ...prev, [field]: value })))}
                      className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                      title="حذف الصوت"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {singleQuestion.audioUrl && (
                  <div className="mt-2">
                    <LazyMediaPlayer
                      src={singleQuestion.audioUrl}
                      type="audio"
                      className="w-full"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-blue-700">فيديو السؤال:</label>
                <div className="flex gap-1">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      const file = e.target.files[0]
                      if (file) handleSingleQuestionVideoUpload(file)
                    }}
                    className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                  />
                  {singleQuestion.videoUrl && (
                    <button
                      type="button"
                      onClick={() => handleMediaDelete('videoUrl', singleQuestion.videoUrl, (field, value) => setSingleQuestion(prev => ({ ...prev, [field]: value })))}
                      className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                      title="حذف الفيديو"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {singleQuestion.videoUrl && (
                  <div className="mt-2">
                    <LazyMediaPlayer
                      src={singleQuestion.videoUrl}
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
              <div>
                <label className="block text-xs font-bold mb-1 text-green-700">صورة الإجابة:</label>
                <div className="flex gap-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0]
                      if (file) handleSingleAnswerImageUpload(file)
                    }}
                    className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                  />
                  {singleQuestion.answerImageUrl && (
                    <button
                      type="button"
                      onClick={() => handleMediaDelete('answerImageUrl', singleQuestion.answerImageUrl, (field, value) => setSingleQuestion(prev => ({ ...prev, [field]: value })))}
                      className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                      title="حذف الصورة"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {singleQuestion.answerImageUrl && (
                  <div className="mt-2">
                    <img
                      src={singleQuestion.answerImageUrl}
                      alt="معاينة"
                      className="w-20 h-20 object-cover rounded border"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-green-700">صوت الإجابة:</label>
                <div className="flex gap-1">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      const file = e.target.files[0]
                      if (file) handleSingleAnswerAudioUpload(file)
                    }}
                    className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                  />
                  {singleQuestion.answerAudioUrl && (
                    <button
                      type="button"
                      onClick={() => handleMediaDelete('answerAudioUrl', singleQuestion.answerAudioUrl, (field, value) => setSingleQuestion(prev => ({ ...prev, [field]: value })))}
                      className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                      title="حذف الصوت"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {singleQuestion.answerAudioUrl && (
                  <div className="mt-2">
                    <LazyMediaPlayer
                      src={singleQuestion.answerAudioUrl}
                      type="audio"
                      className="w-full"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-green-700">فيديو الإجابة:</label>
                <div className="flex gap-1">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      const file = e.target.files[0]
                      if (file) handleSingleAnswerVideoUpload(file)
                    }}
                    className="flex-1 p-1 border rounded text-xs text-gray-900 bg-white"
                  />
                  {singleQuestion.answerVideoUrl && (
                    <button
                      type="button"
                      onClick={() => handleMediaDelete('answerVideoUrl', singleQuestion.answerVideoUrl, (field, value) => setSingleQuestion(prev => ({ ...prev, [field]: value })))}
                      className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                      title="حذف الفيديو"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {singleQuestion.answerVideoUrl && (
                  <div className="mt-2">
                    <LazyMediaPlayer
                      src={singleQuestion.answerVideoUrl}
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
            <div className="flex gap-3">
              <button
                onClick={() => setShowSingleAdd(false)}
                className="px-4 py-2 text-gray-900 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleSingleQuestionSubmit}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                إضافة السؤال
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Section */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-black">إضافة أسئلة مجمعة</h3>
          <button
            onClick={() => setShowBulkAdd(!showBulkAdd)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            {showBulkAdd ? 'إخفاء' : 'إظهار'} الإضافة المجمعة
          </button>
        </div>

        {showBulkAdd && (
          <div>
            {/* Import Type Selection */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg mb-4 border-2 border-purple-200">
              <h4 className="font-bold text-purple-800 mb-3">📥 اختر طريقة الاستيراد:</h4>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer bg-white p-3 rounded-lg border-2 border-purple-200 hover:border-purple-400 transition-all">
                  <input
                    type="radio"
                    name="importType"
                    value="text"
                    checked={bulkImportType === 'text'}
                    onChange={(e) => setBulkImportType(e.target.value)}
                    className="w-4 h-4 text-purple-600"
                  />
                  <span className="font-semibold text-purple-700">📝 نص مباشر</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer bg-white p-3 rounded-lg border-2 border-green-200 hover:border-green-400 transition-all">
                  <input
                    type="radio"
                    name="importType"
                    value="xlsx"
                    checked={bulkImportType === 'xlsx'}
                    onChange={(e) => setBulkImportType(e.target.value)}
                    className="w-4 h-4 text-green-600"
                  />
                  <span className="font-semibold text-green-700">📊 ملف Excel (XLSX)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer bg-white p-3 rounded-lg border-2 border-blue-200 hover:border-blue-400 transition-all">
                  <input
                    type="radio"
                    name="importType"
                    value="zip"
                    checked={bulkImportType === 'zip'}
                    onChange={(e) => setBulkImportType(e.target.value)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="font-semibold text-blue-700">📦 ملف مضغوط (ZIP)</span>
                </label>
              </div>
            </div>

            {/* Text Import Mode */}
            {bulkImportType === 'text' && (
              <>
                {/* Instructions */}
                <div className="bg-blue-50 p-4 rounded-lg mb-4">
                  <h4 className="font-bold text-blue-800 mb-2">تعليمات التنسيق:</h4>
                  <div className="text-blue-700 text-sm space-y-1">
                    <p>• استخدم الفاصلة المنقوطة العربية (؛) للفصل بين الأجزاء</p>
                    <p>• كل سؤال في سطر واحد مقسم كالتالي:</p>
                    <p><strong>السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛رابط الصوت؛رابط الصورة؛مستوى الصعوبة</strong></p>
                    <p>• يمكن ترك الخيارات فارغة للأسئلة النصية</p>
                    <p>• مستوى الصعوبة: سهل/متوسط/صعب أو easy/medium/hard</p>
                    <p>• <strong>✨ الفئة مطلوبة:</strong> يجب تحديد الفئة في العمود السابع، وإذا لم تكن موجودة سيتم إنشاؤها تلقائياً!</p>
                  </div>
                </div>

                {/* Firebase Info */}
                <div className="bg-orange-50 p-4 rounded-lg mb-4">
                  <h4 className="font-bold text-orange-800 mb-2">🔥 الاستيراد المباشر إلى Firebase</h4>
                  <div className="text-orange-700 text-sm space-y-1">
                    <p>• <strong>فحص المكررات التلقائي:</strong> سيتم تخطي الأسئلة المكررة (نفس النص والإجابة)</p>
                    <p>• <strong>أسئلة مشابهة مسموحة:</strong> إذا كان النص نفسه ولكن الإجابة مختلفة، سيتم إضافته</p>
                    <p>• <strong>حفظ دائم:</strong> البيانات محفوظة في Firebase وتظل موجودة حتى لو تم مسح المتصفح</p>
                    <p>• <strong>تزامن فوري:</strong> يمكن للمستخدمين الآخرين رؤية الأسئلة الجديدة فوراً</p>
                  </div>
                </div>

                {/* Bulk Input */}
                <div className="mb-4">
                  <label className="block text-sm font-bold mb-2 text-black">الأسئلة (بالتنسيق المطلوب):</label>
                  <textarea
                    value={bulkQuestions}
                    onChange={(e) => setBulkQuestions(e.target.value)}
                    className="w-full h-64 p-3 border rounded-lg font-mono text-sm text-black"
                    placeholder="أدخل الأسئلة هنا..."
                    style={{ direction: 'ltr', textAlign: 'left' }}
                  />
                </div>

                {/* Force Import Option */}
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={forceImport}
                      onChange={(e) => setForceImport(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm font-bold text-yellow-800">
                      ⚠️ فرض الاستيراد (تجاهل الأسئلة المكررة)
                    </span>
                  </label>
                  <p className="text-xs text-yellow-600 mt-1">
                    استخدم هذا الخيار إذا حذفت فئة وتريد إعادة استيرادها فوراً
                  </p>
                </div>

                <button
                  onClick={handleBulkAdd}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg"
                >
                  إضافة الأسئلة
                </button>
              </>
            )}

            {/* XLSX Import Mode */}
            {bulkImportType === 'xlsx' && (
              <>
                <div className="bg-green-50 p-4 rounded-lg mb-4">
                  <h4 className="font-bold text-green-800 mb-2">📊 استيراد من ملف Excel</h4>
                  <div className="text-green-700 text-sm space-y-1">
                    <p>• قم بتحميل ملف Excel (.xlsx) يحتوي على الأسئلة</p>
                    <p>• يجب أن يحتوي الملف على الأعمدة التالية: السؤال، الإجابة، الخيارات، الصعوبة</p>
                    <p>• سيتم إضافة جميع الأسئلة إلى الفئة المحددة أدناه</p>
                    <p>• إذا كانت الأسئلة تحتوي على روابط وسائط، تأكد من وجود الملفات في المسارات الصحيحة</p>
                  </div>
                </div>

                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-sm font-bold mb-2 text-black">اسم الفئة:</label>
                    <input
                      type="text"
                      value={bulkCategoryName}
                      onChange={(e) => setBulkCategoryName(e.target.value)}
                      className="w-full p-3 border rounded-lg text-black"
                      placeholder="أدخل اسم الفئة (سيتم إنشاؤها إذا لم تكن موجودة)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-2 text-black">ملف Excel:</label>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => setBulkFile(e.target.files[0])}
                      className="w-full p-3 border rounded-lg text-black"
                    />
                    {bulkFile && (
                      <p className="text-sm text-green-600 mt-2">
                        ✅ تم اختيار: {bulkFile.name}
                      </p>
                    )}
                  </div>
                </div>

                {isProcessingBulk && (
                  <div className="bg-blue-50 p-4 rounded-lg mb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span className="font-bold text-blue-800">{bulkProgress.message}</span>
                    </div>
                    {bulkProgress.total > 0 && (
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                        ></div>
                      </div>
                    )}
                    <p className="text-sm text-gray-900 mt-1">
                      {bulkProgress.current} / {bulkProgress.total}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleFileBulkImport}
                  disabled={isProcessingBulk}
                  className={`font-bold py-3 px-6 rounded-lg ${
                    isProcessingBulk
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {isProcessingBulk ? 'جاري الاستيراد...' : '📊 استيراد من Excel'}
                </button>
              </>
            )}

            {/* ZIP Import Mode */}
            {bulkImportType === 'zip' && (
              <>
                <div className="bg-blue-50 p-4 rounded-lg mb-4">
                  <h4 className="font-bold text-blue-800 mb-2">📦 استيراد من ملف مضغوط</h4>
                  <div className="text-blue-700 text-sm space-y-1">
                    <p>• قم بتحميل ملف ZIP يحتوي على:</p>
                    <p className="mr-4">- ملف Excel (.xlsx) بالأسئلة</p>
                    <p className="mr-4">- مجلد media يحتوي على الصور والأصوات والفيديوهات</p>
                    <p>• سيتم رفع جميع الوسائط تلقائياً وربطها بالأسئلة</p>
                    <p>• تأكد من أن أسماء الملفات في Excel تطابق أسماء ملفات الوسائط في المجلد</p>
                  </div>
                </div>

                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-sm font-bold mb-2 text-black">اسم الفئة:</label>
                    <input
                      type="text"
                      value={bulkCategoryName}
                      onChange={(e) => setBulkCategoryName(e.target.value)}
                      className="w-full p-3 border rounded-lg text-black"
                      placeholder="أدخل اسم الفئة (سيتم إنشاؤها إذا لم تكن موجودة)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-2 text-black">ملف ZIP:</label>
                    <input
                      type="file"
                      accept=".zip"
                      onChange={(e) => setBulkFile(e.target.files[0])}
                      className="w-full p-3 border rounded-lg text-black"
                    />
                    {bulkFile && (
                      <p className="text-sm text-green-600 mt-2">
                        ✅ تم اختيار: {bulkFile.name}
                      </p>
                    )}
                  </div>
                </div>

                {isProcessingBulk && (
                  <div className="bg-blue-50 p-4 rounded-lg mb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span className="font-bold text-blue-800">{bulkProgress.message}</span>
                    </div>
                    {bulkProgress.total > 0 && (
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                        ></div>
                      </div>
                    )}
                    <p className="text-sm text-gray-900 mt-1">
                      {bulkProgress.current} / {bulkProgress.total}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleFileBulkImport}
                  disabled={isProcessingBulk}
                  className={`font-bold py-3 px-6 rounded-lg ${
                    isProcessingBulk
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {isProcessingBulk ? 'جاري الاستيراد...' : '📦 استيراد من ZIP'}
                </button>
              </>
            )}
          </div>
        )}
      </div>


      {/* Questions Display */}
      <div className="space-y-6">
        {categories.map(category => {
          const categoryQuestions = questions[category.id] || []
          const difficultyCounts = getDifficultyCounts(category.id)
          const filteredQuestions = getFilteredQuestions(category.id)
          const activeDifficulty = difficultyFilter[category.id]

          return (
            <div key={category.id} className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {category.name} ({difficultyCounts.total} سؤال)
                  </h3>

                  {/* Difficulty Filter Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleDifficultyFilter(category.id, null)}
                      className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                        !activeDifficulty
                          ? 'bg-gray-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      الكل ({difficultyCounts.total})
                    </button>

                    <button
                      onClick={() => toggleDifficultyFilter(category.id, 'easy')}
                      className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                        activeDifficulty === 'easy'
                          ? 'bg-green-600 text-white'
                          : 'bg-green-100 text-green-800 hover:bg-green-200'
                      }`}
                    >
                      سهل ({difficultyCounts.easy})
                    </button>

                    <button
                      onClick={() => toggleDifficultyFilter(category.id, 'medium')}
                      className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                        activeDifficulty === 'medium'
                          ? 'bg-yellow-600 text-white'
                          : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                      }`}
                    >
                      متوسط ({difficultyCounts.medium})
                    </button>

                    <button
                      onClick={() => toggleDifficultyFilter(category.id, 'hard')}
                      className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                        activeDifficulty === 'hard'
                          ? 'bg-red-600 text-white'
                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                      }`}
                    >
                      صعب ({difficultyCounts.hard})
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => distributeDifficultiesEvenly(category.id)}
                    className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-lg text-sm font-bold transition-colors flex items-center gap-1"
                    title="توزيع الصعوبات بالتساوي"
                  >
                    ⚖️ توزيع متساوي
                  </button>
                  <button
                    onClick={() => toggleCategoryCollapse(category.id)}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-lg text-sm font-bold transition-colors"
                  >
                    {collapsedCategories.has(category.id) ? '▼ إظهار' : '▲ إخفاء'}
                  </button>
                </div>
              </div>

              {!collapsedCategories.has(category.id) && (
                filteredQuestions.length === 0 ? (
                  <p className="text-gray-900">
                    {categoryQuestions.length === 0
                      ? 'لا توجد أسئلة في هذه الفئة'
                      : `لا توجد أسئلة بمستوى الصعوبة المحدد`}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {filteredQuestions.map((question, filteredIndex) => {
                      // Find the original index in the full category questions array
                      // Use more specific matching to avoid duplicates
                      const originalIndex = categoryQuestions.findIndex((q) =>
                        q.text === question.text &&
                        q.answer === question.answer &&
                        q.difficulty === question.difficulty &&
                        q.points === question.points &&
                        (q.imageUrl || '') === (question.imageUrl || '') &&
                        (q.audioUrl || '') === (question.audioUrl || '') &&
                        (q.type || 'text') === (question.type || 'text')
                      )
                      const dropdownKey = `${category.id}-${originalIndex}`
                      const isDropdownOpen = difficultyDropdowns[dropdownKey]
                      // Create a unique key combining category, original index, and filtered index
                      const uniqueKey = `${category.id}-${originalIndex}-${filteredIndex}`

                      return (
                    <div key={uniqueKey} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          {question.imageUrl && (
                            <div className="mb-3">
                              <SmartImage
                                src={question.imageUrl}
                                alt="صورة السؤال"
                                size="thumb"
                                context="thumbnail"
                                className="max-w-32 max-h-32 rounded-lg object-cover border"
                              />
                            </div>
                          )}

                          {/* Question Audio Display */}
                          {question.audioUrl && (
                            <div className="mb-3">
                              <label className="block text-xs font-bold mb-1 text-gray-900">صوت السؤال:</label>
                              <LazyMediaPlayer
                                src={question.audioUrl}
                                type="audio"
                                className="w-full max-w-xs"
                              />
                            </div>
                          )}

                          {/* Question Video Display */}
                          {question.videoUrl && (
                            <div className="mb-3">
                              <label className="block text-xs font-bold mb-1 text-gray-900">فيديو السؤال:</label>
                              <LazyMediaPlayer
                                src={question.videoUrl}
                                type="video"
                                className="w-full max-w-xs"
                              />
                            </div>
                          )}

                          {/* Answer Image Display */}
                          {question.answerImageUrl && (
                            <div className="mb-3">
                              <label className="block text-xs font-bold mb-1 text-gray-900">صورة الإجابة:</label>
                              <img
                                src={question.answerImageUrl}
                                alt="صورة الإجابة"
                                className="max-w-32 max-h-32 rounded-lg object-cover border"
                              />
                            </div>
                          )}

                          {/* Answer Audio Display */}
                          {question.answerAudioUrl && (
                            <div className="mb-3">
                              <label className="block text-xs font-bold mb-1 text-gray-900">صوت الإجابة:</label>
                              <LazyMediaPlayer
                                src={question.answerAudioUrl}
                                type="audio"
                                className="w-full max-w-xs"
                              />
                            </div>
                          )}

                          {/* Answer Video Display */}
                          {question.answerVideoUrl && (
                            <div className="mb-3">
                              <label className="block text-xs font-bold mb-1 text-gray-900">فيديو الإجابة:</label>
                              <LazyMediaPlayer
                                src={question.answerVideoUrl}
                                type="video"
                                className="w-full max-w-xs"
                              />
                            </div>
                          )}

                          {/* Question Image Upload */}
                          <div className="mb-3">
                            <label className="block text-xs font-bold mb-1 text-gray-900">
                              {question.imageUrl ? 'تغيير صورة السؤال:' : 'إضافة صورة للسؤال:'}
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                  handleQuestionImageUpload(category.id, originalIndex, file);
                                }
                              }}
                              className="w-full p-1 border rounded text-xs"
                              disabled={uploadingQuestionImages[`${category.id}-${originalIndex}`]}
                            />
                            {uploadingQuestionImages[`${category.id}-${originalIndex}`] && (
                              <div className="mt-1 text-center">
                                <div className="inline-flex items-center px-2 py-1 font-semibold leading-4 text-xs shadow rounded text-blue-500 bg-blue-100">
                                  <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  جاري الرفع...
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Question Text - Inline Editable */}
                          {editingQuestion === `${category.id}-${originalIndex}` ? (
                            <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-bold text-yellow-800">نص السؤال:</label>
                                {setShowAIModal && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      setAiEditingCategory({
                                        categoryId: category.id,
                                        categoryName: category.name,
                                        questionData: editingData,
                                        onApplyChanges: handleAIChanges
                                      })
                                      setShowAIModal(true)
                                    }}
                                    className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:from-purple-700 hover:to-blue-700 transition-all"
                                  >
                                    ✨ AI
                                  </button>
                                )}
                              </div>
                              <textarea
                                value={editingData.text || ''}
                                onChange={(e) => updateEditingData('text', e.target.value)}
                                className="w-full p-2 border rounded-lg text-sm mb-3 text-gray-900 bg-white"
                                rows="3"
                                placeholder="اكتب نص السؤال هنا..."
                              />

                              <label className="block text-sm font-bold mb-2 text-yellow-800">الإجابة الصحيحة:</label>
                              <input
                                type="text"
                                value={editingData.answer || ''}
                                onChange={(e) => updateEditingData('answer', e.target.value)}
                                className="w-full p-2 border rounded-lg text-sm mb-3 text-gray-900 bg-white"
                                placeholder="الإجابة الصحيحة..."
                              />

                              {/* Tolerance Hint */}
                              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                  <input
                                    type="checkbox"
                                    checked={editingData.toleranceHint?.enabled || false}
                                    onChange={(e) => updateEditingData('toleranceHint', {
                                      enabled: e.target.checked,
                                      value: editingData.toleranceHint?.value || '1'
                                    })}
                                    className="w-4 h-4"
                                  />
                                  <label className="text-xs font-bold text-amber-700">إظهار هامش خطأ مسموح</label>
                                </div>
                                {editingData.toleranceHint?.enabled && (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={editingData.toleranceHint?.value || '1'}
                                      onChange={(e) => updateEditingData('toleranceHint', {
                                        ...editingData.toleranceHint,
                                        value: e.target.value
                                      })}
                                      className="w-32 p-2 border rounded-lg text-xs text-gray-900 bg-white"
                                      placeholder="1 أو نص"
                                    />
                                    <span className="text-xs text-amber-600">سيظهر تحت نص السؤال</span>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-4 mb-3">
                                <div>
                                  <label className="block text-sm font-bold mb-2 text-yellow-800">مستوى الصعوبة:</label>
                                  <select
                                    value={editingData.difficulty || 'easy'}
                                    onChange={(e) => {
                                      const difficulty = e.target.value
                                      const points = difficulty === 'easy' ? 200 : difficulty === 'medium' ? 400 : 600
                                      updateEditingData('difficulty', difficulty)
                                      updateEditingData('points', points)
                                    }}
                                    className="w-full p-2 border rounded-lg text-sm text-gray-900 bg-white"
                                  >
                                    <option value="easy">سهل (200 نقطة)</option>
                                    <option value="medium">متوسط (400 نقطة)</option>
                                    <option value="hard">صعب (600 نقطة)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-bold mb-2 text-yellow-800">النقاط:</label>
                                  <input
                                    type="number"
                                    value={editingData.points || 200}
                                    onChange={(e) => updateEditingData('points', parseInt(e.target.value))}
                                    className="w-full p-2 border rounded-lg text-sm text-gray-900 bg-white"
                                    min="100"
                                    max="1000"
                                    step="100"
                                  />
                                </div>
                              </div>


                              {/* Question Media Section */}
                              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <h4 className="text-sm font-bold mb-3 text-blue-800">🎯 وسائط السؤال</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div>
                                    <label className="block text-xs font-bold mb-1 text-blue-700">صورة السؤال:</label>
                                    <input
                                      type="text"
                                      value={editingData.imageUrl || ''}
                                      onChange={(e) => updateEditingData('imageUrl', e.target.value)}
                                      className="w-full p-2 border rounded text-xs text-gray-900 bg-white mb-1"
                                      placeholder="رابط الصورة"
                                    />
                                    <div className="flex gap-1">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleMediaUpload(e.target.files[0], 'image', 'imageUrl')}
                                        disabled={uploadingMedia.imageUrl}
                                        className="hidden"
                                        id="question-image-upload"
                                      />
                                      <label
                                        htmlFor="question-image-upload"
                                        className={`flex-1 text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                          uploadingMedia.imageUrl
                                            ? 'bg-gray-400 text-white cursor-not-allowed'
                                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                                        }`}
                                      >
                                        {uploadingMedia.imageUrl ? '⏳ جاري الرفع...' : '📤 رفع صورة'}
                                      </label>
                                      {editingData.imageUrl && (
                                        <button
                                          type="button"
                                          onClick={() => handleMediaDelete('imageUrl', editingData.imageUrl, updateEditingData)}
                                          className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                                          title="حذف الصورة"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold mb-1 text-blue-700">صوت السؤال:</label>
                                    <input
                                      type="text"
                                      value={editingData.audioUrl || ''}
                                      onChange={(e) => updateEditingData('audioUrl', e.target.value)}
                                      className="w-full p-2 border rounded text-xs text-gray-900 bg-white mb-1"
                                      placeholder="رابط الصوت"
                                    />
                                    <div className="flex gap-1">
                                      <input
                                        type="file"
                                        accept="audio/*"
                                        onChange={(e) => handleMediaUpload(e.target.files[0], 'audio', 'audioUrl')}
                                        disabled={uploadingMedia.audioUrl}
                                        className="hidden"
                                        id="question-audio-upload"
                                      />
                                      <label
                                        htmlFor="question-audio-upload"
                                        className={`flex-1 text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                          uploadingMedia.audioUrl
                                            ? 'bg-gray-400 text-white cursor-not-allowed'
                                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                                        }`}
                                      >
                                        {uploadingMedia.audioUrl ? '⏳ جاري الرفع...' : '📤 رفع صوت'}
                                      </label>
                                      {editingData.audioUrl && (
                                        <button
                                          type="button"
                                          onClick={() => handleMediaDelete('audioUrl', editingData.audioUrl, updateEditingData)}
                                          className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                                          title="حذف الصوت"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold mb-1 text-blue-700">فيديو السؤال:</label>
                                    <input
                                      type="text"
                                      value={editingData.videoUrl || ''}
                                      onChange={(e) => updateEditingData('videoUrl', e.target.value)}
                                      className="w-full p-2 border rounded text-xs text-gray-900 bg-white mb-1"
                                      placeholder="رابط الفيديو"
                                    />
                                    <div className="flex gap-1">
                                      <input
                                        type="file"
                                        accept="video/*"
                                        onChange={(e) => handleMediaUpload(e.target.files[0], 'video', 'videoUrl')}
                                        disabled={uploadingMedia.videoUrl}
                                        className="hidden"
                                        id="question-video-upload"
                                      />
                                      <label
                                        htmlFor="question-video-upload"
                                        className={`flex-1 text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                          uploadingMedia.videoUrl
                                            ? 'bg-gray-400 text-white cursor-not-allowed'
                                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                                        }`}
                                      >
                                        {uploadingMedia.videoUrl ? '⏳ جاري الرفع...' : '📤 رفع فيديو'}
                                      </label>
                                      {editingData.videoUrl && (
                                        <button
                                          type="button"
                                          onClick={() => handleMediaDelete('videoUrl', editingData.videoUrl, updateEditingData)}
                                          className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                                          title="حذف الفيديو"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Answer Media Section */}
                              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                <h4 className="text-sm font-bold mb-3 text-green-800">✅ وسائط الإجابة</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div>
                                    <label className="block text-xs font-bold mb-1 text-green-700">صورة الإجابة:</label>
                                    <input
                                      type="text"
                                      value={editingData.answerImageUrl || ''}
                                      onChange={(e) => updateEditingData('answerImageUrl', e.target.value)}
                                      className="w-full p-2 border rounded text-xs text-gray-900 bg-white mb-1"
                                      placeholder="رابط الصورة"
                                    />
                                    <div className="flex gap-1">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleMediaUpload(e.target.files[0], 'image', 'answerImageUrl')}
                                        disabled={uploadingMedia.answerImageUrl}
                                        className="hidden"
                                        id="answer-image-upload"
                                      />
                                      <label
                                        htmlFor="answer-image-upload"
                                        className={`flex-1 text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                          uploadingMedia.answerImageUrl
                                            ? 'bg-gray-400 text-white cursor-not-allowed'
                                            : 'bg-green-600 hover:bg-green-700 text-white'
                                        }`}
                                      >
                                        {uploadingMedia.answerImageUrl ? '⏳ جاري الرفع...' : '📤 رفع صورة'}
                                      </label>
                                      {editingData.answerImageUrl && (
                                        <button
                                          type="button"
                                          onClick={() => handleMediaDelete('answerImageUrl', editingData.answerImageUrl, updateEditingData)}
                                          className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                                          title="حذف الصورة"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold mb-1 text-green-700">صوت الإجابة:</label>
                                    <input
                                      type="text"
                                      value={editingData.answerAudioUrl || ''}
                                      onChange={(e) => updateEditingData('answerAudioUrl', e.target.value)}
                                      className="w-full p-2 border rounded text-xs text-gray-900 bg-white mb-1"
                                      placeholder="رابط الصوت"
                                    />
                                    <div className="flex gap-1">
                                      <input
                                        type="file"
                                        accept="audio/*"
                                        onChange={(e) => handleMediaUpload(e.target.files[0], 'audio', 'answerAudioUrl')}
                                        disabled={uploadingMedia.answerAudioUrl}
                                        className="hidden"
                                        id="answer-audio-upload"
                                      />
                                      <label
                                        htmlFor="answer-audio-upload"
                                        className={`flex-1 text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                          uploadingMedia.answerAudioUrl
                                            ? 'bg-gray-400 text-white cursor-not-allowed'
                                            : 'bg-green-600 hover:bg-green-700 text-white'
                                        }`}
                                      >
                                        {uploadingMedia.answerAudioUrl ? '⏳ جاري الرفع...' : '📤 رفع صوت'}
                                      </label>
                                      {editingData.answerAudioUrl && (
                                        <button
                                          type="button"
                                          onClick={() => handleMediaDelete('answerAudioUrl', editingData.answerAudioUrl, updateEditingData)}
                                          className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                                          title="حذف الصوت"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold mb-1 text-green-700">فيديو الإجابة:</label>
                                    <input
                                      type="text"
                                      value={editingData.answerVideoUrl || ''}
                                      onChange={(e) => updateEditingData('answerVideoUrl', e.target.value)}
                                      className="w-full p-2 border rounded text-xs text-gray-900 bg-white mb-1"
                                      placeholder="رابط الفيديو"
                                    />
                                    <div className="flex gap-1">
                                      <input
                                        type="file"
                                        accept="video/*"
                                        onChange={(e) => handleMediaUpload(e.target.files[0], 'video', 'answerVideoUrl')}
                                        disabled={uploadingMedia.answerVideoUrl}
                                        className="hidden"
                                        id="answer-video-upload"
                                      />
                                      <label
                                        htmlFor="answer-video-upload"
                                        className={`flex-1 text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                          uploadingMedia.answerVideoUrl
                                            ? 'bg-gray-400 text-white cursor-not-allowed'
                                            : 'bg-green-600 hover:bg-green-700 text-white'
                                        }`}
                                      >
                                        {uploadingMedia.answerVideoUrl ? '⏳ جاري الرفع...' : '📤 رفع فيديو'}
                                      </label>
                                      {editingData.answerVideoUrl && (
                                        <button
                                          type="button"
                                          onClick={() => handleMediaDelete('answerVideoUrl', editingData.answerVideoUrl, updateEditingData)}
                                          className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-bold"
                                          title="حذف الفيديو"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    saveEdit(category.id, originalIndex)
                                  }}
                                  disabled={savingEdit}
                                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                                >
                                  {savingEdit ? '⏳ جاري الحفظ...' : '✅ حفظ'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    cancelEditing(category.id, originalIndex)
                                  }}
                                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-bold"
                                >
                                  ❌ إلغاء
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p
                              className="font-bold text-lg mb-2 text-black cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors"
                              onDoubleClick={() => startEditing(category.id, originalIndex)}
                              title="انقر مرتين للتعديل"
                            >
                              {question.text}
                            </p>
                          )}


                          <p className="text-green-600 mb-2">
                            ✓ {question.answer}
                          </p>

                          {/* Multiple Choice Options */}
                          {question.options && question.options.length > 1 && (
                            <div className="mb-2">
                              <p className="text-sm font-bold text-gray-900 mb-1">الخيارات:</p>
                              <div className="grid grid-cols-2 gap-1 text-sm">
                                {question.options.map((option, idx) => (
                                  <span
                                    key={idx}
                                    className={`px-2 py-1 rounded text-xs ${
                                      option === question.answer
                                        ? 'bg-green-100 text-green-800 font-bold'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}
                                  >
                                    {option}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2 text-sm flex-wrap">
                            <div className="relative difficulty-dropdown">
                              <button
                                onClick={() => toggleDifficultyDropdown(category.id, originalIndex)}
                                className={`px-2 py-1 rounded cursor-pointer hover:opacity-80 ${
                                  question.difficulty === 'easy' ? 'bg-green-100 text-green-800' :
                                  question.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}
                              >
                                {question.difficulty === 'easy' ? 'سهل' :
                                 question.difficulty === 'medium' ? 'متوسط' : 'صعب'} ▼
                              </button>

                              {isDropdownOpen && (
                                <div className="absolute top-full left-0 z-10 bg-white border border-gray-300 rounded-lg shadow-lg mt-1 min-w-max">
                                  <button
                                    onClick={() => changeDifficulty(category.id, originalIndex, 'easy')}
                                    className="block w-full px-3 py-2 text-left hover:bg-green-50 text-green-800 text-sm"
                                  >
                                    سهل (200 نقطة)
                                  </button>
                                  <button
                                    onClick={() => changeDifficulty(category.id, originalIndex, 'medium')}
                                    className="block w-full px-3 py-2 text-left hover:bg-yellow-50 text-yellow-800 text-sm"
                                  >
                                    متوسط (400 نقطة)
                                  </button>
                                  <button
                                    onClick={() => changeDifficulty(category.id, originalIndex, 'hard')}
                                    className="block w-full px-3 py-2 text-left hover:bg-red-50 text-red-800 text-sm"
                                  >
                                    صعب (600 نقطة)
                                  </button>
                                </div>
                              )}
                            </div>
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                              {question.points} نقطة
                            </span>
                            <span className="px-2 py-1 bg-red-100 text-red-800 rounded">
                              {question.type === 'multiple_choice' ? 'متعدد الخيارات' : 'نصي'}
                            </span>
                            {(question.categoryId || question.category) && (
                              <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded">
                                {getCategoryName(question.categoryId || question.category)}
                              </span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const question = questions[category.id][originalIndex]
                                const categoryName = categories.find(cat => cat.id === category.id)?.name || category.id

                                console.log('👁️ Preview button clicked for question:', {
                                  categoryId: category.id,
                                  categoryName,
                                  originalIndex,
                                  questionText: question.text?.substring(0, 50)
                                })

                                // Store preview data in localStorage
                                const previewData = {
                                  previewMode: true,
                                  question: {
                                    ...question,
                                    category: categoryName,
                                    categoryId: category.id
                                  },
                                  gameData: {
                                    team1: { name: 'الفريق 1', score: 0 },
                                    team2: { name: 'الفريق 2', score: 0 },
                                    currentTeam: 'team1',
                                    currentTurn: 'team1',
                                    gameName: 'معاينة السؤال',
                                    selectedCategories: [category.id],
                                    usedQuestions: [], // Empty array instead of Set for JSON serialization
                                    usedPointValues: [], // Empty array instead of Set for JSON serialization
                                    gameStarted: true
                                  }
                                }

                                console.log('💾 Storing preview data:', previewData)

                                // Store in localStorage instead of sessionStorage for new window access
                                localStorage.setItem('questionPreview', JSON.stringify(previewData))
                                console.log('✅ localStorage set, opening new window')

                                // Open in new window
                                window.open('/question', '_blank')
                              }}
                              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm font-bold"
                              title="معاينة السؤال"
                            >
                              👁️ معاينة
                            </button>
                            <button
                              onClick={() => deleteQuestion(category.id, originalIndex)}
                              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                            >
                              حذف
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                      )
                    })}
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SettingsManager() {
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [logoSize, setLogoSize] = useState('medium')

  const [largeLogoFile, setLargeLogoFile] = useState(null)
  const [largeLogoPreview, setLargeLogoPreview] = useState(null)
  const [uploadingLargeLogo, setUploadingLargeLogo] = useState(false)
  const [largeLogoSize, setLargeLogoSize] = useState('medium')

  const [slogan, setSlogan] = useState('')
  const [loading, setLoading] = useState(true)

  const [sponsorLogoFile, setSponsorLogoFile] = useState(null)
  const [sponsorLogoPreview, setSponsorLogoPreview] = useState(null)
  const [uploadingSponsorLogo, setUploadingSponsorLogo] = useState(false)
  const [showSponsorLogo, setShowSponsorLogo] = useState(true)

  const [signUpEnabled, setSignUpEnabled] = useState(true)

  const { getAppSettings, saveAppSettings } = useAuth()

  // Load saved logo and size from Firebase on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getAppSettings()
        if (settings?.logo) {
          setLogoPreview(settings.logo)
        }
        if (settings?.logoSize) {
          setLogoSize(settings.logoSize)
        }
        if (settings?.largeLogo) {
          setLargeLogoPreview(settings.largeLogo)
        }
        if (settings?.largeLogoSize) {
          setLargeLogoSize(settings.largeLogoSize)
        }
        if (settings?.slogan) {
          setSlogan(settings.slogan)
        }
        if (settings?.sponsorLogo) {
          setSponsorLogoPreview(settings.sponsorLogo)
        }
        if (settings?.showSponsorLogo !== undefined) {
          setShowSponsorLogo(settings.showSponsorLogo)
        }
        if (settings?.signUpEnabled !== undefined) {
          setSignUpEnabled(settings.signUpEnabled)
        }
      } catch (error) {
        prodError('Error loading settings:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [getAppSettings])

  const handleLogoChange = (event) => {
    const file = event.target.files[0]
    if (file) {
      setLogoFile(file)

      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setLogoPreview(e.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleLogoUpload = async () => {
    if (!logoFile) return

    setUploading(true)
    try {
      // Convert file to base64 and save to Firebase
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64Logo = e.target.result
        const success = await saveAppSettings({
          logo: base64Logo,
          logoSize: logoSize
        })

        if (success) {
          setLogoPreview(base64Logo)
          alert('تم حفظ الشعار والحجم بنجاح!')
        } else {
          alert('حدث خطأ أثناء حفظ الشعار')
        }
        setUploading(false)
      }
      reader.readAsDataURL(logoFile)
    } catch (error) {
      prodError('Error uploading logo:', error)
      setUploading(false)
      alert('حدث خطأ أثناء رفع الشعار')
    }
  }

  const handleSizeChange = async () => {
    try {
      const success = await saveAppSettings({ logoSize: logoSize })
      if (success) {
        alert('تم حفظ حجم الشعار بنجاح!')
      } else {
        alert('حدث خطأ أثناء حفظ حجم الشعار')
      }
    } catch (error) {
      prodError('Error saving logo size:', error)
      alert('حدث خطأ أثناء حفظ حجم الشعار')
    }
  }

  const handleLogoRemove = async () => {
    if (confirm('هل أنت متأكد من حذف الشعار؟')) {
      try {
        const success = await saveAppSettings({
          logo: null,
          logoSize: 'medium'
        })

        if (success) {
          setLogoFile(null)
          setLogoPreview(null)
          setLogoSize('medium')
          alert('تم حذف الشعار بنجاح!')
        } else {
          alert('حدث خطأ أثناء حذف الشعار')
        }
      } catch (error) {
        prodError('Error removing logo:', error)
        alert('حدث خطأ أثناء حذف الشعار')
      }
    }
  }

  // Large logo handlers
  const handleLargeLogoChange = (event) => {
    const file = event.target.files[0]
    if (file) {
      setLargeLogoFile(file)

      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setLargeLogoPreview(e.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleLargeLogoUpload = async () => {
    if (!largeLogoFile) return

    setUploadingLargeLogo(true)
    try {
      // Convert file to base64 and save to Firebase
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64Logo = e.target.result
        const success = await saveAppSettings({
          largeLogo: base64Logo,
          largeLogoSize: largeLogoSize
        })

        if (success) {
          alert('تم حفظ الشعار الكبير بنجاح!')
          setLargeLogoFile(null)
        } else {
          alert('حدث خطأ أثناء حفظ الشعار الكبير')
        }
        setUploadingLargeLogo(false)
      }
      reader.readAsDataURL(largeLogoFile)
    } catch (error) {
      prodError('Error uploading large logo:', error)
      setUploadingLargeLogo(false)
      alert('حدث خطأ أثناء رفع الشعار الكبير')
    }
  }

  const handleLargeLogoSizeChange = async () => {
    try {
      const success = await saveAppSettings({ largeLogoSize: largeLogoSize })
      if (success) {
        alert('تم حفظ حجم الشعار الكبير بنجاح!')
      } else {
        alert('حدث خطأ أثناء حفظ حجم الشعار الكبير')
      }
    } catch (error) {
      prodError('Error saving large logo size:', error)
      alert('حدث خطأ أثناء حفظ حجم الشعار الكبير')
    }
  }

  const handleLargeLogoRemove = async () => {
    if (!window.confirm('هل أنت متأكد من حذف الشعار الكبير؟')) {
      return
    }

    try {
      const success = await saveAppSettings({ largeLogo: null })
      if (success) {
        setLargeLogoPreview(null)
        setLargeLogoFile(null)
        alert('تم حذف الشعار الكبير بنجاح!')
      } else {
        alert('حدث خطأ أثناء حذف الشعار الكبير')
      }
    } catch (error) {
      prodError('Error removing large logo:', error)
      alert('حدث خطأ أثناء حذف الشعار الكبير')
    }
  }

  // Slogan handler
  const handleSloganSave = async () => {
    try {
      const success = await saveAppSettings({ slogan: slogan })
      if (success) {
        alert('تم حفظ الشعار النصي بنجاح!')
      } else {
        alert('حدث خطأ أثناء حفظ الشعار النصي')
      }
    } catch (error) {
      prodError('Error saving slogan:', error)
      alert('حدث خطأ أثناء حفظ الشعار النصي')
    }
  }

  // Sponsor Logo handlers
  const handleSponsorLogoChange = (event) => {
    const file = event.target.files[0]
    if (file) {
      setSponsorLogoFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setSponsorLogoPreview(e.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSponsorLogoUpload = async () => {
    if (!sponsorLogoFile) {
      alert('الرجاء اختيار صورة أولاً')
      return
    }

    setUploadingSponsorLogo(true)
    try {
      // Compress image before uploading (preserves transparency for PNG/WebP)
      const compressed = await S3UploadService.compressImage(sponsorLogoFile, 300, 0.85)

      // Upload to S3 with correct extension
      const extension = compressed.name.split('.').pop()
      const fileName = `sponsor_logo_${Date.now()}.${extension}`
      const s3Url = await S3UploadService.uploadImage(compressed, 'images/settings', fileName)

      // Save URL to app settings
      const success = await saveAppSettings({ sponsorLogo: s3Url })

      if (success) {
        setSponsorLogoPreview(s3Url)
        setSponsorLogoFile(null)
        alert('تم رفع شعار الراعي بنجاح!')
      } else {
        alert('حدث خطأ أثناء حفظ شعار الراعي')
      }
    } catch (error) {
      prodError('Error uploading sponsor logo:', error)
      alert('حدث خطأ أثناء رفع شعار الراعي: ' + error.message)
    } finally {
      setUploadingSponsorLogo(false)
    }
  }

  const handleSponsorLogoRemove = async () => {
    if (!confirm('هل أنت متأكد من حذف شعار الراعي؟')) {
      return
    }

    try {
      // Delete from S3 if it's an S3 URL
      if (sponsorLogoPreview && sponsorLogoPreview.includes('cloudfront')) {
        await S3UploadService.deleteFile(sponsorLogoPreview)
      }

      // Remove from settings
      const success = await saveAppSettings({ sponsorLogo: null })
      if (success) {
        setSponsorLogoPreview(null)
        setSponsorLogoFile(null)
        alert('تم حذف شعار الراعي بنجاح!')
      } else {
        alert('حدث خطأ أثناء حذف شعار الراعي')
      }
    } catch (error) {
      prodError('Error removing sponsor logo:', error)
      alert('حدث خطأ أثناء حذف شعار الراعي')
    }
  }

  const handleShowSponsorLogoToggle = async () => {
    try {
      const newValue = !showSponsorLogo
      const success = await saveAppSettings({ showSponsorLogo: newValue })
      if (success) {
        setShowSponsorLogo(newValue)
        alert(newValue ? 'سيتم عرض شعار الراعي' : 'سيتم إخفاء شعار الراعي')
      } else {
        alert('حدث خطأ أثناء حفظ الإعداد')
      }
    } catch (error) {
      prodError('Error toggling sponsor logo visibility:', error)
      alert('حدث خطأ أثناء حفظ الإعداد')
    }
  }

  const handleSignUpToggle = async () => {
    try {
      const newValue = !signUpEnabled
      const success = await saveAppSettings({ signUpEnabled: newValue })
      if (success) {
        setSignUpEnabled(newValue)
        alert(newValue
          ? 'تم تفعيل التسجيل - يمكن للمستخدمين الجدد إنشاء حسابات'
          : 'تم إيقاف التسجيل - يمكن للمستخدمين الحاليين تسجيل الدخول فقط')
      } else {
        alert('حدث خطأ أثناء حفظ الإعداد')
      }
    } catch (error) {
      prodError('Error toggling sign-up:', error)
      alert('حدث خطأ أثناء حفظ الإعداد')
    }
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold mb-6">إعدادات اللعبة</h2>

      {/* Logo Upload Section */}
      <div className="bg-white p-6 rounded-xl shadow-md border">
        <h3 className="text-xl font-bold mb-4 text-gray-800">شعار اللعبة</h3>
        <p className="text-gray-900 mb-4">
          يمكنك رفع شعار مخصص ليظهر في جميع صفحات اللعبة. يُفضل أن يكون الشعار مربع الشكل ولا يتجاوز 2 ميجابايت.
        </p>

        {/* Current Logo Preview */}
        <div className="mb-6">
          <h4 className="font-semibold mb-3 text-gray-700">الشعار الحالي:</h4>
          <div className="w-20 h-20 bg-red-600/20 rounded-lg flex items-center justify-center border-2 border-dashed border-red-300">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="شعار اللعبة"
                className="w-full h-full object-contain rounded-lg"
              />
            ) : (
              <span className="text-red-600 text-2xl">🧠</span>
            )}
          </div>
        </div>

        {/* Upload Controls */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              اختر صورة جديدة:
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="block w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
            />
          </div>

          {/* Logo Size Control */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              حجم الشعار:
            </label>
            <select
              value={logoSize}
              onChange={(e) => setLogoSize(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-red-500"
            >
              <option value="small">صغير (32px)</option>
              <option value="medium">متوسط (48px)</option>
              <option value="large">كبير (64px)</option>
              <option value="xlarge">كبير جداً (80px)</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleLogoUpload}
              disabled={!logoFile || uploading}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              {uploading ? 'جاري الحفظ...' : 'حفظ الشعار'}
            </button>

            <button
              onClick={handleSizeChange}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              حفظ الحجم
            </button>

            {logoPreview && (
              <button
                onClick={handleLogoRemove}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                حذف الشعار
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Large Logo Upload Section */}
      <div className="bg-white p-6 rounded-xl shadow-md border">
        <h3 className="text-xl font-bold mb-4 text-gray-800">الشعار الكبير للصفحة الرئيسية</h3>
        <p className="text-gray-900 mb-4">
          يمكنك رفع شعار كبير ليظهر في الصفحة الرئيسية للعبة. يُفضل أن يكون الشعار مربع الشكل ولا يتجاوز 5 ميجابايت.
        </p>

        {/* Current Large Logo Preview */}
        <div className="mb-6">
          <h4 className="font-semibold mb-3 text-gray-700">الشعار الكبير الحالي:</h4>
          <div className={`bg-blue-600/20 rounded-lg flex items-center justify-center border-2 border-dashed border-blue-300 ${
            largeLogoSize === 'small' ? 'w-32 h-32' :
            largeLogoSize === 'medium' ? 'w-48 h-48' :
            largeLogoSize === 'large' ? 'w-64 h-64' :
            'w-48 h-48'
          }`}>
            {largeLogoPreview ? (
              <img
                src={largeLogoPreview}
                alt="الشعار الكبير"
                className="w-full h-full object-contain rounded-lg"
              />
            ) : (
              <span className="text-blue-600 text-6xl">🎯</span>
            )}
          </div>
        </div>

        {/* Large Logo Size Selection */}
        <div className="mb-4">
          <h4 className="font-semibold mb-2 text-gray-700">حجم الشعار الكبير:</h4>
          <div className="flex gap-4">
            {['small', 'medium', 'large'].map((size) => (
              <label key={size} className="flex items-center">
                <input
                  type="radio"
                  name="largeLogoSize"
                  value={size}
                  checked={largeLogoSize === size}
                  onChange={(e) => setLargeLogoSize(e.target.value)}
                  className="mr-2"
                />
                <span className="text-gray-700">
                  {size === 'small' ? 'صغير (128px)' : size === 'medium' ? 'متوسط (192px)' : 'كبير (256px)'}
                </span>
              </label>
            ))}
          </div>
          <button
            onClick={handleLargeLogoSizeChange}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            حفظ الحجم
          </button>
        </div>

        {/* Large Logo Upload */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold mb-2 text-gray-700">رفع شعار جديد:</h4>
            <input
              type="file"
              accept="image/*"
              onChange={handleLargeLogoChange}
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {largeLogoFile && (
              <div className="mt-3">
                <img
                  src={largeLogoPreview}
                  alt="معاينة الشعار الكبير"
                  className="w-20 h-20 object-contain border rounded-lg"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleLargeLogoUpload}
              disabled={!largeLogoFile || uploadingLargeLogo}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg disabled:opacity-50"
            >
              {uploadingLargeLogo ? 'جاري الرفع...' : 'رفع الشعار الكبير'}
            </button>

            {largeLogoPreview && (
              <button
                onClick={handleLargeLogoRemove}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg"
              >
                حذف الشعار الكبير
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Slogan Management Section */}
      <div className="bg-white p-6 rounded-xl shadow-md border">
        <h3 className="text-xl font-bold mb-4 text-gray-800">شعار اللعبة النصي</h3>
        <p className="text-gray-900 mb-4">
          يمكنك تعديل النص الذي يظهر في الصفحة الرئيسية تحت الشعار الكبير.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold mb-2 text-gray-700">الشعار النصي الحالي:</h4>
            <div className="p-4 bg-gray-50 rounded-lg border">
              <p className="text-lg font-bold text-gray-800">
                {slogan || 'مرحباً بكم في لعبة المعرفة'}
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2 text-gray-700">تعديل الشعار النصي:</h4>
            <textarea
              value={slogan}
              onChange={(e) => setSlogan(e.target.value)}
              placeholder="أدخل الشعار النصي الجديد..."
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
              maxLength={200}
            />
            <p className="text-sm text-gray-900 mt-1">
              {slogan.length}/200 حرف
            </p>
            <button
              onClick={handleSloganSave}
              className="mt-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
            >
              حفظ الشعار النصي
            </button>
          </div>
        </div>
      </div>

      {/* Sponsor Logo Upload Section */}
      <div className="bg-white p-6 rounded-xl shadow-md border">
        <h3 className="text-lg font-bold mb-3 text-red-800">شعار الراعي (يظهر في الفوتر)</h3>
        <p className="text-sm text-gray-900 mb-4">
          📐 الأبعاد الموصى بها: 240×160 بكسل للحاسوب، 200×120 بكسل للهواتف الأفقية، 60×40 بكسل للهواتف العمودية
          <br />
          <span className="text-xs">سيتم ضغط وتحسين الصورة تلقائياً مع الحفاظ على الشفافية (PNG/WebP)</span>
        </p>

        <div className="space-y-4">
          {/* Visibility Toggle */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <input
              type="checkbox"
              id="showSponsorLogo"
              checked={showSponsorLogo}
              onChange={handleShowSponsorLogoToggle}
              className="w-5 h-5 text-blue-600 rounded cursor-pointer"
            />
            <label htmlFor="showSponsorLogo" className="font-bold text-blue-800 cursor-pointer">
              عرض شعار الراعي في لوحة اللعبة
            </label>
          </div>

          {/* File Input */}
          <div>
            <label className="block text-sm font-bold mb-2">اختر صورة الشعار</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleSponsorLogoChange}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none p-2"
            />
          </div>

          {/* Preview */}
          {sponsorLogoPreview && (
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-gray-100 rounded-lg">
                <img
                  src={sponsorLogoPreview}
                  alt="Sponsor Logo Preview"
                  className="max-w-xs max-h-32 object-contain"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSponsorLogoRemove}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
                >
                  حذف الشعار
                </button>
              </div>
            </div>
          )}

          {/* Upload Button */}
          {sponsorLogoFile && (
            <button
              onClick={handleSponsorLogoUpload}
              disabled={uploadingSponsorLogo}
              className={`w-full py-3 rounded-lg font-bold text-white ${
                uploadingSponsorLogo
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {uploadingSponsorLogo ? 'جاري الرفع...' : 'رفع شعار الراعي'}
            </button>
          )}
        </div>
      </div>

      {/* Sign-Up Control Section */}
      <div className="bg-white p-6 rounded-xl shadow-md border">
        <h3 className="text-lg font-bold mb-3 text-gray-800">التحكم في التسجيل</h3>
        <p className="text-sm text-gray-900 mb-4">
          تحكم في إمكانية إنشاء حسابات جديدة. عند إيقاف التسجيل، يمكن للمستخدمين الحاليين تسجيل الدخول فقط.
        </p>

        <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
          <input
            type="checkbox"
            id="signUpEnabled"
            checked={signUpEnabled}
            onChange={handleSignUpToggle}
            className="w-6 h-6 text-blue-600 rounded cursor-pointer focus:ring-2 focus:ring-blue-500"
          />
          <label htmlFor="signUpEnabled" className="flex-1 cursor-pointer">
            <div className="font-bold text-blue-900 text-lg">
              {signUpEnabled ? '✅ التسجيل مفتوح' : '🔒 التسجيل مغلق'}
            </div>
            <div className="text-sm text-blue-700 mt-1">
              {signUpEnabled
                ? 'يمكن للمستخدمين الجدد إنشاء حسابات'
                : 'المستخدمون الحاليون فقط يمكنهم تسجيل الدخول'}
            </div>
          </label>
        </div>

        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800">
            <strong>ملاحظة:</strong> إيقاف التسجيل لا يؤثر على المستخدمين الحاليين - يمكنهم تسجيل الدخول في أي وقت.
          </p>
        </div>
      </div>
    </div>
  )
}

function UsersManager({ getAllUsers, updateUserRole, searchUsers }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredUsers, setFilteredUsers] = useState([])

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    if (searchTerm.trim()) {
      const filtered = users.filter(user =>
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredUsers(filtered)
    } else {
      setFilteredUsers(users)
    }
  }, [searchTerm, users])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const allUsers = await getAllUsers()
      setUsers(allUsers)
    } catch (error) {
      prodError('Error loading users:', error)
      alert('خطأ في تحميل المستخدمين')
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    if (!window.confirm('هل أنت متأكد من تغيير دور هذا المستخدم؟')) {
      return
    }

    try {
      await updateUserRole(userId, newRole)
      // Refresh users list
      await loadUsers()
      alert('تم تحديث دور المستخدم بنجاح')
    } catch (error) {
      prodError('Error updating user role:', error)
      alert('حدث خطأ في تحديث دور المستخدم')
    }
  }

  const getRoleDisplay = (user) => {
    if (user.isAdmin) return { text: 'مدير', color: 'bg-red-100 text-red-800' }
    if (user.isModerator) return { text: 'مشرف', color: 'bg-blue-50 text-blue-700' }
    return { text: 'مستخدم', color: 'bg-gray-100 text-gray-800' }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-900">جاري تحميل المستخدمين...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">إدارة المستخدمين</h2>
        <button
          onClick={loadUsers}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          تحديث القائمة
        </button>
      </div>

      {/* Search */}
      <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4">
        <input
          type="text"
          placeholder="البحث بالإيميل أو الاسم..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Users List */}
      <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-900 uppercase tracking-wider">المستخدم</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-900 uppercase tracking-wider">الإيميل</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-900 uppercase tracking-wider">الدور الحالي</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-900 uppercase tracking-wider">تاريخ التسجيل</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-900 uppercase tracking-wider">إجراءات</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => {
                const role = getRoleDisplay(user)
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.displayName || 'غير محدد'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${role.color}`}>
                        {role.text}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.createdAt?.toLocaleDateString('ar-EG') || 'غير محدد'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        {!user.isAdmin && (
                          <select
                            value={user.isModerator ? 'moderator' : 'user'}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-800"
                            style={{ color: '#374151' }}
                          >
                            <option value="user">مستخدم</option>
                            <option value="moderator">مشرف</option>
                            <option value="admin">مدير</option>
                          </select>
                        )}
                        {user.isAdmin && (
                          <span className="text-xs text-gray-900 px-2 py-1">لا يمكن التعديل</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-900">
              {searchTerm ? 'لا توجد نتائج للبحث' : 'لا توجد مستخدمون'}
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-xl">
          <h3 className="text-lg font-bold text-blue-800">إجمالي المستخدمين</h3>
          <p className="text-2xl font-bold text-blue-600">{users.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-xl">
          <h3 className="text-lg font-bold text-green-800">المشرفون</h3>
          <p className="text-2xl font-bold text-green-600">
            {users.filter(u => u.isModerator).length}
          </p>
        </div>
        <div className="bg-red-50 p-4 rounded-xl">
          <h3 className="text-lg font-bold text-red-800">المديرون</h3>
          <p className="text-2xl font-bold text-red-600">
            {users.filter(u => u.isAdmin).length}
          </p>
        </div>
      </div>
    </div>
  )
}

function PendingQuestionsManager() {
  const { user } = useAuth()
  const [pendingQuestions, setPendingQuestions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState({})

  useEffect(() => {
    loadPendingQuestions()
    loadCategories()
  }, [])

  const loadPendingQuestions = async () => {
    try {
      setLoading(true)
      const pending = await loaderService.getAllPendingQuestions()
      setPendingQuestions(pending)
    } catch (error) {
      prodError('Error loading pending questions:', error)
      alert('فشل في تحميل الأسئلة المعلقة')
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    try {
      const gameData = await GameDataLoader.loadGameData()
      setCategories(gameData.categories || [])
    } catch (error) {
      prodError('Error loading categories:', error)
    }
  }

  const handleApprove = async (questionId) => {
    // Find the question to get its categoryId if not manually selected
    const question = pendingQuestions.find(q => q.id === questionId)
    const categoryId = selectedCategory[questionId] || question?.categoryId

    if (!categoryId) {
      alert('الرجاء اختيار فئة للسؤال')
      return
    }

    if (!window.confirm('هل أنت متأكد من الموافقة على هذا السؤال؟')) {
      return
    }

    try {
      setProcessingId(questionId)
      await loaderService.approveQuestion(questionId, user.uid, categoryId)
      await loadPendingQuestions()
      // Clear cache to show new question immediately
      GameDataLoader.clearCache()
      alert('تم الموافقة على السؤال بنجاح!')
    } catch (error) {
      prodError('Error approving question:', error)
      alert('فشل في الموافقة على السؤال: ' + error.message)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (questionId) => {
    if (!window.confirm('هل أنت متأكد من رفض هذا السؤال؟')) {
      return
    }

    try {
      setProcessingId(questionId)
      await loaderService.rejectQuestion(questionId, user.uid)
      await loadPendingQuestions()
      alert('تم رفض السؤال')
    } catch (error) {
      prodError('Error rejecting question:', error)
      alert('فشل في رفض السؤال')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDelete = async (questionId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السؤال نهائياً؟')) {
      return
    }

    try {
      setProcessingId(questionId)
      const questionRef = doc(db, 'pending_questions', questionId)
      await deleteDoc(questionRef)
      await loadPendingQuestions()
      alert('تم حذف السؤال نهائياً')
    } catch (error) {
      prodError('Error deleting pending question:', error)
      alert('فشل في حذف السؤال')
    } finally {
      setProcessingId(null)
    }
  }

  const getCategoryName = (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId)
    return category ? category.name : 'فئة غير معروفة'
  }

  const getDifficultyName = (difficulty) => {
    switch (difficulty) {
      case 'easy': return 'سهل'
      case 'medium': return 'متوسط'
      case 'hard': return 'صعب'
      default: return difficulty
    }
  }

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-100 text-green-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'hard': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-900">جاري تحميل الأسئلة المعلقة...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">مراجعة الأسئلة المرسلة</h2>
        <button
          onClick={loadPendingQuestions}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          🔄 تحديث
        </button>
      </div>

      {pendingQuestions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">لا توجد أسئلة معلقة</h3>
          <p className="text-gray-900">عندما يرسل المشرفون أسئلة للمراجعة، ستظهر هنا</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingQuestions.map((question) => (
            <div key={question.id} className="bg-white rounded-xl shadow-lg p-6 border-r-4 border-yellow-400">
              {/* Header */}
              <div className="mb-4 pb-4 border-b">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <span className={`px-3 py-1 rounded-lg font-bold ${question.isNewCategory ? 'bg-purple-100 text-purple-800 border-2 border-purple-300' : 'bg-blue-100 text-blue-800'}`}>
                    {question.isNewCategory ? `🆕 ${question.category}` : (question.category || getCategoryName(question.categoryId))}
                  </span>
                  <span className={`px-3 py-1 rounded-lg font-bold ${getDifficultyColor(question.difficulty)}`}>
                    {getDifficultyName(question.difficulty)}
                  </span>
                  <span className="text-sm text-gray-900">
                    📅 {question.createdAt?.toDate?.()?.toLocaleDateString('ar-EG') || 'غير متوفر'}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-800">{question.question || question.text}</h3>
              </div>

              {/* Answer and Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <strong className="text-green-700">✅ الإجابة:</strong>
                  <p className="mt-1 text-gray-900 font-semibold">{question.answer}</p>
                </div>
                {question.options && question.options.length > 0 && (
                  <div>
                    <strong className="text-gray-900">الخيارات:</strong>
                    <ul className="mt-1 list-disc list-inside">
                      {question.options.map((option, index) => (
                        <li key={index} className="text-sm text-gray-900">{option}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {question.explanation && (
                <div className="mb-4">
                  <strong className="text-gray-900">التفسير:</strong>
                  <p className="mt-1 text-gray-900">{question.explanation}</p>
                </div>
              )}

              {/* Question Media Section */}
              {(question.imageUrl || question.audioUrl || question.videoUrl) && (
                <div className="mb-4">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-1">🎯 وسائط السؤال</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {question.imageUrl && (
                      <div>
                        <strong className="text-gray-900">صورة السؤال:</strong>
                        <SmartImage
                          src={question.imageUrl}
                          alt="صورة السؤال"
                          size="thumb"
                          context="thumbnail"
                          className="mt-2 w-32 h-32 object-cover rounded-lg border"
                        />
                      </div>
                    )}
                    {question.audioUrl && (
                      <div>
                        <strong className="text-gray-900">صوت السؤال:</strong>
                        <div className="mt-2 w-48">
                          <LazyMediaPlayer
                            src={question.audioUrl}
                            type="audio"
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}
                    {question.videoUrl && (
                      <div>
                        <strong className="text-gray-900">فيديو السؤال:</strong>
                        <div className="mt-2 w-48">
                          <LazyMediaPlayer
                            src={question.videoUrl}
                            type="video"
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Answer Media Section */}
              {(question.answerImageUrl || question.answerAudioUrl || question.answerVideoUrl) && (
                <div className="mb-4">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-1">✅ وسائط الإجابة</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {question.answerImageUrl && (
                      <div>
                        <strong className="text-gray-900">صورة الإجابة:</strong>
                        <img
                          src={question.answerImageUrl}
                          alt="صورة الإجابة"
                          className="mt-2 w-32 h-32 object-cover rounded-lg border"
                        />
                      </div>
                    )}
                    {question.answerAudioUrl && (
                      <div>
                        <strong className="text-gray-900">صوت الإجابة:</strong>
                        <div className="mt-2 w-48">
                          <LazyMediaPlayer
                            src={question.answerAudioUrl}
                            type="audio"
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}
                    {question.answerVideoUrl && (
                      <div>
                        <strong className="text-gray-900">فيديو الإجابة:</strong>
                        <div className="mt-2 w-48">
                          <LazyMediaPlayer
                            src={question.answerVideoUrl}
                            type="video"
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Category Selection */}
              <div className="mb-4 pb-4 border-b">
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  اختر الفئة لهذا السؤال:
                </label>
                <select
                  value={selectedCategory[question.id] || question.categoryId || ''}
                  onChange={(e) => setSelectedCategory(prev => ({ ...prev, [question.id]: e.target.value }))}
                  className="w-full p-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white"
                >
                  <option value="">-- اختر فئة --</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={() => handleApprove(question.id)}
                  disabled={processingId === question.id}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                >
                  {processingId === question.id ? '⏳ جاري المعالجة...' : '✅ موافقة'}
                </button>
                <button
                  onClick={() => handleReject(question.id)}
                  disabled={processingId === question.id}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                >
                  ❌ رفض
                </button>
                <button
                  onClick={() => handleDelete(question.id)}
                  disabled={processingId === question.id}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                >
                  🗑️ حذف نهائي
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Invite Codes Manager Component
function InviteCodesManager({ user }) {
  const [inviteCodes, setInviteCodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [newCode, setNewCode] = useState(null)

  useEffect(() => {
    loadInviteCodes()
  }, [])

  const loadInviteCodes = async () => {
    try {
      setLoading(true)
      const codes = await loaderService.getAllInviteCodes()
      setInviteCodes(codes)
    } catch (error) {
      prodError('Error loading invite codes:', error)
      alert('فشل تحميل رموز الدعوة')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateCode = async () => {
    try {
      const code = await loaderService.createInviteCode(user.uid)
      setNewCode(code)
      await loadInviteCodes()
    } catch (error) {
      prodError('Error generating invite code:', error)
      alert('فشل إنشاء رمز الدعوة')
    }
  }

  const copyToClipboard = (code) => {
    const url = `${window.location.origin}/loader/${code}`
    navigator.clipboard.writeText(url)
    alert('تم نسخ رابط الدعوة!')
  }

  const handleRevokeCode = async (codeId, code) => {
    if (!window.confirm(`هل أنت متأكد من إلغاء رمز الدعوة ${code}؟\n\nلن يتمكن أي شخص من استخدامه بعد الآن.`)) {
      return
    }

    try {
      await loaderService.revokeInviteCode(codeId)
      await loadInviteCodes()
      alert('تم إلغاء رمز الدعوة بنجاح')
    } catch (error) {
      prodError('Error revoking invite code:', error)
      alert('فشل إلغاء رمز الدعوة: ' + error.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">إدارة رموز الدعوة</h2>
        <button
          onClick={handleGenerateCode}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          + إنشاء رمز دعوة جديد
        </button>
      </div>

      {newCode && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
          <h3 className="font-bold text-green-800 mb-2">✅ تم إنشاء رمز دعوة جديد!</h3>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={`${window.location.origin}/loader/${newCode}`}
              readOnly
              className="flex-1 p-2 border rounded bg-white"
            />
            <button
              onClick={() => copyToClipboard(newCode)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
            >
              📋 نسخ
            </button>
          </div>
          <p className="text-sm text-green-600 mt-2">شارك هذا الرابط مع محمل الأسئلة</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">جاري التحميل...</div>
      ) : (
        <div className="space-y-4">
          {inviteCodes.length === 0 ? (
            <p className="text-gray-900 text-center py-8">لا توجد رموز دعوة بعد</p>
          ) : (
            inviteCodes.map((invite) => (
              <div
                key={invite.id}
                className={`border-2 rounded-lg p-4 ${
                  invite.revoked ? 'border-red-300 bg-red-50' :
                  invite.usedBy ? 'border-gray-300 bg-gray-50' :
                  'border-blue-300 bg-blue-50'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono font-bold text-lg">{invite.code}</span>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        invite.revoked ? 'bg-red-500 text-white' :
                        invite.usedBy ? 'bg-gray-500 text-white' :
                        'bg-green-500 text-white'
                      }`}>
                        {invite.revoked ? 'ملغي' : invite.usedBy ? 'مستخدم' : 'متاح'}
                      </span>
                    </div>
                    {invite.usedBy && (
                      <p className="text-sm text-gray-900">المستخدم: {invite.usedBy}</p>
                    )}
                    {invite.revoked && (
                      <p className="text-sm text-red-600">
                        تم الإلغاء في: {invite.revokedAt?.toDate?.().toLocaleDateString('ar-EG')}
                      </p>
                    )}
                    <p className="text-sm text-gray-900">
                      تاريخ الإنشاء: {invite.createdAt?.toDate?.().toLocaleDateString('ar-EG')}
                    </p>
                    <p className="text-sm text-gray-900">
                      ينتهي في: {invite.expiresAt?.toDate?.().toLocaleDateString('ar-EG')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!invite.usedBy && !invite.revoked && (
                      <button
                        onClick={() => copyToClipboard(invite.code)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                      >
                        📋 نسخ الرابط
                      </button>
                    )}
                    {!invite.revoked && (
                      <button
                        onClick={() => handleRevokeCode(invite.id, invite.code)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                      >
                        🚫 إلغاء
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default Admin