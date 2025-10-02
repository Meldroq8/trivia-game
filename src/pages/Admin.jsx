import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { importAllQuestions, addQuestionsToStorage, importBulkQuestionsToFirebase, importBulkQuestionsToFirebaseForced } from '../utils/importQuestions'
import { FirebaseQuestionsService } from '../utils/firebaseQuestions'
import { debugFirebaseAuth, testFirebaseConnection } from '../utils/firebaseDebug'
import { GameDataLoader } from '../utils/gameDataLoader'
import { deleteField } from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { ImageUploadService } from '../utils/imageUpload'
import AudioPlayer from '../components/AudioPlayer'
import LazyMediaPlayer from '../components/LazyMediaPlayer'
import SmartImage from '../components/SmartImage'
import BackgroundImage from '../components/BackgroundImage'
import { processCategoryImage, processQuestionImage, isValidImage, createPreviewUrl, cleanupPreviewUrl } from '../utils/imageProcessor'
import { getCategoryImageUrl, getQuestionImageUrl, getThumbnailUrl } from '../utils/mediaUrlConverter'
import MediaUploadManager from '../components/MediaUploadManager'

function Admin() {
  // Load saved tab from localStorage or default to 'categories'
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('adminActiveTab') || 'categories'
  })
  const navigate = useNavigate()
  const { isAdmin, isModerator, isAdminOrModerator, user, isAuthenticated, loading, userProfile, getAllUsers, updateUserRole, searchUsers } = useAuth()

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
          <p className="text-gray-600 mb-6">يجب أن تكون مديراً للوصول إلى هذه الصفحة</p>
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
            <p className="text-gray-600 mt-1">مرحباً، {user?.displayName || user?.email}</p>
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
              className={`flex-1 py-4 px-6 font-bold ${
                activeTab === 'pending'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              مراجعة الأسئلة
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
          {activeTab === 'categories' && <CategoriesManager isAdmin={isAdmin} isModerator={isModerator} />}
          {activeTab === 'questions' && <QuestionsManager isAdmin={isAdmin} isModerator={isModerator} user={user} />}
          {activeTab === 'users' && isAdmin && <UsersManager getAllUsers={getAllUsers} updateUserRole={updateUserRole} searchUsers={searchUsers} />}
          {activeTab === 'pending' && isAdmin && <PendingQuestionsManager />}
          {activeTab === 'media' && isAdminOrModerator && <MediaUploadManager />}
          {activeTab === 'settings' && isAdmin && <SettingsManager isAdmin={isAdmin} isModerator={isModerator} />}
        </div>
      </div>
    </div>
  )
}

function CategoriesManager({ isAdmin, isModerator }) {
  const [categories, setCategories] = useState([])
  const [questions, setQuestions] = useState({})
  const [uploadingImages, setUploadingImages] = useState({})
  const [showCategoryAdd, setShowCategoryAdd] = useState(false)
  const [newCategory, setNewCategory] = useState({
    name: '',
    image: '🧠',
    imageUrl: ''
  })

  useEffect(() => {
    // Load directly from Firebase - no localStorage dependency
    loadDataFromFirebase()
  }, [])

  const loadDataFromFirebase = async () => {
    try {
      console.log('🔥 Loading categories manager data from Firebase...')
      const gameData = await GameDataLoader.loadGameData(true) // Force refresh

      if (gameData) {
        setCategories(gameData.categories || [])
        setQuestions(gameData.questions || {})
        console.log('✅ Categories manager data loaded from Firebase')
      }
    } catch (error) {
      console.error('❌ Error loading categories manager data:', error)
      // Only fallback to sample data if Firebase completely fails
      try {
        const module = await import('../data/sampleQuestions.json')
        setCategories(module.default.categories || [])
        setQuestions(module.default.questions || {})
      } catch (sampleError) {
        console.error('❌ Error loading sample data:', sampleError)
      }
    }
  }

  const saveCategories = async (newCategories) => {
    setCategories(newCategories)
    // Save directly to Firebase - no localStorage
    try {
      console.log('🔥 Saving categories to Firebase...')
      // Update each category in Firebase (skip mystery category)
      for (const category of newCategories) {
        // Handle mystery category separately - save to localStorage
        if (category.id === 'mystery') {
          console.log('💾 Saving mystery category to localStorage')
          localStorage.setItem('mystery_category_settings', JSON.stringify({
            name: category.name,
            color: category.color,
            image: category.image,
            imageUrl: category.imageUrl,
            showImageInQuestion: category.showImageInQuestion,
            showImageInAnswer: category.showImageInAnswer
          }))
          continue
        }
        await FirebaseQuestionsService.updateCategory(category.id, {
          name: category.name,
          color: category.color,
          image: category.image,
          imageUrl: category.imageUrl,
          showImageInQuestion: category.showImageInQuestion,
          showImageInAnswer: category.showImageInAnswer
        })
      }
      console.log('✅ Categories saved to Firebase')

      // Clear game data cache to force reload with updated mystery category
      GameDataLoader.clearCache()
    } catch (error) {
      console.error('❌ Error saving categories to Firebase:', error)
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

      console.log('Processing category image...')

      // Process the image (resize to 400x300 WebP)
      const { blob, info } = await processCategoryImage(file)

      console.log('Image processed:', info)

      // Convert blob to file for upload
      const processedFile = new File([blob], `category_${categoryId}_${Date.now()}.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      // Upload to CloudFront/S3
      console.log('Uploading processed category image to CloudFront/S3...')
      const downloadURL = await ImageUploadService.uploadCategoryImage(processedFile, categoryId)

      // Update category with new image URL
      handleImageUrlChange(categoryId, downloadURL)

      console.log('Category image uploaded successfully:', downloadURL)
      alert(`تم رفع الصورة بنجاح!\n📏 الأبعاد: ${info.dimensions}\n📦 الحجم الأصلي: ${info.originalSize}\n🗜️ الحجم الجديد: ${info.newSize}\n📉 نسبة الضغط: ${info.compression}`)

    } catch (error) {
      console.error('Error processing/uploading category image:', error)
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
    const categoryQuestions = questions[categoryId] || []
    const questionCount = categoryQuestions.length

    const confirmMessage = questionCount > 0
      ? `هل أنت متأكد من حذف فئة "${category?.name}" مع جميع أسئلتها (${questionCount} سؤال)؟\n\nلا يمكن التراجع عن هذا الإجراء!`
      : `هل أنت متأكد من حذف فئة "${category?.name}"؟`

    if (!window.confirm(confirmMessage)) {
      return
    }

    try {
      console.log(`🗑️ Starting deletion of category: ${categoryId}`)

      // Delete from Firebase (this will delete category and all its questions)
      const result = await FirebaseQuestionsService.deleteCategory(categoryId)

      console.log(`✅ Category deletion result:`, result)

      // Update local state - remove category
      const updatedCategories = categories.filter(cat => cat.id !== categoryId)
      setCategories(updatedCategories)

      // Update local state - remove all questions in this category
      const updatedQuestions = { ...questions }
      delete updatedQuestions[categoryId]
      setQuestions(updatedQuestions)

      // Clear cache and reload from Firebase to ensure sync
      GameDataLoader.clearCache()
      await loadDataFromFirebase()

      alert(`✅ تم حذف فئة "${category?.name}" بنجاح!\n\nتم حذف ${result.deletedQuestionsCount} سؤال من Firebase.`)

    } catch (error) {
      console.error('❌ Error deleting category:', error)
      alert('حدث خطأ أثناء حذف الفئة. يرجى المحاولة مرة أخرى.')
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
      console.error('Error creating category:', error)
      alert('حدث خطأ في إنشاء الفئة')
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
      console.log(processingMsg)

      // Process the image (resize to 400x300 WebP)
      const { blob, info } = await processCategoryImage(file)

      console.log('Image processed:', info)

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
      console.error('Error processing/uploading category image:', error)
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
              <h3 className="font-bold text-lg">{category.name}</h3>
              <p className="text-sm text-blue-600 font-bold">
                {(questions[category.id] || []).length} سؤال
              </p>
            </div>

            {/* Image URL Input */}
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2">رابط الصورة (URL)</label>
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
                  <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-blue-500 bg-blue-100">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    جاري رفع الصورة...
                  </div>
                </div>
              )}
              <div className="text-xs text-gray-500 mt-1">
                ☁️ <strong>CloudFront/S3:</strong> اختر ملف من جهازك ليتم رفعه تلقائياً إلى السحابة<br/>
                🌐 أو أدخل رابط صورة من الإنترنت (JPG, PNG, WebP) - حد أقصى 5MB
              </div>
            </div>

            {/* Fallback Emoji Editor */}
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2">إيموجي احتياطي (في حالة عدم تحميل الصورة)</label>
              <input
                type="text"
                value={category.image}
                onChange={(e) => handleImageChange(category.id, e.target.value)}
                className="w-full p-2 border rounded-lg text-center text-2xl"
                placeholder="اختر إيموجي"
              />
              <div className="text-xs text-gray-500 mt-1">
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
              <div className="text-xs text-gray-500 mt-1">
                يمكنك التحكم في متى تظهر صور الأسئلة في هذه الفئة
              </div>
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
                  <div className="font-bold">{category.name}</div>
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
                  <label className="block text-sm font-bold mb-2">اسم الفئة *</label>
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
                  <label className="block text-sm font-bold mb-2">إيموجي الفئة</label>
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
                  <label className="block text-sm font-bold mb-2">رابط الصورة (اختياري)</label>
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
                  <label className="block text-sm font-bold mb-2">أو ارفع صورة من جهازك</label>
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
                  <div className="text-xs text-gray-500 mt-1">
                    سيتم رفع الصورة إلى CloudFront/S3 تلقائياً
                  </div>
                </div>
              </div>

              {/* Preview */}
              {(newCategory.name || newCategory.image || newCategory.imageUrl) && (
                <div className="mt-6">
                  <label className="block text-sm font-bold mb-2">معاينة الفئة</label>
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
                        <div className="font-bold">{newCategory.name || 'اسم الفئة'}</div>
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
          <p className="text-xs text-gray-600 mt-2">
            استخدم "المسح الشامل" إذا كانت البيانات المؤقتة مستمرة رغم المسح العادي
          </p>
        </div>
      )}
    </div>
  )
}

function QuestionsManager({ isAdmin, isModerator, user }) {
  const [questions, setQuestions] = useState({})
  const [categories, setCategories] = useState([])
  const [bulkQuestions, setBulkQuestions] = useState('')
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [showSingleAdd, setShowSingleAdd] = useState(false)
  const [singleQuestion, setSingleQuestion] = useState({
    categoryId: '',
    difficulty: 'easy',
    text: '',
    answer: '',
    choices: ['', '', '', ''],
    explanation: '',
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
    console.log('🔄 Admin loadData called')
    try {
      // Load from Firebase first, with localStorage as cache
      console.log('📥 Loading data from Firebase...')
      const gameData = await GameDataLoader.loadGameData()

      if (gameData) {
        console.log('✅ Admin: Loaded data from Firebase:', {
          categories: gameData.categories?.length || 0,
          questions: Object.keys(gameData.questions || {}).length
        })

        setCategories(gameData.categories || [])

        // Transform Firebase data format to admin format
        const transformedQuestions = gameData.questions || {}
        setQuestions(transformedQuestions)

        // Debug: Check if questions have Firebase IDs
        Object.entries(transformedQuestions).forEach(([categoryId, categoryQuestions]) => {
          categoryQuestions.forEach((question, index) => {
            if (!question.id) {
              console.warn(`⚠️ Question at ${categoryId}[${index}] has no Firebase ID:`, question.text)
            }
          })
        })

        console.log('📊 Admin data loaded successfully')
      } else {
        throw new Error('No game data received from Firebase')
      }
    } catch (error) {
      console.error('❌ Admin: Error loading from Firebase:', error)

      // Fallback to localStorage
      console.log('🔄 Admin: Falling back to localStorage...')
      const savedData = localStorage.getItem('triviaData')
      if (savedData) {
        try {
          const data = JSON.parse(savedData)
          console.log('📦 Admin: Using localStorage fallback')

          // Ensure questions object exists
          if (!data.questions) {
            data.questions = {}
            localStorage.setItem('triviaData', JSON.stringify(data))
          }

          setQuestions(data.questions || {})
          setCategories(data.categories || [])
        } catch (parseError) {
          console.error('❌ Error parsing localStorage:', parseError)
          await loadSampleDataFallback()
        }
      } else {
        await loadSampleDataFallback()
      }
    }
  }

  const loadSampleDataFallback = async () => {
    console.log('📄 Admin: Loading sample data as final fallback')
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
      console.log('💾 Sample data saved to localStorage')
    } catch (error) {
      console.error('❌ Error loading sample data:', error)
      setQuestions({})
      setCategories([])
    }
  }

  useEffect(() => {
    loadData()
  }, [])


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
    console.log('💾 saveQuestions called with:', newQuestions)
    console.log('🔍 Current questions state before update:', questions)

    setQuestions(newQuestions)
    console.log('✅ setQuestions called')

    // Save directly to Firebase - no localStorage
    try {
      console.log('🔥 Saving questions to Firebase...')
      // Note: Individual question updates will be handled by the question editing functions
      // This is just for updating the local state
      console.log('✅ Questions state updated')
    } catch (error) {
      console.error('❌ Error updating questions state:', error)
    }
  }

  const loadDataForceRefresh = async () => {
    console.log('🔄 Admin loadDataForceRefresh called - bypassing cache')
    try {
      // Force refresh from Firebase by passing forceRefresh = true
      console.log('📥 Loading data from Firebase with force refresh...')
      const gameData = await GameDataLoader.loadGameData(true)

      if (gameData) {
        console.log('✅ Admin: Loaded data from Firebase (force refresh):', {
          categories: gameData.categories?.length || 0,
          questions: Object.keys(gameData.questions || {}).length
        })

        setCategories(gameData.categories || [])
        setQuestions(gameData.questions || {})

        console.log('📊 Admin data loaded successfully (force refresh)')
      } else {
        throw new Error('No game data received from Firebase')
      }
    } catch (error) {
      console.error('❌ Admin: Error loading from Firebase (force refresh):', error)
      alert('حدث خطأ أثناء تحديث البيانات من Firebase')
    }
  }

  const parseBulkQuestions = (text) => {
    if (!text || typeof text !== 'string') {
      console.error('❌ Invalid text provided to parseBulkQuestions:', text)
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
          console.log('🎵 Importing question with audio:', {
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
      console.log('🔥 Saving categories to Firebase...')
      // Update each category in Firebase (skip mystery category)
      for (const category of newCategories) {
        // Handle mystery category separately - save to localStorage
        if (category.id === 'mystery') {
          console.log('💾 Saving mystery category to localStorage')
          localStorage.setItem('mystery_category_settings', JSON.stringify({
            name: category.name,
            color: category.color,
            image: category.image,
            imageUrl: category.imageUrl,
            showImageInQuestion: category.showImageInQuestion,
            showImageInAnswer: category.showImageInAnswer
          }))
          continue
        }
        await FirebaseQuestionsService.updateCategory(category.id, {
          name: category.name,
          color: category.color,
          image: category.image,
          imageUrl: category.imageUrl,
          showImageInQuestion: category.showImageInQuestion,
          showImageInAnswer: category.showImageInAnswer
        })
      }
      console.log('✅ Categories saved to Firebase')

      // Clear game data cache to force reload with updated mystery category
      GameDataLoader.clearCache()
    } catch (error) {
      console.error('❌ Error saving categories to Firebase:', error)
    }
  }

  const handleBulkAdd = async () => {
    if (!bulkQuestions || !bulkQuestions.trim()) {
      alert('يرجى إدخال الأسئلة')
      return
    }

    try {
      console.log('🔥 Starting Firebase-only bulk add process...')
      console.log('Bulk questions input length:', bulkQuestions.length)

      // Clear cache before import to ensure fresh data for duplicate detection
      GameDataLoader.clearCache()
      console.log('🗑️ Cleared cache before import for fresh duplicate detection')

      // Small delay to ensure Firebase consistency after recent deletions
      await new Promise(resolve => setTimeout(resolve, 500))

      // Import directly to Firebase - use force import if checkbox is checked
      const firebaseResult = forceImport
        ? await importBulkQuestionsToFirebaseForced(bulkQuestions)
        : await importBulkQuestionsToFirebase(bulkQuestions)
      console.log('Firebase import result:', firebaseResult)

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
        console.error('Import errors:', fbResults.questions.errors)
      }

      alert(message)

      // Refresh data from Firebase to show new questions immediately
      console.log('🔄 Refreshing data from Firebase...')
      await loadDataForceRefresh()

    } catch (error) {
      console.error('❌ Firebase bulk add error:', error)
      alert('فشل في إضافة الأسئلة إلى Firebase: ' + error.message)
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
          console.log(`🗑️ Deleting question from Firebase: ${questionToDelete.id}`)
          // Delete from Firebase first
          await FirebaseQuestionsService.deleteQuestion(questionToDelete.id)
          console.log(`✅ Question deleted from Firebase successfully`)
        } else {
          console.warn('⚠️ Question has no Firebase ID, skipping Firebase deletion')
        }

        // Update local state immediately without page refresh
        const updatedQuestions = { ...questions }
        updatedQuestions[categoryId].splice(questionIndex, 1)
        setQuestions(updatedQuestions)

        console.log(`✅ Question deleted successfully from ${categoryId} at index ${questionIndex}`)

      } catch (error) {
        console.error('❌ Error deleting question:', error)
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
        console.log('Processing image before upload...')
        const { blob, info } = await processQuestionImage(file)

        // Convert blob to File for upload
        const extension = 'webp'
        const fileName = `question_${Date.now()}.${extension}`
        fileToUpload = new File([blob], fileName, {
          type: 'image/webp',
          lastModified: Date.now(),
        })

        compressionInfo = info
        console.log('Image processed:', info)
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
      console.error('Error uploading media:', error)
      alert('فشل في رفع الملف: ' + error.message)
    } finally {
      setUploadingMedia(prev => ({ ...prev, [fieldName]: false }))
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

    // Clear the last edited category flag after a short delay
    setTimeout(() => setLastEditedCategory(null), 100)
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
        console.log('🗑️ Deleted imageUrl from updatedQuestion')
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
        console.log(`💾 Updating question in Firebase: ${question.id}`)
        console.log(`🔥 Firebase update object:`, firebaseUpdate)
        await FirebaseQuestionsService.updateQuestion(question.id, firebaseUpdate)
        console.log(`✅ Question updated in Firebase successfully`)
      }

      // Update local state
      console.log('📝 Final updatedQuestion object:', updatedQuestion)
      console.log('🖼️ imageUrl in updatedQuestion:', updatedQuestion.imageUrl)

      const updatedQuestions = { ...questions }
      updatedQuestions[categoryId][questionIndex] = updatedQuestion

      console.log('📋 Updated questions state:', updatedQuestions[categoryId][questionIndex])

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

      // Clear the last edited category flag after a VERY long delay to prevent auto-collapse
      setTimeout(() => setLastEditedCategory(null), 10000)

      console.log('✅ Question updated successfully')
    } catch (error) {
      console.error('❌ Error updating question:', error)
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

  const deleteCategory = async (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId)
    const questionCount = (questions[categoryId] || []).length

    const confirmMessage = questionCount > 0
      ? `هل أنت متأكد من حذف فئة "${category?.name}" مع جميع أسئلتها (${questionCount} سؤال)؟\n\nلا يمكن التراجع عن هذا الإجراء!`
      : `هل أنت متأكد من حذف فئة "${category?.name}"؟`

    if (window.confirm(confirmMessage)) {
      try {
        console.log(`🗑️ Starting deletion of category: ${categoryId}`)

        // Delete from Firebase (this will delete category and all its questions)
        const result = await FirebaseQuestionsService.deleteCategory(categoryId)

        console.log(`✅ Category deletion result:`, result)

        // Update local state - remove category
        const updatedCategories = categories.filter(cat => cat.id !== categoryId)
        setCategories(updatedCategories)

        // Update local state - remove all questions in this category
        const updatedQuestions = { ...questions }
        delete updatedQuestions[categoryId]
        setQuestions(updatedQuestions)

        // Clear cache and reload data from Firebase
        GameDataLoader.clearCache()
        await loadData()

        alert(`✅ تم حذف فئة "${category?.name}" بنجاح!\n\nتم حذف ${result.deletedQuestionsCount} سؤال من Firebase.`)

      } catch (error) {
        console.error('❌ Error deleting category:', error)
        alert('حدث خطأ أثناء حذف الفئة. يرجى المحاولة مرة أخرى.')
      }
    }
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
        console.log(`💾 Updating question difficulty in Firebase: ${question.id}`)
        await FirebaseQuestionsService.updateQuestion(question.id, {
          difficulty: question.difficulty,
          points: question.points
        })
        console.log(`✅ Question difficulty updated in Firebase successfully`)
      } else {
        console.warn(`⚠️ Question has no Firebase ID, cannot save to Firebase`)
      }

      // Update local state immediately
      setQuestions(updatedQuestions)

      // Clear cache to ensure fresh data on next reload
      GameDataLoader.clearCache()

      console.log(`✅ Difficulty changed from ${oldDifficulty} (${oldPoints} pts) to ${newDifficulty} (${question.points} pts)`)
      console.log(`🔥 Firebase update completed, cache cleared for fresh data on reload`)
    } catch (error) {
      console.error('❌ Error updating question difficulty:', error)
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

      console.log('Processing question image...')

      // Process the image (resize to 400x300 WebP)
      const { blob, info } = await processCategoryImage(file)

      console.log('Question image processed:', info)

      // Convert blob to file for upload
      const processedFile = new File([blob], `question_${categoryId}_${questionIndex}_${Date.now()}.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      // Upload to CloudFront/S3
      console.log('Uploading processed question image to CloudFront/S3...')
      const downloadURL = await ImageUploadService.uploadQuestionImage(processedFile, `${categoryId}_${questionIndex}`)

      // Update question with new image URL
      updateQuestionField(categoryId, questionIndex, 'imageUrl', downloadURL)

      console.log('Question image uploaded successfully:', downloadURL)
      alert(`تم رفع صورة السؤال بنجاح!\n📏 الأبعاد: ${info.dimensions}\n📦 الحجم الأصلي: ${info.originalSize}\n🗜️ الحجم الجديد: ${info.newSize}\n📉 نسبة الضغط: ${info.compression}`)

    } catch (error) {
      console.error('Error processing/uploading question image:', error)
      alert('فشل في معالجة أو رفع صورة السؤال: ' + error.message)
    } finally {
      // Clear loading state
      setUploadingQuestionImages(prev => ({ ...prev, [questionKey]: false }))
    }
  }

  const updateQuestionField = (categoryId, questionIndex, field, newValue, optionIndex = null) => {
    console.log('🔧 updateQuestionField called:', {
      categoryId,
      questionIndex,
      field,
      newValue,
      optionIndex
    });

    // Special handling for test category
    if (categoryId === 'test') {
      console.log('🧪 Test category detected - just logging the change');
      console.log('📝 Test field update:', field, '=', newValue);
      return;
    }

    const updatedQuestions = { ...questions }
    const categoryQuestions = updatedQuestions[categoryId] ? [...updatedQuestions[categoryId]] : []

    if (!categoryQuestions || categoryQuestions.length === 0) {
      console.error('❌ No questions found for category:', categoryId);
      console.log('🔍 Available categories:', Object.keys(questions));
      return;
    }

    if (questionIndex >= categoryQuestions.length || questionIndex < 0) {
      console.error('❌ Invalid question index:', questionIndex, 'for category with', categoryQuestions.length, 'questions');
      return;
    }

    const question = { ...categoryQuestions[questionIndex] }

    if (field === 'options' && optionIndex !== null) {
      const newOptions = [...(question.options || [])]
      newOptions[optionIndex] = newValue
      question.options = newOptions
      console.log('📝 Updated option:', newOptions);
    } else {
      question[field] = newValue
      console.log('📝 Updated field:', field, '=', newValue);
    }

    categoryQuestions[questionIndex] = question
    updatedQuestions[categoryId] = categoryQuestions

    console.log('💾 Calling saveQuestions...');
    saveQuestions(updatedQuestions)
    console.log('✅ updateQuestionField completed');
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

      console.log('🚀 Submitting question with media:', {
        hasQuestionImage: !!newQuestion.imageUrl,
        hasAnswerImage: !!newQuestion.answerImageUrl,
        hasQuestionAudio: !!newQuestion.audioUrl,
        hasAnswerAudio: !!newQuestion.answerAudioUrl,
        hasQuestionVideo: !!newQuestion.videoUrl,
        hasAnswerVideo: !!newQuestion.answerVideoUrl,
        answerVideoUrl: newQuestion.answerVideoUrl,
        audioUrl: newQuestion.audioUrl,
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
        imageUrl: null,
        answerImageUrl: null,
        audioUrl: null,
        answerAudioUrl: null,
        videoUrl: null,
        answerVideoUrl: null
      })

      setShowSingleAdd(false)
    } catch (error) {
      console.error('Error adding single question:', error)
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
      console.log('Processing single question image...')

      // Process the image (resize to 400x300 WebP)
      const { blob, info } = await processCategoryImage(file)

      console.log('Single question image processed:', info)

      // Convert blob to file for upload
      const processedFile = new File([blob], `single_question_${Date.now()}.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      const downloadURL = await ImageUploadService.uploadQuestionImage(processedFile, `single_${Date.now()}`)
      setSingleQuestion(prev => ({ ...prev, imageUrl: downloadURL }))
      alert(`تم رفع الصورة بنجاح!\n📏 الأبعاد: ${info.dimensions}\n📦 الحجم الأصلي: ${info.originalSize}\n🗜️ الحجم الجديد: ${info.newSize}\n📉 نسبة الضغط: ${info.compression}`)
    } catch (error) {
      console.error('Error processing/uploading image:', error)
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
      console.log('Processing single answer image...')

      // Process the image (resize to 400x300 WebP)
      const { blob, info } = await processCategoryImage(file)

      console.log('Single answer image processed:', info)

      // Convert blob to file for upload
      const processedFile = new File([blob], `single_answer_${Date.now()}.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
      })

      const downloadURL = await ImageUploadService.uploadQuestionImage(processedFile, `single_answer_${Date.now()}`)
      setSingleQuestion(prev => ({ ...prev, answerImageUrl: downloadURL }))
      alert(`تم رفع صورة الجواب بنجاح!\n📏 الأبعاد: ${info.dimensions}\n📦 الحجم الأصلي: ${info.originalSize}\n🗜️ الحجم الجديد: ${info.newSize}\n📉 نسبة الضغط: ${info.compression}`)
    } catch (error) {
      console.error('Error processing/uploading answer image:', error)
      alert('فشل في معالجة أو رفع صورة الجواب: ' + error.message)
    }
  }

  // Media upload handlers
  const handleSingleQuestionAudioUpload = async (file) => {
    if (!file) return

    try {
      console.log('Uploading question audio...')
      const downloadURL = await ImageUploadService.uploadQuestionMedia(file, `question_audio_${Date.now()}`)
      setSingleQuestion(prev => ({ ...prev, audioUrl: downloadURL }))
      alert('تم رفع ملف الصوت بنجاح!')
    } catch (error) {
      console.error('Error uploading question audio:', error)
      alert('حدث خطأ في رفع ملف الصوت: ' + error.message)
    }
  }

  const handleSingleAnswerAudioUpload = async (file) => {
    if (!file) return

    try {
      console.log('Uploading answer audio...')
      const downloadURL = await ImageUploadService.uploadQuestionMedia(file, `answer_audio_${Date.now()}`)
      setSingleQuestion(prev => ({ ...prev, answerAudioUrl: downloadURL }))
      alert('تم رفع ملف صوت الجواب بنجاح!')
    } catch (error) {
      console.error('Error uploading answer audio:', error)
      alert('حدث خطأ في رفع ملف صوت الجواب: ' + error.message)
    }
  }

  const handleSingleQuestionVideoUpload = async (file) => {
    if (!file) return

    try {
      console.log('Uploading question video...')
      const downloadURL = await ImageUploadService.uploadQuestionMedia(file, `question_video_${Date.now()}`)
      setSingleQuestion(prev => ({ ...prev, videoUrl: downloadURL }))
      alert('تم رفع ملف الفيديو بنجاح!')
    } catch (error) {
      console.error('Error uploading question video:', error)
      alert('حدث خطأ في رفع ملف الفيديو: ' + error.message)
    }
  }

  const handleSingleAnswerVideoUpload = async (file) => {
    if (!file) return

    try {
      console.log('🎬 Uploading answer video...', file.name)
      const downloadURL = await ImageUploadService.uploadQuestionMedia(file, `answer_video_${Date.now()}`)
      console.log('✅ Answer video uploaded successfully:', downloadURL)
      setSingleQuestion(prev => {
        const newState = { ...prev, answerVideoUrl: downloadURL }
        console.log('📝 Updated singleQuestion state with answerVideoUrl:', newState.answerVideoUrl)
        return newState
      })
      alert('تم رفع فيديو الجواب بنجاح!')
    } catch (error) {
      console.error('❌ Error uploading answer video:', error)
      alert('حدث خطأ في رفع فيديو الجواب: ' + error.message)
    }
  }


  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">إدارة الأسئلة</h2>
          <p className="text-gray-600 text-sm">
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
                  console.log('Firebase Stats:', stats)
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
                console.log('=== LOCAL DEBUG INFO ===')
                console.log('Questions state:', questions)
                console.log('Categories state:', categories)
                console.log('localStorage:', localStorage.getItem('triviaData'))

                console.log('\n=== FIREBASE DEBUG INFO ===')
                await debugFirebaseAuth()
                await testFirebaseConnection()

                // Check current user's Firestore document
                if (user?.uid) {
                  try {
                    const { getDoc, doc } = await import('firebase/firestore')
                    const { db } = await import('../firebase/config')
                    const userDoc = await getDoc(doc(db, 'users', user.uid))
                    console.log('\n=== USER FIRESTORE DOCUMENT ===')
                    console.log('Document exists:', userDoc.exists())
                    if (userDoc.exists()) {
                      console.log('Document data:', userDoc.data())
                      console.log('isAdmin field:', userDoc.data().isAdmin)
                      console.log('isAdmin type:', typeof userDoc.data().isAdmin)
                    }
                  } catch (error) {
                    console.error('Error fetching user document:', error)
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
                    console.error('Error clearing Firebase data:', error)
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
                console.log('🔄 Force refreshing from Firebase...')
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
                    console.log('Loading sample data to Firebase...')
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
                    console.error('Error loading sample data:', error)
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
              className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
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
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) handleSingleQuestionImageUpload(file)
                  }}
                  className="w-full p-1 border rounded text-xs text-gray-900 bg-white"
                />
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
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) handleSingleQuestionAudioUpload(file)
                  }}
                  className="w-full p-1 border rounded text-xs text-gray-900 bg-white"
                />
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
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) handleSingleQuestionVideoUpload(file)
                  }}
                  className="w-full p-1 border rounded text-xs text-gray-900 bg-white"
                />
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
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) handleSingleAnswerImageUpload(file)
                  }}
                  className="w-full p-1 border rounded text-xs text-gray-900 bg-white"
                />
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
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) handleSingleAnswerAudioUpload(file)
                  }}
                  className="w-full p-1 border rounded text-xs text-gray-900 bg-white"
                />
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
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) handleSingleAnswerVideoUpload(file)
                  }}
                  className="w-full p-1 border rounded text-xs text-gray-900 bg-white"
                />
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
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
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
          <h3 className="text-xl font-bold">إضافة أسئلة مجمعة</h3>
          <button
            onClick={() => setShowBulkAdd(!showBulkAdd)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            {showBulkAdd ? 'إخفاء' : 'إظهار'} الإضافة المجمعة
          </button>
        </div>

        {showBulkAdd && (
          <div>

            {/* Instructions */}
            <div className="bg-blue-50 p-4 rounded-lg mb-4">
              <h4 className="font-bold text-blue-800 mb-2">تعليمات التنسيق:</h4>
              <div className="text-blue-700 text-sm space-y-1">
                <p>• استخدم الفاصلة المنقوطة العربية (؛) للفصل بين الأجزاء</p>
                <p>• كل سؤال في سطر واحد مقسم كالتالي:</p>
                <p><strong>السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛رابط الصوت؛رابط الصورة؛مستوى الصعوبة</strong></p>
                <p>• يمكن ترك الخيارات فارغة للأسئلة النصية</p>
                <p>• مستوى الصعوبة: سهل/متوسط/صعب أو easy/medium/hard</p>
                <p>• <strong>🎵 رابط الصوت:</strong> اختياري - مثل: images/songseng/Skyfall_Adele.mp3</p>
                <p>• <strong>🖼️ رابط الصورة:</strong> اختياري - مثل: images/songsimg/Skyfall_Adele.jpg</p>
                <p>• <strong>✨ الفئة مطلوبة:</strong> يجب تحديد الفئة في العمود السابع، وإذا لم تكن موجودة سيتم إنشاؤها تلقائياً!</p>
                <p>• <strong>🔄 لا حاجة لاختيار فئة مسبقاً:</strong> النظام سيوزع الأسئلة على الفئات المحددة في كل سؤال</p>
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
                <p>• <strong>🎵 دعم كامل للصوت والصور:</strong> يدعم ملفات MP3 و JPG حسب التنسيق الجديد</p>
                <p>• <strong>⚡ أداء محسن:</strong> لا يحفظ في localStorage - Firebase فقط للموثوقية</p>
              </div>
            </div>

            {/* Auto Category Creation Info */}
            <div className="bg-green-50 p-4 rounded-lg mb-4">
              <h4 className="font-bold text-green-800 mb-2">✨ إنشاء الفئات التلقائي</h4>
              <div className="text-green-700 text-sm space-y-1">
                <p>• إذا كتبت فئة جديدة في عمود "الفئة"، سيتم إنشاؤها تلقائياً</p>
                <p>• الفئات الجديدة ستظهر في لوحة اللعبة وفي قائمة إدارة الفئات</p>
                <p>• يمكنك تعديل لون وصورة الفئة الجديدة من تبويب "إدارة الفئات"</p>
                <p>• إذا تركت عمود الفئة فارغاً، سيتم إضافة السؤال لفئة "عام"</p>
              </div>
            </div>

            {/* Example */}
            <div className="bg-green-50 p-4 rounded-lg mb-4">
              <h4 className="font-bold text-green-800 mb-2">🎯 أمثلة التنسيق الجديد المبسط (باستخدام البادئات):</h4>
              <pre className="text-green-700 text-sm whitespace-pre-line" style={{ direction: 'ltr', textAlign: 'left' }}>{`ما اسم هذا الحيوان؟؛أسد؛أسد؛نمر؛فهد؛ذئب؛حيوانات؛Q:lion.jpg|QA:lion_roar.mp3|AV:lion_facts.mp4؛سهل

من غنى هذه الأغنية؟؛Adele - Skyfall؛Taylor Swift؛Harry Styles؛Adele؛The Weeknd؛اغاني اجنبية؛QA:skyfall.mp3|Q:adele.jpg|AA:skyfall_answer.mp3|A:album.jpg؛متوسط

شاهد الفيديو واجب على السؤال؟؛باريس؛باريس؛لندن؛روما؛برلين؛سفر؛QV:paris_tour.mp4|A:paris_answer.jpg|AV:paris_facts.mp4؛صعب

سؤال بصورة فقط؛جواب؛؛؛؛؛فئة؛Q:question_image.jpg؛سهل

سؤال بصوت فقط؛جواب؛؛؛؛؛فئة؛QA:question_audio.mp3؛سهل`}</pre>

              <h4 className="font-bold text-green-800 mb-2 mt-4">📱 أمثلة التنسيق القديم (مدعوم):</h4>
              <pre className="text-green-700 text-sm whitespace-pre-line" style={{ direction: 'ltr', textAlign: 'left' }}>{`من غنى هذه الأغنية؟؛Adele - Skyfall؛Taylor Swift؛Harry Styles؛Adele؛The Weeknd؛اغاني اجنبية؛images/songseng/Skyfall_Adele.mp3؛images/songsimg/Skyfall_Adele.jpg؛سهل

ما هي الدولة الملونة بالأحمر في الخريطة؟؛هنغاريا؛هنغاريا؛هولندا؛الهند؛هايتي؛خرائط؛؛images/Flags/countries/Hungary_map.svg؛متوسط

من اكتشف الجاذبية؟؛إسحاق نيوتن؛؛؛؛؛علوم؛؛؛متوسط`}</pre>
              <div className="text-green-600 text-xs mt-2">
                <p><strong>🎯 التنسيق الجديد المبسط (مع دعم الفيديو والصوت):</strong></p>
                <p className="bg-green-50 p-2 rounded mt-1 mb-2 font-mono text-xs">
                  السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛الوسائط؛مستوى الصعوبة
                </p>
                <p><strong>📱 التنسيق القديم المدعوم:</strong> السؤال؛الجواب؛خيار1؛خيار2؛خيار3؛خيار4؛الفئة؛رابط الصوت؛رابط الصورة؛مستوى الصعوبة</p>

                <div className="mt-3 space-y-1">
                  <p><strong>📝 قواعد الأسئلة:</strong></p>
                  <p>• أسئلة متعددة الخيارات: املأ جميع الخيارات الأربعة</p>
                  <p>• أسئلة نصية: اترك الخيارات فارغة (؛؛؛؛)</p>
                  <p>• <strong>الفئة مطلوبة:</strong> كل سؤال يجب أن يحدد فئته</p>

                  <p><strong>🎥 قواعد الوسائط الجديدة (باستخدام البادئات):</strong></p>
                  <p>• <strong>للسؤال:</strong> Q:صورة.jpg | QA:صوت.mp3 | QV:فيديو.mp4</p>
                  <p>• <strong>للجواب:</strong> A:صورة.jpg | AA:صوت.mp3 | AV:فيديو.mp4</p>
                  <p>• <strong>مثال كامل:</strong> Q:lion.jpg|QA:roar.mp3|AV:facts.mp4</p>
                  <p>• اترك الوسائط فارغة إذا لم تكن هناك وسائط</p>

                  <p><strong>🏷️ البادئات المدعومة:</strong></p>
                  <p>• Q, QI, Q_IMG → صورة السؤال | QA, Q_AUDIO → صوت السؤال | QV, Q_VIDEO → فيديو السؤال</p>
                  <p>• A, AI, A_IMG → صورة الجواب | AA, A_AUDIO → صوت الجواب | AV, A_VIDEO → فيديو الجواب</p>

                  <p><strong>⚙️ إعدادات أخرى:</strong></p>
                  <p>• مستوى الصعوبة: سهل / متوسط / صعب</p>
                  <p>• فئات جديدة سيتم إنشاؤها تلقائياً</p>
                </div>
              </div>
            </div>

            {/* Bulk Input */}
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2">الأسئلة (بالتنسيق المطلوب):</label>
              <textarea
                value={bulkQuestions}
                onChange={(e) => setBulkQuestions(e.target.value)}
                className="w-full h-64 p-3 border rounded-lg font-mono text-sm"
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
                  <h3 className="text-xl font-bold mb-2">
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

                <button
                  onClick={() => toggleCategoryCollapse(category.id)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-lg text-sm font-bold transition-colors"
                >
                  {collapsedCategories.has(category.id) ? '▼ إظهار' : '▲ إخفاء'}
                </button>
              </div>

              {!collapsedCategories.has(category.id) && (
                filteredQuestions.length === 0 ? (
                  <p className="text-gray-500">
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
                              <label className="block text-xs font-bold mb-1 text-gray-600">صوت السؤال:</label>
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
                              <label className="block text-xs font-bold mb-1 text-gray-600">فيديو السؤال:</label>
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
                              <label className="block text-xs font-bold mb-1 text-gray-600">صورة الإجابة:</label>
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
                              <label className="block text-xs font-bold mb-1 text-gray-600">صوت الإجابة:</label>
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
                              <label className="block text-xs font-bold mb-1 text-gray-600">فيديو الإجابة:</label>
                              <LazyMediaPlayer
                                src={question.answerVideoUrl}
                                type="video"
                                className="w-full max-w-xs"
                              />
                            </div>
                          )}

                          {/* Question Image Upload */}
                          <div className="mb-3">
                            <label className="block text-xs font-bold mb-1 text-gray-600">
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
                              <label className="block text-sm font-bold mb-2 text-yellow-800">نص السؤال:</label>
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
                                      className={`block text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                        uploadingMedia.imageUrl
                                          ? 'bg-gray-400 text-white cursor-not-allowed'
                                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                                      }`}
                                    >
                                      {uploadingMedia.imageUrl ? '⏳ جاري الرفع...' : '📤 رفع صورة'}
                                    </label>
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
                                      className={`block text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                        uploadingMedia.audioUrl
                                          ? 'bg-gray-400 text-white cursor-not-allowed'
                                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                                      }`}
                                    >
                                      {uploadingMedia.audioUrl ? '⏳ جاري الرفع...' : '📤 رفع صوت'}
                                    </label>
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
                                      className={`block text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                        uploadingMedia.videoUrl
                                          ? 'bg-gray-400 text-white cursor-not-allowed'
                                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                                      }`}
                                    >
                                      {uploadingMedia.videoUrl ? '⏳ جاري الرفع...' : '📤 رفع فيديو'}
                                    </label>
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
                                      className={`block text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                        uploadingMedia.answerImageUrl
                                          ? 'bg-gray-400 text-white cursor-not-allowed'
                                          : 'bg-green-600 hover:bg-green-700 text-white'
                                      }`}
                                    >
                                      {uploadingMedia.answerImageUrl ? '⏳ جاري الرفع...' : '📤 رفع صورة'}
                                    </label>
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
                                      className={`block text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                        uploadingMedia.answerAudioUrl
                                          ? 'bg-gray-400 text-white cursor-not-allowed'
                                          : 'bg-green-600 hover:bg-green-700 text-white'
                                      }`}
                                    >
                                      {uploadingMedia.answerAudioUrl ? '⏳ جاري الرفع...' : '📤 رفع صوت'}
                                    </label>
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
                                      className={`block text-center py-1 px-2 rounded text-xs font-bold cursor-pointer ${
                                        uploadingMedia.answerVideoUrl
                                          ? 'bg-gray-400 text-white cursor-not-allowed'
                                          : 'bg-green-600 hover:bg-green-700 text-white'
                                      }`}
                                    >
                                      {uploadingMedia.answerVideoUrl ? '⏳ جاري الرفع...' : '📤 رفع فيديو'}
                                    </label>
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
                              <p className="text-sm font-bold text-gray-600 mb-1">الخيارات:</p>
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
                            {question.category && (
                              <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded">
                                {question.category}
                              </span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => deleteQuestion(category.id, originalIndex)}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                          >
                            حذف
                          </button>
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
      } catch (error) {
        console.error('Error loading settings:', error)
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
      console.error('Error uploading logo:', error)
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
      console.error('Error saving logo size:', error)
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
        console.error('Error removing logo:', error)
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
      console.error('Error uploading large logo:', error)
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
      console.error('Error saving large logo size:', error)
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
      console.error('Error removing large logo:', error)
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
      console.error('Error saving slogan:', error)
      alert('حدث خطأ أثناء حفظ الشعار النصي')
    }
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold mb-6">إعدادات اللعبة</h2>

      {/* Logo Upload Section */}
      <div className="bg-white p-6 rounded-xl shadow-md border">
        <h3 className="text-xl font-bold mb-4 text-gray-800">شعار اللعبة</h3>
        <p className="text-gray-600 mb-4">
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
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
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
        <p className="text-gray-600 mb-4">
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
        <p className="text-gray-600 mb-4">
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
            <p className="text-sm text-gray-500 mt-1">
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

      {/* Future Settings Placeholder */}
      <div className="bg-[#f7f2e6] p-6 rounded-xl">
        <h3 className="text-lg font-bold mb-3 text-red-800">إعدادات أخرى</h3>
        <p className="text-red-800">سيتم تطوير المزيد من الإعدادات قريباً.</p>
        <p className="text-red-600 text-sm mt-2">
          الميزات المخططة: تغيير وقت المؤقت، إعدادات العرض، نسخ احتياطي للبيانات
        </p>
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
      console.error('Error loading users:', error)
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
      console.error('Error updating user role:', error)
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
        <p className="mt-4 text-gray-600">جاري تحميل المستخدمين...</p>
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
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">المستخدم</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الإيميل</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الدور الحالي</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">تاريخ التسجيل</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">إجراءات</th>
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
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${role.color}`}>
                        {role.text}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
                          <span className="text-xs text-gray-500 px-2 py-1">لا يمكن التعديل</span>
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
            <p className="text-gray-500">
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
  const [pendingQuestions, setPendingQuestions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)

  useEffect(() => {
    loadPendingQuestions()
    loadCategories()
  }, [])

  const loadPendingQuestions = async () => {
    try {
      setLoading(true)
      const pending = await FirebaseQuestionsService.getPendingQuestions()
      setPendingQuestions(pending)
    } catch (error) {
      console.error('Error loading pending questions:', error)
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
      console.error('Error loading categories:', error)
    }
  }

  const handleApprove = async (questionId) => {
    if (!window.confirm('هل أنت متأكد من الموافقة على هذا السؤال؟')) {
      return
    }

    try {
      setProcessingId(questionId)
      await FirebaseQuestionsService.approveQuestion(questionId)
      await loadPendingQuestions()
      alert('تم الموافقة على السؤال بنجاح!')
    } catch (error) {
      console.error('Error approving question:', error)
      alert('فشل في الموافقة على السؤال')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDeny = async (questionId) => {
    const reason = prompt('سبب الرفض (اختياري):')
    if (reason === null) return // User cancelled

    try {
      setProcessingId(questionId)
      await FirebaseQuestionsService.denyQuestion(questionId, reason)
      await loadPendingQuestions()
      alert('تم رفض السؤال')
    } catch (error) {
      console.error('Error denying question:', error)
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
      await FirebaseQuestionsService.deletePendingQuestion(questionId)
      await loadPendingQuestions()
      alert('تم حذف السؤال نهائياً')
    } catch (error) {
      console.error('Error deleting pending question:', error)
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
        <p className="mt-4 text-gray-600">جاري تحميل الأسئلة المعلقة...</p>
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
          <h3 className="text-xl font-bold text-gray-600 mb-2">لا توجد أسئلة معلقة</h3>
          <p className="text-gray-500">عندما يرسل المشرفون أسئلة للمراجعة، ستظهر هنا</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingQuestions.map((question) => (
            <div key={question.id} className="bg-white rounded-lg shadow-md p-6 border-r-4 border-yellow-400">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">{question.text}</h3>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {getCategoryName(question.categoryId)}
                    </span>
                    <span className={`px-2 py-1 rounded ${getDifficultyColor(question.difficulty)}`}>
                      {getDifficultyName(question.difficulty)}
                    </span>
                    <span>
                      📅 {question.submittedAt.toLocaleDateString('ar-EG')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <strong className="text-gray-700">الإجابة:</strong>
                  <p className="mt-1">{question.answer}</p>
                </div>
                {question.options && question.options.length > 0 && (
                  <div>
                    <strong className="text-gray-700">الخيارات:</strong>
                    <ul className="mt-1 list-disc list-inside">
                      {question.options.map((option, index) => (
                        <li key={index} className="text-sm">{option}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {question.explanation && (
                <div className="mb-4">
                  <strong className="text-gray-700">التفسير:</strong>
                  <p className="mt-1">{question.explanation}</p>
                </div>
              )}

              {/* Question Media Section */}
              {(question.imageUrl || question.audioUrl || question.videoUrl) && (
                <div className="mb-4">
                  <h4 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-1">🎯 وسائط السؤال</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {question.imageUrl && (
                      <div>
                        <strong className="text-gray-700">صورة السؤال:</strong>
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
                        <strong className="text-gray-700">صوت السؤال:</strong>
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
                        <strong className="text-gray-700">فيديو السؤال:</strong>
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
                  <h4 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-1">✅ وسائط الإجابة</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {question.answerImageUrl && (
                      <div>
                        <strong className="text-gray-700">صورة الإجابة:</strong>
                        <img
                          src={question.answerImageUrl}
                          alt="صورة الإجابة"
                          className="mt-2 w-32 h-32 object-cover rounded-lg border"
                        />
                      </div>
                    )}
                    {question.answerAudioUrl && (
                      <div>
                        <strong className="text-gray-700">صوت الإجابة:</strong>
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
                        <strong className="text-gray-700">فيديو الإجابة:</strong>
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

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={() => handleApprove(question.id)}
                  disabled={processingId === question.id}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
                >
                  {processingId === question.id ? '⏳ جاري المعالجة...' : '✅ موافقة'}
                </button>
                <button
                  onClick={() => handleDeny(question.id)}
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

export default Admin