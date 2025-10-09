import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PresentationModeToggle from '../components/PresentationModeToggle'
import { useAuth } from '../hooks/useAuth'
import AudioPlayer from '../components/AudioPlayer'
import QuestionMediaPlayer from '../components/QuestionMediaPlayer'
import { GameDataLoader } from '../utils/gameDataLoader'
import PerkModal from '../components/PerkModal'
import gamePreloader from '../utils/preloader'
import questionUsageTracker from '../utils/questionUsageTracker'
import LogoDisplay from '../components/LogoDisplay'
import { hasGameStarted, shouldStayOnCurrentPage } from '../utils/gameStateUtils'
import SmartImage from '../components/SmartImage'

function QuestionView({ gameState, setGameState, stateLoaded }) {
  const navigate = useNavigate()
  const location = useLocation()

  // Debug: Log current question with video URLs
  useEffect(() => {
    if (gameState?.currentQuestion) {
      devLog('🎬 Current question data:', {
        text: gameState.currentQuestion.text?.substring(0, 50) + '...',
        hasVideoUrl: !!gameState.currentQuestion.videoUrl,
        hasAnswerVideoUrl: !!gameState.currentQuestion.answerVideoUrl,
        videoUrl: gameState.currentQuestion.videoUrl,
        answerVideoUrl: gameState.currentQuestion.answerVideoUrl,
        allKeys: Object.keys(gameState.currentQuestion)
      })

      // Check if this is a question that has video but is missing video URLs
      if (!gameState.currentQuestion.videoUrl && !gameState.currentQuestion.answerVideoUrl) {
        devLog('⚠️ Question has no video URLs - cache might need clearing!')
      }
    }
  }, [gameState?.currentQuestion])

  // Responsive scaling system - viewport-aware scaling to prevent scrolling
  const getResponsiveStyles = () => {
    try {
      const W = window.innerWidth || 375 // Fallback width
      const H = window.innerHeight || 667 // Fallback height

      // PC Auto-scaling: Apply 2x scaling for desktop/PC users for better visibility
      const isPC = W >= 1024 && H >= 768 // Desktop/laptop detection
      const pcScaleFactor = isPC ? 2.0 : 1.0 // 200% scaling for PC, normal for mobile/tablet

      // Use dynamic viewport height for better mobile support
      const actualVH = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : H

      // Device and orientation detection
      const isUltraNarrow = W < 950 // Phones and small tablets
      const isMobileLayout = W < 768
      const isLandscape = W > actualVH // Landscape orientation
      const isShortScreen = actualVH < 500 // Z Fold and short screens - height-based detection!
      const isTallScreen = actualVH > 900 // Tall screens can use more space

      // Calculate header sizing first - matching Header component
      const globalScaleFactor = Math.max(0.8, Math.min(1.2, W / 400))
      let headerBaseFontSize = 16
      if (actualVH <= 390) {
        headerBaseFontSize = 14
      } else if (actualVH <= 430) {
        headerBaseFontSize = 15
      } else if (actualVH <= 568) {
        headerBaseFontSize = 16
      } else if (actualVH <= 667) {
        headerBaseFontSize = 17
      } else if (actualVH <= 812) {
        headerBaseFontSize = 18
      } else if (actualVH <= 896) {
        headerBaseFontSize = 19
      } else if (actualVH <= 1024) {
        headerBaseFontSize = 20
      } else {
        headerBaseFontSize = isPC ? 24 : 20
      }
      const buttonPadding = Math.max(8, globalScaleFactor * 12)
      const headerFontSize = headerBaseFontSize * globalScaleFactor
      const headerPadding = Math.max(8, buttonPadding * 0.25)
      const calculatedHeaderHeight = Math.max(56, headerFontSize * 3)

      // More accurate space calculation - use calculated header height
      const actualHeaderHeight = calculatedHeaderHeight
      const padding = isUltraNarrow ? 4 : isMobileLayout ? 6 : 8

      // Minimal space accounting to maximize question area
      const browserUIBuffer = 0 // No browser buffer - use natural overflow
      const buttonBuffer = 20 // Minimal space for bottom buttons

      const totalReservedSpace = actualHeaderHeight + browserUIBuffer + buttonBuffer + (padding * 2)
      const availableHeight = Math.max(350, actualVH - totalReservedSpace)
      const availableWidth = W - (padding * 2)

      // Calculate aspect ratio and screen density for better scaling with validation
      const aspectRatio = actualVH > 0 ? W / actualVH : W / H
      const screenDensity = Math.sqrt(W * W + actualVH * actualVH) / Math.max(W, actualVH || H)

      // Define UI element heights for calculations
      const timerHeight = 50 // Timer at top
      const bottomButtonsHeight = 60 // Answer/category buttons at bottom
      const safetyMargin = 20 // Extra safety margin

      // Adaptive question area height calculation based on available viewport
      // Account for all UI elements: header, timer, buttons, padding, margins
      const totalUIHeight = actualHeaderHeight + timerHeight + bottomButtonsHeight + safetyMargin + (padding * 2) + 40 // 40px for main container padding
      const availableQuestionSpace = Math.max(200, actualVH - totalUIHeight)

      // Use percentage of available space with device-specific limits
      let questionAreaHeight
      if (actualVH <= 400) {
        // Very small screens - use most available space
        questionAreaHeight = Math.min(availableQuestionSpace * 0.8, 180)
      } else if (actualVH <= 600) {
        // Small to medium phones - balanced approach
        questionAreaHeight = Math.min(availableQuestionSpace * 0.85, 300)
      } else if (actualVH <= 800) {
        // Large phones - optimal space usage
        questionAreaHeight = Math.min(availableQuestionSpace * 0.9, 450)
      } else if (actualVH <= 1000) {
        // Small tablets, phablets
        questionAreaHeight = Math.min(availableQuestionSpace * 0.9, 550)
      } else {
        // Large tablets, desktop - maximum space
        questionAreaHeight = isPC ? availableQuestionSpace * 0.9 : Math.min(availableQuestionSpace * 0.9, 700)
      }

      // Apply proper scaling with dynamic limits
      const minQuestionHeight = isShortScreen ? 150 : 200 // Minimum height for short screens
      const maxQuestionHeight = isPC ? 600 : (isTallScreen ? 500 : 400)

      const finalQuestionAreaHeight = Math.min(
        Math.max(questionAreaHeight, minQuestionHeight),
        maxQuestionHeight
      )

      // Question area width calculation with PC scaling
      let questionAreaWidth
      if (isUltraNarrow) {
        questionAreaWidth = Math.min(availableWidth * 0.95, W - 20) // Mobile: Full width minus margin
      } else {
        questionAreaWidth = Math.min(availableWidth * 0.9, isPC ? W - 100 : 600)
      }

      // Calculate responsive font sizes based on screen height
      // Use same baseFontSize as header for consistency
      const baseFontSize = headerBaseFontSize
      // Responsive team section sizing based on screen size
      let teamSectionWidth, teamNameFontSize, teamScoreFontSize, teamHelpFontSize, teamIconSize

      // Check if we're in landscape mode on small devices (ultra-compact scenario)
      const isUltraCompactLandscape = actualVH <= 450 && W > actualVH && !isPC

      if (isUltraCompactLandscape) {
        // Ultra-compact landscape mode (iPhone SE landscape, Z Fold 5 folded landscape)
        teamSectionWidth = Math.min(130, W * 0.28) // Max 28% of screen width
        teamNameFontSize = baseFontSize * 0.75 * globalScaleFactor // Increased for visibility
        teamScoreFontSize = baseFontSize * 0.9 * globalScaleFactor // Increased for visibility
        teamHelpFontSize = baseFontSize * 0.65 * globalScaleFactor // Increased for visibility
        teamIconSize = Math.max(18, 22 * globalScaleFactor) // Reduced icon size
      } else if (actualVH <= 344) {
        // Very small screens - compact everything
        teamSectionWidth = 160
        teamNameFontSize = baseFontSize * 0.75 * globalScaleFactor
        teamScoreFontSize = baseFontSize * 0.9 * globalScaleFactor
        teamHelpFontSize = baseFontSize * 0.65 * globalScaleFactor
        teamIconSize = Math.max(24, 28 * globalScaleFactor)
      } else if (actualVH <= 390) {
        // iPhone SE and similar - reduced sizing
        teamSectionWidth = 180
        teamNameFontSize = baseFontSize * 0.8 * globalScaleFactor
        teamScoreFontSize = baseFontSize * 1.0 * globalScaleFactor
        teamHelpFontSize = baseFontSize * 0.7 * globalScaleFactor
        teamIconSize = Math.max(28, 32 * globalScaleFactor)
      } else if (actualVH <= 430) {
        // Standard small phones
        teamSectionWidth = 200
        teamNameFontSize = baseFontSize * 0.85 * globalScaleFactor
        teamScoreFontSize = baseFontSize * 1.1 * globalScaleFactor
        teamHelpFontSize = baseFontSize * 0.75 * globalScaleFactor
        teamIconSize = Math.max(30, 36 * globalScaleFactor)
      } else {
        // Medium to large screens - original sizing
        teamSectionWidth = isPC ? 300 : 200
        teamNameFontSize = baseFontSize * 0.9 * globalScaleFactor
        teamScoreFontSize = baseFontSize * 1.2 * globalScaleFactor
        teamHelpFontSize = baseFontSize * 0.8 * globalScaleFactor
        teamIconSize = Math.max(32, 40 * globalScaleFactor)
      }

      // Responsive team button height
      const teamButtonHeight = isUltraCompactLandscape ? 24 : actualVH <= 344 ? 28 : actualVH <= 390 ? 32 : actualVH <= 430 ? 36 : 42

      // Responsive spacing for ultra-compact landscape
      const teamContainerGap = isUltraCompactLandscape ? 'landscape:gap-y-1' : 'landscape:gap-y-3'
      const teamContainerPadding = isUltraCompactLandscape ? 'landscape:px-1' : 'landscape:px-2.5'
      const teamContainerTopPadding = isUltraCompactLandscape ? 'landscape:pt-1' : 'landscape:pt-4'
      const teamElementSpacing = isUltraCompactLandscape ? 'mt-1' : 'mt-2' // Spacing between team name and score
      const perkIconSize = isUltraCompactLandscape ? 12 : isPC ? 20 : 16 // Even smaller perk icons
      const perkTitleSpacing = isUltraCompactLandscape ? 'mb-0' : 'mb-1 sm:mb-2 max-xl:mb-0' // Spacing below "وسائل المساعدة"
      const perkContainerSpacing = isUltraCompactLandscape ? 'my-1' : 'my-2 sm:my-3' // Spacing around perk container
      const perkButtonPadding = isUltraCompactLandscape ? 'p-0.5' : 'p-1 sm:p-2' // Perk button padding

      const buttonFontSize = baseFontSize * globalScaleFactor
      const timerSize = Math.max(180, 180 * globalScaleFactor)
      const timerEmojiSize = Math.max(16, 20 * globalScaleFactor)
      const timerFontSize = baseFontSize * 0.9 * globalScaleFactor
      const pointsFontSize = baseFontSize * 0.7 * globalScaleFactor
      const pointsPadding = Math.max(4, 6 * globalScaleFactor)
      const questionFontSize = baseFontSize * 1.1 * globalScaleFactor
      // Responsive media sizing based on screen size and available space
      let imageAreaHeight
      if (actualVH <= 344) {
        imageAreaHeight = Math.max(120, finalQuestionAreaHeight * 0.4) // Smaller for tiny screens
      } else if (actualVH <= 390) {
        imageAreaHeight = Math.max(140, finalQuestionAreaHeight * 0.45) // iPhone SE and similar
      } else if (actualVH <= 430) {
        imageAreaHeight = Math.max(160, finalQuestionAreaHeight * 0.5) // Standard small phones
      } else if (actualVH <= 600) {
        imageAreaHeight = Math.max(180, finalQuestionAreaHeight * 0.55) // Medium phones
      } else {
        imageAreaHeight = Math.max(200, finalQuestionAreaHeight * 0.6) // Large screens
      }
      const answerFontSize = baseFontSize * 1.1 * globalScaleFactor

      // Universal viewport-aware padding system to prevent overflow
      // Calculate minimum required space for UI elements (timer + buttons + margins)
      const requiredUISpace = timerHeight + bottomButtonsHeight + safetyMargin

      // Calculate bottom padding as percentage of available space after UI elements
      const availableSpaceForPadding = Math.max(0, actualVH - actualHeaderHeight - requiredUISpace)
      const paddingPercentage = Math.min(0.15, Math.max(0.05, availableSpaceForPadding / actualVH)) // 5-15% of viewport

      let bottomPadding = Math.floor(actualVH * paddingPercentage)

      // Ensure minimum and maximum bounds for different screen categories
      if (actualVH <= 400) {
        // Very small screens (iPhone SE, small Android) - minimal padding
        bottomPadding = Math.max(15, Math.min(bottomPadding, 30))
      } else if (actualVH <= 600) {
        // Small to medium phones
        bottomPadding = Math.max(25, Math.min(bottomPadding, 50))
      } else if (actualVH <= 800) {
        // Large phones (iPhone 12 Pro, Samsung S20 Ultra)
        bottomPadding = Math.max(35, Math.min(bottomPadding, 70))
      } else if (actualVH <= 1000) {
        // Small tablets, large phones
        bottomPadding = Math.max(45, Math.min(bottomPadding, 90))
      } else {
        // Large tablets, desktop
        bottomPadding = Math.max(60, Math.min(bottomPadding, isPC ? 120 : 100))
      }
      const scoringButtonWidth = Math.max(100, 120 * globalScaleFactor)
      const scoringButtonHeight = Math.max(60, 80 * globalScaleFactor)
      const scoringFontSize = baseFontSize * 0.9 * globalScaleFactor

      // Return calculated responsive values with error fallbacks
      const baseGap = isMobileLayout ? 6 : 8 // Smaller gaps for slimmer appearance

      return {
        isShortScreen,
        isTallScreen,
        isMobileLayout,
        isUltraNarrow,
        isLandscape,
        isPC,
        globalScaleFactor,
        availableHeight,
        availableWidth,
        questionAreaHeight: finalQuestionAreaHeight,
        questionAreaWidth,
        padding,
        aspectRatio,
        screenDensity,
        actualVH,
        deviceType: isPC ? 'pc' : (isMobileLayout ? 'mobile' : 'tablet'),
        pcScaleFactor,
        buttonPadding,
        headerFontSize,
        headerPadding,
        headerHeight: calculatedHeaderHeight,
        baseGap,
        teamSectionWidth,
        teamNameFontSize,
        teamScoreFontSize,
        teamHelpFontSize,
        teamIconSize,
        teamButtonHeight,
        teamContainerGap,
        teamContainerPadding,
        teamContainerTopPadding,
        teamElementSpacing,
        perkIconSize,
        perkTitleSpacing,
        perkContainerSpacing,
        perkButtonPadding,
        buttonFontSize,
        timerSize,
        timerEmojiSize,
        timerFontSize,
        pointsFontSize,
        pointsPadding,
        questionFontSize,
        imageAreaHeight,
        answerFontSize,
        scoringButtonWidth,
        scoringButtonHeight,
        scoringFontSize,
        bottomPadding
      }
    } catch (error) {
      prodError('Error in getResponsiveStyles:', error)
      // Return safe fallback values
      return {
        isSmallScreen: true,
        isMediumScreen: false,
        isLargeScreen: false,
        isShortScreen: false,
        isTallScreen: false,
        isPC: false,
        isUltraNarrow: true,
        isMobileLayout: true,
        globalScaleFactor: 1,
        availableHeight: 400,
        availableWidth: 300,
        buttonPadding: 12,
        headerFontSize: 16,
        teamSectionWidth: 200,
        teamNameFontSize: 14,
        teamScoreFontSize: 18,
        teamHelpFontSize: 12,
        teamIconSize: 32,
        teamButtonHeight: 42,
        teamContainerGap: 'landscape:gap-y-3',
        teamContainerPadding: 'landscape:px-2.5',
        teamContainerTopPadding: 'landscape:pt-4',
        teamElementSpacing: 'mt-2',
        perkIconSize: 20,
        perkTitleSpacing: 'mb-1 sm:mb-2 max-xl:mb-0',
        perkContainerSpacing: 'my-2 sm:my-3',
        perkButtonPadding: 'p-1 sm:p-2',
        buttonFontSize: 16,
        timerSize: 220,
        timerEmojiSize: 16,
        timerFontSize: 14,
        pointsFontSize: 12,
        pointsPadding: 6,
        questionFontSize: 18,
        imageAreaHeight: 200,
        answerFontSize: 18,
        scoringButtonWidth: 100,
        scoringButtonHeight: 60,
        scoringFontSize: 14
      }
    }
  }

  const [timeElapsed, setTimeElapsed] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showScoring, setShowScoring] = useState(false)
  const [timerActive, setTimerActive] = useState(true)
  const [imageZoomed, setImageZoomed] = useState(false)
  const [gameData, setGameData] = useState(null)
  const [preloadedImages, setPreloadedImages] = useState(new Set())
  const [imageLoading, setImageLoading] = useState(false)


  // Perk system state
  const [perkModalOpen, setPerkModalOpen] = useState(false)
  const [activePerk, setActivePerk] = useState({ type: null, team: null })
  const [activeTimer, setActiveTimer] = useState({ active: false, type: null, team: null, timeLeft: 0, paused: false })
  const [burgerMenuOpen, setBurgerMenuOpen] = useState(false)
  const { isAuthenticated, loading, user } = useAuth()
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)

  // Memoized responsive styles
  const styles = useMemo(() => getResponsiveStyles(), [])

  // Set user ID for question tracker when user changes
  useEffect(() => {
    devLog('🔧 QuestionView: User changed:', user?.uid ? 'User ID: ' + user.uid : 'No user')
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
      devLog('✅ QuestionView: Set questionUsageTracker user ID to:', user.uid)
    }
  }, [user])

  // BULLETPROOF: No redirects to categories after game starts
  useEffect(() => {
    if (!stateLoaded) return

    // Check if we should stay on this page
    if (shouldStayOnCurrentPage(gameState, location.pathname)) {
      devLog('🛡️ QuestionView: Staying on current page - no redirects allowed')
      return
    }

    // Only redirect if explicitly starting fresh (no game started, no route restoration)
    if (!gameState.selectedCategories.length && !hasGameStarted(gameState)) {
      // Give time for Firebase to load, then check again
      const timeout = setTimeout(() => {
        if (!gameState.selectedCategories.length && !hasGameStarted(gameState) && !shouldStayOnCurrentPage(gameState, location.pathname)) {
          devLog('🔄 QuestionView: Fresh start - redirecting to categories')
          navigate('/categories')
        }
      }, 2000) // Extended timeout for Firebase

      return () => clearTimeout(timeout)
    }
  }, [stateLoaded, gameState, location.pathname, navigate])

  // Check if all questions are finished and navigate to results
  useEffect(() => {
    if (!gameState.selectedCategories.length) return

    const totalQuestions = gameState.selectedCategories.length * 6 // 6 questions per category (3 difficulty levels × 2 questions each)
    const answeredQuestions = gameState.usedQuestions.size

    devLog(`Game completion check: ${answeredQuestions}/${totalQuestions} questions answered`)

    // If all questions have been answered, automatically go to results
    if (answeredQuestions >= totalQuestions && answeredQuestions > 0) {
      devLog('🎉 All questions completed! Navigating to results...')
      // Small delay to allow final question processing
      setTimeout(() => {
        navigate('/results')
      }, 2000)
    }
  }, [gameState.usedQuestions.size, gameState.selectedCategories.length, navigate])

  // Redirect to home if not authenticated (but only after loading is complete)
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, loading])

  const { currentQuestion } = gameState


  // Load game data for category settings
  useEffect(() => {
    const loadGameData = async () => {
      try {
        const data = await GameDataLoader.loadGameData()
        setGameData(data)
      } catch (error) {
        prodError('Error loading game data in QuestionView:', error)
      }
    }
    loadGameData()
  }, [])

  const getCategoryById = (categoryId) => {
    if (gameData && gameData.categories) {
      return gameData.categories.find(cat => cat.id === categoryId)
    }
    return null
  }

  const shouldShowImageInQuestion = (categoryId) => {
    const category = getCategoryById(categoryId)
    return category ? category.showImageInQuestion !== false : true
  }

  const shouldShowImageInAnswer = (categoryId) => {
    const category = getCategoryById(categoryId)
    return category ? category.showImageInAnswer !== false : true
  }

  // Helper function to get cached image URL from preloader
  const getCachedImageUrl = (originalUrl) => {
    if (!originalUrl) return null
    const cachedUrl = gamePreloader.getCachedImageUrl(originalUrl)
    // If image is cached (blob URL), log it
    if (cachedUrl.startsWith('blob:')) {
      // Using cached image (debug removed)
    } else {
      // Image not cached, using original (debug removed)
    }
    return cachedUrl
  }

  // Helper function to construct image URL if not provided
  const getQuestionImageUrl = () => {
    // First try explicit imageUrl fields
    let imageUrl = currentQuestion?.question?.imageUrl ||
                  currentQuestion?.question?.image ||
                  currentQuestion?.question?.imagePath ||
                  currentQuestion?.image ||
                  currentQuestion?.imageUrl

    // If no explicit imageUrl, try to construct one for certain categories
    if (!imageUrl && currentQuestion?.question) {
      const question = currentQuestion.question
      const categoryId = currentQuestion.categoryId

      // For flag questions, construct image path from question content
      if (categoryId === 'أعلام' && question.text?.includes('العلم')) {
        if (question.options && question.options.length > 0) {
          // Use the first option as the flag name
          const flagName = question.options[0]?.toLowerCase()
          imageUrl = `images/Flags/${flagName}.svg`
        }
      }
    }

    return imageUrl
  }

  // Helper function to get cached audio URL from preloader
  const getCachedAudioUrl = (originalUrl) => {
    if (!originalUrl) return null
    const cachedUrl = gamePreloader.getCachedAudioUrl(originalUrl)
    if (cachedUrl.startsWith('blob:')) {
      // Using cached audio (debug removed)
    } else {
      // Audio not cached, using original (debug removed)
    }
    return cachedUrl
  }

  // Helper function to get cached media URL (for video files)
  const getCachedMediaUrl = (originalUrl) => {
    if (!originalUrl) return null
    // Use cached video URL from game preloader
    const cachedUrl = window.gamePreloader?.getCachedVideoUrl(originalUrl) || originalUrl
    devLog('🎥 Loading video URL:', cachedUrl)
    return cachedUrl
  }

  // Force clear cache and reload data
  const forceClearCacheAndReload = async () => {
    devLog('🔄 Force clearing cache and reloading data...')

    // Clear localStorage cache
    localStorage.removeItem('triviaData')
    localStorage.removeItem('triviaDataTimestamp')

    // Force reload game data
    try {
      const freshData = await GameDataLoader.loadGameData(true) // Force refresh
      devLog('✅ Fresh data loaded:', freshData)

      // Reload the page to get fresh data
      window.location.reload()
    } catch (error) {
      prodError('❌ Error force refreshing data:', error)
    }
  }

  // Persist current question and restore on refresh
  useEffect(() => {
    // If we have a current question, store it for persistence
    if (currentQuestion) {
      localStorage.setItem('current_question', JSON.stringify(currentQuestion))
    }

    // If no current question but we're on question route, try to restore from localStorage
    if (!currentQuestion && window.location.pathname === '/question') {
      try {
        const storedQuestion = localStorage.getItem('current_question')
        if (storedQuestion) {
          const parsedQuestion = JSON.parse(storedQuestion)
          devLog('🔄 QuestionView: Restoring question from localStorage after refresh')
          setGameState(prev => ({
            ...prev,
            currentQuestion: parsedQuestion
          }))
        }
      } catch (error) {
        prodError('❌ Error restoring question from localStorage:', error)
      }
    }

    if (!currentQuestion) {
      return // Don't redirect - wait for question to load or be restored
    }

    // Reset timer when question changes
    setTimeElapsed(0)
    setShowAnswer(false)
    setShowScoring(false)
    setTimerActive(true)
    setImageZoomed(false)

    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: rect.height })
      }

      if (headerRef.current) {
        const headerRect = headerRef.current.getBoundingClientRect()
        setHeaderHeight(headerRect.height)
      }
    }

    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [currentQuestion])

  // Set initial dimensions after component mounts
  useEffect(() => {
    const setInitialDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: rect.height })
      }

      if (headerRef.current) {
        const headerRect = headerRef.current.getBoundingClientRect()
        setHeaderHeight(headerRect.height)
      }
    }

    setInitialDimensions()
  }, [])

  useEffect(() => {
    if (!timerActive) return

    const timer = setInterval(() => {
      setTimeElapsed(prev => prev + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [timerActive])

  // Handle perk timer countdown
  useEffect(() => {
    if (!activeTimer.active || activeTimer.timeLeft <= 0 || activeTimer.paused) return

    const timer = setInterval(() => {
      setActiveTimer(prev => {
        if (prev.timeLeft <= 1) {
          return { active: false, type: null, team: null, timeLeft: 0, paused: false }
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 }
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [activeTimer.active, activeTimer.timeLeft, activeTimer.paused])

  // Close burger menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (burgerMenuOpen &&
          !event.target.closest('.burger-menu-container') &&
          !event.target.closest('.burger-dropdown')) {
        setBurgerMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [burgerMenuOpen])


  const handleShowAnswer = () => {
    setShowAnswer(true)
    setTimerActive(false)
    // Hide active timer circle when showing answer
    setActiveTimer({ active: false, type: null, team: null, timeLeft: 0, paused: false })
  }

  const handleResetTimer = () => {
    setTimeElapsed(0)
    setTimerActive(true)
  }

  const handleShowScoring = () => {
    setShowScoring(true)
  }

  const handleScoreTeam = async (teamKey) => {
    // Guard against null currentQuestion
    if (!currentQuestion) return

    // Ensure user ID is set and mark question as used globally
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
      await questionUsageTracker.markQuestionAsUsed(currentQuestion.question || currentQuestion)
    } else {
      devLog('⏳ QuestionView: Skipping global question tracking - user not authenticated')
    }

    // Calculate points (apply double points if active and team matches)
    const basePoints = currentQuestion.points
    const doublePointsInfo = gameState.activatedPerks?.doublePoints
    const shouldApplyDouble = doublePointsInfo?.active && doublePointsInfo?.team === teamKey
    const finalPoints = shouldApplyDouble ? basePoints * 2 : basePoints

    // Award points to the specified team
    setGameState(prev => {
      const newUsedQuestions = new Set([...prev.usedQuestions, currentQuestion.question.id])
      const newUsedPointValues = new Set([...(prev.usedPointValues || []), currentQuestion.pointValueKey])

      return {
        ...prev,
        [teamKey]: {
          ...prev[teamKey],
          score: prev[teamKey].score + finalPoints
        },
        usedQuestions: newUsedQuestions,
        usedPointValues: newUsedPointValues,
        // Switch turn to the other team after scoring
        currentTurn: prev.currentTurn === 'team1' ? 'team2' : 'team1',
        gameHistory: [
          ...prev.gameHistory,
          {
            question: currentQuestion.text,
            answer: currentQuestion.answer,
            points: finalPoints,
            basePoints: basePoints,
            doublePointsUsed: shouldApplyDouble,
            difficulty: currentQuestion.difficulty,
            category: currentQuestion.categoryId,
            winner: teamKey,
            timestamp: Date.now()
          }
        ],
        // Clear double points after use
        activatedPerks: {
          ...prev.activatedPerks,
          doublePoints: { active: false, team: null }
        }
      }
    })

    // Double points is now cleared in the game state above

    // Clear stored question when completing
    localStorage.removeItem('current_question')

    // Return to game board
    navigate('/game')
  }

  const handleNoAnswer = async () => {
    // Guard against null currentQuestion
    if (!currentQuestion) return

    // Ensure user ID is set and mark question as used globally even if no one answered
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
      await questionUsageTracker.markQuestionAsUsed(currentQuestion.question || currentQuestion)
    } else {
      devLog('⏳ QuestionView: Skipping global question tracking - user not authenticated')
    }

    // Mark question as used without awarding points
    setGameState(prev => {
      const newUsedQuestions = new Set([...prev.usedQuestions, currentQuestion.question.id])
      const newUsedPointValues = new Set([...(prev.usedPointValues || []), currentQuestion.pointValueKey])

      devLog('✅ New used questions set (no answer):', Array.from(newUsedQuestions))
      devLog('✅ New used point values set (no answer):', Array.from(newUsedPointValues))

      return {
        ...prev,
        usedQuestions: newUsedQuestions,
        usedPointValues: newUsedPointValues,
        // Switch turn to the other team when no one answers
        currentTurn: prev.currentTurn === 'team1' ? 'team2' : 'team1',
        gameHistory: [
          ...prev.gameHistory,
          {
            question: currentQuestion.text,
            answer: currentQuestion.answer,
            points: 0, // No points awarded
            basePoints: currentQuestion.points,
            doublePointsUsed: false,
            difficulty: currentQuestion.difficulty,
            category: currentQuestion.categoryId,
            winner: 'none',
            timestamp: Date.now()
          }
        ]
      }
    })

    // Clear double points after question ends
    setGameState(prev => ({
      ...prev,
      activatedPerks: {
        ...prev.activatedPerks,
        doublePoints: { active: false, team: null }
      }
    }))

    // Clear stored question when completing
    localStorage.removeItem('current_question')

    // Return to game board
    navigate('/game')
  }

  const handleImageClick = (e) => {
    e.stopPropagation()
    if (imageZoomed) {
      setImageZoomed(false)
    } else {
      setImageZoomed(true)
    }
  }

  const handleBackdropClick = (e) => {
    // Don't close image if clicking on burger dropdown
    if (e.target.closest('.burger-dropdown') || e.target.closest('.burger-menu-container')) {
      return
    }
    setImageZoomed(false)
  }

  // Perk handling functions
  const handlePerkClick = (perkType, team) => {
    devLog(`🔧 Perk clicked in QuestionView: ${perkType} for ${team}`)
    devLog(`  - Current question:`, currentQuestion ? 'Available' : 'None')
    devLog(`  - Current turn:`, gameState.currentTurn)
    devLog(`  - Team:`, team)

    // Double points perk can only be used before selecting a question (in GameBoard)
    if (perkType === 'double') {
      devWarn('❌ Double points perk should only be used in GameBoard')
      return
    }

    if (!currentQuestion) {
      devWarn('❌ No current question - perks only work when a question is visible')
      return
    }

    // Only allow the current team to use perks
    if (gameState.currentTurn !== team) {
      devWarn(`❌ Not ${team}'s turn (current turn: ${gameState.currentTurn})`)
      return
    }

    devLog('✅ Opening perk modal...')
    setActivePerk({ type: perkType, team })
    setPerkModalOpen(true)
  }

  const handlePerkConfirm = () => {
    const { type, team } = activePerk

    // Check if perk is already used (max 1 use per perk per team)
    const currentUsage = gameState.perkUsage?.[team]?.[type] || 0
    if (currentUsage >= 1) {
      devWarn(`Perk ${type} already used by ${team}`)
      setPerkModalOpen(false)
      setActivePerk({ type: null, team: null })
      return
    }

    // Update perk usage count in a single state call
    setGameState(prev => ({
      ...prev,
      perkUsage: {
        ...prev.perkUsage,
        [team]: {
          ...prev.perkUsage?.[team],
          [type]: (prev.perkUsage?.[team]?.[type] || 0) + 1
        }
      }
    }))

    devLog(`✅ Perk activated in QuestionView: ${type} for ${team}`)

    // Handle specific perk effects
    if (type === 'double') {
      // Double points should not be activatable in QuestionView
      devWarn('Double points perk should only be used in GameBoard')
      setPerkModalOpen(false)
      setActivePerk({ type: null, team: null })
      return
    }

    // For phone and search, start the timer
    if (type === 'phone' || type === 'search') {
      const duration = type === 'phone' ? 30 : 15
      setActiveTimer({ active: true, type, team, timeLeft: duration, paused: false })
      setPerkModalOpen(false)
      setActivePerk({ type: null, team: null })
    }
  }

  const handlePerkModalClose = () => {
    setPerkModalOpen(false)
    setActivePerk({ type: null, team: null })
  }


  // Clear double points when question changes (but not on initial load)
  const [previousQuestionKey, setPreviousQuestionKey] = useState(null)

  useEffect(() => {
    const currentQuestionKey = currentQuestion?.questionKey

    // Only clear double points if this is actually a new question (not initial load)
    if (previousQuestionKey && previousQuestionKey !== currentQuestionKey) {
      setGameState(prev => ({
        ...prev,
        activatedPerks: {
          ...prev.activatedPerks,
          doublePoints: { active: false, team: null }
        }
      }))
    }

    // Debug the current question structure (removed for performance)

    // Check for image in multiple possible fields and preload immediately
    // First try explicit imageUrl fields
    let imageUrl = currentQuestion?.question?.imageUrl ||
                  currentQuestion?.question?.image ||
                  currentQuestion?.question?.imagePath ||
                  currentQuestion?.image ||
                  currentQuestion?.imageUrl

    // If no explicit imageUrl, try to construct one for certain categories
    if (!imageUrl && currentQuestion?.question) {
      const question = currentQuestion.question
      const categoryId = currentQuestion.categoryId

      // For flag questions, construct image path from question content
      if (categoryId === 'أعلام' && question.text?.includes('العلم')) {
        // Try to extract flag name from options or construct from question
        // Common flag image path: images/Flags/{country}.svg
        if (question.options && question.options.length > 0) {
          // For now, let's use a fallback approach - try the first option
          const flagName = question.options[0]?.toLowerCase()
          imageUrl = `images/Flags/${flagName}.svg`
          devLog('🏁 Constructed flag image URL:', imageUrl)
        }
      }
    }

    if (imageUrl) {
      // Immediately preloading current question image (debug removed)
      gamePreloader.preloadImage(imageUrl)
        .then(() => {
          // Current question image preloaded successfully (debug removed)
        })
        .catch(error => {
          devWarn('❌ Failed to preload current question image:', error)
        })
    } else {
      // No image found in current question for preloading (debug removed)
    }

    // Immediately preload current question's audio if it has one
    if (currentQuestion?.question?.audio) {
      devLog('🎵 Immediately preloading current question audio:', currentQuestion.question.audio)
      gamePreloader.preloadAudio(currentQuestion.question.audio)
        .then(() => {
          devLog('✅ Current question audio preloaded successfully')
        })
        .catch(error => {
          devWarn('❌ Failed to preload current question audio:', error)
        })
    }

    setPreviousQuestionKey(currentQuestionKey)
  }, [currentQuestion, setGameState])


  // Don't return null - always show the QuestionView layout

  const getTimerBg = () => {
    if (timeElapsed >= 50) return 'bg-red-500'
    return 'bg-gray-500'
  }

  // Get responsive styles - use the memoized version from line 200

  return (
    <div ref={containerRef} className="bg-[#f5f5dc] flex flex-col" style={{
      height: '100vh',
      overflow: 'hidden'
    }} onClick={handleBackdropClick}>

      {/* Fullscreen Image Overlay */}
      {imageZoomed && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-[10000] flex items-center justify-center p-4"
          onClick={handleBackdropClick}
        >
          <SmartImage
            src={(() => {
              const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId

              if (showAnswer) {
                // In answer mode, prioritize answer image
                const answerImageUrl = currentQuestion?.question?.answerImageUrl ||
                                     currentQuestion?.answerImageUrl ||
                                     currentQuestion?.question?.answerImage ||
                                     currentQuestion?.answerImage

                // For اغاني اجنبية category, only show answerImageUrl (no fallback to question image)
                if (categoryId === 'اغاني_اجنبية') {
                  return answerImageUrl
                }

                // For other categories, fall back to question image if no answer image
                const questionImageUrl = currentQuestion?.question?.imageUrl || currentQuestion?.imageUrl
                return answerImageUrl || questionImageUrl
              } else {
                // In question mode, show question image (exclude اغاني اجنبية category)
                const questionImageUrl = currentQuestion?.question?.imageUrl || currentQuestion?.imageUrl
                return questionImageUrl && categoryId !== 'اغاني_اجنبية' ? questionImageUrl : null
              }
            })()}
            alt={currentQuestion ? (showAnswer ? (currentQuestion.question?.answer || currentQuestion.answer) : (currentQuestion.question?.text || currentQuestion.text)) : ''}
            className="cursor-pointer"
            style={{
              maxWidth: '95vw',
              maxHeight: '95vh',
              minWidth: '70vw',
              minHeight: '70vh',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain'
            }}
            context={showAnswer ? "answer" : "question"}
            size="original"
            onClick={handleImageClick}
          />
        </div>
      )}
      {/* Header - Copy from GameBoard */}
      <div
        ref={headerRef}
        className="bg-red-600 text-white flex-shrink-0 sticky top-0 z-[9998] overflow-hidden"
        style={{
          padding: `${styles.headerPadding}px`,
          height: `${styles.headerHeight}px`
        }}
      >
        <div className="flex justify-between items-center h-full">
          <div className="flex items-center" style={{ gap: `${styles.baseGap}px` }}>
            <LogoDisplay />
            <span className="font-bold text-white" style={{ fontSize: `${styles.headerFontSize * 0.85}px` }}>
              دور الفريق:
            </span>
            <span
              className="font-bold text-white"
              style={{ fontSize: `${styles.headerFontSize * 0.85}px` }}
            >
              {gameState.currentTurn === 'team1'
                ? gameState.team1.name
                : gameState.currentTurn === 'team2'
                ? gameState.team2.name
                : 'غير محدد'}
            </span>
            <button
              onClick={() => setGameState(prev => ({
                ...prev,
                currentTurn: prev.currentTurn === 'team1' ? 'team2' : 'team1'
              }))}
              className="bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors flex items-center justify-center"
              style={{
                fontSize: `${styles.headerFontSize * 0.9}px`,
                width: '28px',
                height: '28px',
                padding: '2px'
              }}
            >
              🔄
            </button>
          </div>

          <div className="flex-1 text-center flex items-center justify-center px-2" style={{ gap: `${styles.baseGap}px` }}>
            <h1 className="font-bold text-center" style={{
              fontSize: `${Math.max(styles.headerFontSize * 0.7, styles.headerFontSize * 1.2 - (gameState.gameName.length > 15 ? (gameState.gameName.length - 15) * 1.5 : 0))}px`,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%'
            }}>
              {gameState.gameName}
            </h1>
          </div>

          {/* Navigation - Responsive */}
          <div className="relative">
            {/* Landscape Mode - Show all buttons */}
            <div className="hidden landscape:flex" style={{ gap: `${styles.baseGap}px` }}>
              <PresentationModeToggle style={{ fontSize: `${styles.headerFontSize * 0.75}px` }} />
              <button
                onClick={() => navigate('/game')}
                className="bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors"
                style={{
                  fontSize: `${styles.headerFontSize * 0.75}px`,
                  padding: `4px 8px`
                }}
              >
                الرجوع للوحة
              </button>
              <button
                onClick={() => navigate('/results')}
                className="bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors"
                style={{
                  fontSize: `${styles.headerFontSize * 0.75}px`,
                  padding: `4px 8px`
                }}
              >
                انهاء
              </button>
            </div>

            {/* Portrait Mode - Burger Menu */}
            <div className="landscape:hidden burger-menu-container">
              <button
                onClick={() => setBurgerMenuOpen(!burgerMenuOpen)}
                className="bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors flex items-center justify-center"
                style={{
                  fontSize: `${styles.headerFontSize * 1}px`,
                  width: '32px',
                  height: '32px'
                }}
              >
                ☰
              </button>

            </div>
          </div>
        </div>
      </div>

      {/* Burger Menu Dropdown - Outside header to avoid overflow clipping */}
      {burgerMenuOpen && (
        <div className="fixed top-0 left-0 bg-red-700 rounded-lg shadow-lg border border-red-600 z-[9999] min-w-max landscape:hidden burger-dropdown"
             style={{
               top: `${styles.headerHeight}px`,
               left: '8px',
               fontSize: `${styles.headerFontSize * 0.75}px`
             }}
             onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col p-2 gap-2">
            <div className="border-b border-red-600 pb-2">
              <PresentationModeToggle style={{ fontSize: `${styles.headerFontSize * 0.75}px` }} />
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                devLog('Navigate to game clicked')
                navigate('/game')
                setBurgerMenuOpen(false)
              }}
              className="px-3 py-2 bg-red-600 hover:bg-red-800 text-white rounded-lg transition-colors text-right"
            >
              الرجوع للوحة
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                devLog('Navigate to results clicked')
                navigate('/results')
                setBurgerMenuOpen(false)
              }}
              className="px-3 py-2 bg-red-600 hover:bg-red-800 text-white rounded-lg transition-colors text-right"
            >
              انهاء
            </button>
          </div>
        </div>
      )}

      {/* Main Content - New Grid Layout */}
      <div className="flex-1 flex flex-col px-4 py-5 2xl:h-[calc(100vh_-_112px)] 4xl:h-[calc(100vh_-_130px)] xl:h-[calc(100vh-76px)] sm:h-[calc(100vh-92px)] xs:h-[calc(100vh-118px)] h-[calc(100vh-107px)] height-container" style={{
        minHeight: 0
      }}>
        <div className={`xl:grid flex flex-col-reverse landscape:flex landscape:flex-row xl:grid xl:grid-cols-12 gap-x-5 pt-2 sm:pt-4 md:pt-6 lg:pt-8 xl:pt-10 2xl:pt-12 ${styles.teamContainerTopPadding} h-full max-xl:justify-between landscape:justify-start game-panel_wrapper text-center`}>
          {/* Teams Sidebar - xl:col-span-3 */}
          <div className={`xl:col-span-3 xl:order-1 landscape:w-auto landscape:flex-shrink-0 max-xl:flex max-md:grid grid-cols-2 max-md:flex-col landscape:flex landscape:flex-col max-xl:justify-around max-xl:flex-row-reverse landscape:justify-start max-xl:gap-x-5 ${styles.teamContainerGap} max-sm:gap-x-2 max-xl:[&>*]:flex-shrink-0 styled-scrollbar xl:px-2.5 ${styles.teamContainerPadding} max-xl:w-full max-xl:mx-auto max-xl:items-center landscape:items-stretch xl:h-[calc(90vh_-_112px)] landscape:h-[calc(90vh_-_112px)] mb-3 landscape:mb-0 landscpe_btn-view`}>

            {/* Team 1 Section */}
            <section className="about_score_footer_secMain">
              <div className="text-center about_score_footer max-2xl:gap-x-2">
                <div className={`text-white min-w-max w-full p-1 sm:p-2 md:p-3 lg:p-3.5 max-4xl:max-w-64 4xl:max-w-96 max-xl:max-w-64 xl:w-full max-w-full text-center rounded-[30px] font-bold place-self-center flex justify-center items-center mx-auto team-name_wrapper relative ${
                  gameState.currentTurn === 'team1' ? 'ring-4 ring-red-400 ring-opacity-60 shadow-lg shadow-red-400/30' : ''
                }`}
                     style={{
                       background: 'linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626)',
                       fontSize: `${styles.buttonFontSize * 0.8}px`,
                       minHeight: `${styles.teamButtonHeight}px`,
                       padding: `${styles.buttonPadding * 0.4}px ${styles.buttonPadding * 0.8}px`
                     }}>
                  <span className="whitespace-nowrap inline-block">
                    {gameState.team1.name}
                  </span>
                </div>
                <div className={`text-60 game-text font-bold text-black ${styles.teamElementSpacing}`} style={{ fontSize: `${styles.teamScoreFontSize}px` }}>
                  {gameState.team1.score}
                </div>
                <div className={`text-[#231E1E] xl:text-2xl sm:text-xl text-xs sm:text-sm ${styles.perkTitleSpacing} font-bold whitespace-nowrap`}
                     style={{ fontSize: `${styles.teamHelpFontSize}px` }}>
                  وسائل المساعدة
                </div>

                {/* Helper Tools */}
                <div className={`flex justify-center gap-1 sm:gap-2 md:gap-3 ${styles.perkContainerSpacing}`}>
                  <button
                    className={`icon-nav-link border-2 rounded-full ${styles.perkButtonPadding} border-gray-600 bg-gray-200 opacity-50 cursor-not-allowed flex items-center justify-center`}
                    disabled={true}
                    title="متاح فقط في لوحة اللعبة"
                  >
                    <svg width={styles.perkIconSize} height={styles.perkIconSize} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                      <path d="M12 2L15.09 8.26L22 9L17 14L18.18 21L12 17.77L5.82 21L7 14L2 9L8.91 8.26L12 2Z" fill="#6b7280" stroke="none"/>
                      <text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" dominantBaseline="middle">2</text>
                    </svg>
                  </button>

                  <button
                    className={`icon-nav-link border-2 rounded-full ${styles.perkButtonPadding} flex items-center justify-center ${
                      (gameState.perkUsage?.team1?.phone || 0) >= 1
                        ? 'border-gray-600 bg-gray-200 opacity-50 cursor-not-allowed'
                        : gameState.currentTurn !== 'team1'
                        ? 'border-gray-600 bg-gray-100 opacity-60 cursor-not-allowed'
                        : 'border-red-600 bg-white cursor-pointer hover:bg-red-50'
                    }`}
                    disabled={(gameState.perkUsage?.team1?.phone || 0) >= 1 || gameState.currentTurn !== 'team1'}
                    onClick={() => handlePerkClick('phone', 'team1')}
                    title="اتصال بصديق"
                  >
                    <svg width={styles.perkIconSize} height={styles.perkIconSize} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                      <path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill="#dc2626" stroke="none"/>
                    </svg>
                  </button>

                  <button
                    className={`icon-nav-link border-2 rounded-full ${styles.perkButtonPadding} flex items-center justify-center ${
                      (gameState.perkUsage?.team1?.search || 0) >= 1
                        ? 'border-gray-600 bg-gray-200 opacity-50 cursor-not-allowed'
                        : gameState.currentTurn !== 'team1'
                        ? 'border-gray-600 bg-gray-100 opacity-60 cursor-not-allowed'
                        : 'border-red-600 bg-white cursor-pointer hover:bg-red-50'
                    }`}
                    disabled={(gameState.perkUsage?.team1?.search || 0) >= 1 || gameState.currentTurn !== 'team1'}
                    onClick={() => handlePerkClick('search', 'team1')}
                    title="البحث في جوجل"
                  >
                    <svg width={styles.perkIconSize} height={styles.perkIconSize} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                      <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3S3 5.91 3 9.5S5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14Z" fill="#dc2626" stroke="none"/>
                    </svg>
                  </button>
                </div>
              </div>
            </section>

            {/* Team 2 Section */}
            <section className="about_score_footer_secMain">
              <div className="text-center about_score_footer max-2xl:gap-x-2">
                <div className={`text-white min-w-max w-full p-1 sm:p-2 md:p-3 lg:p-3.5 max-4xl:max-w-64 4xl:max-w-96 max-xl:max-w-64 xl:w-full max-w-full text-center rounded-[30px] font-bold place-self-center flex justify-center items-center mx-auto team-name_wrapper relative ${
                  gameState.currentTurn === 'team2' ? 'ring-4 ring-red-400 ring-opacity-60 shadow-lg shadow-red-400/30' : ''
                }`}
                     style={{
                       background: 'linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626)',
                       fontSize: `${styles.buttonFontSize * 0.8}px`,
                       minHeight: `${styles.teamButtonHeight}px`,
                       padding: `${styles.buttonPadding * 0.4}px ${styles.buttonPadding * 0.8}px`
                     }}>
                  <span className="whitespace-nowrap inline-block">
                    {gameState.team2.name}
                  </span>
                </div>
                <div className={`text-60 game-text font-bold text-black ${styles.teamElementSpacing}`} style={{ fontSize: `${styles.teamScoreFontSize}px` }}>
                  {gameState.team2.score}
                </div>
                <div className={`text-[#231E1E] xl:text-2xl sm:text-xl text-xs sm:text-sm ${styles.perkTitleSpacing} font-bold whitespace-nowrap`}
                     style={{ fontSize: `${styles.teamHelpFontSize}px` }}>
                  وسائل المساعدة
                </div>

                {/* Helper Tools */}
                <div className={`flex justify-center gap-1 sm:gap-2 md:gap-3 ${styles.perkContainerSpacing}`}>
                  <button
                    className={`icon-nav-link border-2 rounded-full ${styles.perkButtonPadding} border-gray-600 bg-gray-200 opacity-50 cursor-not-allowed flex items-center justify-center`}
                    disabled={true}
                    title="متاح فقط في لوحة اللعبة"
                  >
                    <svg width={styles.perkIconSize} height={styles.perkIconSize} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                      <path d="M12 2L15.09 8.26L22 9L17 14L18.18 21L12 17.77L5.82 21L7 14L2 9L8.91 8.26L12 2Z" fill="#6b7280" stroke="none"/>
                      <text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" dominantBaseline="middle">2</text>
                    </svg>
                  </button>

                  <button
                    className={`icon-nav-link border-2 rounded-full ${styles.perkButtonPadding} flex items-center justify-center ${
                      (gameState.perkUsage?.team2?.phone || 0) >= 1
                        ? 'border-gray-600 bg-gray-200 opacity-50 cursor-not-allowed'
                        : gameState.currentTurn !== 'team2'
                        ? 'border-gray-600 bg-gray-100 opacity-60 cursor-not-allowed'
                        : 'border-red-600 bg-white cursor-pointer hover:bg-red-50'
                    }`}
                    disabled={(gameState.perkUsage?.team2?.phone || 0) >= 1 || gameState.currentTurn !== 'team2'}
                    onClick={() => handlePerkClick('phone', 'team2')}
                    title="اتصال بصديق"
                  >
                    <svg width={styles.perkIconSize} height={styles.perkIconSize} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                      <path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill="#dc2626" stroke="none"/>
                    </svg>
                  </button>

                  <button
                    className={`icon-nav-link border-2 rounded-full ${styles.perkButtonPadding} flex items-center justify-center ${
                      (gameState.perkUsage?.team2?.search || 0) >= 1
                        ? 'border-gray-600 bg-gray-200 opacity-50 cursor-not-allowed'
                        : gameState.currentTurn !== 'team2'
                        ? 'border-gray-600 bg-gray-100 opacity-60 cursor-not-allowed'
                        : 'border-red-600 bg-white cursor-pointer hover:bg-red-50'
                    }`}
                    disabled={(gameState.perkUsage?.team2?.search || 0) >= 1 || gameState.currentTurn !== 'team2'}
                    onClick={() => handlePerkClick('search', 'team2')}
                    title="البحث في جوجل"
                  >
                    <svg width={styles.perkIconSize} height={styles.perkIconSize} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                      <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3S3 5.91 3 9.5S5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14Z" fill="#dc2626" stroke="none"/>
                    </svg>
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Main Question Area - xl:col-span-9 */}
          <div className="xl:col-span-9 xl:order-2 landscape:flex-1 max-xl:row-start-1 h-full relative gamemain_section max-xl:mb-7 landscape:mb-0 barcode-box barcode-more"
               style={{ backgroundColor: '#f7f2e6' }}>
            <div className="h-full game-mainSec px-3.5 landscape:px-6 xs:px-6 border-[5px] border-[#E34B4B] 2xl:rounded-[78px] xl:rounded-[54px] rounded-3xl pt-2 game-section_wrapper flex justify-center hint-question-wrapper"
                 style={{
                   paddingBottom: `${styles.bottomPadding}px`,
                   backgroundColor: '#f7f2e6'
                 }}>

              {/* Perk Timer Circle - Bottom Right */}
              {activeTimer.active && (
                <div className="absolute bottom-16 right-3 md:bottom-20 md:right-6 lg:bottom-24 lg:right-8 z-50 pointer-events-none">
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28">
                    {/* Circular Progress SVG */}
                    <svg className="transform -rotate-90 w-full h-full drop-shadow-lg">
                      {/* Background circle */}
                      <circle
                        cx="50%"
                        cy="50%"
                        r="40%"
                        stroke="#e5e7eb"
                        strokeWidth="8%"
                        fill="white"
                        fillOpacity="0.9"
                      />
                      {/* Progress circle */}
                      <circle
                        cx="50%"
                        cy="50%"
                        r="40%"
                        stroke="#dc2626"
                        strokeWidth="8%"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        strokeDashoffset={`${2 * Math.PI * 40 * (1 - activeTimer.timeLeft / (activeTimer.type === 'phone' ? 30 : 15))}`}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />
                    </svg>
                    {/* Timer text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-red-600">
                        {activeTimer.timeLeft}
                      </div>
                      <div className="mt-1">
                        {activeTimer.type === 'phone' ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6">
                            <path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill="#dc2626" stroke="none"/>
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6">
                            <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3S3 5.91 3 9.5S5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14Z" fill="#dc2626" stroke="none"/>
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-center items-center w-full flex-col h-full question-block-wrapper">

                {/* Question Content - Only show when not in answer mode */}
                {!showAnswer && (
                  <div className="flex justify-center items-center w-full flex-col h-auto md:h-full">
                  <label className="flex justify-center items-center w-full leading-[1.3_!important] question-content text-center pb-4 sm:py-4 font-extrabold text-black"
                         style={{
                           direction: 'rtl',
                           fontSize: `${styles.questionFontSize}px`
                         }}>
                    {currentQuestion ? (currentQuestion.question?.text || currentQuestion.text) : 'جاري تحميل السؤال...'}
                  </label>

                  {/* Media Player for Question */}
                  {(() => {
                    const hasQuestionAudio = currentQuestion?.question?.audioUrl || currentQuestion?.audioUrl
                    const hasQuestionVideo = currentQuestion?.question?.videoUrl || currentQuestion?.videoUrl
                    return currentQuestion && (hasQuestionAudio || hasQuestionVideo)
                  })() && (
                    <div className="relative overflow-hidden media-wrapper"
                         style={{
                           display: 'block',
                           height: styles.imageAreaHeight + 'px',
                           maxHeight: styles.imageAreaHeight + 'px',
                           width: '90%',
                           maxWidth: '90%'
                         }}>
                      <QuestionMediaPlayer
                        currentQuestion={currentQuestion}
                        showAnswer={showAnswer}
                        isQuestionMedia={true}
                        styles={styles}
                      />
                    </div>
                  )}

                  {/* Image for Question - only show question image (exclude اغاني اجنبية category) */}
                  {(() => {
                    const imageUrl = currentQuestion?.question?.imageUrl || currentQuestion?.imageUrl
                    const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId
                    // Don't show question images for اغاني اجنبية category (images moved to answers)
                    return imageUrl && categoryId !== 'اغاني_اجنبية'
                  })() && (
                    <div className="relative overflow-hidden image-text-below-block media-wrapper"
                         style={{
                           display: 'block',
                           height: styles.imageAreaHeight + 'px',
                           maxHeight: styles.imageAreaHeight + 'px',
                           width: '90%',
                           maxWidth: '90%'
                         }}>
                      <SmartImage
                        src={currentQuestion?.question?.imageUrl || currentQuestion?.imageUrl}
                        alt={currentQuestion ? (currentQuestion.question?.text || currentQuestion.text) : ''}
                        className="w-full h-full object-contain mx-auto cursor-pointer image"
                        context="question"
                        size="large"
                        onClick={handleImageClick}
                      />
                    </div>
                  )}
                </div>
                )}
              </div>

              {/* Absolute Positioned Elements */}

              {/* Timer at Top Center - Hide in answer and scoring mode */}
              {!showAnswer && !showScoring && (
                <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 flex justify-between items-center w-full max-w-[90%]">
                <div className="text-center">
                  {/* Points Display */}
                  <div className="font-bold bg-[#000000] text-white rounded-xl w-fit box-point flex items-center justify-center"
                       style={{
                         fontSize: `${styles.pointsFontSize}px`,
                         padding: `${styles.pointsPadding}px ${styles.pointsPadding * 1.2}px`
                       }}>
                    {currentQuestion?.points || 0} نقطة
                  </div>
                </div>

                {/* Timer Controls */}
                <div className="grid grid-flow-col justify-between gap-3 bg-[#2A2634] rounded-full btn-wrapper mx-auto flex items-center"
                     style={{
                       padding: `${styles.buttonPadding * 0.4}px ${styles.buttonPadding * 0.8}px`,
                       maxWidth: `${styles.timerSize}px`
                     }}>
                  <button type="button" className="flex items-center justify-center p-1" onClick={handleResetTimer}>
                    <svg
                      viewBox="0 0 44 44"
                      style={{ width: `${styles.timerEmojiSize}px`, height: `${styles.timerEmojiSize}px` }}
                      className="active:scale-110 duration-100"
                    >
                      <path
                        d="M22 4C12.6 4 5 11.6 5 21C5 30.4 12.6 38 22 38C31.4 38 39 30.4 39 21C39 11.6 31.4 4 22 4ZM22 34C14.8 34 9 28.2 9 21C9 13.8 14.8 8 22 8C29.2 8 35 13.8 35 21C35 28.2 29.2 34 22 34ZM23 13H21V22L28.5 26.2L29.5 24.5L23 21V13Z"
                        fill="#fff"
                      />
                      <path
                        d="M18 2H26V6H18V2Z"
                        fill="#fff"
                      />
                    </svg>
                  </button>

                  <span className="inline-flex items-center text-white justify-center font-cairo"
                        style={{ fontSize: `${styles.timerFontSize}px` }}>
                    {String(Math.floor(timeElapsed / 60)).padStart(2, '0')}:{String(timeElapsed % 60).padStart(2, '0')}
                  </span>

                  <button type="button" className="flex items-center justify-center p-1" onClick={() => setTimerActive(!timerActive)}>
                    {timerActive ? (
                      <svg
                        viewBox="0 0 24 24"
                        style={{ width: `${styles.timerEmojiSize}px`, height: `${styles.timerEmojiSize}px` }}
                        className="active:scale-110 duration-100"
                      >
                        <path d="M6 4H10V20H6V4Z" fill="#fff"/>
                        <path d="M14 4H18V20H14V4Z" fill="#fff"/>
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        style={{ width: `${styles.timerEmojiSize}px`, height: `${styles.timerEmojiSize}px` }}
                        className="active:scale-110 duration-100"
                      >
                        <path d="M7 4V20L19 12L7 4Z" fill="#fff"/>
                      </svg>
                    )}
                  </button>
                </div>

                <div className="w-11 text-center"></div>
              </div>
              )}

              {/* Answer Button at Bottom Right - Only show in question mode */}
              {!showAnswer && !showScoring && (
                <div className="absolute bottom-0 translate-y-1/4 left-0 right-0">
                  <div className="flex gap-1 sm:gap-2 landscape:gap-2 justify-end px-1 sm:px-0 landscape:px-0">
                    <div className="md:text-xl sm:text-base text-xs text-white bg-[#FF7546] py-1.5 4xl:py-2.5 xl:px-5 lg:px-3 md:px-2.5 sm:px-2 px-2 rounded-2xl w-fit font-semibold flex items-center justify-center ml-auto mr-[5%]">
                      {currentQuestion?.category || 'فئة السؤال'}
                    </div>
                    <div className="cursor-pointer sm:text-xl 2xl:text-3xl bg-[#265B13] text-white md:px-6 px-5 py-1 md:py-3 inline-flex items-center justify-center text-center rounded-full go-to-answer"
                         onClick={handleShowAnswer}>
                      الإجابة
                    </div>
                  </div>
                </div>
              )}

              {/* Answer Section - Show answer text and question image */}
              {showAnswer && !showScoring && (
                <div className="flex justify-center items-center w-full flex-col h-full question-block-wrapper absolute inset-0"
                     style={{
                       background: 'linear-gradient(#f7f2e6, #f7f2e6) padding-box, linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626) border-box',
                       border: '5px solid transparent',
                       borderRadius: 'inherit'
                     }}>

                  {/* Answer Content - Same as question content */}
                  <div className="flex justify-center items-center w-full flex-col h-auto md:h-full">
                    <label className="flex justify-center items-center w-full leading-[1.3_!important] question-content text-center pb-4 sm:py-4 font-extrabold text-black font-arabic"
                           style={{
                             direction: 'rtl',
                             fontSize: `${styles.questionFontSize}px`
                           }}>
                      {currentQuestion ? (currentQuestion.question?.answer || currentQuestion.answer) : 'جاري تحميل الإجابة...'}
                    </label>

                    {/* Answer Media Player */}
                    {(() => {
                      const hasAnswerAudio = currentQuestion?.question?.answerAudioUrl || currentQuestion?.answerAudioUrl
                      const hasAnswerVideo = currentQuestion?.question?.answerVideoUrl || currentQuestion?.answerVideoUrl
                      return currentQuestion && (hasAnswerAudio || hasAnswerVideo)
                    })() && (
                      <div className="relative overflow-hidden media-wrapper"
                           style={{
                             display: 'block',
                             height: styles.imageAreaHeight + 'px',
                             maxHeight: styles.imageAreaHeight + 'px',
                             width: '90%',
                             maxWidth: '90%'
                           }}>
                        <QuestionMediaPlayer
                          currentQuestion={currentQuestion}
                          showAnswer={showAnswer}
                          isQuestionMedia={false}
                          styles={styles}
                        />
                      </div>
                    )}

                    {/* Answer Image (shown in answer area) */}
                    {(() => {
                      // First check for answer-specific image
                      const answerImageUrl = currentQuestion?.question?.answerImageUrl ||
                                           currentQuestion?.answerImageUrl ||
                                           currentQuestion?.question?.answerImage ||
                                           currentQuestion?.answerImage

                      const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId

                      // For اغاني اجنبية category, only show answerImageUrl (no fallback to question image)
                      if (categoryId === 'اغاني_اجنبية') {
                        return answerImageUrl
                      }

                      // For other categories, fall back to question image if no answer image
                      const questionImageUrl = currentQuestion?.question?.imageUrl || currentQuestion?.imageUrl
                      return answerImageUrl || questionImageUrl
                    })() && (
                      <div className="relative overflow-hidden image-text-below-block media-wrapper"
                           style={{
                             display: 'block',
                             height: styles.imageAreaHeight + 'px',
                             maxHeight: styles.imageAreaHeight + 'px',
                             width: '90%',
                             maxWidth: '90%'
                           }}>
                        <SmartImage
                          src={(() => {
                            const answerImageUrl = currentQuestion?.question?.answerImageUrl ||
                                                 currentQuestion?.answerImageUrl ||
                                                 currentQuestion?.question?.answerImage ||
                                                 currentQuestion?.answerImage

                            const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId

                            // For اغاني اجنبية category, only show answerImageUrl (no fallback to question image)
                            if (categoryId === 'اغاني_اجنبية') {
                              return answerImageUrl
                            }

                            // For other categories, fall back to question image if no answer image
                            const questionImageUrl = currentQuestion?.question?.imageUrl || currentQuestion?.imageUrl
                            return answerImageUrl || questionImageUrl
                          })()}
                          alt={currentQuestion ? (currentQuestion.question?.answer || currentQuestion.answer) : ''}
                          className="w-full h-full object-contain mx-auto cursor-pointer image"
                          context="answer"
                          size="large"
                          onClick={handleImageClick}
                        />
                      </div>
                    )}
                  </div>

                  {/* Navigation Buttons */}
                  <div className="absolute bottom-0 translate-y-1/4 left-0 right-0">
                    <div className="flex items-stretch justify-between">
                      <div className="cursor-pointer 2xl:text-3xl xl:text-xl text-sm text-white md:px-4 px-2 py-1 md:py-3 inline-flex shrink-0 items-center justify-center text-center bg-[#D10C0C] rounded-full prev-step-btn font-arabic font-bold"
                           onClick={() => setShowAnswer(false)}>
                        <span className="shrink-0">ارجع للسؤال</span>
                      </div>
                      <div className="cursor-pointer 2xl:text-3xl md:text-xl text-base text-white md:px-4 px-2 py-1 md:py-3 inline-flex shrink-0 items-center justify-center text-center bg-[#00619B] rounded-full next-step-btn font-arabic font-bold"
                           onClick={handleShowScoring}>
                        <span className="shrink-0">منو جاوب؟</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Scoring Section - Clean scoring area with team buttons only */}
              {showScoring && (
                <div className="flex justify-center items-center w-full flex-col h-full question-block-wrapper absolute inset-0"
                     style={{
                       background: 'linear-gradient(#f7f2e6, #f7f2e6) padding-box, linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626) border-box',
                       border: '5px solid transparent',
                       borderRadius: 'inherit'
                     }}>

                  {/* Team Selection Buttons - Centered in scoring area */}
                  <div className="flex flex-col gap-4 justify-center items-center w-full h-full">
                    {/* Title Text */}
                    <div className="text-center mb-4">
                      <h2 className="text-black font-bold font-arabic"
                          style={{ fontSize: `${styles.questionFontSize}px` }}>
                        منو جاوب صح؟
                      </h2>
                    </div>

                    {/* First Row - Team Buttons Side by Side */}
                    <div style={{ width: '90%' }} className="flex gap-4">
                      <button
                        onClick={() => handleScoreTeam('team1')}
                        className="text-white font-bold rounded-full px-6 py-3 font-arabic flex-1 hover:opacity-90 transition-opacity"
                        style={{
                          fontSize: `${styles.buttonFontSize}px`,
                          background: 'linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626)'
                        }}
                      >
                        {gameState.team1.name}
                      </button>
                      <button
                        onClick={() => handleScoreTeam('team2')}
                        className="text-white font-bold rounded-full px-6 py-3 font-arabic flex-1 hover:opacity-90 transition-opacity"
                        style={{
                          fontSize: `${styles.buttonFontSize}px`,
                          background: 'linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626)'
                        }}
                      >
                        {gameState.team2.name}
                      </button>
                    </div>

                    {/* Second Row - No One Button Spanning Full Width */}
                    <div style={{ width: '90%' }}>
                      <button
                        onClick={() => handleNoAnswer()}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-full px-6 py-3 w-full"
                        style={{ fontSize: `${styles.buttonFontSize}px` }}
                      >
                        لا أحد
                      </button>
                    </div>
                  </div>

                  {/* Navigation Buttons at Bottom - Return to Answer and Question */}
                  <div className="absolute bottom-0 translate-y-1/4 left-0 right-0">
                    <div className="flex items-stretch justify-between">
                      <div className="cursor-pointer 2xl:text-3xl xl:text-xl text-sm text-white md:px-4 px-2 py-1 md:py-3 inline-flex shrink-0 items-center justify-center text-center bg-[#D10C0C] rounded-full prev-step-btn font-arabic font-bold"
                           onClick={() => {
                             setShowScoring(false)
                             setShowAnswer(false)
                           }}>
                        <span className="shrink-0">ارجع للسؤال</span>
                      </div>
                      <div className="cursor-pointer 2xl:text-3xl md:text-xl text-base text-white md:px-4 px-2 py-1 md:py-3 inline-flex shrink-0 items-center justify-center text-center bg-[#00619B] rounded-full next-step-btn font-arabic font-bold"
                           onClick={() => setShowScoring(false)}>
                        <span className="shrink-0">ارجع للإجابة</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}


            </div>
          </div>
        </div>
      </div>

      {/* Perk Modal */}
      <PerkModal
        isOpen={perkModalOpen}
        onClose={handlePerkModalClose}
        perkType={activePerk.type}
        teamName={activePerk.team === 'team1' ? gameState.team1.name : gameState.team2.name}
        onConfirm={handlePerkConfirm}
        usageCount={gameState.perkUsage?.[activePerk.team]?.[activePerk.type] || 0}
        maxUses={1}
        readOnly={false}
      />
    </div>
  )
}

export default QuestionView
