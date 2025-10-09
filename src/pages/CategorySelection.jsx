import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameDataLoader } from '../utils/gameDataLoader'
import { useAuth } from '../hooks/useAuth'
import questionUsageTracker from '../utils/questionUsageTracker'
import BackgroundImage from '../components/BackgroundImage'
import { getCategoryImageUrl } from '../utils/mediaUrlConverter'

function CategorySelection({ gameState, setGameState, stateLoaded }) {
  const [selectedCategories, setSelectedCategories] = useState(gameState.selectedCategories)
  const [availableCategories, setAvailableCategories] = useState([])
  const [loadingError, setLoadingError] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [questionCounts, setQuestionCounts] = useState({})
  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading } = useAuth()

  // Set user ID for question tracker when user changes
  useEffect(() => {
    devLog('🔧 CategorySelection: User changed:', user?.uid ? 'User ID: ' + user.uid : 'No user')
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
      devLog('✅ CategorySelection: Set questionUsageTracker user ID to:', user.uid)

      // If we have game data but hadn't set up question tracking yet, do it now
      if (gameData) {
        devLog('🔄 CategorySelection: Updating question pool after user authentication')
        questionUsageTracker.updateQuestionPool(gameData)
      }
    }
  }, [user, gameData])

  // Redirect to home if not authenticated (but only after loading is complete)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, authLoading])

  useEffect(() => {
    // Load categories from Firebase with local cache
    const loadData = async () => {
      try {
        setLoadingError(null)

        devLog('🎮 CategorySelection: Loading game data...')
        const gameData = await GameDataLoader.loadGameData()

        if (gameData && gameData.categories) {
          devLog('🔍 CategorySelection: All categories loaded:', gameData.categories)
          const mysteryCategory = gameData.categories.find(cat => cat.id === 'mystery')
          if (mysteryCategory) {
            devLog('🔍 CategorySelection: Mystery category found:', mysteryCategory)
            devLog('🔍 CategorySelection: Mystery imageUrl:', mysteryCategory.imageUrl)
          }
          setAvailableCategories(gameData.categories)
          setGameData(gameData)
          devLog('✅ CategorySelection: Loaded', gameData.categories.length, 'categories')

          // Update question pool for global usage tracking (only if user is set)
          if (user?.uid) {
            questionUsageTracker.setUserId(user.uid) // Ensure user ID is set
            questionUsageTracker.updateQuestionPool(gameData)
          } else {
            devLog('⏳ CategorySelection: Delaying questionUsageTracker until user is authenticated')
          }
        } else {
          throw new Error('No categories found in game data')
        }
      } catch (error) {
        prodError('❌ CategorySelection: Error loading data:', error)
        setLoadingError(error.message)

        // Try to load fallback data
        try {
          const fallbackData = await GameDataLoader.loadSampleData()
          setAvailableCategories(fallbackData.categories || [])
          setGameData(fallbackData)
          devLog('🔄 CategorySelection: Using fallback data')

          // Update question pool for global usage tracking with fallback data (only if user is set)
          if (user?.uid) {
            questionUsageTracker.setUserId(user.uid) // Ensure user ID is set
            questionUsageTracker.updateQuestionPool(fallbackData)
          } else {
            devLog('⏳ CategorySelection: Delaying questionUsageTracker (fallback) until user is authenticated')
          }
        } catch (fallbackError) {
          prodError('❌ CategorySelection: Fallback also failed:', fallbackError)
          setAvailableCategories([])
          setLoadingError('Unable to load categories. Please refresh the page.')
        }
      }
    }

    loadData()
  }, [])

  // Load question counts when game data is available
  useEffect(() => {
    if (gameData) {
      loadQuestionCounts()
    }
  }, [gameData])

  const toggleCategory = (categoryId) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId)
      } else if (prev.length < 6) {
        return [...prev, categoryId]
      }
      return prev
    })
  }

  const handleStartGame = () => {
    if (selectedCategories.length === 6) {
      setGameState(prev => ({
        ...prev,
        selectedCategories
      }))
      navigate('/game')
    }
  }

  const isSelected = (categoryId) => selectedCategories.includes(categoryId)

  // Load question counts asynchronously
  const loadQuestionCounts = async () => {
    if (!gameData || !gameData.questions) return

    // Ensure user ID is set before getting question counts
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
    }

    const counts = {}

    // Count questions for regular categories
    for (const categoryId of Object.keys(gameData.questions)) {
      try {
        const categoryQuestions = gameData.questions[categoryId]
        devLog(`📊 Counting questions for category ${categoryId}:`, categoryQuestions.length, 'total')

        const availableQuestions = await questionUsageTracker.getAvailableQuestions(categoryQuestions)
        devLog(`📊 Available questions for category ${categoryId}:`, availableQuestions.length)

        // Divide by 3 for the 3 difficulties to get average per difficulty
        counts[categoryId] = Math.round(availableQuestions.length / 3)
      } catch (error) {
        prodError('Error calculating question count for category:', categoryId, error)
        counts[categoryId] = 0
      }
    }

    // Special handling for Mystery Category - keep ? for question count only
    if (gameData.categories && gameData.categories.some(cat => cat.id === 'mystery')) {
      counts['mystery'] = '?' // Show question mark for mystery category count
    }

    devLog('📊 Final question counts:', counts)
    setQuestionCounts(counts)
  }

  // Get remaining questions count from state (safe, no async calls)
  const getRemainingQuestions = (categoryId) => {
    return questionCounts[categoryId] || 0
  }

  // Show skeleton/empty state while loading in background
  const isLoading = availableCategories.length === 0 && !loadingError

  // Show error state
  if (loadingError) {
    return (
      <div className="h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">خطأ في تحميل البيانات</h2>
          <p className="text-gray-600 mb-4">{loadingError}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#f7f2e6] flex flex-col">
      {/* Red Header Bar */}
      <div className="bg-red-600 text-white p-2 md:p-3 flex-shrink-0 sticky top-0 z-10">
        <div className="flex justify-between items-center">
          <div className="flex flex-col md:flex-row md:items-center md:gap-3">
            <h1 className="text-lg md:text-2xl font-bold text-white">اختر 6 فئات</h1>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/game-setup')}
              className="px-2 py-1 md:px-3 md:py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors text-xs md:text-sm"
            >
              الرجوع
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-[#f7f2e6] flex flex-col items-center justify-start p-3 md:p-6 overflow-y-auto">
        {/* Selection Counter */}
        <div className="text-center mb-4 md:mb-8 flex-shrink-0">
          <div className="bg-gray-100 border-2 border-gray-300 rounded-lg p-2 md:p-4 inline-block">
            <span className="text-lg md:text-2xl font-bold text-red-600">
              {selectedCategories.length} / 6 فئات محددة
            </span>
          </div>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4 w-full max-w-7xl flex-1 content-start">
          {isLoading ? (
            // Show skeleton loading cards without blocking UI
            Array.from({ length: 12 }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="relative p-0 rounded-lg flex flex-col border-2 border-gray-200 bg-gray-50 animate-pulse aspect-[3/4]"
              >
                <div className="flex-1 relative flex items-center justify-center">
                  <div className="w-8 h-8 bg-gray-300 rounded"></div>
                </div>
                <div className="p-2 md:p-3 border-t-2 border-gray-200 bg-gray-100">
                  <div className="h-4 bg-gray-300 rounded w-3/4 mx-auto"></div>
                </div>
              </div>
            ))
          ) : (
            availableCategories.map((category) => {
            const selected = isSelected(category.id)
            const canSelect = selectedCategories.length < 6 || selected

            return (
              <button
                key={category.id}
                onClick={() => canSelect && toggleCategory(category.id)}
                disabled={!canSelect}
                className={`
                  relative p-0 rounded-lg font-bold text-sm md:text-xl transition-all duration-200 transform hover:scale-105 overflow-hidden border-2 flex flex-col aspect-[3/4]
                  ${selected
                    ? 'text-white shadow-lg scale-105 border-red-600'
                    : canSelect
                    ? 'text-red-600 border-gray-300 hover:border-red-300 hover:shadow-lg'
                    : 'text-gray-500 cursor-not-allowed border-gray-400 opacity-50'
                  }
                `}
              >
                {/* Main content area with background image */}
                <BackgroundImage
                  src={category.imageUrl}
                  size="medium"
                  context="category"
                  categoryId={category.id}
                  className={`flex-1 relative flex items-center justify-center rounded-t-lg ${
                    selected
                      ? 'bg-red-600'
                      : canSelect
                      ? 'bg-white hover:bg-gray-50'
                      : 'bg-gray-300'
                  }`}
                  fallbackGradient={
                    selected
                      ? 'from-red-600 to-red-700'
                      : canSelect
                      ? 'from-white to-gray-50'
                      : 'from-gray-300 to-gray-400'
                  }
                >
                  {/* Overlay for better text readability when image is present */}
                  {category.imageUrl && (
                    <div className="absolute inset-0 bg-black/30 rounded-t-lg"></div>
                  )}
                  {selected && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full w-6 h-6 md:w-8 md:h-8 flex items-center justify-center text-xs md:text-sm font-bold z-20">
                      ✓
                    </div>
                  )}
                  {/* Question count - top left corner, opposite of checkmark */}
                  <div className="absolute top-2 left-2 bg-blue-600 text-white rounded-full w-6 h-6 md:w-8 md:h-8 flex items-center justify-center text-xs md:text-sm font-bold z-20">
                    {getRemainingQuestions(category.id)}
                  </div>
                  {/* Show emoji/icon only when no background image */}
                  {!category.imageUrl && (
                    <div className="relative z-10 text-center p-3 md:p-6">
                      <div className="text-lg md:text-2xl">
                        {category.image}
                      </div>
                    </div>
                  )}
                </BackgroundImage>

                {/* Bottom bar with category name */}
                <div className={`p-2 md:p-3 border-t-2 relative z-10 ${
                  selected
                    ? 'bg-red-700 border-red-800'
                    : canSelect
                    ? 'bg-gray-100 border-gray-200'
                    : 'bg-gray-400 border-gray-500'
                }`}>
                  <div className="text-xs md:text-sm leading-tight font-bold text-center">
                    {category.name}
                  </div>
                </div>
              </button>
            )
          })
          )}
        </div>

        {/* Start Game Button */}
        <div className="text-center mt-4 md:mt-8 flex-shrink-0">
          <button
            onClick={handleStartGame}
            disabled={selectedCategories.length !== 6}
            className={`text-lg md:text-2xl font-bold py-3 px-8 md:py-4 md:px-12 rounded-lg shadow-lg transform transition-all duration-200 ${
              selectedCategories.length === 6
                ? 'bg-green-600 hover:bg-green-700 text-white hover:scale-105'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {selectedCategories.length === 6 ? 'ابدأ اللعبة' : `اختر ${6 - selectedCategories.length} فئات أخرى`}
          </button>
        </div>
      </div>

    </div>
  )
}

export default CategorySelection