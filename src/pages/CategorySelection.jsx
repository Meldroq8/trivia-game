import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameDataLoader } from '../utils/gameDataLoader'
import { useAuth } from '../hooks/useAuth'
import questionUsageTracker from '../utils/questionUsageTracker'
import BackgroundImage from '../components/BackgroundImage'
import { getCategoryImageUrl } from '../utils/mediaUrlConverter'
import Header from '../components/Header'


function CategorySelection({ gameState, setGameState, stateLoaded }) {
  // Check if this is a new game or continuing
  const isNewGame = !gameState.selectedCategories || gameState.selectedCategories.length === 0

  const [selectedCategories, setSelectedCategories] = useState(isNewGame ? [] : (gameState.selectedCategories || []))
  const [availableCategories, setAvailableCategories] = useState([])
  const [loadingError, setLoadingError] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [questionCounts, setQuestionCounts] = useState({})

  // Game setup state - only pre-fill if continuing a game
  const [gameName, setGameName] = useState(isNewGame ? '' : (gameState.gameName || ''))
  const [team1Name, setTeam1Name] = useState(isNewGame ? '' : (gameState.team1?.name || ''))
  const [team2Name, setTeam2Name] = useState(isNewGame ? '' : (gameState.team2?.name || ''))
  const [showCategoriesGrid, setShowCategoriesGrid] = useState(true)

  // Perk selection state
  const [selectedPerks, setSelectedPerks] = useState([])
  const [expandedPerk, setExpandedPerk] = useState(null)
  const [showPerkSelection, setShowPerkSelection] = useState(false)
  const [showTeamSetup, setShowTeamSetup] = useState(false)
  const [hasAutoTransitioned, setHasAutoTransitioned] = useState(false)

  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight })

  // Responsive dimensions tracking
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Auto-show perk selection when 6 categories are selected (only once, on first selection)
  useEffect(() => {
    if (selectedCategories.length === 6 && showCategoriesGrid && !showPerkSelection && !showTeamSetup && !hasAutoTransitioned) {
      // Add a small delay for smooth transition
      setTimeout(() => {
        setShowCategoriesGrid(false)
        setShowPerkSelection(true)
        setHasAutoTransitioned(true)
      }, 300)
    }
    // Reset flag when categories go below 6 (user is editing)
    if (selectedCategories.length < 6 && hasAutoTransitioned) {
      setHasAutoTransitioned(false)
    }
  }, [selectedCategories.length, showCategoriesGrid, showPerkSelection, showTeamSetup, hasAutoTransitioned])

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
  }, [isAuthenticated, authLoading, navigate])

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
  }, [user])

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

  // Helper function to get perk information (matching PerkModal.jsx structure)
  const getPerkInfo = (perkType) => {
    const iconSize = 40
    switch (perkType) {
      case 'double':
        return {
          icon: (
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" stroke="none"/>
              <text x="12" y="15" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="bold" stroke="#dc2626" strokeWidth="0.5">2</text>
            </svg>
          ),
          title: 'دبلها',
          description: 'يحصل الفريق على ضعف النقاط إذا أجاب بشكل صحيح على السؤال الحالي',
          duration: null
        }
      case 'phone':
        return {
          icon: (
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
              <path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill="currentColor" stroke="none"/>
            </svg>
          ),
          title: 'اتصال بصديق',
          description: 'يمكن للفريق الاتصال بصديق للمساعدة في الإجابة لمدة 30 ثانية',
          duration: 30
        }
      case 'search':
        return {
          icon: (
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
              <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3S3 5.91 3 9.5S5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14Z" fill="currentColor" stroke="none"/>
            </svg>
          ),
          title: 'جوجلها',
          description: 'يمكن للفريق البحث في جوجل عن إجابة السؤال لمدة 15 ثانية',
          duration: 15
        }
      case 'risk':
        return {
          icon: (
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" stroke="none"/>
              <circle cx="7" cy="7" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
              <circle cx="17" cy="7" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
              <circle cx="7" cy="17" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
              <circle cx="17" cy="17" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
              <circle cx="12" cy="12" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
            </svg>
          ),
          title: 'يا تصيب يا تخيب',
          description: '3 أضعاف النقاط في حال الإجابة الصحيحة، وخصم ضعف النقاط في حال الإجابة الخاطئة',
          duration: null
        }
      case 'twoAnswers':
        return {
          icon: (
            <svg width={iconSize} height={iconSize} viewBox="0 0 72 72" fill="none">
              <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m52.62 31.13 1.8-22.18c-0.3427-4.964-6.779-5.02-7.227-0.026l-2.42 17.36c-0.3 2.179-1.278 3.962-2.166 3.962s-1.845-1.785-2.126-3.967l-2.231-17.34c-0.8196-5.278-7.439-4.322-7.037 0.0011l2.527 21.03"/>
              <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m53.63 50.08c0 9.872-8.02 16.88-17.89 16.88"/>
              <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m43.74 47.29v-2.333c0-1.1-1.789-2.2-3.976-2.441l-1.049-0.117c-2.187-0.242-3.976-1.851-3.976-3.774s1.8-3.334 4-3.334h10c2.201-0.0448 4.057 1.632 4.235 3.826l0.657 11.21"/>
              <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m37.96 50.36c1.63-1.48 3.624-2.5 5.777-2.958"/>
              <path fill="none" stroke="currentColor" strokeLinecap="round" strokeMiterlimit="10" strokeWidth="4" d="m18.53 52.1c1.142 8.6 8.539 14.98 17.21 14.86 9.667 0 17.89-6.833 17.89-16.88"/>
              <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m31.75 49.72c0 1.258-0.6709 2.42-1.76 3.048s-2.431 0.6288-3.52 0-1.76-1.791-1.76-3.048v-15.96c0-1.258 0.6709-2.42 1.76-3.048s2.431-0.6288 3.52 0c1.089 0.6288 1.76 1.791 1.76 3.049z"/>
              <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m24.71 44.94c0 1.262-0.6709 2.427-1.76 3.058s-2.431 0.6308-3.52 0c-1.089-0.6308-1.76-1.796-1.76-3.058v-7.937c0-1.262 0.6709-2.427 1.76-3.058 1.089-0.6308 2.431-0.6308 3.52 0s1.76 1.796 1.76 3.058z"/>
            </svg>
          ),
          title: 'جوابين',
          description: 'يمكن للفريق إعطاء إجابتين بدلاً من واحدة. إذا كانت أي من الإجابتين صحيحة، يحصل الفريق على النقاط',
          duration: null
        }
      case 'prison':
        return {
          icon: (
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
              <path d="M6 2V22H8V2H6M10 2V22H12V2H10M14 2V22H16V2H14M18 2V22H20V2H18M2 2V4H22V2H2M2 20V22H22V20H2Z" fill="currentColor" stroke="none"/>
            </svg>
          ),
          title: 'السجن',
          description: 'سجن لاعب من الفريق الآخر لهذا السؤال',
          duration: null,
          canActivateOnOpponentTurn: true
        }
      default:
        return {}
    }
  }

  // Perk selection handlers
  const togglePerk = (perkId) => {
    setSelectedPerks(prev => {
      if (prev.includes(perkId)) {
        // Unselect
        return prev.filter(id => id !== perkId)
      } else if (prev.length < 3) {
        // Select
        return [...prev, perkId]
      }
      return prev
    })
  }

  const handlePerkClick = (perkId) => {
    // Toggle selection
    togglePerk(perkId)

    // Toggle description expansion
    if (expandedPerk === perkId) {
      setExpandedPerk(null)
    } else {
      setExpandedPerk(perkId)
    }
  }

  const handleProceedToTeamSetup = () => {
    if (selectedPerks.length === 3) {
      setShowPerkSelection(false)
      setShowTeamSetup(true)
    }
  }

  const handleBackToCategories = () => {
    setShowCategoriesGrid(true)
    setShowPerkSelection(false)
    setShowTeamSetup(false)
  }

  const handleBackToPerks = () => {
    setShowPerkSelection(true)
    setShowTeamSetup(false)
  }

  const handleStartGame = () => {
    if (selectedCategories.length === 6 && selectedPerks.length === 3 && gameName.trim() && team1Name.trim() && team2Name.trim()) {
      // Build perkUsage dynamically from selected perks
      const perkUsageObj = {}
      selectedPerks.forEach(perkId => {
        perkUsageObj[perkId] = 0
      })

      setGameState(prev => ({
        ...prev,
        gameName: gameName,
        team1: { name: team1Name, score: 0 },
        team2: { name: team2Name, score: 0 },
        currentTurn: 'team1',
        selectedCategories,
        selectedPerks, // Store selected perks
        usedQuestions: new Set(),
        currentQuestion: null,
        gameHistory: [],
        assignedQuestions: {},
        perkUsage: {
          team1: { ...perkUsageObj },
          team2: { ...perkUsageObj }
        },
        activatedPerks: {
          doublePoints: { active: false, team: null },
          riskPoints: { active: false, team: null }
        },
        isGameContinuation: false,
        gameId: null
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

  // Responsive styling system
  const getResponsiveStyles = () => {
    const { width, height } = dimensions
    const isPortrait = height > width
    const isPC = width >= 1024 && height >= 768
    const pcScaleFactor = isPC ? 2.0 : 1.0

    const availableHeight = height
    const availableWidth = width

    const basePadding = Math.max(8, Math.min(20, availableHeight * 0.02))
    const baseGap = Math.max(12, Math.min(24, availableHeight * 0.03))

    const labelFontSize = Math.max(14, Math.min(18, availableHeight * 0.025)) * pcScaleFactor
    const inputFontSize = Math.max(12, Math.min(16, availableHeight * 0.02)) * pcScaleFactor
    const buttonFontSize = Math.max(12, Math.min(20, availableHeight * 0.025)) * pcScaleFactor

    const inputHeight = Math.max(40, Math.min(55, availableHeight * 0.06))
    const inputPadding = Math.max(8, Math.min(12, inputHeight * 0.2))
    const buttonPadding = Math.max(8, Math.min(20, availableHeight * 0.02))

    return {
      labelFontSize,
      inputFontSize,
      buttonFontSize,
      basePadding,
      baseGap,
      inputPadding,
      buttonPadding,
      inputHeight,
      availableHeight,
      availableWidth,
      isPortrait,
      pcScaleFactor
    }
  }

  const styles = getResponsiveStyles()

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
      {/* Header */}
      <Header showBackButton={true} backPath="/" />

      {/* Main Content */}
      <div className="flex-1 bg-[#f7f2e6] flex flex-col items-center justify-start p-3 md:p-6 overflow-y-auto">

        {/* Show Categories Grid OR Selected Categories + Game Setup */}
        {showCategoriesGrid || selectedCategories.length < 6 ? (
          <div className="w-full animate-slideInFromTop">
            {/* Selection Counter */}
            <div className="text-center mb-4 md:mb-8 flex-shrink-0">
              <div className="bg-gray-100 border-2 border-gray-300 rounded-lg p-2 md:p-4 inline-block">
                <span className="text-lg md:text-2xl font-bold text-red-600">
                  {selectedCategories.length} / 6 فئات محددة
                </span>
              </div>
            </div>

            {/* Categories Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4 w-full max-w-7xl mx-auto flex-1 content-start">
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
          </div>
        ) : (
          /* Perk Selection OR Game Setup Section - Shown when 6 categories selected */
          <div className="w-full max-w-3xl animate-slideInFromBottom">
            {/* Selected Categories Display - Compact */}
            <div className="mb-4 md:mb-6">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-3 md:p-4 shadow-lg border border-green-300">
                <div className="text-center mb-2">
                  <span className="inline-flex items-center gap-1 md:gap-2 bg-green-600 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-bold">
                    <span>✓</span>
                    <span>تم اختيار 6 فئات</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 md:gap-2 justify-center mb-2">
                  {selectedCategories.map((categoryId) => {
                    const category = availableCategories.find(cat => cat.id === categoryId)
                    return category ? (
                      <div key={categoryId} className="bg-red-600 text-white px-2 md:px-4 py-1 md:py-1.5 rounded-full text-xs md:text-base lg:text-lg font-bold">
                        {category.name}
                      </div>
                    ) : null
                  })}
                </div>
                <div className="text-center flex gap-2 justify-center">
                  <button
                    onClick={handleBackToCategories}
                    className="text-xs bg-white text-blue-600 hover:bg-blue-50 px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-bold transition-all border border-blue-300"
                  >
                    تغيير الفئات
                  </button>
                  {showTeamSetup && (
                    <button
                      onClick={handleBackToPerks}
                      className="text-xs bg-white text-purple-600 hover:bg-purple-50 px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-bold transition-all border border-purple-300"
                    >
                      تغيير الوسائل
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Perk Selection Section */}
            {showPerkSelection && (
              <div className="bg-white rounded-2xl shadow-xl p-4 md:p-6 border border-gray-200 mb-4 md:mb-6">
                {/* Title */}
                <div className="text-center mb-4 md:mb-6">
                  <h2 className="font-bold text-red-600 text-xl md:text-2xl">
                    اعدادات وسائل المساعدة
                  </h2>
                </div>

                {/* Selection Counter */}
                <div className="text-center mb-4 md:mb-6">
                  <div className="bg-gray-100 border-2 border-gray-300 rounded-lg p-2 md:p-3 inline-block">
                    <span className="text-base md:text-xl font-bold text-red-600">
                      {selectedPerks.length === 0 && 'اختر 3 وسائل مساعدة'}
                      {selectedPerks.length === 1 && 'اختر وسيلتين إضافيتين'}
                      {selectedPerks.length === 2 && 'اختر وسيلة واحدة إضافية'}
                      {selectedPerks.length === 3 && '✓ تم اختيار جميع الوسائل'}
                    </span>
                  </div>
                </div>

                {/* Perks Row - 6 circles */}
                <div className="flex justify-center items-center gap-2 md:gap-4 mb-4">
                  {['double', 'phone', 'search', 'risk', 'twoAnswers', 'prison'].map(perkId => {
                    const perkInfo = getPerkInfo(perkId)
                    const isSelected = selectedPerks.includes(perkId)
                    const isDisabled = !isSelected && selectedPerks.length >= 3

                    return (
                      <button
                        key={perkId}
                        onClick={() => !isDisabled && handlePerkClick(perkId)}
                        disabled={isDisabled}
                        className={`
                          rounded-full flex items-center justify-center transition-all duration-200 transform
                          w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-20 lg:h-20
                          ${isSelected
                            ? 'bg-red-600 text-white scale-110 shadow-lg'
                            : isDisabled
                            ? 'bg-gray-300 text-gray-500 opacity-40 cursor-not-allowed'
                            : 'bg-gray-400 text-gray-600 hover:bg-gray-500 hover:scale-105 cursor-pointer'
                          }
                        `}
                      >
                        {perkInfo.icon}
                      </button>
                    )
                  })}
                </div>

                {/* Description Expansion Area */}
                {expandedPerk && (
                  <div className="mt-4 bg-gray-50 rounded-xl p-4 md:p-6 border-2 border-gray-200 animate-slideDown">
                    <button
                      onClick={() => setExpandedPerk(null)}
                      className="float-left text-gray-500 hover:text-gray-700 font-bold text-xl"
                    >
                      ×
                    </button>
                    <div className="text-center">
                      <div className="flex justify-center mb-3">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                          selectedPerks.includes(expandedPerk) ? 'bg-red-600 text-white' : 'bg-gray-400 text-gray-600'
                        }`}>
                          {getPerkInfo(expandedPerk).icon}
                        </div>
                      </div>
                      <h3 className="font-bold text-lg md:text-xl mb-2 text-gray-800">
                        {getPerkInfo(expandedPerk).title}
                      </h3>
                      <p className="text-gray-700 text-sm md:text-base leading-relaxed" dir="rtl">
                        {getPerkInfo(expandedPerk).description}
                      </p>
                      {getPerkInfo(expandedPerk).duration && (
                        <p className="text-gray-600 text-xs md:text-sm mt-2">
                          ⏱️ المدة: {getPerkInfo(expandedPerk).duration} ثانية
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Proceed Button */}
                <div className="text-center mt-6">
                  <button
                    onClick={handleProceedToTeamSetup}
                    disabled={selectedPerks.length !== 3}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold px-6 md:px-8 py-3 md:py-4 rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 disabled:hover:scale-100 text-base md:text-lg"
                  >
                    التالي
                  </button>
                </div>
              </div>
            )}

            {/* Game Setup Form - Compact & Responsive */}
            {showTeamSetup && (
              <div className="bg-white rounded-2xl shadow-xl p-4 md:p-6 border border-gray-200">
                {/* Title */}
                <div className="text-center mb-4 md:mb-6">
                  <h2 className="font-bold text-red-600" style={{ fontSize: `${styles.labelFontSize * 1.3}px` }}>
                    إعداد فرق اللعبة
                  </h2>
                </div>

                {/* Game Name Section */}
                <div className="mb-4 md:mb-5">
                  <label className="flex items-center justify-center gap-1.5 mb-2 font-bold text-gray-700" style={{ fontSize: `${styles.labelFontSize}px` }}>
                    <span>اسم اللعبة</span>
                  </label>
                  <input
                    type="text"
                    value={gameName}
                    onChange={(e) => setGameName(e.target.value)}
                    dir="auto"
                    className="w-full border-2 border-gray-300 rounded-xl text-center font-bold focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 bg-white shadow-sm placeholder-gray-400 transition-all"
                    style={{
                      padding: `${styles.inputPadding}px ${styles.inputPadding * 1.5}px`,
                      fontSize: `${styles.inputFontSize}px`,
                      height: `${styles.inputHeight}px`,
                      boxSizing: 'border-box',
                      color: '#374151'
                    }}
                    placeholder="أدخل اسم اللعبة"
                    maxLength={30}
                  />
                </div>

                {/* Teams Section */}
                <div className={`${styles.isPortrait ? 'flex flex-col' : 'grid grid-cols-2'} gap-3 md:gap-4 mb-4 md:mb-5`}>
                  {/* Team 1 */}
                  <div className="bg-gray-50 p-3 md:p-4 rounded-xl border border-gray-300">
                    <label className="flex items-center justify-center gap-1.5 mb-2 font-bold text-gray-700" style={{ fontSize: `${styles.labelFontSize * 0.95}px` }}>
                      <span>الفريق الأول</span>
                    </label>
                    <input
                      type="text"
                      value={team1Name}
                      onChange={(e) => setTeam1Name(e.target.value)}
                      dir="auto"
                      className="w-full border-2 border-gray-300 rounded-xl text-center font-bold focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 bg-white shadow-sm placeholder-gray-400 transition-all"
                      style={{
                        padding: `${styles.inputPadding}px ${styles.inputPadding * 1.5}px`,
                        fontSize: `${styles.inputFontSize}px`,
                        height: `${styles.inputHeight}px`,
                        boxSizing: 'border-box',
                        color: '#374151'
                      }}
                      placeholder="اسم الفريق"
                      maxLength={20}
                    />
                  </div>

                  {/* Team 2 */}
                  <div className="bg-gray-50 p-3 md:p-4 rounded-xl border border-gray-300">
                    <label className="flex items-center justify-center gap-1.5 mb-2 font-bold text-gray-700" style={{ fontSize: `${styles.labelFontSize * 0.95}px` }}>
                      <span>الفريق الثاني</span>
                    </label>
                    <input
                      type="text"
                      value={team2Name}
                      onChange={(e) => setTeam2Name(e.target.value)}
                      dir="auto"
                      className="w-full border-2 border-gray-300 rounded-xl text-center font-bold focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 bg-white shadow-sm placeholder-gray-400 transition-all"
                      style={{
                        padding: `${styles.inputPadding}px ${styles.inputPadding * 1.5}px`,
                        fontSize: `${styles.inputFontSize}px`,
                        height: `${styles.inputHeight}px`,
                        boxSizing: 'border-box',
                        color: '#374151'
                      }}
                      placeholder="اسم الفريق"
                      maxLength={20}
                    />
                  </div>
                </div>

                {/* Start Game Button */}
                <div className="text-center">
                  <button
                    onClick={handleStartGame}
                    disabled={!gameName?.trim() || !team1Name?.trim() || !team2Name?.trim() || !isAuthenticated}
                    className="w-full md:w-auto font-bold rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 bg-red-600 hover:bg-red-700 text-white"
                    style={{
                      fontSize: `${styles.buttonFontSize}px`,
                      padding: `${styles.buttonPadding}px ${styles.buttonPadding * 2}px`
                    }}
                  >
                    {!isAuthenticated ? (
                      <span className="inline-flex items-center gap-2 justify-center">
                        <span>🔐</span>
                        {styles.isPortrait ? 'تسجيل دخول' : 'يجب تسجيل الدخول أولاً'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 justify-center">
                        ابدأ اللعبة
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CategorySelection
