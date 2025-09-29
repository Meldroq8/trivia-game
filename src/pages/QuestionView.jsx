import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PresentationModeToggle from '../components/PresentationModeToggle'
import { useAuth } from '../hooks/useAuth'
import AudioPlayer from '../components/AudioPlayer'
import MediaPlayer from '../components/MediaPlayer'
import { GameDataLoader } from '../utils/gameDataLoader'
import PerkModal from '../components/PerkModal'
import gamePreloader from '../utils/preloader'
import questionUsageTracker from '../utils/questionUsageTracker'
import LogoDisplay from '../components/LogoDisplay'
import { hasGameStarted, shouldStayOnCurrentPage } from '../utils/gameStateUtils'

function QuestionView({ gameState, setGameState, stateLoaded }) {
  const navigate = useNavigate()
  const location = useLocation()

  // Debug: Log current question with video URLs
  useEffect(() => {
    if (gameState?.currentQuestion) {
      console.log('🎬 Current question data:', {
        text: gameState.currentQuestion.text?.substring(0, 50) + '...',
        hasVideoUrl: !!gameState.currentQuestion.videoUrl,
        hasAnswerVideoUrl: !!gameState.currentQuestion.answerVideoUrl,
        videoUrl: gameState.currentQuestion.videoUrl,
        answerVideoUrl: gameState.currentQuestion.answerVideoUrl,
        allKeys: Object.keys(gameState.currentQuestion)
      })

      // Check if this is a question that has video but is missing video URLs
      if (!gameState.currentQuestion.videoUrl && !gameState.currentQuestion.answerVideoUrl) {
        console.log('⚠️ Question has no video URLs - cache might need clearing!')
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

      // More accurate space calculation
      const actualHeaderHeight = 80 // Use fixed value to avoid dependency issues
      const padding = isUltraNarrow ? 4 : isMobileLayout ? 6 : 8

      // Minimal space accounting to maximize question area
      const browserUIBuffer = 0 // No browser buffer - use natural overflow
      const buttonBuffer = 20 // Minimal space for bottom buttons
      const safetyMargin = 0 // No safety margin - let natural scrolling handle overflow

      const totalReservedSpace = actualHeaderHeight + browserUIBuffer + buttonBuffer + safetyMargin + (padding * 2)
      const availableHeight = Math.max(350, actualVH - totalReservedSpace)
      const availableWidth = W - (padding * 2)

      // Calculate aspect ratio and screen density for better scaling with validation
      const aspectRatio = actualVH > 0 ? W / actualVH : W / H
      const screenDensity = Math.sqrt(W * W + actualVH * actualVH) / Math.max(W, actualVH || H)

      // Very conservative scaling
      const globalScaleFactor = Math.max(0.8, Math.min(1.2, W / 400))

      // Adjust question area for different devices with PC scaling
      let questionAreaHeight
      if (isShortScreen) {
        // Z Fold and short screens - use smaller percentage to prevent overflow
        questionAreaHeight = Math.min(availableHeight * 0.75, 250)
      } else {
        // Other devices - maximize space, scale for PC
        if (isPC) {
          // PC: Keep original logic unchanged
          questionAreaHeight = availableHeight * 0.8
        } else {
          // Mobile/Tablet: Use safe percentage - reduce from 90% to 75%
          questionAreaHeight = Math.min(availableHeight * 0.75, 500)
        }
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

      // Calculate responsive font sizes and dimensions
      const baseFontSize = isPC ? 24 : (isUltraNarrow ? 14 : 16)
      const buttonPadding = Math.max(8, globalScaleFactor * 12)
      const headerFontSize = baseFontSize * globalScaleFactor
      const teamSectionWidth = isPC ? 300 : 200
      const teamNameFontSize = baseFontSize * 0.9 * globalScaleFactor
      const teamScoreFontSize = baseFontSize * 1.2 * globalScaleFactor
      const teamHelpFontSize = baseFontSize * 0.8 * globalScaleFactor
      const teamIconSize = Math.max(32, 40 * globalScaleFactor)
      const buttonFontSize = baseFontSize * globalScaleFactor
      const timerSize = Math.max(150, 150 * globalScaleFactor)
      const timerEmojiSize = Math.max(16, 20 * globalScaleFactor)
      const timerFontSize = baseFontSize * 0.9 * globalScaleFactor
      const questionFontSize = baseFontSize * 1.1 * globalScaleFactor
      const imageAreaHeight = Math.max(200, finalQuestionAreaHeight * 0.6)
      const answerFontSize = baseFontSize * 1.1 * globalScaleFactor
      const scoringButtonWidth = Math.max(100, 120 * globalScaleFactor)
      const scoringButtonHeight = Math.max(60, 80 * globalScaleFactor)
      const scoringFontSize = baseFontSize * 0.9 * globalScaleFactor

      // Return calculated responsive values with error fallbacks
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
        teamSectionWidth,
        teamNameFontSize,
        teamScoreFontSize,
        teamHelpFontSize,
        teamIconSize,
        buttonFontSize,
        timerSize,
        timerEmojiSize,
        timerFontSize,
        questionFontSize,
        imageAreaHeight,
        answerFontSize,
        scoringButtonWidth,
        scoringButtonHeight,
        scoringFontSize
      }
    } catch (error) {
      console.error('Error in getResponsiveStyles:', error)
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
        buttonFontSize: 16,
        timerSize: 200,
        timerEmojiSize: 16,
        timerFontSize: 14,
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
  const { isAuthenticated, loading, user } = useAuth()
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)

  // Memoized responsive styles
  const styles = useMemo(() => getResponsiveStyles(), [])

  // Set user ID for question tracker when user changes
  useEffect(() => {
    console.log('🔧 QuestionView: User changed:', user?.uid ? 'User ID: ' + user.uid : 'No user')
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
      console.log('✅ QuestionView: Set questionUsageTracker user ID to:', user.uid)
    }
  }, [user])

  // BULLETPROOF: No redirects to categories after game starts
  useEffect(() => {
    if (!stateLoaded) return

    // Check if we should stay on this page
    if (shouldStayOnCurrentPage(gameState, location.pathname)) {
      console.log('🛡️ QuestionView: Staying on current page - no redirects allowed')
      return
    }

    // Only redirect if explicitly starting fresh (no game started, no route restoration)
    if (!gameState.selectedCategories.length && !hasGameStarted(gameState)) {
      // Give time for Firebase to load, then check again
      const timeout = setTimeout(() => {
        if (!gameState.selectedCategories.length && !hasGameStarted(gameState) && !shouldStayOnCurrentPage(gameState, location.pathname)) {
          console.log('🔄 QuestionView: Fresh start - redirecting to categories')
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

    console.log(`Game completion check: ${answeredQuestions}/${totalQuestions} questions answered`)

    // If all questions have been answered, automatically go to results
    if (answeredQuestions >= totalQuestions && answeredQuestions > 0) {
      console.log('🎉 All questions completed! Navigating to results...')
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
        console.error('Error loading game data in QuestionView:', error)
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
    console.log('🎥 Loading video URL:', cachedUrl)
    return cachedUrl
  }

  // Force clear cache and reload data
  const forceClearCacheAndReload = async () => {
    console.log('🔄 Force clearing cache and reloading data...')

    // Clear localStorage cache
    localStorage.removeItem('triviaData')
    localStorage.removeItem('triviaDataTimestamp')

    // Force reload game data
    try {
      const { GameDataLoader } = await import('../utils/gameDataLoader')
      const freshData = await GameDataLoader.loadGameData(true) // Force refresh
      console.log('✅ Fresh data loaded:', freshData)

      // Reload the page to get fresh data
      window.location.reload()
    } catch (error) {
      console.error('❌ Error force refreshing data:', error)
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
          console.log('🔄 QuestionView: Restoring question from localStorage after refresh')
          setGameState(prev => ({
            ...prev,
            currentQuestion: parsedQuestion
          }))
        }
      } catch (error) {
        console.error('❌ Error restoring question from localStorage:', error)
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


  const handleShowAnswer = () => {
    setShowAnswer(true)
    setTimerActive(false)
    // Hide active timer circle when showing answer
    setActiveTimer({ active: false, type: null, team: null, timeLeft: 0, paused: false })
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
      console.log('⏳ QuestionView: Skipping global question tracking - user not authenticated')
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
      console.log('⏳ QuestionView: Skipping global question tracking - user not authenticated')
    }

    // Mark question as used without awarding points
    setGameState(prev => {
      const newUsedQuestions = new Set([...prev.usedQuestions, currentQuestion.question.id])
      const newUsedPointValues = new Set([...(prev.usedPointValues || []), currentQuestion.pointValueKey])

      console.log('✅ New used questions set (no answer):', Array.from(newUsedQuestions))
      console.log('✅ New used point values set (no answer):', Array.from(newUsedPointValues))

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

  const handleBackdropClick = () => {
    setImageZoomed(false)
  }

  // Perk handling functions
  const handlePerkClick = (perkType, team) => {
    // Double points perk can only be used before selecting a question (in GameBoard)
    if (perkType === 'double') return

    if (!currentQuestion) return // Only allow phone/search perks when question is visible

    // Only allow the current team to use perks
    if (gameState.currentTurn !== team) return

    setActivePerk({ type: perkType, team })
    setPerkModalOpen(true)
  }

  const handlePerkConfirm = () => {
    const { type, team } = activePerk

    // Initialize perk usage tracking if it doesn't exist
    if (!gameState.perkUsage) {
      setGameState(prev => ({
        ...prev,
        perkUsage: {
          team1: { double: 0, phone: 0, search: 0 },
          team2: { double: 0, phone: 0, search: 0 }
        }
      }))
    }

    // Check if perk is already used (max 1 use per perk per team)
    const currentUsage = gameState.perkUsage?.[team]?.[type] || 0
    if (currentUsage >= 1) return

    // Update perk usage count
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

    // Handle specific perk effects
    if (type === 'double') {
      // Double points should not be activatable in QuestionView
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
          console.log('🏁 Constructed flag image URL:', imageUrl)
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
          console.warn('❌ Failed to preload current question image:', error)
        })
    } else {
      // No image found in current question for preloading (debug removed)
    }

    // Immediately preload current question's audio if it has one
    if (currentQuestion?.question?.audio) {
      console.log('🎵 Immediately preloading current question audio:', currentQuestion.question.audio)
      gamePreloader.preloadAudio(currentQuestion.question.audio)
        .then(() => {
          console.log('✅ Current question audio preloaded successfully')
        })
        .catch(error => {
          console.warn('❌ Failed to preload current question audio:', error)
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
    <div ref={containerRef} className="bg-gradient-to-br from-red-900 via-red-800 to-red-900 flex flex-col" style={{
      height: '100vh',
      overflow: 'hidden'
    }} onClick={handleBackdropClick}>
      {/* Header - Copy from GameBoard */}
      <div
        ref={headerRef}
        className="bg-red-600 text-white flex-shrink-0 sticky top-0 z-10 overflow-hidden"
        style={{
          padding: `${Math.max(8, styles.buttonPadding * 0.25)}px`,
          height: `${Math.max(56, styles.headerFontSize * 3)}px`
        }}
      >
        <div className="flex justify-between items-center h-full">
          <div className="flex items-center gap-3">
            <LogoDisplay />
            <span className="font-bold text-white" style={{ fontSize: `${styles.headerFontSize * 0.9}px` }}>
              دور الفريق:
            </span>
            <span
              className="font-bold text-white"
              style={{ fontSize: `${styles.headerFontSize * 0.9}px` }}
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
              className="bg-red-700 hover:bg-red-800 text-white rounded-lg px-2 py-1 transition-colors"
              style={{ fontSize: `${styles.headerFontSize * 1}px` }}
            >
              🔄
            </button>
          </div>

          <div className="flex-1 text-center flex items-center justify-center gap-3 px-2">
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

          <div className="flex gap-3">
            <PresentationModeToggle style={{ fontSize: `${styles.headerFontSize * 0.8}px` }} />
            <button
              onClick={() => navigate('/game')}
              className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors"
              style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}
            >
              الرجوع للوحة
            </button>
            <button
              onClick={() => navigate('/results')}
              className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors"
              style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}
            >
              انهاء
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Full Screen with Header */}
      <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
        <div className="bg-[#f7f2e6] flex-1 flex" style={{ minHeight: 0 }}>
          {/* Main Content Area - Full Height Split Layout */}
          <div className="flex flex-1 h-full">
            {/* Left Side - Teams - Responsive Width - Height varies by device */}
            <div className="flex flex-col flex-shrink-0" style={{
              width: styles.isPC ? `${styles.teamSectionWidth}px` : '200px',
              height: styles.isPC ? '90%' : (styles.isUltraNarrow ? '75%' : '85%')
            }}>
              {/* Team 1 */}
              <div className="flex-1 bg-red-600 text-white flex flex-col items-center justify-center" style={{
                padding: `${Math.max(2, styles.buttonPadding * 0.25)}px`,
                borderTopLeftRadius: '0',
                borderTopRightRadius: '0',
                borderBottomLeftRadius: '0',
                borderBottomRightRadius: '0',
                position: 'relative'
              }}>
                <div className="absolute top-0 left-0 w-6 h-6" style={{
                  background: 'radial-gradient(circle at bottom right, transparent 70%, #dc2626 70%)'
                }}></div>
                <div className="flex flex-col items-center justify-center h-full">
                  <div className={`bg-black text-white font-bold rounded-full shadow-lg text-center ${gameState.currentTurn === 'team1' ? 'ring-4 ring-white' : ''}`} style={{
                    fontSize: `${styles.buttonFontSize * 0.8}px`,
                    padding: `${styles.buttonPadding * 0.4}px ${styles.buttonPadding * 0.8}px`,
                    marginBottom: `${styles.buttonPadding * 0.25}px`
                  }}>{gameState.team1.name}</div>
                  <div className="font-bold text-center" style={{
                    fontSize: `${styles.teamScoreFontSize}px`,
                    marginBottom: `${styles.buttonPadding * 0.25}px`
                  }}>{gameState.team1.score}</div>
                  <div className="text-center" style={{
                    fontSize: `${styles.teamHelpFontSize}px`,
                    marginBottom: `${styles.buttonPadding * 0.5}px`
                  }}>وسائل المساعدة</div>
                  <div className="flex" style={{ gap: `${styles.buttonPadding * 0.25}px` }}>
                    <div
                      className="bg-gray-400 opacity-50 cursor-not-allowed rounded-full flex items-center justify-center transition-all duration-200"
                      style={{
                        width: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        height: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        fontSize: styles.isUltraNarrow ? '19.2px' : `${styles.teamIconSize * 0.6}px`
                      }}
                      title="متاح فقط في لوحة اللعبة"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                        <text x="12" y="15" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">2</text>
                      </svg>
                    </div>
                    <div
                      className={`rounded-full flex items-center justify-center transition-all duration-200 ${
                        (gameState.perkUsage?.team1?.phone || 0) >= 1
                          ? 'bg-gray-400 opacity-50 cursor-not-allowed'
                          : gameState.currentTurn !== 'team1'
                          ? 'bg-white bg-opacity-10 opacity-30 cursor-not-allowed'
                          : 'bg-white bg-opacity-20 cursor-pointer hover:bg-opacity-30'
                      }`}
                      style={{
                        width: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        height: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        fontSize: styles.isUltraNarrow ? '19.2px' : `${styles.teamIconSize * 0.6}px`
                      }}
                      onClick={() => handlePerkClick('phone', 'team1')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                      </svg>
                    </div>
                    <div
                      className={`rounded-full flex items-center justify-center transition-all duration-200 ${
                        (gameState.perkUsage?.team1?.search || 0) >= 1
                          ? 'bg-gray-400 opacity-50 cursor-not-allowed'
                          : gameState.currentTurn !== 'team1'
                          ? 'bg-white bg-opacity-10 opacity-30 cursor-not-allowed'
                          : 'bg-white bg-opacity-20 cursor-pointer hover:bg-opacity-30'
                      }`}
                      style={{
                        width: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        height: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        fontSize: styles.isUltraNarrow ? '19.2px' : `${styles.teamIconSize * 0.6}px`
                      }}
                      onClick={() => handlePerkClick('search', 'team1')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Team 2 */}
              <div className="flex-1 bg-red-600 text-white flex flex-col items-center justify-center rounded-bl-3xl" style={{
                padding: `${Math.max(2, styles.buttonPadding * 0.25)}px`,
                position: 'relative'
              }}>
                <div className="flex flex-col items-center justify-center h-full">
                  <div className={`bg-black text-white font-bold rounded-full shadow-lg text-center ${gameState.currentTurn === 'team2' ? 'ring-4 ring-white' : ''}`} style={{
                    fontSize: `${styles.buttonFontSize * 0.8}px`,
                    padding: `${styles.buttonPadding * 0.4}px ${styles.buttonPadding * 0.8}px`,
                    marginBottom: `${styles.buttonPadding * 0.25}px`
                  }}>{gameState.team2.name}</div>
                  <div className="font-bold text-center" style={{
                    fontSize: `${styles.teamScoreFontSize}px`,
                    marginBottom: `${styles.buttonPadding * 0.25}px`
                  }}>{gameState.team2.score}</div>
                  <div className="text-center" style={{
                    fontSize: `${styles.teamHelpFontSize}px`,
                    marginBottom: `${styles.buttonPadding * 0.5}px`
                  }}>وسائل المساعدة</div>
                  <div className="flex" style={{ gap: `${styles.buttonPadding * 0.25}px` }}>
                    <div
                      className="bg-gray-400 opacity-50 cursor-not-allowed rounded-full flex items-center justify-center transition-all duration-200"
                      style={{
                        width: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        height: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        fontSize: styles.isUltraNarrow ? '19.2px' : `${styles.teamIconSize * 0.6}px`
                      }}
                      title="متاح فقط في لوحة اللعبة"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                        <text x="12" y="15" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">2</text>
                      </svg>
                    </div>
                    <div
                      className={`rounded-full flex items-center justify-center transition-all duration-200 ${
                        (gameState.perkUsage?.team2?.phone || 0) >= 1
                          ? 'bg-gray-400 opacity-50 cursor-not-allowed'
                          : gameState.currentTurn !== 'team2'
                          ? 'bg-white bg-opacity-10 opacity-30 cursor-not-allowed'
                          : 'bg-white bg-opacity-20 cursor-pointer hover:bg-opacity-30'
                      }`}
                      style={{
                        width: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        height: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        fontSize: styles.isUltraNarrow ? '19.2px' : `${styles.teamIconSize * 0.6}px`
                      }}
                      onClick={() => handlePerkClick('phone', 'team2')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                      </svg>
                    </div>
                    <div
                      className={`rounded-full flex items-center justify-center transition-all duration-200 ${
                        (gameState.perkUsage?.team2?.search || 0) >= 1
                          ? 'bg-gray-400 opacity-50 cursor-not-allowed'
                          : gameState.currentTurn !== 'team2'
                          ? 'bg-white bg-opacity-10 opacity-30 cursor-not-allowed'
                          : 'bg-white bg-opacity-20 cursor-pointer hover:bg-opacity-30'
                      }`}
                      style={{
                        width: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        height: styles.isUltraNarrow ? '32px' : `${styles.teamIconSize}px`,
                        fontSize: styles.isUltraNarrow ? '19.2px' : `${styles.teamIconSize * 0.6}px`
                      }}
                      onClick={() => handlePerkClick('search', 'team2')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>


            {/* Right Side - Question and Image */}
            <div className="flex-1 flex flex-col relative" style={{
              height: styles.isPC ? '90%' : (styles.isUltraNarrow ? '90%' : '95%'),
              paddingTop: styles.isPC ? `${Math.max(12, styles.buttonPadding * 0.25)}px` : `${Math.max(8, styles.buttonPadding * 0.5)}px`,
              paddingLeft: styles.isPC ? `${Math.max(12, styles.buttonPadding * 0.25)}px` : `${Math.max(8, styles.buttonPadding * 0.5)}px`,
              paddingRight: styles.isPC ? `${Math.max(12, styles.buttonPadding * 0.25)}px` : `${Math.max(8, styles.buttonPadding * 0.5)}px`
            }}>
              {/* Perk Timer Circle */}
              {activeTimer.active && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: `${Math.max(8, styles.buttonPadding * 0.75) + 15}px`,
                    right: `${Math.max(8, styles.buttonPadding * 0.75) + 15}px`,
                    zIndex: 1000,
                    backgroundColor: activeTimer.paused ? '#059669' : '#dc2626',
                    color: 'white',
                    borderRadius: '50%',
                    width: `${120 * (styles.isPC ? 2.0 : 1.0)}px`,
                    height: `${120 * (styles.isPC ? 2.0 : 1.0)}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
                    cursor: 'pointer',
                    transition: 'transform 0.3s ease',
                    border: '4px solid rgba(255, 255, 255, 0.4)'
                  }}
                  onClick={() => setActiveTimer(prev => ({ ...prev, paused: !prev.paused }))}
                  title={`${activeTimer.type === 'phone' ? 'اتصال بصديق' : 'البحث في جوجل'} - ${activeTimer.team === 'team1' ? gameState.team1.name : gameState.team2.name} - ${activeTimer.paused ? 'اضغط للمتابعة' : 'اضغط للإيقاف'}`}
                >
                  <div style={{ fontSize: `${24 * (styles.isPC ? 2.0 : 1.0)}px`, marginBottom: '4px' }}>
                    {activeTimer.type === 'phone' ? '📞' : '🔍'}
                  </div>
                  <div style={{ fontSize: `${16 * (styles.isPC ? 2.0 : 1.0)}px`, lineHeight: '1', fontWeight: 'bold' }}>
                    {String(Math.floor(activeTimer.timeLeft / 60)).padStart(2, '0')}:{String(activeTimer.timeLeft % 60).padStart(2, '0')}
                  </div>
                </div>
              )}

              <div className="bg-[#f7f2e6] rounded-2xl border-4 border-red-600 flex flex-col relative h-full" style={{
                outline: '2px solid #dc2626',
                outlineOffset: '2px'
              }}>
                {/* الإجابة Button - Overlapping bottom-left corner */}
                {!showAnswer && (
                  <button
                    onClick={handleShowAnswer}
                    className="absolute bg-green-600 hover:bg-green-700 text-white font-bold rounded-full shadow-lg z-10"
                    style={{
                      left: '-12px',
                      bottom: '-12px',
                      fontSize: `${styles.buttonFontSize}px`,
                      padding: `${styles.buttonPadding * 0.5}px ${styles.buttonPadding}px`
                    }}
                  >
                    الإجابة
                  </button>
                )}

                {/* Points Display - Overlapping top-right corner */}
                <div
                  className="absolute bg-blue-600 text-white font-bold rounded-full shadow-lg z-10"
                  style={{
                    right: '-12px',
                    top: '-12px',
                    fontSize: `${styles.buttonFontSize}px`,
                    padding: `${styles.buttonPadding * 0.5}px ${styles.buttonPadding}px`
                  }}
                >
                  {currentQuestion?.points || 0} نقطة
                </div>

                {/* منو جاوب صح Button - Overlapping bottom-left corner when showing answer */}
                {showAnswer && !showScoring && (
                  <button
                    onClick={handleShowScoring}
                    className="absolute bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-full shadow-lg z-10"
                    style={{
                      left: '-12px',
                      bottom: '-12px',
                      fontSize: `${styles.buttonFontSize}px`,
                      padding: `${styles.buttonPadding * 0.5}px ${styles.buttonPadding}px`
                    }}
                  >
                    منو جاوب صح؟
                  </button>
                )}

                {/* الرجوع للإجابة Button - Overlapping bottom-left corner when showing scoring */}
                {showScoring && (
                  <button
                    onClick={() => setShowScoring(false)}
                    className="absolute bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-lg z-10"
                    style={{
                      left: '-12px',
                      bottom: '-12px',
                      fontSize: `${styles.buttonFontSize}px`,
                      padding: `${styles.buttonPadding * 0.5}px ${styles.buttonPadding}px`
                    }}
                  >
                    الرجوع للإجابة
                  </button>
                )}

                {/* الرجوع للسؤال Button - Overlapping bottom-right corner when showing answer or scoring */}
                {(showAnswer || showScoring) && (
                  <button
                    onClick={() => {
                      setShowAnswer(false)
                      setShowScoring(false)
                    }}
                    className="absolute bg-red-600 hover:bg-red-700 text-white font-bold rounded-full shadow-lg z-10"
                    style={{
                      right: '-12px',
                      bottom: '-12px',
                      fontSize: `${styles.buttonFontSize}px`,
                      padding: `${styles.buttonPadding * 0.5}px ${styles.buttonPadding}px`
                    }}
                  >
                    الرجوع للسؤال
                  </button>
                )}

                {!showAnswer ? (
                  <>
                    {/* Compact Oval Timer Section */}
                    <div className="flex justify-center" style={{
                      paddingTop: styles.isUltraNarrow
                        ? `${Math.max(8, styles.buttonPadding * 0.5)}px`
                        : styles.isMobileLayout
                        ? `${Math.max(12, styles.buttonPadding * 0.75)}px`
                        : `${Math.max(16, styles.buttonPadding * 1.0)}px`,
                      paddingBottom: `${Math.max(1, styles.buttonPadding * 0.03125)}px`
                    }}>
                      <div className="relative">
                        {/* Simple Oval Timer */}
                        <div
                          className={`shadow-xl flex items-center justify-between backdrop-blur-sm border-2 transition-all duration-300 ${
                            timeElapsed >= 50
                              ? 'bg-red-600/90 border-red-400 shadow-red-500/20'
                              : timeElapsed >= 30
                              ? 'bg-amber-600/90 border-amber-400 shadow-amber-500/20'
                              : 'bg-emerald-600/90 border-emerald-400 shadow-emerald-500/20'
                          }`}
                          style={{
                            width: styles.isUltraNarrow
                              ? `${Math.max(140, styles.timerSize * 0.9)}px`
                              : styles.isMobileLayout
                              ? `${Math.max(160, styles.timerSize * 1.0)}px`
                              : `${Math.max(180, styles.timerSize * 1.2)}px`,
                            height: styles.isUltraNarrow
                              ? `${Math.max(45, styles.timerSize * 0.3)}px`
                              : styles.isMobileLayout
                              ? `${Math.max(50, styles.timerSize * 0.35)}px`
                              : `${Math.max(60, styles.timerSize * 0.4)}px`,
                            borderRadius: styles.isUltraNarrow
                              ? `${Math.max(22, styles.timerSize * 0.15)}px`
                              : styles.isMobileLayout
                              ? `${Math.max(25, styles.timerSize * 0.175)}px`
                              : `${Math.max(30, styles.timerSize * 0.2)}px`,
                            padding: `${Math.max(2, styles.buttonPadding * 0.15)}px ${Math.max(6, styles.buttonPadding * 0.4)}px`,
                            gap: `${Math.max(3, styles.buttonPadding * 0.2)}px`
                          }}
                        >
                          {/* SVG Play/Pause Button */}
                          <button
                            onClick={() => setTimerActive(!timerActive)}
                            className="rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 flex items-center justify-center"
                            style={{
                              width: styles.isUltraNarrow
                                ? `${Math.max(26, styles.timerEmojiSize)}px`
                                : styles.isMobileLayout
                                ? `${Math.max(28, styles.timerEmojiSize + 2)}px`
                                : `${Math.max(32, styles.timerEmojiSize + 4)}px`,
                              height: styles.isUltraNarrow
                                ? `${Math.max(26, styles.timerEmojiSize)}px`
                                : styles.isMobileLayout
                                ? `${Math.max(28, styles.timerEmojiSize + 2)}px`
                                : `${Math.max(32, styles.timerEmojiSize + 4)}px`
                            }}
                          >
                            {timerActive ? (
                              // Pause Icon
                              <svg
                                width={styles.isUltraNarrow ? "10" : styles.isMobileLayout ? "11" : "12"}
                                height={styles.isUltraNarrow ? "10" : styles.isMobileLayout ? "11" : "12"}
                                viewBox="0 0 12 12"
                                fill="none"
                              >
                                <rect x="2" y="1" width="2.5" height="10" rx="1" fill="white" />
                                <rect x="7.5" y="1" width="2.5" height="10" rx="1" fill="white" />
                              </svg>
                            ) : (
                              // Play Icon
                              <svg
                                width={styles.isUltraNarrow ? "10" : styles.isMobileLayout ? "11" : "12"}
                                height={styles.isUltraNarrow ? "10" : styles.isMobileLayout ? "11" : "12"}
                                viewBox="0 0 12 12"
                                fill="none"
                              >
                                <path
                                  d="M3 1.5L10 6L3 10.5V1.5Z"
                                  fill="white"
                                  stroke="white"
                                  strokeWidth="0.5"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>

                          {/* Time Display */}
                          <div className="flex-1 flex items-center justify-center">
                            <div className="font-bold text-white text-center leading-none" style={{
                              fontSize: styles.isUltraNarrow
                                ? `${Math.max(14, styles.timerFontSize * 0.8)}px`
                                : styles.isMobileLayout
                                ? `${Math.max(16, styles.timerFontSize * 0.9)}px`
                                : `${Math.max(18, styles.timerFontSize * 1.0)}px`,
                              textShadow: '0 2px 4px rgba(0,0,0,0.4)',
                              fontFamily: 'monospace'
                            }}>
                              {String(Math.floor(timeElapsed / 60)).padStart(2, '0')}:{String(timeElapsed % 60).padStart(2, '0')}
                            </div>
                          </div>

                          {/* SVG Reset Button */}
                          <button
                            onClick={() => setTimeElapsed(0)}
                            className="rounded-full bg-white/10 hover:bg-white/20 transition-all duration-200 flex items-center justify-center"
                            style={{
                              width: styles.isUltraNarrow
                                ? `${Math.max(26, styles.timerEmojiSize)}px`
                                : styles.isMobileLayout
                                ? `${Math.max(28, styles.timerEmojiSize + 2)}px`
                                : `${Math.max(32, styles.timerEmojiSize + 4)}px`,
                              height: styles.isUltraNarrow
                                ? `${Math.max(26, styles.timerEmojiSize)}px`
                                : styles.isMobileLayout
                                ? `${Math.max(28, styles.timerEmojiSize + 2)}px`
                                : `${Math.max(32, styles.timerEmojiSize + 4)}px`
                            }}
                          >
                            {/* Reset/Refresh Icon */}
                            <svg
                              width={styles.isUltraNarrow ? "10" : styles.isMobileLayout ? "11" : "12"}
                              height={styles.isUltraNarrow ? "10" : styles.isMobileLayout ? "11" : "12"}
                              viewBox="0 0 12 12"
                              fill="none"
                            >
                              <path
                                d="M3 2.5C4.5 1 7.5 1 9 2.5C10.5 4 10.5 7 9 8.5C7.5 10 4.5 10 3 8.5L3.5 8"
                                stroke="white"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                fill="none"
                              />
                              <path
                                d="M2.5 7.5L3.5 8.5L4.5 7.5"
                                stroke="white"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Content area without padding to prevent overlap */}
                    <div className="flex-1 relative">

                      <div className="flex items-center justify-center" style={{ padding: `${Math.max(1, styles.buttonPadding * 0.03125)}px ${Math.max(2, styles.buttonPadding * 0.0625)}px` }}>
                        <h2 className="font-bold text-gray-800 text-center" dir="rtl" style={{ fontSize: `${styles.questionFontSize}px` }}>
                          {currentQuestion ? (currentQuestion.question?.text || currentQuestion.text) : 'جاري تحميل السؤال...'}
                        </h2>
                      </div>

                      {/* Media Player - Audio and Video */}
                      {(() => {
                        const hasQuestionAudio = currentQuestion?.question?.audioUrl || currentQuestion?.audioUrl
                        const hasQuestionVideo = currentQuestion?.question?.videoUrl || currentQuestion?.videoUrl
                        console.log('🎵 Question Media Check:', {
                          hasQuestionAudio: !!hasQuestionAudio,
                          hasQuestionVideo: !!hasQuestionVideo,
                          audioUrl1: currentQuestion?.question?.audioUrl,
                          audioUrl2: currentQuestion?.audioUrl,
                          videoUrl1: currentQuestion?.question?.videoUrl,
                          videoUrl2: currentQuestion?.videoUrl
                        })
                        return currentQuestion && (hasQuestionAudio || hasQuestionVideo)
                      })() && (
                        <div className="flex justify-center" style={{ padding: '30px 2px' }}>
                          <div style={{ maxWidth: '500px', width: '100%' }}>
                            {/* Video Player - Show if video exists */}
                            {(currentQuestion.question?.videoUrl || currentQuestion.videoUrl) ? (
                              <MediaPlayer
                                src={getCachedMediaUrl(currentQuestion.question?.videoUrl || currentQuestion.videoUrl)}
                                type="video"
                                className="w-full"
                              />
                            ) : (
                              /* Audio Player - Show if only audio exists */
                              <MediaPlayer
                                src={getCachedAudioUrl(currentQuestion.question?.audioUrl || currentQuestion.audioUrl)}
                                type="audio"
                                className="w-full"
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Question Image Area - Fixed Height */}
                      <div className="flex-1 flex items-center justify-center" style={{
                        minHeight: styles.isUltraNarrow ? '150px' : `${styles.imageAreaHeight}px`,
                        height: styles.isUltraNarrow ? '150px' : `${styles.imageAreaHeight}px`,
                        overflow: 'hidden',
                        paddingLeft: styles.isUltraNarrow ? '1.8px' : `${Math.max(1, styles.buttonPadding * 0.125)}px`,
                        paddingRight: styles.isUltraNarrow ? '1.8px' : `${Math.max(1, styles.buttonPadding * 0.125)}px`,
                        paddingTop: styles.isUltraNarrow ? '1px' : `${Math.max(1, styles.buttonPadding * 0.03125)}px`
                      }}>
                        {(() => {
                          const showImage = currentQuestion && currentQuestion.question?.imageUrl && shouldShowImageInQuestion(currentQuestion.categoryId);

                          if (!showImage) {
                            return <div className="w-full h-full"></div>;
                          }

                          return (
                            <>
                              {imageLoading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
                                  <div className="flex flex-col items-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    <span className="text-sm text-gray-600 mt-2">جاري تحميل الصورة...</span>
                                  </div>
                                </div>
                              )}
                              <img
                                src={getCachedImageUrl(getQuestionImageUrl())}
                                alt="سؤال"
                                className={`rounded-lg cursor-pointer transition-all duration-300 ${imageLoading ? 'opacity-0' : 'opacity-100'} ${imageZoomed ? 'fixed inset-0 z-50 w-screen h-screen object-contain bg-black bg-opacity-90' : ''}`}
                                style={{
                                  display: 'block',
                                  visibility: 'visible',
                                  ...(imageZoomed ? {
                                    maxWidth: 'none',
                                    maxHeight: 'none',
                                    width: '100vw',
                                    height: '100vh',
                                    objectFit: 'contain',
                                    zIndex: 9999
                                  } : {
                                    maxWidth: styles.isUltraNarrow ? '80%' : '100%',
                                    maxHeight: styles.isUltraNarrow ? '80%' : '100%',
                                    width: styles.isUltraNarrow ? 'auto' : ((currentQuestion.question.imageUrl.endsWith('.svg') && styles.isPC) ? '400px' : 'auto'),
                                    height: styles.isUltraNarrow ? 'auto' : ((currentQuestion.question.imageUrl.endsWith('.svg') && styles.isPC) ? '300px' : 'auto'),
                                    objectFit: 'contain',
                                    touchAction: styles.isPC ? 'auto' : 'manipulation',
                                    userSelect: 'none',
                                    WebkitUserSelect: 'none',
                                    WebkitTouchCallout: 'none'
                                  })
                                }}
                                onClick={handleImageClick}
                                onLoad={(e) => {
                                  // Only handle loading for non-cached images
                                  if (!e.target.src.startsWith('blob:')) {
                                    setImageLoading(false)
                                  }
                                }}
                                onLoadStart={(e) => {
                                  // Only show loading for non-cached images
                                  if (!e.target.src.startsWith('blob:')) {
                                    setImageLoading(true)
                                  }
                                }}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  setImageLoading(false);
                                }}
                                loading="eager"
                                decoding="async"
                                fetchPriority="high"
                              />
                            </>
                          );
                        })()}
                      </div>

                    </div>
                  </>
                ) : showAnswer && !showScoring ? (
                  <>
                    {/* Answer Section */}
                    <div className="flex-1 relative">
                      <div className="flex items-center justify-center" style={{
                        paddingTop: `${styles.buttonPadding * 0.5}px`,
                        paddingBottom: `${styles.buttonPadding * 0.25}px`,
                        paddingLeft: `${styles.buttonPadding * 0.25}px`,
                        paddingRight: `${styles.buttonPadding * 0.25}px`
                      }}>
                        <h2 className="font-bold text-black text-center" dir="rtl" style={{ fontSize: `${styles.answerFontSize}px` }}>
                          {currentQuestion ? (currentQuestion.question?.answer || currentQuestion.answer) : 'جاري تحميل الإجابة...'}
                        </h2>
                      </div>

                      {/* Answer Media Player - Audio and Video */}
                      {(() => {
                        const hasAnswerAudio = currentQuestion?.question?.answerAudioUrl || currentQuestion?.answerAudioUrl
                        const hasAnswerVideo = currentQuestion?.question?.answerVideoUrl || currentQuestion?.answerVideoUrl
                        console.log('🎬 Answer Media Check:', {
                          hasAnswerAudio: !!hasAnswerAudio,
                          hasAnswerVideo: !!hasAnswerVideo,
                          answerAudioUrl1: currentQuestion?.question?.answerAudioUrl,
                          answerAudioUrl2: currentQuestion?.answerAudioUrl,
                          answerVideoUrl1: currentQuestion?.question?.answerVideoUrl,
                          answerVideoUrl2: currentQuestion?.answerVideoUrl
                        })
                        return currentQuestion && (hasAnswerAudio || hasAnswerVideo)
                      })() && (
                        <div className="flex justify-center" style={{ padding: '20px 2px' }}>
                          <div style={{ maxWidth: '500px', width: '100%' }}>
                            {/* Answer Video Player - Show if video exists */}
                            {(currentQuestion.question?.answerVideoUrl || currentQuestion.answerVideoUrl) ? (
                              <MediaPlayer
                                src={getCachedMediaUrl(currentQuestion.question?.answerVideoUrl || currentQuestion.answerVideoUrl)}
                                type="video"
                                className="w-full"
                                autoPlay={true}
                              />
                            ) : (
                              /* Answer Audio Player - Show if only audio exists */
                              <MediaPlayer
                                src={getCachedAudioUrl(currentQuestion.question?.answerAudioUrl || currentQuestion.answerAudioUrl)}
                                type="audio"
                                className="w-full"
                                autoPlay={true}
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Answer Image Area - Fixed Height */}
                      <div className="flex-1 flex items-center justify-center pt-1" style={{
                        minHeight: styles.isUltraNarrow ? '150px' : `${styles.imageAreaHeight}px`,
                        height: styles.isUltraNarrow ? '150px' : `${styles.imageAreaHeight}px`,
                        overflow: 'hidden',
                        paddingLeft: styles.isUltraNarrow ? '1.8px' : `${styles.buttonPadding * 0.25}px`,
                        paddingRight: styles.isUltraNarrow ? '1.8px' : `${styles.buttonPadding * 0.25}px`
                      }}>
                        {(() => {
                          const showAnswerImage = currentQuestion && (currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || getQuestionImageUrl()) && shouldShowImageInAnswer(currentQuestion.categoryId);

                          if (!showAnswerImage) {
                            return <div className="w-full h-full"></div>;
                          }

                          return (
                            <img
                              src={getCachedImageUrl(currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || getQuestionImageUrl())}
                              alt="إجابة"
                              className={`rounded-lg cursor-pointer transition-all duration-300 ${imageZoomed ? 'fixed inset-0 z-50 w-screen h-screen object-contain bg-black bg-opacity-90' : ''}`}
                              style={{
                                display: 'block',
                                visibility: 'visible',
                                ...(imageZoomed ? {
                                  maxWidth: 'none',
                                  maxHeight: 'none',
                                  width: '100vw',
                                  height: '100vh',
                                  objectFit: 'contain',
                                  zIndex: 9999
                                } : {
                                  maxWidth: styles.isUltraNarrow ? '80%' : '100%',
                                  maxHeight: styles.isUltraNarrow ? '80%' : '100%',
                                  width: styles.isUltraNarrow ? 'auto' : ((((currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || currentQuestion.question?.imageUrl) || '').endsWith('.svg') && styles.isPC) ? '400px' : 'auto'),
                                  height: styles.isUltraNarrow ? 'auto' : ((((currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || currentQuestion.question?.imageUrl) || '').endsWith('.svg') && styles.isPC) ? '300px' : 'auto'),
                                  objectFit: 'contain',
                                  touchAction: styles.isPC ? 'auto' : 'manipulation',
                                  userSelect: 'none',
                                  WebkitUserSelect: 'none',
                                  WebkitTouchCallout: 'none'
                                })
                              }}
                              onClick={handleImageClick}
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                              loading="eager"
                              decoding="async"
                              fetchPriority="high"
                            />
                          );
                        })()}
                      </div>

                    </div>
                  </>
                ) : (
                  <>
                    {/* Scoring Section */}
                    <div className="flex-1 relative flex items-center justify-center">
                      <div className="flex items-center justify-center" style={{ padding: `${styles.buttonPadding * 0.5}px` }}>
                        <div className="text-center">
                          <h3 className="font-bold text-gray-800" dir="rtl" style={{
                            fontSize: `${styles.questionFontSize * 1.2}px`,
                            marginBottom: `${styles.buttonPadding * 0.75}px`
                          }}>منو جاوب صح؟</h3>
                          <div className="grid grid-cols-3 mx-auto" style={{
                            gap: `${styles.buttonPadding * 0.5}px`,
                            maxWidth: `${styles.scoringButtonWidth * 3 + styles.buttonPadding * 1.5}px`
                          }}>
                            <button
                              onClick={() => handleScoreTeam('team1')}
                              className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center"
                              style={{
                                width: `${styles.scoringButtonWidth}px`,
                                height: `${styles.scoringButtonHeight}px`,
                                fontSize: `${Math.max(styles.scoringFontSize * 0.5, styles.scoringFontSize - (gameState.team1.name.length > 8 ? (gameState.team1.name.length - 8) * 2 : 0))}px`,
                                padding: `${Math.max(2, styles.buttonPadding * 0.25)}px`
                              }}
                            >
                              <div style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                width: '100%',
                                textAlign: 'center'
                              }}>{gameState.team1.name}</div>
                            </button>
                            <button
                              onClick={handleNoAnswer}
                              className="bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-xl"
                              style={{
                                width: `${styles.scoringButtonWidth}px`,
                                height: `${styles.scoringButtonHeight}px`,
                                fontSize: `${styles.scoringFontSize}px`,
                                padding: `${Math.max(2, styles.buttonPadding * 0.25)}px`
                              }}
                            >
                              <div>لا أحد أجاب</div>
                            </button>
                            <button
                              onClick={() => handleScoreTeam('team2')}
                              className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center"
                              style={{
                                width: `${styles.scoringButtonWidth}px`,
                                height: `${styles.scoringButtonHeight}px`,
                                fontSize: `${Math.max(styles.scoringFontSize * 0.5, styles.scoringFontSize - (gameState.team2.name.length > 8 ? (gameState.team2.name.length - 8) * 2 : 0))}px`,
                                padding: `${Math.max(2, styles.buttonPadding * 0.25)}px`
                              }}
                            >
                              <div style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                width: '100%',
                                textAlign: 'center'
                              }}>{gameState.team2.name}</div>
                            </button>
                          </div>
                        </div>
                      </div>

                    </div>
                  </>
                )}
              </div>



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