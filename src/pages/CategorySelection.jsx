import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameDataLoader } from '../utils/gameDataLoader'
import { useAuth } from '../hooks/useAuth'
import questionUsageTracker from '../utils/questionUsageTracker'
import BackgroundImage from '../components/BackgroundImage'
import { getCategoryImageUrl } from '../utils/mediaUrlConverter'
import Header from '../components/Header'
import settingsService from '../firebase/settingsService'

// Auto-fit text component that scales to fill available width
function AutoFitText({ text, className = '', minFontSize = 8, maxFontSize = 24 }) {
  const containerRef = useRef(null)
  const textRef = useRef(null)
  const [fontSize, setFontSize] = useState(maxFontSize)

  const calculateFontSize = useCallback(() => {
    if (!containerRef.current || !textRef.current) return

    const containerWidth = containerRef.current.clientWidth - 8 // Account for padding
    const containerHeight = containerRef.current.clientHeight

    // Binary search for optimal font size
    let min = minFontSize
    let max = maxFontSize
    let optimalSize = minFontSize

    while (min <= max) {
      const mid = Math.floor((min + max) / 2)
      textRef.current.style.fontSize = `${mid}px`

      const textWidth = textRef.current.scrollWidth
      const textHeight = textRef.current.scrollHeight

      if (textWidth <= containerWidth && textHeight <= containerHeight) {
        optimalSize = mid
        min = mid + 1
      } else {
        max = mid - 1
      }
    }

    setFontSize(optimalSize)
  }, [minFontSize, maxFontSize])

  useEffect(() => {
    calculateFontSize()

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(() => {
      calculateFontSize()
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [text, calculateFontSize])

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden">
      <span
        ref={textRef}
        className={`whitespace-nowrap text-center leading-tight ${className}`}
        style={{ fontSize: `${fontSize}px` }}
      >
        {text}
      </span>
    </div>
  )
}

function CategorySelection({ gameState, setGameState, stateLoaded }) {
  // Check if this is a new game or continuing
  const isNewGame = !gameState.selectedCategories || gameState.selectedCategories.length === 0

  const [selectedCategories, setSelectedCategories] = useState(isNewGame ? [] : (gameState.selectedCategories || []))
  const [availableCategories, setAvailableCategories] = useState([])
  const [loadingError, setLoadingError] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [questionCounts, setQuestionCounts] = useState({}) // Display counts (divided by 6)
  const [rawQuestionCounts, setRawQuestionCounts] = useState({}) // Actual available questions
  const [masterCategories, setMasterCategories] = useState([])
  const [countsRefreshTrigger, setCountsRefreshTrigger] = useState(0) // Trigger to refresh counts

  // Set page title
  useEffect(() => {
    document.title = 'راس براس - اختيار الفئات'
  }, [])
  const [expandedMasters, setExpandedMasters] = useState({})
  const [searchText, setSearchText] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [viewMode, setViewMode] = useState('grouped') // 'grouped', 'ungrouped', 'favorites'
  const [favoriteCategories, setFavoriteCategories] = useState([]) // Array of category IDs

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
  const [showSidebar, setShowSidebar] = useState(false)
  const [isRandomizing, setIsRandomizing] = useState(false)
  const [isStartingGame, setIsStartingGame] = useState(false)

  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading, getAppSettings } = useAuth()
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [newestCategoriesDays, setNewestCategoriesDays] = useState(7)
  const [newestCategoriesName, setNewestCategoriesName] = useState('🆕 أجدد الفئات')

  // Responsive dimensions tracking
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Load newest categories settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getAppSettings()
        if (settings?.newestCategoriesDays !== undefined) {
          setNewestCategoriesDays(settings.newestCategoriesDays)
        }
        if (settings?.newestCategoriesName !== undefined) {
          setNewestCategoriesName(settings.newestCategoriesName)
        }
      } catch (error) {
        prodError('Error loading newest categories setting:', error)
      }
    }
    loadSettings()
  }, [getAppSettings])

  // Load favorite categories from Firebase
  useEffect(() => {
    const loadFavorites = async () => {
      if (!user?.uid) return
      try {
        const userSettings = await settingsService.getUserSettings(user.uid)
        if (userSettings?.favoriteCategories) {
          setFavoriteCategories(userSettings.favoriteCategories)
          devLog('✅ Loaded favorite categories:', userSettings.favoriteCategories.length)
        }
      } catch (error) {
        prodError('Error loading favorite categories:', error)
      }
    }
    loadFavorites()
  }, [user?.uid])

  // Toggle favorite category and save to Firebase
  const toggleFavorite = async (categoryId, e) => {
    e.stopPropagation() // Prevent category selection
    if (!user?.uid) return

    const isFavorite = favoriteCategories.includes(categoryId)
    const newFavorites = isFavorite
      ? favoriteCategories.filter(id => id !== categoryId)
      : [...favoriteCategories, categoryId]

    setFavoriteCategories(newFavorites)

    // Save to Firebase
    try {
      await settingsService.saveUserSettings({ favoriteCategories: newFavorites }, user.uid)
      devLog(`${isFavorite ? '💔' : '❤️'} Category ${categoryId} ${isFavorite ? 'removed from' : 'added to'} favorites`)
    } catch (error) {
      prodError('Error saving favorite categories:', error)
      // Revert on error
      setFavoriteCategories(favoriteCategories)
    }
  }

  // Show sidebar on scroll when categories are selected and grid is visible
  useEffect(() => {
    const handleScroll = (e) => {
      const scrollTop = e.target.scrollTop || 0
      const shouldShow = scrollTop > 50 && selectedCategories.length > 0 && showCategoriesGrid
      setShowSidebar(shouldShow)
    }

    const mainContent = document.querySelector('.category-selection-main-content')
    if (mainContent) {
      mainContent.addEventListener('scroll', handleScroll)
      return () => mainContent.removeEventListener('scroll', handleScroll)
    }
  }, [selectedCategories.length, showCategoriesGrid])

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

  // Clear cache when returning from a completed game
  // Note: Main sync from game history happens in useAuth on app load
  useEffect(() => {
    const gameJustCompleted = sessionStorage.getItem('gameJustCompleted')

    if (gameJustCompleted) {
      // Coming back from a completed game - refresh to show updated counters
      devLog('🔄 CategorySelection: Game just completed - refreshing question usage data')
      questionUsageTracker.clearCache()
      sessionStorage.removeItem('gameJustCompleted')
      // Trigger a refresh of question counts
      setCountsRefreshTrigger(prev => prev + 1)
    }
  }, []) // Empty deps = runs only on mount

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
    // Don't load data until auth check is complete and user is authenticated
    if (authLoading || !isAuthenticated) {
      return
    }

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

          // Load master categories and initialize all as expanded
          if (gameData.masterCategories) {
            setMasterCategories(gameData.masterCategories)
            const initialExpanded = {}
            gameData.masterCategories.forEach(master => {
              initialExpanded[master.id] = true // All expanded by default
            })
            initialExpanded['general'] = true // Always expand general
            initialExpanded['newest'] = true // Always expand newest categories
            setExpandedMasters(initialExpanded)
            devLog('✅ CategorySelection: Loaded', gameData.masterCategories.length, 'master categories')
          }

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
  }, [user, authLoading, isAuthenticated])

  // Load question counts when game data is available or refresh is triggered
  useEffect(() => {
    if (gameData && user?.uid) {
      loadQuestionCounts()
    }
  }, [gameData, user?.uid, countsRefreshTrigger])

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

  const scrollToCategory = (categoryId) => {
    const element = document.getElementById(`category-${categoryId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Add a highlight effect
      element.classList.add('ring-4', 'ring-blue-400')
      setTimeout(() => {
        element.classList.remove('ring-4', 'ring-blue-400')
      }, 1500)
    }
  }

  const toggleMasterExpand = (masterId) => {
    setExpandedMasters(prev => ({
      ...prev,
      [masterId]: !prev[masterId]
    }))
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

  const handleRandomPerks = async () => {
    setIsRandomizing(true)
    setSelectedPerks([]) // Clear current selection
    setExpandedPerk(null)

    const allPerks = ['double', 'phone', 'search', 'risk', 'twoAnswers', 'prison']

    // Shuffle and animate
    let flashCount = 0
    const flashInterval = setInterval(() => {
      // Randomly select 3 perks to flash
      const randomFlash = allPerks
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)

      setSelectedPerks(randomFlash)
      flashCount++

      // After 10 flashes, select final 3
      if (flashCount >= 10) {
        clearInterval(flashInterval)
        const finalSelection = allPerks
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
        setSelectedPerks(finalSelection)
        setIsRandomizing(false)
      }
    }, 150) // Flash every 150ms
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

  const handleStartGame = async () => {
    // Prevent double-clicks
    if (isStartingGame) return

    if (selectedCategories.length === 6 && selectedPerks.length === 3 && gameName.trim() && team1Name.trim() && team2Name.trim()) {
      setIsStartingGame(true)
      // Build perkUsage dynamically from selected perks
      const perkUsageObj = {}
      selectedPerks.forEach(perkId => {
        perkUsageObj[perkId] = 0
      })

      // Generate unique gameId for this game session
      const newGameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      devLog('🎮 Starting new game with ID:', newGameId)

      // Pre-assign questions to all button slots and mark as used (paid game - questions reserved)
      const preAssignedQuestions = {}

      if (gameData && gameData.questions) {
        // Get current usage data to filter out already-used questions
        const usageData = await questionUsageTracker.getUsageData()

        // Point values and their difficulties
        const pointConfigs = [
          { points: 200, difficulty: 'easy' },
          { points: 400, difficulty: 'medium' },
          { points: 600, difficulty: 'hard' }
        ]

        // Helper to generate question ID (use categoryId from iteration for consistency)
        // MUST match questionUsageTracker.getQuestionId logic exactly!
        const getQuestionId = (question, catId) => {
          // PREFERRED: Use Firebase document ID if available (most unique)
          if (question.id && typeof question.id === 'string' && question.id.length > 5) {
            return `${catId}-${question.id}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
          }
          // FALLBACK: Use text + answer with MORE characters
          const text = String(question.text || question.question?.text || '')
          const answer = String(question.answer || question.question?.answer || '')
          return `${catId}-${text.substring(0, 100)}-${answer.substring(0, 50)}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
        }

        // Helper to check if a question is already used
        const isQuestionUsed = (question, catId) => {
          const trackingId = getQuestionId(question, catId)
          return usageData[trackingId] && usageData[trackingId] > 0
        }

        // Debug: Log selected categories with names
        const selectedWithNames = selectedCategories.map(id => {
          const cat = gameData.categories?.find(c => c.id === id)
          return { id, name: cat?.name || 'Unknown' }
        })
        devLog(`🎮 DEBUG Starting game with categories:`, selectedWithNames)

        // For each selected category, pre-assign questions to all 6 buttons (3 point values × 2 buttons)
        for (const categoryId of selectedCategories) {
          const categoryQuestions = gameData.questions[categoryId]
          if (!categoryQuestions || !Array.isArray(categoryQuestions)) continue

          const category = gameData.categories?.find(c => c.id === categoryId)
          const categoryName = category?.name || categoryId

          for (const { points, difficulty } of pointConfigs) {
            // Get questions of this difficulty that haven't been used in previous games
            const difficultyQuestions = categoryQuestions.filter(q =>
              q.difficulty === difficulty && !isQuestionUsed(q, categoryId)
            )

            // Assign 2 questions per point value (buttonIndex 0 and 1)
            for (let buttonIndex = 0; buttonIndex < 2; buttonIndex++) {
              const buttonKey = `${categoryId}-${points}-${buttonIndex}`

              if (difficultyQuestions.length > 0) {
                // Pick a random question that hasn't been assigned yet in this game
                const alreadyAssigned = Object.values(preAssignedQuestions).map(a => a.questionId)
                const availableForButton = difficultyQuestions.filter(q => !alreadyAssigned.includes(q.id))

                if (availableForButton.length > 0) {
                  const questionToAssign = availableForButton[Math.floor(Math.random() * availableForButton.length)]

                  // Generate the tracking ID (use categoryId for consistency)
                  const trackingId = getQuestionId(questionToAssign, categoryId)

                  preAssignedQuestions[buttonKey] = {
                    questionId: questionToAssign.id,  // Firebase ID for GameBoard lookup
                    trackingId: trackingId,           // Tracking ID for usage marking
                    categoryId,
                    points,
                    category: categoryName,
                    buttonIndex
                  }
                } else {
                  devLog(`⚠️ No unused ${difficulty} questions available for ${categoryName}`)
                }
              }
            }
          }
        }

        devLog(`🎯 Pre-assigned ${Object.keys(preAssignedQuestions).length} questions for this game`)
      }

      // Mark questions as used in background (don't block game start)
      console.log('🔥 [START GAME DEBUG] user?.uid:', user?.uid)
      console.log('🔥 [START GAME DEBUG] preAssignedQuestions count:', Object.keys(preAssignedQuestions).length)
      console.log('🔥 [START GAME DEBUG] preAssignedQuestions:', preAssignedQuestions)

      if (user?.uid && Object.keys(preAssignedQuestions).length > 0) {
        console.log('🔥 [START GAME DEBUG] Calling markGameQuestionsAsUsed...')
        questionUsageTracker.setUserId(user.uid)
        // Fire and forget - don't await
        questionUsageTracker.markGameQuestionsAsUsed(preAssignedQuestions)
          .then(markedCount => {
            console.log('🔥 [START GAME DEBUG] markGameQuestionsAsUsed completed, marked:', markedCount)
            devLog(`💰 Paid game created - ${markedCount} questions reserved`)
          })
          .catch(err => {
            console.error('🔥 [START GAME DEBUG] markGameQuestionsAsUsed FAILED:', err)
            prodError('❌ Failed to mark questions as used:', err)
          })
      } else {
        console.log('🔥 [START GAME DEBUG] Skipping markGameQuestionsAsUsed - condition not met')
      }

      setGameState(prev => ({
        ...prev,
        gameName: gameName,
        team1: { name: team1Name, score: 0 },
        team2: { name: team2Name, score: 0 },
        currentTurn: 'team1',
        selectedCategories,
        selectedPerks, // Store selected perks
        usedQuestions: new Set(),
        usedPointValues: new Set(), // Reset used point values for new game
        currentQuestion: null,
        gameHistory: [],
        assignedQuestions: preAssignedQuestions,
        perkUsage: {
          team1: { ...perkUsageObj },
          team2: { ...perkUsageObj }
        },
        activatedPerks: {
          doublePoints: { active: false, team: null },
          riskPoints: { active: false, team: null }
        },
        isGameContinuation: false,
        gameId: newGameId,
        gameStartedAt: new Date().toISOString()
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

    // Load usage data ONCE (not per category)
    const usageData = await questionUsageTracker.getUsageData()

    // Helper to generate question ID (use categoryId from iteration, not question's own category)
    // MUST match questionUsageTracker.getQuestionId logic exactly!
    const getQuestionId = (question, categoryId) => {
      // PREFERRED: Use Firebase document ID if available (most unique)
      if (question.id && typeof question.id === 'string' && question.id.length > 5) {
        return `${categoryId}-${question.id}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
      }
      // FALLBACK: Use text + answer with MORE characters
      const text = String(question.text || question.question?.text || '')
      const answer = String(question.answer || question.question?.answer || '')
      return `${categoryId}-${text.substring(0, 100)}-${answer.substring(0, 50)}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
    }

    const counts = {}
    const rawCounts = {}

    // Debug: Log ALL category IDs with their names
    const allCategoryIds = Object.keys(gameData.questions)
    const categoryIdToName = {}
    gameData.categories?.forEach(cat => {
      categoryIdToName[cat.id] = cat.name
    })
    const categoriesWithNames = allCategoryIds.map(id => ({ id, name: categoryIdToName[id] || 'Unknown' }))
    const matchingCategories = categoriesWithNames.filter(c =>
      c.name?.includes('امثال') || c.name?.includes('الغاز') || c.name?.includes('أمثال') || c.name?.includes('ألغاز')
    )
    devLog(`🔍 DEBUG ALL Categories with names:`, categoriesWithNames)
    devLog(`🔍 DEBUG Categories matching امثال/الغاز: ${matchingCategories.length}`, matchingCategories)

    // Count questions for all categories locally (no Firebase calls per category)
    for (const categoryId of Object.keys(gameData.questions)) {
      const categoryQuestions = gameData.questions[categoryId]
      if (!categoryQuestions) continue

      // Debug logging for امثال و الغاز (use category name, not ID)
      const categoryName = categoryIdToName[categoryId] || ''
      const isDebugCategory = categoryName.includes('امثال') || categoryName.includes('الغاز') ||
                              categoryName.includes('أمثال') || categoryName.includes('ألغاز')

      // Count available (unused) questions locally
      let usedCount = 0
      const availableCount = categoryQuestions.filter(question => {
        const questionId = getQuestionId(question, categoryId)
        const isUsed = usageData[questionId] && usageData[questionId] > 0
        if (isUsed) usedCount++

        // Debug: log each question ID for the problem category
        if (isDebugCategory && isUsed) {
          devLog(`🔍 DEBUG ${categoryId}: Used question ID = ${questionId}`)
        }

        return !isUsed
      }).length

      if (isDebugCategory) {
        devLog(`📊 DEBUG ${categoryName} (${categoryId}): Total=${categoryQuestions.length}, Used=${usedCount}, Available=${availableCount}`)
        // Also log all usage data keys that START with this category ID
        const categoryUsageKeys = Object.keys(usageData).filter(key => key.startsWith(categoryId))
        devLog(`🔑 DEBUG Usage keys for ${categoryName}: ${categoryUsageKeys.length} entries`, categoryUsageKeys)
      }

      rawCounts[categoryId] = availableCount
      counts[categoryId] = Math.round(availableCount / 6)
    }

    // Special handling for Mystery Category
    if (gameData.categories?.some(cat => cat.id === 'mystery')) {
      counts['mystery'] = '?'
      rawCounts['mystery'] = 999
    }

    setQuestionCounts(counts)
    setRawQuestionCounts(rawCounts)
  }

  // Get remaining questions count from state (safe, no async calls)
  const getRemainingQuestions = (categoryId) => {
    return questionCounts[categoryId] || 0
  }

  // Check if category needs reset (less than 6 available questions)
  const categoryNeedsReset = (categoryId) => {
    const rawCount = rawQuestionCounts[categoryId]
    if (rawCount === undefined) return false
    return rawCount < 6
  }

  // Handle category reset
  const handleCategoryReset = async (e, categoryId) => {
    e.stopPropagation() // Prevent category selection

    if (!gameData || !gameData.questions[categoryId]) {
      devWarn('No questions found for category reset:', categoryId)
      return
    }

    devLog(`🔄 Resetting category: ${categoryId}`)

    try {
      // Ensure user ID is set before reset
      if (user?.uid) {
        questionUsageTracker.setUserId(user.uid)
      }

      const categoryQuestions = gameData.questions[categoryId]
      await questionUsageTracker.resetCategoryUsage(categoryId, categoryQuestions)

      // Helper to generate question ID (same as loadQuestionCounts)
      // MUST match questionUsageTracker.getQuestionId logic exactly!
      const getQuestionId = (question, catId) => {
        // PREFERRED: Use Firebase document ID if available (most unique)
        if (question.id && typeof question.id === 'string' && question.id.length > 5) {
          return `${catId}-${question.id}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
        }
        // FALLBACK: Use text + answer with MORE characters
        const text = String(question.text || question.question?.text || '')
        const answer = String(question.answer || question.question?.answer || '')
        return `${catId}-${text.substring(0, 100)}-${answer.substring(0, 50)}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
      }

      // Refresh counts using local calculation (consistent with loadQuestionCounts)
      const usageData = await questionUsageTracker.getUsageData()
      const availableCount = categoryQuestions.filter(question => {
        const questionId = getQuestionId(question, categoryId)
        return !usageData[questionId] || usageData[questionId] === 0
      }).length

      setRawQuestionCounts(prev => ({
        ...prev,
        [categoryId]: availableCount
      }))

      setQuestionCounts(prev => ({
        ...prev,
        [categoryId]: Math.round(availableCount / 6)
      }))

      devLog(`✅ Category ${categoryId} reset complete. Available: ${availableCount}`)
    } catch (error) {
      prodError('Error resetting category:', error)
    }
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
    <div className="h-screen bg-[#f7f2e6] dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <Header showBackButton={true} backPath="/" />

      {/* Main Content */}
      <div className="flex-1 bg-[#f7f2e6] dark:bg-slate-900 flex flex-col items-center justify-start p-3 md:p-6 overflow-y-auto category-selection-main-content relative">

        {/* Selected Categories Sidebar - Shows on scroll */}
        {showSidebar && showCategoriesGrid && selectedCategories.length > 0 && (
          <div className="fixed portrait:bottom-4 portrait:left-1/2 portrait:-translate-x-1/2 landscape:left-2 landscape:top-1/2 landscape:-translate-y-1/2 lg:landscape:left-8 z-50 portrait:animate-slideInFromBottom landscape:animate-slideInFromLeft">
            <div className="bg-white dark:bg-slate-800 rounded-lg md:rounded-xl lg:rounded-2xl shadow-2xl p-1.5 md:p-2 lg:p-4 portrait:w-auto max-lg:landscape:w-[65px] md:max-lg:w-[82px] lg:w-[102px] border-2 border-gray-200 dark:border-slate-600">
              <div className="flex portrait:flex-row landscape:flex-col gap-1 max-lg:landscape:gap-0.5 md:gap-2 lg:gap-3 portrait:gap-1.5">
                {selectedCategories.map((categoryId) => {
                  const category = availableCategories.find(cat => cat.id === categoryId)
                  if (!category) return null

                  return (
                    <div key={categoryId} className="relative group portrait:w-12 portrait:flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleCategory(categoryId)
                        }}
                        className="absolute -top-1 -right-1 md:-top-1.5 md:-right-1.5 lg:-top-2 lg:-right-2 z-10 bg-red-600 hover:bg-red-700 text-white rounded-full w-4 h-4 max-lg:landscape:w-3.5 max-lg:landscape:h-3.5 md:w-5 md:h-5 lg:w-7 lg:h-7 flex items-center justify-center text-[10px] md:text-xs lg:text-base font-bold shadow-lg transition-all hover:scale-110"
                      >
                        ×
                      </button>
                      <div
                        onClick={() => scrollToCategory(categoryId)}
                        className="bg-gradient-to-b from-gray-50 to-white rounded-lg lg:rounded-xl border-2 border-red-300 overflow-hidden cursor-pointer hover:border-red-400 transition-all">
                        <div className="aspect-[3/4] max-lg:landscape:aspect-[6/5] portrait:aspect-[3/4] lg:aspect-[5/4] relative">
                          <BackgroundImage
                            src={category.imageUrl}
                            alt={category.name}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20"></div>
                        </div>
                        <div className="bg-gradient-to-r from-red-600 to-red-700 px-0.5 portrait:px-1 md:px-1.5 lg:px-2 py-0.5 max-lg:landscape:py-px portrait:py-0.5 lg:py-1 overflow-hidden">
                          <div className="text-white font-bold text-center leading-tight whitespace-nowrap overflow-hidden w-full">
                            <div
                              className="inline-block max-w-full text-[8px] portrait:text-[7px] md:text-[10px] lg:text-xs"
                              style={{
                                transform: `scale(${Math.min(1, 1 / Math.max(1, category.name.length / 10))})`,
                                transformOrigin: 'center'
                              }}
                            >
                              {category.name}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Show Categories Grid OR Selected Categories + Game Setup */}
        {showCategoriesGrid || selectedCategories.length < 6 ? (
          <div className="w-full animate-slideInFromTop max-lg:landscape:px-[75px] md:max-lg:landscape:px-[90px] lg:px-[110px]">
            {/* Selection Counter */}
            <div className="text-center mb-4 md:mb-6 flex-shrink-0">
              <div className="bg-gray-100 dark:bg-slate-800 border-2 border-gray-300 dark:border-slate-600 rounded-lg p-2 md:p-4 inline-block">
                <span className="text-lg md:text-2xl font-bold text-red-600 dark:text-red-400">
                  {selectedCategories.length} / 6 فئات محددة
                </span>
              </div>
            </div>

            {/* Search Bar */}
            <div className="w-full max-w-sm mx-auto mb-4 relative">
              <div className="relative">
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value)
                    setShowSearchResults(e.target.value.length > 0)
                  }}
                  onFocus={() => searchText.length > 0 && setShowSearchResults(true)}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                  placeholder="ابحث عن فئة..."
                  className="w-full px-4 py-3 pr-12 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-800 border-2 border-gray-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 text-lg"
                />
                <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Autocomplete Results */}
              {showSearchResults && searchText.length > 0 && (() => {
                const filteredCategories = availableCategories.filter(cat =>
                  cat.name.toLowerCase().includes(searchText.toLowerCase())
                )

                return filteredCategories.length > 0 ? (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border-2 border-gray-300 dark:border-slate-600 rounded-xl shadow-2xl max-h-96 overflow-y-auto z-50">
                    {filteredCategories.map(category => (
                      <div
                        key={category.id}
                        onClick={() => {
                          if (selectedCategories.length < 6 || selectedCategories.includes(category.id)) {
                            toggleCategory(category.id)
                            setShowSidebar(true) // Show sidebar after selection
                          }
                          setSearchText('')
                          setShowSearchResults(false)
                        }}
                        className={`p-3 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer border-b border-gray-200 dark:border-slate-700 last:border-b-0 flex items-center gap-3 ${
                          selectedCategories.includes(category.id) ? 'bg-green-50 dark:bg-green-900/30' : ''
                        }`}
                      >
                        {category.imageUrl ? (
                          <img src={category.imageUrl} alt={category.name} className="w-12 h-12 rounded object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-2xl">
                            {category.image}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="font-bold text-gray-900 dark:text-gray-100">{category.name}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {masterCategories.find(m => m.id === category.masterCategoryId)?.name || 'فئات عامة'}
                          </div>
                        </div>
                        {selectedCategories.includes(category.id) && (
                          <div className="text-green-600 dark:text-green-400 font-bold">✓</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border-2 border-gray-300 dark:border-slate-600 rounded-xl shadow-xl p-4 z-50">
                    <div className="text-gray-500 dark:text-gray-400 text-center">لا توجد نتائج</div>
                  </div>
                )
              })()}
            </div>

            {/* View Mode Toggle - Pill shaped */}
            <div className="flex justify-center mb-6 md:mb-8">
              <div className="inline-flex bg-white dark:bg-slate-800 rounded-full border-2 border-gray-300 dark:border-slate-600 shadow-md overflow-hidden">
                {/* Ungrouped View - Grid of squares */}
                <button
                  onClick={() => setViewMode('ungrouped')}
                  onTouchEnd={(e) => e.currentTarget.blur()}
                  className={`px-4 py-2.5 md:px-5 md:py-3 transition-all duration-200 flex items-center justify-center ${
                    viewMode === 'ungrouped'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-500 dark:text-gray-400 [@media(hover:hover)]:hover:bg-gray-100 [@media(hover:hover)]:dark:hover:bg-slate-700'
                  }`}
                  title="عرض بدون تصنيف"
                >
                  <svg className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                </button>

                {/* Grouped View - Stacked rectangles */}
                <button
                  onClick={() => setViewMode('grouped')}
                  onTouchEnd={(e) => e.currentTarget.blur()}
                  className={`px-4 py-2.5 md:px-5 md:py-3 transition-all duration-200 flex items-center justify-center border-x-2 border-gray-300 dark:border-slate-600 ${
                    viewMode === 'grouped'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-500 dark:text-gray-400 [@media(hover:hover)]:hover:bg-gray-100 [@media(hover:hover)]:dark:hover:bg-slate-700'
                  }`}
                  title="عرض حسب التصنيف"
                >
                  <svg className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="3" width="18" height="5" rx="1.5" />
                    <rect x="3" y="10" width="18" height="5" rx="1.5" />
                    <rect x="3" y="17" width="18" height="5" rx="1.5" />
                  </svg>
                </button>

                {/* Favorites - Heart */}
                <button
                  onClick={() => setViewMode('favorites')}
                  onTouchEnd={(e) => e.currentTarget.blur()}
                  className={`px-4 py-2.5 md:px-5 md:py-3 transition-all duration-200 flex items-center justify-center ${
                    viewMode === 'favorites'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-500 dark:text-gray-400 [@media(hover:hover)]:hover:bg-gray-100 [@media(hover:hover)]:dark:hover:bg-slate-700'
                  }`}
                  title="المفضلة"
                >
                  <svg className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Categories Grid - Grouped by Master Categories */}
            <div className="w-full max-w-[1800px] mx-auto flex-1">
              {isLoading ? (
                // Show skeleton loading cards without blocking UI
                <div className="grid grid-cols-3 sm:grid-cols-4 landscape:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3 lg:gap-4">
                  {Array.from({ length: 21 }).map((_, index) => (
                    <div
                      key={`skeleton-${index}`}
                      className="relative p-0 rounded-lg flex flex-col border-2 border-gray-200 bg-gray-50 animate-pulse aspect-[3/4]"
                    >
                      <div className="flex-1 relative flex items-center justify-center">
                        <div className="w-8 h-8 bg-gray-300 dark:bg-slate-600 rounded"></div>
                      </div>
                      <div className="p-2 md:p-3 border-t-2 border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-700">
                        <div className="h-4 bg-gray-300 dark:bg-slate-600 rounded w-3/4 mx-auto"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : viewMode === 'favorites' ? (
                // Favorites view - show favorited categories
                favoriteCategories.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 md:py-24">
                    <svg className="w-16 h-16 md:w-24 md:h-24 text-gray-300 dark:text-slate-600 mb-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    <h3 className="text-xl md:text-2xl font-bold text-gray-400 dark:text-slate-500 mb-2">لا توجد فئات مفضلة</h3>
                    <p className="text-gray-400 dark:text-slate-500 text-center">اضغط على القلب في أي فئة لإضافتها للمفضلة</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 landscape:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3 lg:gap-4">
                    {availableCategories
                      .filter(cat => favoriteCategories.includes(cat.id))
                      .map((category) => {
                        const selected = isSelected(category.id)
                        const needsReset = categoryNeedsReset(category.id)
                        const canSelect = (selectedCategories.length < 6 || selected) && !needsReset

                        return (
                          <button
                            key={category.id}
                            id={`category-${category.id}`}
                            onClick={() => canSelect && toggleCategory(category.id)}
                            disabled={!canSelect && !needsReset}
                            onTouchEnd={(e) => e.currentTarget.blur()}
                            className={`
                              relative p-0 rounded-lg font-bold transition-all duration-200 transform overflow-hidden border-2 flex flex-col aspect-[3/4] max-lg:landscape:aspect-[4/5]
                              text-sm max-lg:landscape:!text-xs md:!text-lg lg:!text-xl xl:!text-2xl
                              ${needsReset
                                ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-400 dark:border-slate-600 grayscale'
                                : selected
                                ? 'text-white shadow-lg scale-105 border-red-600 dark:border-red-500'
                                : canSelect
                                ? 'text-red-600 dark:text-red-400 border-gray-300 dark:border-slate-600 active:border-red-300 active:shadow-lg active:scale-105 [@media(hover:hover)]:hover:border-red-300 [@media(hover:hover)]:hover:shadow-lg [@media(hover:hover)]:hover:scale-105'
                                : 'text-gray-500 dark:text-gray-600 cursor-not-allowed border-gray-400 dark:border-slate-700 opacity-50'
                              }
                            `}
                          >
                            {/* Reset overlay for exhausted categories */}
                            {needsReset && (
                              <div
                                className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 rounded-lg cursor-pointer"
                                onClick={(e) => handleCategoryReset(e, category.id)}
                              >
                                <div className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 md:p-4 transition-colors shadow-lg">
                                  <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                </div>
                                <span className="text-white text-xs md:text-sm mt-2 font-bold">إعادة تعيين</span>
                              </div>
                            )}

                            {/* Main content area with background image */}
                            <BackgroundImage
                              src={category.imageUrl}
                              size="medium"
                              context="category"
                              categoryId={category.id}
                              className={`flex-1 relative flex items-center justify-center rounded-t-lg ${
                                needsReset
                                  ? 'bg-gray-400 dark:bg-slate-600'
                                  : selected
                                  ? 'bg-red-600 dark:bg-red-700'
                                  : canSelect
                                  ? 'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700'
                                  : 'bg-gray-300 dark:bg-slate-700'
                              }`}
                              fallbackGradient={
                                needsReset
                                  ? 'from-gray-400 to-gray-500'
                                  : selected
                                  ? 'from-red-600 to-red-700'
                                  : canSelect
                                  ? 'from-white to-gray-50'
                                  : 'from-gray-300 to-gray-400'
                              }
                            >
                              {/* Overlay for better text readability when image is present */}
                              {category.imageUrl && (
                                <div className={`absolute inset-0 rounded-t-lg ${needsReset ? 'bg-black/50' : 'bg-black/30'}`}></div>
                              )}
                              {/* Question count badge - top left corner */}
                              <div className={`absolute top-1 left-1 sm:top-1.5 sm:left-1.5 md:top-2 md:left-2 text-white rounded-full w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 flex items-center justify-center text-[8px] sm:text-[10px] md:text-xs lg:text-sm font-bold z-20 ${
                                needsReset ? 'bg-red-600' : 'bg-blue-600'
                              }`}>
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

                            {/* Favorite heart button - positioned above bottom bar */}
                            <button
                              onClick={(e) => toggleFavorite(category.id, e)}
                              onTouchEnd={(e) => { e.stopPropagation(); e.currentTarget.blur() }}
                              className={`absolute bottom-8 right-1 sm:bottom-9 sm:right-1.5 md:bottom-11 md:right-2 lg:bottom-12 z-20 p-1 sm:p-1.5 rounded-full transition-all duration-200 ${
                                favoriteCategories.includes(category.id)
                                  ? 'text-red-500 [@media(hover:hover)]:hover:text-red-600'
                                  : 'text-white/70 [@media(hover:hover)]:hover:text-red-400'
                              } [@media(hover:hover)]:hover:scale-110 active:scale-95`}
                              title={favoriteCategories.includes(category.id) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                            >
                              <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 drop-shadow-lg" viewBox="0 0 24 24" fill={favoriteCategories.includes(category.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                              </svg>
                            </button>

                            {/* Bottom bar with category name */}
                            <div className={`h-7 sm:h-8 md:h-10 lg:h-11 flex items-center justify-center px-1 border-t-2 relative z-10 ${
                              needsReset
                                ? 'bg-gray-400 dark:bg-slate-600 border-gray-500 dark:border-slate-700'
                                : selected
                                ? 'bg-red-700 dark:bg-red-800 border-red-800 dark:border-red-900'
                                : canSelect
                                ? 'bg-gray-100 dark:bg-slate-700 border-gray-200 dark:border-slate-600'
                                : 'bg-gray-400 dark:bg-slate-600 border-gray-500 dark:border-slate-700'
                            }`}>
                              <AutoFitText
                                text={category.name}
                                className="font-bold"
                                minFontSize={8}
                                maxFontSize={16}
                              />
                            </div>
                          </button>
                        )
                      })}
                  </div>
                )
              ) : viewMode === 'ungrouped' ? (
                // Ungrouped view - flat grid without categories
                (() => {
                  // Get all categories sorted by master category order, then by displayOrder
                  const allCategories = [...availableCategories].sort((a, b) => {
                    // First sort by master category order
                    const masterA = masterCategories.find(m => m.id === a.masterCategoryId)
                    const masterB = masterCategories.find(m => m.id === b.masterCategoryId)
                    const masterOrderA = masterA?.order ?? 999
                    const masterOrderB = masterB?.order ?? 999
                    if (masterOrderA !== masterOrderB) return masterOrderA - masterOrderB
                    // Then sort by displayOrder within same master category
                    return (a.displayOrder || 0) - (b.displayOrder || 0)
                  })

                  return (
                    <div className="grid grid-cols-3 sm:grid-cols-4 landscape:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3 lg:gap-4">
                      {allCategories.map((category) => {
                        const selected = isSelected(category.id)
                        const needsReset = categoryNeedsReset(category.id)
                        const canSelect = (selectedCategories.length < 6 || selected) && !needsReset

                        return (
                          <button
                            key={category.id}
                            id={`category-${category.id}`}
                            onClick={() => canSelect && toggleCategory(category.id)}
                            disabled={!canSelect && !needsReset}
                            onTouchEnd={(e) => e.currentTarget.blur()}
                            className={`
                              relative p-0 rounded-lg font-bold transition-all duration-200 transform overflow-hidden border-2 flex flex-col aspect-[3/4] max-lg:landscape:aspect-[4/5]
                              text-sm max-lg:landscape:!text-xs md:!text-lg lg:!text-xl xl:!text-2xl
                              ${needsReset
                                ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-400 dark:border-slate-600 grayscale'
                                : selected
                                ? 'text-white shadow-lg scale-105 border-red-600 dark:border-red-500'
                                : canSelect
                                ? 'text-red-600 dark:text-red-400 border-gray-300 dark:border-slate-600 active:border-red-300 active:shadow-lg active:scale-105 [@media(hover:hover)]:hover:border-red-300 [@media(hover:hover)]:hover:shadow-lg [@media(hover:hover)]:hover:scale-105'
                                : 'text-gray-500 dark:text-gray-600 cursor-not-allowed border-gray-400 dark:border-slate-700 opacity-50'
                              }
                            `}
                          >
                            {/* Reset overlay for exhausted categories */}
                            {needsReset && (
                              <div
                                className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 rounded-lg cursor-pointer"
                                onClick={(e) => handleCategoryReset(e, category.id)}
                              >
                                <div className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 md:p-4 transition-colors shadow-lg">
                                  <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                </div>
                                <span className="text-white text-xs md:text-sm mt-2 font-bold">إعادة تعيين</span>
                              </div>
                            )}

                            {/* Main content area with background image */}
                            <BackgroundImage
                              src={category.imageUrl}
                              size="medium"
                              context="category"
                              categoryId={category.id}
                              className={`flex-1 relative flex items-center justify-center rounded-t-lg ${
                                needsReset
                                  ? 'bg-gray-400 dark:bg-slate-600'
                                  : selected
                                  ? 'bg-red-600 dark:bg-red-700'
                                  : canSelect
                                  ? 'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700'
                                  : 'bg-gray-300 dark:bg-slate-700'
                              }`}
                              fallbackGradient={
                                needsReset
                                  ? 'from-gray-400 to-gray-500'
                                  : selected
                                  ? 'from-red-600 to-red-700'
                                  : canSelect
                                  ? 'from-white to-gray-50'
                                  : 'from-gray-300 to-gray-400'
                              }
                            >
                              {/* Overlay for better text readability when image is present */}
                              {category.imageUrl && (
                                <div className={`absolute inset-0 rounded-t-lg ${needsReset ? 'bg-black/50' : 'bg-black/30'}`}></div>
                              )}
                              {/* Question count badge - top left corner */}
                              <div className={`absolute top-1 left-1 sm:top-1.5 sm:left-1.5 md:top-2 md:left-2 text-white rounded-full w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 flex items-center justify-center text-[8px] sm:text-[10px] md:text-xs lg:text-sm font-bold z-20 ${
                                needsReset ? 'bg-red-600' : 'bg-blue-600'
                              }`}>
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

                            {/* Favorite heart button - positioned above bottom bar */}
                            <button
                              onClick={(e) => toggleFavorite(category.id, e)}
                              onTouchEnd={(e) => { e.stopPropagation(); e.currentTarget.blur() }}
                              className={`absolute bottom-8 right-1 sm:bottom-9 sm:right-1.5 md:bottom-11 md:right-2 lg:bottom-12 z-20 p-1 sm:p-1.5 rounded-full transition-all duration-200 ${
                                favoriteCategories.includes(category.id)
                                  ? 'text-red-500 [@media(hover:hover)]:hover:text-red-600'
                                  : 'text-white/70 [@media(hover:hover)]:hover:text-red-400'
                              } [@media(hover:hover)]:hover:scale-110 active:scale-95`}
                              title={favoriteCategories.includes(category.id) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                            >
                              <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 drop-shadow-lg" viewBox="0 0 24 24" fill={favoriteCategories.includes(category.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                              </svg>
                            </button>

                            {/* Bottom bar with category name */}
                            <div className={`h-7 sm:h-8 md:h-10 lg:h-11 flex items-center justify-center px-1 border-t-2 relative z-10 ${
                              needsReset
                                ? 'bg-gray-400 dark:bg-slate-600 border-gray-500 dark:border-slate-700'
                                : selected
                                ? 'bg-red-700 dark:bg-red-800 border-red-800 dark:border-red-900'
                                : canSelect
                                ? 'bg-gray-100 dark:bg-slate-700 border-gray-200 dark:border-slate-600'
                                : 'bg-gray-400 dark:bg-slate-600 border-gray-500 dark:border-slate-700'
                            }`}>
                              <AutoFitText
                                text={category.name}
                                className="font-bold"
                                minFontSize={8}
                                maxFontSize={16}
                              />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                })()
              ) : (
                (() => {
                  // Grouped view (default) - Group categories by masterCategoryId and sort by displayOrder
                  const groupedCategories = {}

                  availableCategories.forEach(category => {
                    const masterId = category.masterCategoryId || 'general'
                    if (!groupedCategories[masterId]) {
                      groupedCategories[masterId] = []
                    }
                    groupedCategories[masterId].push(category)
                  })

                  // Sort categories within each group by displayOrder
                  Object.keys(groupedCategories).forEach(masterId => {
                    groupedCategories[masterId].sort((a, b) =>
                      (a.displayOrder || 0) - (b.displayOrder || 0)
                    )
                  })

                  // Find "newest" categories based on createdAt date
                  const cutoffDate = Date.now() - (newestCategoriesDays * 24 * 60 * 60 * 1000)
                  const newestCategories = availableCategories.filter(cat => {
                    if (!cat.createdAt) return false
                    const createdTime = cat.createdAt instanceof Date
                      ? cat.createdAt.getTime()
                      : new Date(cat.createdAt).getTime()
                    return createdTime > cutoffDate
                  }).sort((a, b) => {
                    // Sort newest first
                    const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime()
                    const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime()
                    return bTime - aTime
                  })

                  // Create sorted array of master categories
                  const sortedMasters = []

                  // Add "Newest Categories" virtual group at the very top (only if there are new categories)
                  if (newestCategories.length > 0) {
                    sortedMasters.push({
                      id: 'newest',
                      name: newestCategoriesName,
                      order: -1,
                      categories: newestCategories,
                      isVirtual: true
                    })
                  }

                  // Add general category after newest if it exists
                  if (groupedCategories['general']) {
                    sortedMasters.push({
                      id: 'general',
                      name: 'فئات عامة',
                      order: 0,
                      categories: groupedCategories['general']
                    })
                  }

                  // Add other master categories sorted by order (exclude 'general' since we added it above)
                  masterCategories
                    .filter(master => master.id !== 'general' && groupedCategories[master.id])
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .forEach(master => {
                      sortedMasters.push({
                        id: master.id,
                        name: master.name,
                        order: master.order,
                        categories: groupedCategories[master.id]
                      })
                    })

                  // Render grouped categories
                  return sortedMasters.map(master => (
                    <div key={master.id} className="mb-10 relative">
                      {/* Categories Container with header badge */}
                      <div className={`bg-gradient-to-b from-white to-gray-50 dark:from-slate-800 dark:to-slate-900 rounded-2xl md:rounded-3xl px-3 sm:px-6 md:px-8 lg:px-10 relative transition-all duration-300 shadow-xl ${
                        expandedMasters[master.id] ? 'py-16 sm:py-20 md:py-24' : 'py-8'
                      }`}>
                        {/* Master Header Badge - centered at top */}
                        <div className="rounded-full bg-red-600 dark:bg-red-700 -top-4 sm:-top-5 md:-top-6 -translate-x-1/2 left-1/2 absolute flex items-center justify-center py-1.5 px-4 sm:py-2 sm:px-6 md:py-2.5 md:px-8 overflow-hidden transition-all shadow-lg">
                          <span className="text-base sm:text-lg md:text-xl text-white font-bold whitespace-nowrap">
                            {master.name}
                          </span>
                        </div>

                        {/* Plus/Minus toggle button */}
                        <button
                          onClick={() => toggleMasterExpand(master.id)}
                          className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full absolute cursor-pointer flex justify-center items-center shadow-md right-2 sm:right-3 md:right-4 ${
                            expandedMasters[master.id]
                              ? 'bg-gray-400 dark:bg-slate-600 hover:bg-gray-500 dark:hover:bg-slate-500 top-2 sm:top-3 md:top-4'
                              : 'bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-600 top-1/2 -translate-y-1/2'
                          }`}
                        >
                          {expandedMasters[master.id] ? (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
                              <rect x="5" y="10.5" width="14" height="3" rx="1.5" fill="currentColor"/>
                            </svg>
                          ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
                              <rect x="5" y="10.5" width="14" height="3" rx="1.5" fill="currentColor"/>
                              <rect x="10.5" y="5" width="3" height="14" rx="1.5" fill="currentColor"/>
                            </svg>
                          )}
                        </button>

                        {/* Categories Grid (only if expanded) */}
                        {expandedMasters[master.id] && (
                          <div className="grid grid-cols-3 sm:grid-cols-4 landscape:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3 lg:gap-4">
                          {master.categories.map((category) => {
                            const selected = isSelected(category.id)
                            const needsReset = categoryNeedsReset(category.id)
                            const canSelect = (selectedCategories.length < 6 || selected) && !needsReset

                            return (
                              <button
                                key={category.id}
                                id={`category-${category.id}`}
                                onClick={() => canSelect && toggleCategory(category.id)}
                                disabled={!canSelect && !needsReset}
                                onTouchEnd={(e) => e.currentTarget.blur()}
                                className={`
                                  relative p-0 rounded-lg font-bold transition-all duration-200 transform overflow-hidden border-2 flex flex-col aspect-[3/4] max-lg:landscape:aspect-[4/5]
                                  text-sm max-lg:landscape:!text-xs md:!text-lg lg:!text-xl xl:!text-2xl
                                  ${needsReset
                                    ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-400 dark:border-slate-600 grayscale'
                                    : selected
                                    ? 'text-white shadow-lg scale-105 border-red-600 dark:border-red-500'
                                    : canSelect
                                    ? 'text-red-600 dark:text-red-400 border-gray-300 dark:border-slate-600 active:border-red-300 active:shadow-lg active:scale-105 [@media(hover:hover)]:hover:border-red-300 [@media(hover:hover)]:hover:shadow-lg [@media(hover:hover)]:hover:scale-105'
                                    : 'text-gray-500 dark:text-gray-600 cursor-not-allowed border-gray-400 dark:border-slate-700 opacity-50'
                                  }
                                `}
                              >
                                {/* Reset overlay for exhausted categories */}
                                {needsReset && (
                                  <div
                                    className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 rounded-lg cursor-pointer"
                                    onClick={(e) => handleCategoryReset(e, category.id)}
                                  >
                                    <div className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 md:p-4 transition-colors shadow-lg">
                                      <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                      </svg>
                                    </div>
                                    <span className="text-white text-xs md:text-sm mt-2 font-bold">إعادة تعيين</span>
                                  </div>
                                )}

                                {/* Main content area with background image */}
                                <BackgroundImage
                                  src={category.imageUrl}
                                  size="medium"
                                  context="category"
                                  categoryId={category.id}
                                  className={`flex-1 relative flex items-center justify-center rounded-t-lg ${
                                    needsReset
                                      ? 'bg-gray-400 dark:bg-slate-600'
                                      : selected
                                      ? 'bg-red-600 dark:bg-red-700'
                                      : canSelect
                                      ? 'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700'
                                      : 'bg-gray-300 dark:bg-slate-700'
                                  }`}
                                  fallbackGradient={
                                    needsReset
                                      ? 'from-gray-400 to-gray-500'
                                      : selected
                                      ? 'from-red-600 to-red-700'
                                      : canSelect
                                      ? 'from-white to-gray-50'
                                      : 'from-gray-300 to-gray-400'
                                  }
                                >
                                  {/* Overlay for better text readability when image is present */}
                                  {category.imageUrl && (
                                    <div className={`absolute inset-0 rounded-t-lg ${needsReset ? 'bg-black/50' : 'bg-black/30'}`}></div>
                                  )}
                                                                    {/* Question count badge - top left corner */}
                                  <div className={`absolute top-1 left-1 sm:top-1.5 sm:left-1.5 md:top-2 md:left-2 text-white rounded-full w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 flex items-center justify-center text-[8px] sm:text-[10px] md:text-xs lg:text-sm font-bold z-20 ${
                                    needsReset ? 'bg-red-600' : 'bg-blue-600'
                                  }`}>
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

                                {/* Favorite heart button - positioned above bottom bar */}
                                <button
                                  onClick={(e) => toggleFavorite(category.id, e)}
                                  onTouchEnd={(e) => { e.stopPropagation(); e.currentTarget.blur() }}
                                  className={`absolute bottom-8 right-1 sm:bottom-9 sm:right-1.5 md:bottom-11 md:right-2 lg:bottom-12 z-20 p-1 sm:p-1.5 rounded-full transition-all duration-200 ${
                                    favoriteCategories.includes(category.id)
                                      ? 'text-red-500 [@media(hover:hover)]:hover:text-red-600'
                                      : 'text-white/70 [@media(hover:hover)]:hover:text-red-400'
                                  } [@media(hover:hover)]:hover:scale-110 active:scale-95`}
                                  title={favoriteCategories.includes(category.id) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                                >
                                  <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 drop-shadow-lg" viewBox="0 0 24 24" fill={favoriteCategories.includes(category.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                  </svg>
                                </button>

                                {/* Bottom bar with category name */}
                                <div className={`h-7 sm:h-8 md:h-10 lg:h-11 flex items-center justify-center px-1 border-t-2 relative z-10 ${
                                  needsReset
                                    ? 'bg-gray-400 dark:bg-slate-600 border-gray-500 dark:border-slate-700'
                                    : selected
                                    ? 'bg-red-700 dark:bg-red-800 border-red-800 dark:border-red-900'
                                    : canSelect
                                    ? 'bg-gray-100 dark:bg-slate-700 border-gray-200 dark:border-slate-600'
                                    : 'bg-gray-400 dark:bg-slate-600 border-gray-500 dark:border-slate-700'
                                }`}>
                                  <AutoFitText
                                    text={category.name}
                                    className="font-bold"
                                    minFontSize={8}
                                    maxFontSize={16}
                                  />
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                      </div>
                    </div>
                  ))
                })()
              )}
            </div>
          </div>
        ) : (
          /* Perk Selection OR Game Setup Section - Shown when 6 categories selected */
          <div className="w-full max-w-3xl animate-slideInFromBottom">
            {/* Selected Categories Display - Compact */}
            <div className="mb-4 md:mb-6">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-3 md:p-4 shadow-lg border border-green-300 dark:border-green-700">
                <div className="text-center mb-2">
                  <span className="inline-flex items-center gap-1 md:gap-2 bg-green-600 dark:bg-green-700 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-bold">
                    <span>✓</span>
                    <span>تم اختيار 6 فئات</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 md:gap-2 justify-center mb-2">
                  {selectedCategories.map((categoryId) => {
                    const category = availableCategories.find(cat => cat.id === categoryId)
                    return category ? (
                      <div key={categoryId} className="bg-red-600 dark:bg-red-700 text-white px-2 md:px-4 py-1 md:py-1.5 rounded-full text-xs md:text-base lg:text-lg font-bold">
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
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 md:p-6 border border-gray-200 dark:border-slate-700 mb-4 md:mb-6">
                {/* Title */}
                <div className="text-center mb-4 md:mb-6">
                  <h2 className="font-bold text-red-600 dark:text-red-400 text-xl md:text-2xl">
                    اعدادات وسائل المساعدة
                  </h2>
                </div>

                {/* Selection Counter with Random Button */}
                <div className="text-center mb-4 md:mb-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <div className="bg-gray-100 dark:bg-slate-700 border-2 border-gray-300 dark:border-slate-600 rounded-lg p-2 md:p-3 inline-block">
                    <span className="text-base md:text-xl font-bold text-red-600 dark:text-red-400">
                      {selectedPerks.length === 0 && 'اختر 3 وسائل مساعدة'}
                      {selectedPerks.length === 1 && 'اختر وسيلتين إضافيتين'}
                      {selectedPerks.length === 2 && 'اختر وسيلة واحدة إضافية'}
                      {selectedPerks.length === 3 && '✓ تم اختيار جميع الوسائل'}
                    </span>
                  </div>
                  <button
                    onClick={handleRandomPerks}
                    disabled={isRandomizing}
                    className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 text-white font-bold px-4 md:px-6 py-2 md:py-3 rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 disabled:hover:scale-100 text-sm md:text-base flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7.5 18c-.83 0-1.5-.67-1.5-1.5S6.67 15 7.5 15s1.5.67 1.5 1.5S8.33 18 7.5 18zm0-9C6.67 9 6 8.33 6 7.5S6.67 6 7.5 6 9 6.67 9 7.5 8.33 9 7.5 9zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-9c-.83 0-1.5-.67-1.5-1.5S15.67 6 16.5 6s1.5.67 1.5 1.5S17.33 9 16.5 9z" fill="currentColor"/>
                    </svg>
                    {isRandomizing ? 'جاري الاختيار...' : 'عشوائي'}
                  </button>
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
                        onClick={() => !isDisabled && !isRandomizing && handlePerkClick(perkId)}
                        disabled={isDisabled || isRandomizing}
                        className={`
                          rounded-full flex items-center justify-center transform
                          w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-20 lg:h-20
                          ${isRandomizing
                            ? 'animate-pulse transition-all duration-150'
                            : 'transition-all duration-200'
                          }
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
                  <div className="mt-4 bg-gray-50 dark:bg-slate-700 rounded-xl p-4 md:p-6 border-2 border-gray-200 dark:border-slate-600 animate-slideDown">
                    <button
                      onClick={() => setExpandedPerk(null)}
                      className="float-left text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-bold text-xl"
                    >
                      ×
                    </button>
                    <div className="text-center">
                      <div className="flex justify-center mb-3">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                          selectedPerks.includes(expandedPerk) ? 'bg-red-600 dark:bg-red-700 text-white' : 'bg-gray-400 dark:bg-slate-600 text-gray-600 dark:text-gray-300'
                        }`}>
                          {getPerkInfo(expandedPerk).icon}
                        </div>
                      </div>
                      <h3 className="font-bold text-lg md:text-xl mb-2 text-gray-800 dark:text-gray-100">
                        {getPerkInfo(expandedPerk).title}
                      </h3>
                      <p className="text-gray-700 dark:text-gray-300 text-sm md:text-base leading-relaxed" dir="rtl">
                        {getPerkInfo(expandedPerk).description}
                      </p>
                      {getPerkInfo(expandedPerk).duration && (
                        <p className="text-gray-600 dark:text-gray-400 text-xs md:text-sm mt-2">
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
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 md:p-6 border border-gray-200 dark:border-slate-700">
                {/* Title */}
                <div className="text-center mb-4 md:mb-6">
                  <h2 className="font-bold text-red-600 dark:text-red-400" style={{ fontSize: `${styles.labelFontSize * 1.3}px` }}>
                    إعداد فرق اللعبة
                  </h2>
                </div>

                {/* Game Name Section */}
                <div className="mb-4 md:mb-5">
                  <label className="flex items-center justify-center gap-1.5 mb-2 font-bold text-gray-700 dark:text-gray-300" style={{ fontSize: `${styles.labelFontSize}px` }}>
                    <span>اسم اللعبة</span>
                  </label>
                  <input
                    type="text"
                    value={gameName}
                    onChange={(e) => setGameName(e.target.value)}
                    dir="auto"
                    className="w-full border-2 border-gray-300 dark:border-slate-600 rounded-xl text-center font-bold focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 dark:focus:ring-red-800 bg-white dark:bg-slate-700 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all text-gray-900 dark:text-gray-100"
                    style={{
                      padding: `${styles.inputPadding}px ${styles.inputPadding * 1.5}px`,
                      fontSize: `${styles.inputFontSize}px`,
                      height: `${styles.inputHeight}px`,
                      boxSizing: 'border-box'
                    }}
                    placeholder="أدخل اسم اللعبة"
                    maxLength={30}
                  />
                </div>

                {/* Teams Section */}
                <div className={`${styles.isPortrait ? 'flex flex-col' : 'grid grid-cols-2'} gap-3 md:gap-4 mb-4 md:mb-5`}>
                  {/* Team 1 */}
                  <div className="bg-gray-50 dark:bg-slate-700 p-3 md:p-4 rounded-xl border border-gray-300 dark:border-slate-600">
                    <label className="flex items-center justify-center gap-1.5 mb-2 font-bold text-gray-700 dark:text-gray-300" style={{ fontSize: `${styles.labelFontSize * 0.95}px` }}>
                      <span>الفريق الأول</span>
                    </label>
                    <input
                      type="text"
                      value={team1Name}
                      onChange={(e) => setTeam1Name(e.target.value)}
                      dir="auto"
                      className="w-full border-2 border-gray-300 dark:border-slate-600 rounded-xl text-center font-bold focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 dark:focus:ring-red-800 bg-white dark:bg-slate-600 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all text-gray-700 dark:text-gray-200"
                      style={{
                        padding: `${styles.inputPadding}px ${styles.inputPadding * 1.5}px`,
                        fontSize: `${styles.inputFontSize}px`,
                        height: `${styles.inputHeight}px`,
                        boxSizing: 'border-box',
                        
                      }}
                      placeholder="اسم الفريق"
                      maxLength={20}
                    />
                  </div>

                  {/* Team 2 */}
                  <div className="bg-gray-50 dark:bg-slate-700 p-3 md:p-4 rounded-xl border border-gray-300 dark:border-slate-600">
                    <label className="flex items-center justify-center gap-1.5 mb-2 font-bold text-gray-700 dark:text-gray-300" style={{ fontSize: `${styles.labelFontSize * 0.95}px` }}>
                      <span>الفريق الثاني</span>
                    </label>
                    <input
                      type="text"
                      value={team2Name}
                      onChange={(e) => setTeam2Name(e.target.value)}
                      dir="auto"
                      className="w-full border-2 border-gray-300 dark:border-slate-600 rounded-xl text-center font-bold focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 dark:focus:ring-red-800 bg-white dark:bg-slate-600 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 transition-all text-gray-700 dark:text-gray-200"
                      style={{
                        padding: `${styles.inputPadding}px ${styles.inputPadding * 1.5}px`,
                        fontSize: `${styles.inputFontSize}px`,
                        height: `${styles.inputHeight}px`,
                        boxSizing: 'border-box',
                        
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
                    disabled={!gameName?.trim() || !team1Name?.trim() || !team2Name?.trim() || !isAuthenticated || isStartingGame}
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
                    ) : isStartingGame ? (
                      <span className="inline-flex items-center gap-2 justify-center">
                        جاري التحميل...
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
