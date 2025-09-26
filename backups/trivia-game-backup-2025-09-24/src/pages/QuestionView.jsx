import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import PresentationModeToggle from '../components/PresentationModeToggle'
import { useAuth } from '../hooks/useAuth'
import AudioPlayer from '../components/AudioPlayer'
import { GameDataLoader } from '../utils/gameDataLoader'
import PerkModal from '../components/PerkModal'
import gamePreloader from '../utils/preloader'
import questionUsageTracker from '../utils/questionUsageTracker'

function QuestionView({ gameState, setGameState, stateLoaded }) {
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
  const navigate = useNavigate()
  const { isAuthenticated, loading, user } = useAuth()
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)

  // Set user ID for question tracker when user changes
  useEffect(() => {
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
    }
  }, [user])

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
      console.log('🎯 Using cached image:', originalUrl, '→', cachedUrl)
    } else {
      console.log('⚠️ Image not cached, using original:', originalUrl)
    }
    return cachedUrl
  }

  // Helper function to get cached audio URL from preloader
  const getCachedAudioUrl = (originalUrl) => {
    if (!originalUrl) return null
    const cachedUrl = gamePreloader.getCachedAudioUrl(originalUrl)
    if (cachedUrl.startsWith('blob:')) {
      console.log('🎵 Using cached audio:', originalUrl, '→', cachedUrl)
    } else {
      console.log('⚠️ Audio not cached, using original:', originalUrl)
    }
    return cachedUrl
  }

  useEffect(() => {
    // Wait for state to be loaded before redirecting
    if (!stateLoaded) return

    if (!currentQuestion) {
      navigate('/game')
      return
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
  }, [currentQuestion, navigate, stateLoaded])

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

    // Mark question as used globally
    await questionUsageTracker.markQuestionAsUsed(currentQuestion.question || currentQuestion)

    // Calculate points (apply double points if active and team matches)
    const basePoints = currentQuestion.points
    const doublePointsInfo = gameState.activatedPerks?.doublePoints
    const shouldApplyDouble = doublePointsInfo?.active && doublePointsInfo?.team === teamKey
    const finalPoints = shouldApplyDouble ? basePoints * 2 : basePoints

    // Award points to the specified team
    setGameState(prev => {
      const newUsedQuestions = new Set([...prev.usedQuestions, currentQuestion.questionKey])
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

    // Return to game board
    navigate('/game')
  }

  const handleNoAnswer = async () => {

    // Mark question as used globally even if no one answered
    await questionUsageTracker.markQuestionAsUsed(currentQuestion.question || currentQuestion)

    // Mark question as used without awarding points
    setGameState(prev => {
      const newUsedQuestions = new Set([...prev.usedQuestions, currentQuestion.questionKey])
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

    setPreviousQuestionKey(currentQuestionKey)
  }, [currentQuestion, setGameState])

  if (!currentQuestion) {
    return null
  }

  const getTimerBg = () => {
    if (timeElapsed >= 50) return 'bg-red-500'
    return 'bg-gray-500'
  }

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

    // Safe area detection for different devices with error handling
    let safeAreaBottom = 0
    let safeAreaTop = 0

      try {
        if (document && document.documentElement && window.getComputedStyle) {
          const computedStyle = getComputedStyle(document.documentElement)
          const bottomValue = computedStyle.getPropertyValue('env(safe-area-inset-bottom)')
          const topValue = computedStyle.getPropertyValue('env(safe-area-inset-top)')
          safeAreaBottom = parseInt(bottomValue || '0') || 0
          safeAreaTop = parseInt(topValue || '0') || 0
        }
      } catch (error) {
        console.warn('Safe area detection failed:', error)
      }

      // Adjust available height for safe areas
      const safeHeight = Math.max(200, actualVH - safeAreaTop - safeAreaBottom)

    // Device and orientation detection
    const isUltraNarrow = W < 950 // Phones and small tablets
    const isMobileLayout = W < 768
    const isLandscape = W > safeHeight // Landscape orientation
    const isShortScreen = safeHeight < 500 // Z Fold and short screens - height-based detection!
    const isTallScreen = safeHeight > 900 // Tall screens can use more space

    // More accurate space calculation
    const actualHeaderHeight = 80 // Use fixed value to avoid dependency issues
    const padding = isUltraNarrow ? 4 : isMobileLayout ? 6 : 8

    // Minimal space accounting to maximize question area
    const browserUIBuffer = 0 // No browser buffer - use natural overflow
    const buttonBuffer = 20 // Minimal space for bottom buttons
    const safetyMargin = 0 // No safety margin - let natural scrolling handle overflow

    const totalReservedSpace = actualHeaderHeight + browserUIBuffer + buttonBuffer + safetyMargin + (padding * 2)
    const availableHeight = Math.max(350, safeHeight - totalReservedSpace)
    const availableWidth = W - (padding * 2)

    // Calculate aspect ratio and screen density for better scaling with validation
    const aspectRatio = safeHeight > 0 ? W / safeHeight : W / H
    const screenDensity = Math.sqrt(W * W + safeHeight * safeHeight) / Math.max(W, safeHeight || H)

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
        questionAreaHeight = Math.min(availableHeight * 0.95, 800)
      } else {
        // Mobile devices: Use more aggressive height for iPhones to fill screen
        const maxHeight = W <= 430 ? 600 : 500 // Higher limit for iPhone-sized screens
        questionAreaHeight = Math.min(availableHeight * 0.98, maxHeight) // Use 98% instead of 95% for better fill
      }
    }
    // Scale question area height for PC
    questionAreaHeight = Math.round(questionAreaHeight * (isPC ? 1.4 : 1.0))
    const questionAreaWidth = '100%'

    // Timer scaling - globally scaled with minimum viable size and PC scaling
    const baseTimerSize = Math.max(140, Math.min(200, W * 0.12))
    const timerSize = Math.round(baseTimerSize * globalScaleFactor * pcScaleFactor)
    const timerFontSize = Math.max(10, Math.min(18, timerSize * 0.08)) * pcScaleFactor
    const timerEmojiSize = Math.max(16, Math.min(24, timerSize * 0.1)) * pcScaleFactor

    // Text scaling - globally scaled based on screen type
    let baseFontSize
    if (isUltraNarrow) {
      baseFontSize = Math.max(10, Math.min(16, W * 0.03))
    } else if (isMobileLayout) {
      baseFontSize = Math.max(12, Math.min(20, W * 0.025))
    } else {
      baseFontSize = Math.max(14, Math.min(24, W * 0.02))
    }

    const questionFontSize = Math.round(baseFontSize * globalScaleFactor) * pcScaleFactor
    const answerFontSize = Math.round(baseFontSize * globalScaleFactor) * pcScaleFactor

    // Button scaling - globally scaled
    let baseButtonFontSize, baseButtonPadding
    if (isUltraNarrow) {
      baseButtonFontSize = Math.max(8, Math.min(12, W * 0.025))
      baseButtonPadding = Math.max(2, Math.min(8, W * 0.01))
    } else if (isMobileLayout) {
      baseButtonFontSize = Math.max(10, Math.min(16, W * 0.02))
      baseButtonPadding = Math.max(4, Math.min(12, W * 0.015))
    } else {
      baseButtonFontSize = Math.max(12, Math.min(18, W * 0.015))
      baseButtonPadding = Math.max(6, Math.min(16, W * 0.015))
    }

    const buttonFontSize = Math.round(baseButtonFontSize * globalScaleFactor) * pcScaleFactor
    const buttonPadding = Math.round(baseButtonPadding * globalScaleFactor * pcScaleFactor)

    // Universal image area scaling - adaptive to available space with PC scaling
    const imageAreaPercentage = Math.max(0.15, Math.min(0.4, 0.2 + (globalScaleFactor - 0.8) * 0.15))
    const baseImageAreaHeight = Math.max(60, Math.round(questionAreaHeight * imageAreaPercentage))
    const imageAreaHeight = Math.round(baseImageAreaHeight * (isPC ? 2.5 : 2.0))

    // Team section scaling - keep Z Fold working, fix others, wider for PC
    let teamSectionWidth
    if (isUltraNarrow) {
      teamSectionWidth = Math.max(120, Math.min(160, W * 0.4)) // Z Fold settings - don't touch!
    } else if (isMobileLayout) {
      teamSectionWidth = Math.max(120, Math.min(160, W * 0.25))
    } else {
      // Wider for PC to match the image
      teamSectionWidth = Math.max(140, Math.min(300, W * (isPC ? 0.3 : 0.2)))
    }
    // Scale team section width for PC
    teamSectionWidth = Math.round(teamSectionWidth * (isPC ? 1.5 : 1.0))

    // Team text scaling - keep readable, minimal height scaling, with PC scaling
    const teamNameFontSize = Math.max(12, Math.min(22, teamSectionWidth * 0.08)) * pcScaleFactor
    const teamScoreFontSize = Math.max(20, Math.min(65, teamSectionWidth * 0.23)) * pcScaleFactor
    const teamHelpFontSize = Math.max(9, Math.min(15, teamSectionWidth * 0.055)) * pcScaleFactor
    const teamIconSize = Math.max(20, Math.min(45, teamSectionWidth * 0.14)) * pcScaleFactor

    // Header scaling - globally scaled with PC scaling
    const baseHeaderFont = Math.max(8, Math.min(16, W * 0.015))
    const headerFontSize = Math.round(baseHeaderFont * globalScaleFactor) * pcScaleFactor
    const footerButtonSize = Math.max(20, Math.min(60, safeHeight * 0.05))

    // Scoring section scaling - globally scaled and space-efficient with PC scaling
    const baseScoreWidth = Math.max(60, Math.min(140, availableWidth * 0.18))
    const baseScoreHeight = Math.max(30, Math.min(70, availableHeight * 0.06))
    const baseScoreFont = Math.max(8, Math.min(16, baseScoreWidth * 0.08))

      const scoringButtonWidth = Math.round(baseScoreWidth * globalScaleFactor * pcScaleFactor)
      const scoringButtonHeight = Math.round(baseScoreHeight * globalScaleFactor * pcScaleFactor)
      const scoringFontSize = Math.round(baseScoreFont * globalScaleFactor) * pcScaleFactor

      return {
      // Container dimensions
      questionAreaHeight,
      questionAreaWidth,
      imageAreaHeight,

      // Timer scaling
      timerSize,
      timerFontSize,
      timerEmojiSize,

      // Text scaling
      questionFontSize,
      answerFontSize,

      // Button scaling
      buttonFontSize,
      buttonPadding,

      // Team section scaling
      teamSectionWidth,
      teamNameFontSize,
      teamScoreFontSize,
      teamHelpFontSize,
      teamIconSize,

      // Header and footer (same as GameBoard)
      headerFontSize,
      footerButtonSize,

      // Scoring section
      scoringButtonWidth,
      scoringButtonHeight,
      scoringFontSize,

      // Device detection
      isPC,
      isUltraNarrow,
      isMobileLayout,
      isShortScreen,
      isTallScreen,
      globalScaleFactor,

        // Available space
        availableHeight,
        availableWidth
      }
    } catch (error) {
      console.error('Error in getResponsiveStyles:', error)
      // Return safe fallback values
      return {
        questionAreaHeight: 400,
        questionAreaWidth: '100%',
        imageAreaHeight: 150,
        timerSize: 120,
        timerFontSize: 14,
        timerEmojiSize: 18,
        questionFontSize: 16,
        answerFontSize: 16,
        buttonFontSize: 14,
        buttonPadding: 8,
        teamSectionWidth: 150,
        teamNameFontSize: 16,
        teamScoreFontSize: 32,
        teamHelpFontSize: 12,
        teamIconSize: 24,
        headerFontSize: 14,
        footerButtonSize: 40,
        scoringButtonWidth: 100,
        scoringButtonHeight: 50,
        scoringFontSize: 12,
        isPC: false,
        isUltraNarrow: false,
        isMobileLayout: true,
        isShortScreen: false,
        isTallScreen: false,
        globalScaleFactor: 1,
        availableHeight: 400,
        availableWidth: 300
      }
    }
  }

  const styles = useMemo(() => getResponsiveStyles(), [])

  return (
    <div ref={containerRef} className="bg-gradient-to-br from-blue-900 via-purple-900 to-red-900 flex flex-col" style={{
      height: '100vh',
      overflow: 'hidden'
    }} onClick={handleBackdropClick}>
      {/* Header - Copy from GameBoard */}
      <div ref={headerRef} className="bg-red-600 text-white flex-shrink-0 sticky top-0 z-10" style={{ padding: `${Math.max(2, styles.buttonPadding * 0.25)}px` }}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
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

          <div className="flex-1 text-center">
            <h1 className="font-bold text-center" style={{ fontSize: `${styles.headerFontSize * 1.2}px` }}>
              {gameState.gameName}
            </h1>
          </div>

          <div className="flex gap-3">
            <PresentationModeToggle style={{ fontSize: `${styles.headerFontSize * 0.8}px` }} />
            <button
              onClick={() => navigate('/categories')}
              className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors"
              style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}
            >
              الخروج
            </button>
            <button
              onClick={() => navigate('/game')}
              className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors"
              style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}
            >
              الرجوع
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
              height: styles.isPC ? '90%' : (styles.isUltraNarrow ? '80%' : '85%')
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
                  <div className="font-bold text-center" style={{
                    fontSize: styles.isPC ? `${styles.teamNameFontSize}px` : `${styles.teamNameFontSize * 1.5}px`,
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
                        width: `${styles.teamIconSize}px`,
                        height: `${styles.teamIconSize}px`,
                        fontSize: `${styles.teamIconSize * 0.6}px`
                      }}
                      title="متاح فقط في لوحة اللعبة"
                    >×2</div>
                    <div
                      className={`rounded-full flex items-center justify-center transition-all duration-200 ${
                        (gameState.perkUsage?.team1?.phone || 0) >= 1
                          ? 'bg-gray-400 opacity-50 cursor-not-allowed'
                          : gameState.currentTurn !== 'team1'
                          ? 'bg-white bg-opacity-10 opacity-30 cursor-not-allowed'
                          : 'bg-white bg-opacity-20 cursor-pointer hover:bg-opacity-30'
                      }`}
                      style={{
                        width: `${styles.teamIconSize}px`,
                        height: `${styles.teamIconSize}px`,
                        fontSize: `${styles.teamIconSize * 0.6}px`
                      }}
                      onClick={() => handlePerkClick('phone', 'team1')}
                    >📞</div>
                    <div
                      className={`rounded-full flex items-center justify-center transition-all duration-200 ${
                        (gameState.perkUsage?.team1?.search || 0) >= 1
                          ? 'bg-gray-400 opacity-50 cursor-not-allowed'
                          : gameState.currentTurn !== 'team1'
                          ? 'bg-white bg-opacity-10 opacity-30 cursor-not-allowed'
                          : 'bg-white bg-opacity-20 cursor-pointer hover:bg-opacity-30'
                      }`}
                      style={{
                        width: `${styles.teamIconSize}px`,
                        height: `${styles.teamIconSize}px`,
                        fontSize: `${styles.teamIconSize * 0.6}px`
                      }}
                      onClick={() => handlePerkClick('search', 'team1')}
                    >🔍</div>
                  </div>
                </div>
              </div>

              {/* Team 2 */}
              <div className="flex-1 bg-red-600 text-white flex flex-col items-center justify-center rounded-bl-3xl" style={{ padding: `${Math.max(2, styles.buttonPadding * 0.25)}px` }}>
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="font-bold text-center" style={{
                    fontSize: styles.isPC ? `${styles.teamNameFontSize}px` : `${styles.teamNameFontSize * 1.5}px`,
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
                        width: `${styles.teamIconSize}px`,
                        height: `${styles.teamIconSize}px`,
                        fontSize: `${styles.teamIconSize * 0.6}px`
                      }}
                      title="متاح فقط في لوحة اللعبة"
                    >×2</div>
                    <div
                      className={`rounded-full flex items-center justify-center transition-all duration-200 ${
                        (gameState.perkUsage?.team2?.phone || 0) >= 1
                          ? 'bg-gray-400 opacity-50 cursor-not-allowed'
                          : gameState.currentTurn !== 'team2'
                          ? 'bg-white bg-opacity-10 opacity-30 cursor-not-allowed'
                          : 'bg-white bg-opacity-20 cursor-pointer hover:bg-opacity-30'
                      }`}
                      style={{
                        width: `${styles.teamIconSize}px`,
                        height: `${styles.teamIconSize}px`,
                        fontSize: `${styles.teamIconSize * 0.6}px`
                      }}
                      onClick={() => handlePerkClick('phone', 'team2')}
                    >📞</div>
                    <div
                      className={`rounded-full flex items-center justify-center transition-all duration-200 ${
                        (gameState.perkUsage?.team2?.search || 0) >= 1
                          ? 'bg-gray-400 opacity-50 cursor-not-allowed'
                          : gameState.currentTurn !== 'team2'
                          ? 'bg-white bg-opacity-10 opacity-30 cursor-not-allowed'
                          : 'bg-white bg-opacity-20 cursor-pointer hover:bg-opacity-30'
                      }`}
                      style={{
                        width: `${styles.teamIconSize}px`,
                        height: `${styles.teamIconSize}px`,
                        fontSize: `${styles.teamIconSize * 0.6}px`
                      }}
                      onClick={() => handlePerkClick('search', 'team2')}
                    >🔍</div>
                  </div>
                </div>
              </div>
            </div>


            {/* Right Side - Question and Image */}
            <div className="flex-1 flex flex-col relative" style={{
              height: styles.isPC ? '90%' : (styles.isUltraNarrow ? '90%' : '95%'),
              paddingTop: styles.isPC ? `${Math.max(4, styles.buttonPadding * 0.25)}px` : `${Math.max(8, styles.buttonPadding * 0.5)}px`,
              paddingLeft: styles.isPC ? `${Math.max(4, styles.buttonPadding * 0.25)}px` : `${Math.max(8, styles.buttonPadding * 0.5)}px`,
              paddingRight: styles.isPC ? `${Math.max(4, styles.buttonPadding * 0.25)}px` : `${Math.max(8, styles.buttonPadding * 0.5)}px`
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
                    className="absolute bg-green-600 hover:bg-green-700 text-white font-bold rounded-full shadow-lg border-2 border-white z-10"
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
                  className="absolute bg-blue-600 text-white font-bold rounded-full shadow-lg border-2 border-white z-10"
                  style={{
                    right: '-12px',
                    top: '-12px',
                    fontSize: `${styles.buttonFontSize}px`,
                    padding: `${styles.buttonPadding * 0.5}px ${styles.buttonPadding}px`
                  }}
                >
                  {currentQuestion.points} نقطة
                </div>

                {/* منو جاوب صح Button - Overlapping bottom-left corner when showing answer */}
                {showAnswer && !showScoring && (
                  <button
                    onClick={handleShowScoring}
                    className="absolute bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-full shadow-lg border-2 border-white z-10"
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
                    className="absolute bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-lg border-2 border-white z-10"
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
                    className="absolute bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-full shadow-lg border-2 border-white z-10"
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
                    {/* Timer Section */}
                    <div className="flex justify-center" style={{ paddingTop: `${Math.max(1, styles.buttonPadding * 0.0625)}px`, paddingBottom: `${Math.max(1, styles.buttonPadding * 0.03125)}px` }}>
                      <div className={`${getTimerBg()} hover:opacity-90 text-white font-bold rounded-full shadow-lg border-2 border-white flex items-center justify-between`} style={{
                        width: `${styles.timerSize}px`,
                        minWidth: `${styles.timerSize}px`,
                        padding: `${Math.max(4, styles.buttonPadding * 0.3)}px`,
                        gap: `${Math.max(2, styles.buttonPadding * 0.1)}px`
                      }}>
                        <button
                          onClick={() => setTimerActive(!timerActive)}
                          className="hover:bg-transparent rounded transition-colors flex-shrink-0 flex items-center justify-center"
                          style={{
                            fontSize: `${styles.timerEmojiSize}px`,
                            width: `${styles.timerEmojiSize + 4}px`,
                            height: `${styles.timerEmojiSize + 4}px`,
                            lineHeight: '1'
                          }}
                        >
                          {timerActive ? '❚❚' : '▶'}
                        </button>
                        <div className="font-bold text-center flex-1" style={{ fontSize: `${styles.timerFontSize}px` }}>
                          {String(Math.floor(timeElapsed / 60)).padStart(2, '0')}:{String(timeElapsed % 60).padStart(2, '0')}
                        </div>
                        <button
                          onClick={() => setTimeElapsed(0)}
                          className="hover:bg-transparent rounded transition-colors flex-shrink-0 flex items-center justify-center"
                          style={{
                            fontSize: `${styles.timerEmojiSize}px`,
                            width: `${styles.timerEmojiSize + 4}px`,
                            height: `${styles.timerEmojiSize + 4}px`,
                            lineHeight: '1'
                          }}
                        >
                          ⟳
                        </button>
                      </div>
                    </div>

                    {/* Content area without padding to prevent overlap */}
                    <div className="flex-1 relative">

                      <div className="flex items-center justify-center" style={{ padding: `${Math.max(1, styles.buttonPadding * 0.03125)}px ${Math.max(2, styles.buttonPadding * 0.0625)}px` }}>
                        <h2 className="font-bold text-gray-800 text-center" dir="rtl" style={{ fontSize: `${styles.questionFontSize}px` }}>
                          {currentQuestion.question?.text || currentQuestion.text}
                        </h2>
                      </div>

                      {/* Audio Player */}
                      {(currentQuestion.question?.audioUrl || currentQuestion.audioUrl) && (
                        <div className="flex justify-center" style={{ padding: `${Math.max(1, styles.buttonPadding * 0.03125)}px ${Math.max(2, styles.buttonPadding * 0.0625)}px` }}>
                          <div style={{ maxWidth: '400px', width: '100%' }}>
                            <AudioPlayer src={getCachedAudioUrl(currentQuestion.question?.audioUrl || currentQuestion.audioUrl)} />
                          </div>
                        </div>
                      )}

                      {/* Question Image Area - Fixed Height */}
                      <div className="flex-1 flex items-center justify-center" style={{
                        minHeight: `${styles.imageAreaHeight}px`,
                        height: `${styles.imageAreaHeight}px`,
                        overflow: 'hidden',
                        paddingLeft: `${Math.max(1, styles.buttonPadding * 0.125)}px`,
                        paddingRight: `${Math.max(1, styles.buttonPadding * 0.125)}px`,
                        paddingTop: `${Math.max(1, styles.buttonPadding * 0.03125)}px`
                      }}>
                        {currentQuestion.question?.imageUrl && shouldShowImageInQuestion(currentQuestion.categoryId) ? (
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
                              src={shouldShowImageInQuestion(currentQuestion.categoryId) ? getCachedImageUrl(currentQuestion.question.imageUrl) : ''}
                              alt="سؤال"
                              className={`rounded-lg cursor-pointer transition-all duration-300 ${imageLoading ? 'opacity-0' : 'opacity-100'} ${imageZoomed ? 'fixed inset-0 z-50 w-screen h-screen object-contain bg-black bg-opacity-90' : ''}`}
                              style={{
                                display: shouldShowImageInQuestion(currentQuestion.categoryId) ? 'block' : 'none',
                                visibility: shouldShowImageInQuestion(currentQuestion.categoryId) ? 'visible' : 'hidden',
                                ...(imageZoomed ? {
                                  maxWidth: 'none',
                                  maxHeight: 'none',
                                  width: '100vw',
                                  height: '100vh',
                                  objectFit: 'contain',
                                  zIndex: 9999
                                } : {
                                  maxWidth: '100%',
                                  maxHeight: '100%',
                                  width: (currentQuestion.question.imageUrl.endsWith('.svg') && styles.isPC) ? '400px' : 'auto',
                                  height: (currentQuestion.question.imageUrl.endsWith('.svg') && styles.isPC) ? '300px' : 'auto',
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
                        ) : (
                          <div className="w-full h-full"></div>
                        )}
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
                          {currentQuestion.question?.answer || currentQuestion.answer}
                        </h2>
                      </div>

                      {/* Answer Image Area - Fixed Height */}
                      <div className="flex-1 flex items-center justify-center pt-1" style={{
                        minHeight: `${styles.imageAreaHeight}px`,
                        height: `${styles.imageAreaHeight}px`,
                        overflow: 'hidden',
                        paddingLeft: `${styles.buttonPadding * 0.25}px`,
                        paddingRight: `${styles.buttonPadding * 0.25}px`
                      }}>
                        {(currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || currentQuestion.question?.imageUrl) && shouldShowImageInAnswer(currentQuestion.categoryId) ? (
                          <img
                            src={shouldShowImageInAnswer(currentQuestion.categoryId) ? getCachedImageUrl(currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || currentQuestion.question?.imageUrl) : ''}
                            alt="إجابة"
                            className={`rounded-lg cursor-pointer transition-all duration-300 ${imageZoomed ? 'fixed inset-0 z-50 w-screen h-screen object-contain bg-black bg-opacity-90' : ''}`}
                            style={{
                              display: shouldShowImageInAnswer(currentQuestion.categoryId) ? 'block' : 'none',
                              visibility: shouldShowImageInAnswer(currentQuestion.categoryId) ? 'visible' : 'hidden',
                              ...(imageZoomed ? {
                                maxWidth: 'none',
                                maxHeight: 'none',
                                width: '100vw',
                                height: '100vh',
                                objectFit: 'contain',
                                zIndex: 9999
                              } : {
                                maxWidth: '100%',
                                maxHeight: '100%',
                                width: (((currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || currentQuestion.question?.imageUrl) || '').endsWith('.svg') && styles.isPC) ? '400px' : 'auto',
                                height: (((currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || currentQuestion.question?.imageUrl) || '').endsWith('.svg') && styles.isPC) ? '300px' : 'auto',
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
                        ) : (
                          <div className="w-full h-full"></div>
                        )}
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
                              className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl"
                              style={{
                                width: `${styles.scoringButtonWidth}px`,
                                height: `${styles.scoringButtonHeight}px`,
                                fontSize: `${styles.scoringFontSize}px`,
                                padding: `${Math.max(2, styles.buttonPadding * 0.25)}px`
                              }}
                            >
                              <div>{gameState.team1.name}</div>
                              <div className="opacity-75" style={{ fontSize: `${styles.scoringFontSize * 0.7}px` }}>+{currentQuestion.points} نقطة</div>
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
                              <div className="opacity-75" style={{ fontSize: `${styles.scoringFontSize * 0.7}px` }}>+0 نقطة</div>
                            </button>
                            <button
                              onClick={() => handleScoreTeam('team2')}
                              className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl"
                              style={{
                                width: `${styles.scoringButtonWidth}px`,
                                height: `${styles.scoringButtonHeight}px`,
                                fontSize: `${styles.scoringFontSize}px`,
                                padding: `${Math.max(2, styles.buttonPadding * 0.25)}px`
                              }}
                            >
                              <div>{gameState.team2.name}</div>
                              <div className="opacity-75" style={{ fontSize: `${styles.scoringFontSize * 0.7}px` }}>+{currentQuestion.points} نقطة</div>
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