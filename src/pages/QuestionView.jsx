import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PresentationModeToggle from '../components/PresentationModeToggle'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import AudioPlayer from '../components/AudioPlayer'
import QuestionMediaPlayer from '../components/QuestionMediaPlayer'
import { GameDataLoader } from '../utils/gameDataLoader'
import PerkModal from '../components/PerkModal'
import gamePreloader from '../utils/preloader'
import questionUsageTracker from '../utils/questionUsageTracker'
import LogoDisplay from '../components/LogoDisplay'
import QRCodeWithLogo from '../components/QRCodeWithLogo'
import { hasGameStarted, shouldStayOnCurrentPage } from '../utils/gameStateUtils'
import SmartImage from '../components/SmartImage'
import { FirebaseQuestionsService } from '../utils/firebaseQuestions'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { getTextDirection, formatText } from '../utils/textDirection'
import DrawingService from '../services/drawingService'
import DrawingCanvas from '../components/DrawingCanvas'
import HeadbandService from '../services/headbandService'
import HeadbandDisplay, { HeadbandAnswerDisplay } from '../components/HeadbandDisplay'
import CharadeService from '../services/charadeService'
import GuessWordService from '../services/guessWordService'
import GuessWordDisplay from '../components/GuessWordDisplay'
import { getHeaderStyles, getDeviceFlags, getPCScaleFactor } from '../utils/responsiveStyles'

// Auto-fit text component - starts at max size and only shrinks if needed to fit
function AutoFitText({ text, className = '', minFontSize = 8, maxFontSize = 16, style = {} }) {
  const containerRef = useRef(null)
  const textRef = useRef(null)
  const [fontSize, setFontSize] = useState(maxFontSize)

  const calculateFontSize = useCallback(() => {
    if (!containerRef.current || !textRef.current) return

    const containerWidth = containerRef.current.clientWidth

    // Start at max size and shrink only if needed
    let currentSize = maxFontSize
    textRef.current.style.fontSize = `${currentSize}px`

    // Shrink until text fits container width or we hit minimum
    while (textRef.current.scrollWidth > containerWidth && currentSize > minFontSize) {
      currentSize -= 0.5
      textRef.current.style.fontSize = `${currentSize}px`
    }

    setFontSize(currentSize)
  }, [minFontSize, maxFontSize])

  useEffect(() => {
    const timer = setTimeout(() => {
      calculateFontSize()
    }, 10)

    const resizeObserver = new ResizeObserver(() => {
      calculateFontSize()
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      clearTimeout(timer)
      resizeObserver.disconnect()
    }
  }, [text, calculateFontSize])

  return (
    <div ref={containerRef} className={`w-full overflow-hidden ${className}`} style={style}>
      <span
        ref={textRef}
        className="block text-center whitespace-nowrap"
        style={{ fontSize: `${fontSize}px` }}
      >
        {text}
      </span>
    </div>
  )
}

function QuestionView({ gameState, setGameState, stateLoaded }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isDarkMode, toggleDarkMode } = useDarkMode()


  // Responsive scaling system - viewport-aware scaling to prevent scrolling
  const getResponsiveStyles = () => {
    try {
      const W = window.innerWidth || 375 // Fallback width
      const H = window.innerHeight || 667 // Fallback height

      // Use dynamic viewport height for better mobile support
      const actualVH = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : H

      // Use shared utility for consistent header sizing across pages
      const sharedHeaderStyles = getHeaderStyles(W, actualVH)
      const { globalScaleFactor, headerFontSize, buttonPadding, headerPadding, isPC, baseGap: sharedBaseGap, headerBaseFontSize } = sharedHeaderStyles
      const calculatedHeaderHeight = sharedHeaderStyles.headerHeight

      // PC Auto-scaling factor
      const pcScaleFactor = getPCScaleFactor(W, H)

      // Device and orientation detection - use shared utility
      const deviceFlags = getDeviceFlags(W, actualVH)
      const { isUltraNarrow, isMobileLayout, isLandscape, isPortrait, isPhone, isTablet, isTabletPortrait, isPhonePortrait, isPhoneLandscape, isShortScreen, isTallScreen } = deviceFlags

      // Use shared baseGap for consistency
      const baseGap = sharedBaseGap

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
      // Question font size - reduce for ultra-narrow landscape (iPhone SE)
      const isUltraNarrowLandscape = isLandscape && !isPC && actualVH <= 390
      const questionFontSize = isUltraNarrowLandscape
        ? baseFontSize * 0.9 * globalScaleFactor  // 90% for iPhone SE landscape
        : baseFontSize * 1.1 * globalScaleFactor  // 110% for normal screens

      // Question line height - tighter for ultra-narrow landscape
      const questionLineHeight = isUltraNarrowLandscape ? 1.2 : 1.3

      // Responsive media sizing based on screen size and available space
      let imageAreaHeight
      if (isPC) {
        imageAreaHeight = Math.max(400, finalQuestionAreaHeight * 0.8) // PC: 80% instead of 60%
      } else if (actualVH <= 344) {
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

      // Option F: Reduce media height on phone landscape when tolerance badge present
      // This prevents overlap with timer while maintaining text readability
      // isPhoneLandscape is already available from getDeviceFlags()
      if (isPhoneLandscape) {
        // Apply 85% scaling to give more breathing room for tolerance badge
        imageAreaHeight = Math.floor(imageAreaHeight * 0.85)
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
      return {
        isShortScreen,
        isTallScreen,
        isMobileLayout,
        isUltraNarrow,
        isLandscape,
        isPhonePortrait,
        isPhoneLandscape,
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
        questionLineHeight,
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
        questionLineHeight: 1.3,
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

  // QR Mini-Game timer state
  const [qrTimerStarted, setQrTimerStarted] = useState(false)
  const [qrTimeRemaining, setQrTimeRemaining] = useState(60)
  const [qrTimerPaused, setQrTimerPaused] = useState(false)

  // Drawing mini-game state
  const [drawingSession, setDrawingSession] = useState(null)
  const [drawingStrokes, setDrawingStrokes] = useState([])
  const [drawerConnected, setDrawerConnected] = useState(false)
  const drawingUnsubscribeRef = useRef(null)
  const drawingTimerInitializedRef = useRef(false)

  // Headband mini-game state
  const [headbandSession, setHeadbandSession] = useState(null)
  const headbandUnsubscribeRef = useRef(null)

  // Charade mini-game state
  const [charadeSession, setCharadeSession] = useState(null)
  const charadeUnsubscribeRef = useRef(null)
  const charadeTimerInitializedRef = useRef(false)

  // GuessWord mini-game state
  const [guesswordSession, setGuesswordSession] = useState(null)
  const guesswordUnsubscribeRef = useRef(null)

  // Perk system state
  const [perkModalOpen, setPerkModalOpen] = useState(false)
  const [activePerk, setActivePerk] = useState({ type: null, team: null })
  const [activeTimer, setActiveTimer] = useState({ active: false, type: null, team: null, timeLeft: 0, paused: false })
  const [burgerMenuOpen, setBurgerMenuOpen] = useState(false)
  const [sponsorLogo, setSponsorLogo] = useState(null)
  const [sponsorLogoLoaded, setSponsorLogoLoaded] = useState(false)
  const { isAuthenticated, loading, user, saveGameState, getAppSettings } = useAuth()

  // Mini game rules state
  const [miniGameRules, setMiniGameRules] = useState({
    drawing: [
      'اختر شخص للرسم من فريقك',
      'شخص واحد مسموح له يصور الباركود',
      'اضغط جاهز وابدأ الرسم'
    ],
    other: [
      'اختر شخص لتمثيل فريقك',
      'شخص واحد مسموح له يصور الباركود',
      'اذا كنت مستعد اضغط جاهز'
    ],
    headband: [
      'لاعب من كل فريق يصور الباركود',
      'اختر فريقك ثم اضغط جاهز',
      'اسأل أسئلة لتخمين صورة الخصم'
    ]
  })
  const [customMiniGames, setCustomMiniGames] = useState([])
  const [miniGameSettingsLoaded, setMiniGameSettingsLoaded] = useState(false)
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 375,
    height: typeof window !== 'undefined' ? window.innerHeight : 667
  })
  const [headerHeight, setHeaderHeight] = useState(0)

  // Set page title
  useEffect(() => {
    document.title = 'راس براس - سؤال'
  }, [])

  // Enable pinch-to-zoom on this page for phones/tablets
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]')
    const originalContent = viewport?.getAttribute('content')

    // Enable zoom
    if (viewport) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes')
    }

    // Restore original viewport settings on unmount
    return () => {
      if (viewport && originalContent) {
        viewport.setAttribute('content', originalContent)
      }
    }
  }, [])

  // Load mini game rules and sponsor logo from settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getAppSettings()
        if (settings?.miniGameRules) {
          setMiniGameRules(settings.miniGameRules)
        }
        if (settings?.customMiniGames) {
          setCustomMiniGames(settings.customMiniGames)
        }
        if (settings?.sponsorLogo) {
          setSponsorLogo(settings.sponsorLogo)
        }
      } catch (error) {
        // Use default rules if loading fails
        devLog('Using default mini game rules')
      } finally {
        setMiniGameSettingsLoaded(true)
      }
    }
    loadSettings()
  }, [getAppSettings])

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false)
  const [hasReported, setHasReported] = useState(false)
  const [checkingReport, setCheckingReport] = useState(false)

  // Memoized responsive styles - recalculate when dimensions change
  const styles = useMemo(() => getResponsiveStyles(), [dimensions])

  // Set user ID for question tracker when user changes
  useEffect(() => {
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
    }
  }, [user])

  // BULLETPROOF: No redirects to categories after game starts
  useEffect(() => {
    if (!stateLoaded) return

    // Check if we should stay on this page
    if (shouldStayOnCurrentPage(gameState, location.pathname)) {
      return
    }

    // Only redirect if explicitly starting fresh (no game started, no route restoration)
    if (!gameState.selectedCategories.length && !hasGameStarted(gameState)) {
      // Give time for Firebase to load, then check again
      const timeout = setTimeout(() => {
        if (!gameState.selectedCategories.length && !hasGameStarted(gameState) && !shouldStayOnCurrentPage(gameState, location.pathname)) {
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
  }, [gameState.usedQuestions?.size, gameState.selectedCategories?.length, navigate])

  // Redirect to home if not authenticated (but only after loading is complete)
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, loading])

  // Check for preview mode from URL query, location.state, localStorage, or sessionStorage
  const [previewData, setPreviewData] = useState(() => {
    // Check URL query parameter first (from user messages preview)
    const urlParams = new URLSearchParams(location.search)
    const previewQuestionId = urlParams.get('preview')
    if (previewQuestionId) {
      devLog('🔗 Preview mode detected from URL parameter:', previewQuestionId)
      // Set flag so App.jsx knows we're in preview mode
      sessionStorage.setItem('isPreviewMode', 'true')
      // Mark as preview mode, question will be loaded from Firebase in useEffect
      return {
        previewMode: true,
        previewQuestionId: previewQuestionId,
        previewQuestion: null, // Will be loaded from Firebase
        previewGameData: {
          team1: { name: 'الفريق 1', score: 0 },
          team2: { name: 'الفريق 2', score: 0 },
          currentTeam: 'team1',
          currentTurn: 'team1',
          gameName: 'معاينة السؤال',
          selectedCategories: [],
          usedQuestions: new Set(),
          usedPointValues: new Set(),
          gameStarted: true
        }
      }
    }

    // Try location.state
    if (location.state?.previewMode) {
      devLog('📍 Loading preview from location.state')
      // Set flag so App.jsx knows we're in preview mode
      sessionStorage.setItem('isPreviewMode', 'true')
      return {
        previewMode: location.state.previewMode,
        previewQuestion: location.state.question,
        previewGameData: location.state.gameData
      }
    }

    // Try localStorage (for new window/tab access)
    const localData = localStorage.getItem('questionPreview')
    if (localData) {
      try {
        const parsed = JSON.parse(localData)
        devLog('💾 Loading preview from localStorage:', parsed)
        // Clear the detailed preview data after reading
        localStorage.removeItem('questionPreview')
        // Keep a simple flag in sessionStorage so App.jsx knows we're in preview mode
        sessionStorage.setItem('isPreviewMode', 'true')

        // Convert arrays back to Sets if they exist
        if (parsed.gameData) {
          if (Array.isArray(parsed.gameData.usedQuestions)) {
            parsed.gameData.usedQuestions = new Set(parsed.gameData.usedQuestions)
          }
          if (Array.isArray(parsed.gameData.usedPointValues)) {
            parsed.gameData.usedPointValues = new Set(parsed.gameData.usedPointValues)
          }
        }

        return {
          previewMode: parsed.previewMode,
          previewQuestion: parsed.question,
          previewGameData: parsed.gameData
        }
      } catch (e) {
        prodError('Failed to parse preview data from localStorage:', e)
      }
    }

    // Try sessionStorage as fallback (for same-window navigation)
    const storedData = sessionStorage.getItem('questionPreview')
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData)
        devLog('💾 Loading preview from sessionStorage:', parsed)
        // Clear the detailed preview data after reading
        sessionStorage.removeItem('questionPreview')
        // Keep a simple flag so App.jsx knows we're in preview mode
        sessionStorage.setItem('isPreviewMode', 'true')

        // Convert arrays back to Sets if they exist
        if (parsed.gameData) {
          if (Array.isArray(parsed.gameData.usedQuestions)) {
            parsed.gameData.usedQuestions = new Set(parsed.gameData.usedQuestions)
          }
          if (Array.isArray(parsed.gameData.usedPointValues)) {
            parsed.gameData.usedPointValues = new Set(parsed.gameData.usedPointValues)
          }
        }

        return {
          previewMode: parsed.previewMode,
          previewQuestion: parsed.question,
          previewGameData: parsed.gameData
        }
      } catch (e) {
        prodError('Failed to parse preview data from sessionStorage:', e)
      }
    }

    return { previewMode: false, previewQuestion: null, previewGameData: null }
  })

  const { previewMode, previewQuestion, previewGameData, previewQuestionId } = previewData

  // Load question from Firebase if preview mode with questionId (from URL parameter)
  useEffect(() => {
    if (previewMode && previewQuestionId && !previewQuestion) {
      const loadPreviewQuestion = async () => {
        try {
          devLog('📥 Loading preview question from Firebase:', previewQuestionId)
          const question = await FirebaseQuestionsService.getQuestionById(previewQuestionId)

          if (question) {
            devLog('✅ Preview question loaded:', question.text?.substring(0, 50))
            setPreviewData(prev => ({
              ...prev,
              previewQuestion: question
            }))
          } else {
            prodError('❌ Preview question not found:', previewQuestionId)
          }
        } catch (error) {
          prodError('Error loading preview question:', error)
        }
      }
      loadPreviewQuestion()
    }
  }, [previewMode, previewQuestionId, previewQuestion])

  // Debug preview data
  useEffect(() => {
    if (previewMode) {
      devLog('🔍 Preview Mode Active:', {
        previewMode,
        previewQuestion,
        previewGameData,
        previewQuestionId,
        hasText: !!previewQuestion?.text,
        questionKeys: previewQuestion ? Object.keys(previewQuestion) : []
      })
    }
  }, [previewMode, previewQuestion, previewGameData, previewQuestionId])

  // Use preview question if in preview mode, otherwise use gameState question
  const currentQuestion = previewMode ? previewQuestion : gameState.currentQuestion

  // Check if user has already reported this question
  useEffect(() => {
    const checkIfReported = async () => {
      if (!currentQuestion || !user?.uid) {
        setHasReported(false)
        return
      }

      setCheckingReport(true)
      try {
        const questionId = currentQuestion.id || currentQuestion.question?.id || 'unknown'
        const reportsRef = collection(db, 'questionReports')
        const q = query(
          reportsRef,
          where('questionId', '==', questionId),
          where('userId', '==', user.uid)
        )
        const snapshot = await getDocs(q)
        setHasReported(!snapshot.empty)
      } catch (error) {
        prodError('Error checking if question is reported:', error)
        setHasReported(false)
      } finally {
        setCheckingReport(false)
      }
    }

    checkIfReported()
  }, [currentQuestion?.id, user?.uid])

  // Override gameState with preview data if in preview mode
  useEffect(() => {
    if (previewMode && previewGameData && previewQuestion) {
      setGameState({
        ...previewGameData,
        currentQuestion: previewQuestion
      })
    }
  }, [previewMode, previewGameData, previewQuestion])

  // Load game data for category settings (force refresh to get latest QR settings)
  useEffect(() => {
    // Don't load data until auth check is complete and user is authenticated
    if (loading || !isAuthenticated) {
      return
    }

    const loadGameData = async () => {
      try {
        const data = await GameDataLoader.loadGameData(true) // Force refresh to get latest category settings
        setGameData(data)
        devLog('✅ QuestionView: Loaded fresh game data with', data?.categories?.length, 'categories')
      } catch (error) {
        prodError('Error loading game data in QuestionView:', error)
      }
    }
    loadGameData()
  }, [currentQuestion?.id, loading, isAuthenticated]) // Reload when question changes or auth ready

  // In preview mode, use preview categories as fallback while gameData loads
  useEffect(() => {
    if (previewMode && previewGameData?.categories && !gameData) {
      setGameData({ categories: previewGameData.categories })
      devLog('✅ QuestionView: Using preview categories as fallback')
    }
  }, [previewMode, previewGameData, gameData])

  // Initialize and subscribe to drawing session for drawing mini-games
  useEffect(() => {
    if (!currentQuestion || !gameData) return

    const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId
    const category = gameData?.categories?.find(c => c.id === categoryId)
    const questionOriginalCategory = currentQuestion?.question?.category || currentQuestion?.category
    const originalCategory = questionOriginalCategory ? gameData?.categories?.find(c => c.id === questionOriginalCategory) : null

    const isQrMiniGame = category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true
    const miniGameType = category?.miniGameType || originalCategory?.miniGameType || 'charades'
    const isDrawingMode = isQrMiniGame && miniGameType === 'drawing'

    if (!isDrawingMode) {
      // Cleanup any existing drawing session if switching away from drawing mode
      if (drawingUnsubscribeRef.current) {
        drawingUnsubscribeRef.current()
        drawingUnsubscribeRef.current = null
      }
      setDrawingSession(null)
      setDrawingStrokes([])
      setDrawerConnected(false)
      drawingTimerInitializedRef.current = false // Reset timer flag
      return
    }

    // Create drawing session - include user ID to prevent collisions between different games
    const questionId = currentQuestion?.question?.id || currentQuestion?.id
    if (!questionId || !user?.uid) return
    const sessionId = `${questionId}_${user.uid}`

    const initDrawingSession = async () => {
      try {
        devLog('🎨 Initializing drawing session with ID:', sessionId)

        // Calculate initial time based on difficulty
        const difficulty = currentQuestion?.question?.difficulty || currentQuestion?.difficulty || 'medium'
        const initialTime = difficulty === 'easy' ? 90 : difficulty === 'hard' ? 45 : 60

        // Create session in Firestore
        await DrawingService.createSession(sessionId, {
          questionId: sessionId,
          answer: currentQuestion?.question?.answer || currentQuestion?.answer,
          word: currentQuestion?.question?.text || currentQuestion?.text,
          promptImageUrl: currentQuestion?.question?.imageUrl || currentQuestion?.imageUrl,
          teamTurn: gameState.currentTurn,
          difficulty: difficulty,
          points: currentQuestion?.question?.points || currentQuestion?.points || 400,
          timeRemaining: initialTime // Set initial timer value
        })

        devLog('🎨 Drawing session created successfully:', sessionId)
        devLog('🎨 QR Code URL should be:', `${window.location.origin}/draw/${sessionId}`)

        // Subscribe to session updates
        const unsubscribe = DrawingService.subscribeToSession(sessionId, (sessionData) => {
          if (sessionData) {
            setDrawingSession(sessionData)
            setDrawingStrokes(sessionData.strokes || [])
            setDrawerConnected(sessionData.drawerConnected || false)

            // Start QR timer when drawer becomes ready (ONLY ONCE using ref)
            if (sessionData.drawerReady && sessionData.status === 'drawing' && !drawingTimerInitializedRef.current) {
              drawingTimerInitializedRef.current = true
              setQrTimerStarted(true)
              setQrTimerPaused(false)
              // Set initial time based on difficulty
              const difficulty = currentQuestion?.question?.difficulty || currentQuestion?.difficulty || 'medium'
              const timeLimit = difficulty === 'easy' ? 90 : difficulty === 'hard' ? 45 : 60
              setQrTimeRemaining(timeLimit)
              devLog('🎨 Drawing started, timer set to:', timeLimit)
            }
          }
        })

        drawingUnsubscribeRef.current = unsubscribe
      } catch (error) {
        prodError('Error initializing drawing session:', error)
      }
    }

    initDrawingSession()

    // Cleanup on unmount or question change
    return () => {
      if (drawingUnsubscribeRef.current) {
        drawingUnsubscribeRef.current()
        drawingUnsubscribeRef.current = null
      }
      drawingTimerInitializedRef.current = false // Reset timer flag on cleanup
    }
  }, [currentQuestion?.id, gameData, gameState.currentTurn, user?.uid])

  // Initialize and subscribe to headband session for headband mini-games
  useEffect(() => {
    if (!currentQuestion || !gameData) return

    const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId
    const category = gameData?.categories?.find(c => c.id === categoryId)
    const questionOriginalCategory = currentQuestion?.question?.category || currentQuestion?.category
    const originalCategory = questionOriginalCategory ? gameData?.categories?.find(c => c.id === questionOriginalCategory) : null

    const isQrMiniGame = category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true
    const miniGameType = category?.miniGameType || originalCategory?.miniGameType || 'charades'
    const isHeadbandMode = isQrMiniGame && miniGameType === 'headband'

    if (!isHeadbandMode) {
      // Cleanup any existing headband session if switching away from headband mode
      if (headbandUnsubscribeRef.current) {
        headbandUnsubscribeRef.current()
        headbandUnsubscribeRef.current = null
      }
      setHeadbandSession(null)
      return
    }

    // Create headband session - include user ID to prevent collisions between different games
    const questionId = currentQuestion?.question?.id || currentQuestion?.id
    if (!questionId || !user?.uid) return
    const sessionId = `${questionId}_${user.uid}`

    const initHeadbandSession = async () => {
      try {
        devLog('🎯 Initializing headband session with ID:', sessionId)

        // Get question data
        const question = currentQuestion?.question || currentQuestion

        // Create session in Firestore
        await HeadbandService.createSession(sessionId, {
          questionId: sessionId,
          // Team A data (Answer + Answer_Image)
          answer: question?.answer || '',
          answerImage: question?.answerImageUrl || question?.answerImage || '',
          // Team B data (Answer2 + Answer_Image2)
          answer2: question?.answer2 || '',
          answerImage2: question?.answerImage2 || question?.answerImageUrl2 || '',
          // Team names from game state
          teamAName: gameState?.team1?.name || 'الفريق 1',
          teamBName: gameState?.team2?.name || 'الفريق 2',
          // Question metadata
          questionText: question?.text || '',
          difficulty: question?.difficulty || 'medium',
          points: question?.points || 400
        })

        devLog('🎯 Headband session created successfully:', sessionId)
        devLog('🎯 QR Code URL should be:', `${window.location.origin}/headband/${sessionId}`)

        // Subscribe to session updates
        const unsubscribe = HeadbandService.subscribeToSession(sessionId, (sessionData) => {
          if (sessionData) {
            setHeadbandSession(sessionData)
            devLog('🎯 Headband session updated:', sessionData.status, 'TeamA:', sessionData.teamACounter, 'TeamB:', sessionData.teamBCounter)
          }
        })

        headbandUnsubscribeRef.current = unsubscribe
      } catch (error) {
        prodError('Error initializing headband session:', error)
      }
    }

    initHeadbandSession()

    // Cleanup on unmount or question change
    return () => {
      if (headbandUnsubscribeRef.current) {
        headbandUnsubscribeRef.current()
        headbandUnsubscribeRef.current = null
      }
    }
  }, [currentQuestion?.id, gameData, user?.uid])

  // Initialize and subscribe to charade session for charades mini-games
  useEffect(() => {
    if (!currentQuestion || !gameData) return

    const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId
    const category = gameData?.categories?.find(c => c.id === categoryId)
    const questionOriginalCategory = currentQuestion?.question?.category || currentQuestion?.category
    const originalCategory = questionOriginalCategory ? gameData?.categories?.find(c => c.id === questionOriginalCategory) : null

    const isQrMiniGame = category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true
    const miniGameType = category?.miniGameType || originalCategory?.miniGameType || 'charades'
    const isCharadesMode = isQrMiniGame && !['drawing', 'headband', 'guessword'].includes(miniGameType)

    if (!isCharadesMode) {
      // Cleanup any existing charade session if switching away from charades mode
      if (charadeUnsubscribeRef.current) {
        charadeUnsubscribeRef.current()
        charadeUnsubscribeRef.current = null
      }
      setCharadeSession(null)
      return
    }

    // Create charade session - include user ID to prevent collisions between different games
    const questionId = currentQuestion?.question?.id || currentQuestion?.id
    if (!questionId || !user?.uid) return
    const sessionId = `${questionId}_${user.uid}`

    const initCharadeSession = async () => {
      try {
        devLog('🎭 Initializing charade session with ID:', sessionId)

        // Get question data
        const question = currentQuestion?.question || currentQuestion

        // Create session in Firestore
        await CharadeService.createSession(sessionId, {
          questionId: questionId,
          answer: question?.answer || '',
          answerImageUrl: question?.answerImageUrl || question?.answerImage || '',
          answerAudioUrl: question?.answerAudioUrl || '',
          answerVideoUrl: question?.answerVideoUrl || '',
          questionText: question?.text || '',
          difficulty: question?.difficulty || 'medium',
          points: question?.points || 400
        })

        devLog('🎭 Charade session created successfully:', sessionId)
        devLog('🎭 QR Code URL should be:', `${window.location.origin}/answer-view/${sessionId}`)

        // Subscribe to session updates
        const unsubscribe = CharadeService.subscribeToSession(sessionId, (sessionData) => {
          if (sessionData) {
            setCharadeSession(sessionData)
            devLog('🎭 Charade session updated:', sessionData.status, 'playerReady:', sessionData.playerReady)

            // Start QR timer when player becomes ready (ONLY ONCE using ref)
            if (sessionData.playerReady && !charadeTimerInitializedRef.current) {
              charadeTimerInitializedRef.current = true
              setQrTimerStarted(true)
              setQrTimerPaused(false)
              // Set timer based on points/difficulty
              const points = currentQuestion?.question?.points || currentQuestion?.points || 400
              const timeLimit = points === 200 ? 90 : points === 600 ? 45 : 60
              setQrTimeRemaining(timeLimit)
              devLog('🎭 Charade player ready, timer started:', timeLimit)
            }
          }
        })

        charadeUnsubscribeRef.current = unsubscribe
      } catch (error) {
        prodError('Error initializing charade session:', error)
      }
    }

    initCharadeSession()

    // Cleanup on unmount or question change
    return () => {
      if (charadeUnsubscribeRef.current) {
        charadeUnsubscribeRef.current()
        charadeUnsubscribeRef.current = null
      }
      charadeTimerInitializedRef.current = false // Reset timer flag on cleanup
    }
  }, [currentQuestion?.id, gameData, user?.uid])

  // Initialize and subscribe to guessword session for guessword mini-games
  useEffect(() => {
    if (!currentQuestion || !gameData) return

    const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId
    const category = gameData?.categories?.find(c => c.id === categoryId)
    const questionOriginalCategory = currentQuestion?.question?.category || currentQuestion?.category
    const originalCategory = questionOriginalCategory ? gameData?.categories?.find(c => c.id === questionOriginalCategory) : null

    const isQrMiniGame = category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true
    const miniGameType = category?.miniGameType || originalCategory?.miniGameType || 'charades'
    const isGuesswordMode = isQrMiniGame && miniGameType === 'guessword'

    if (!isGuesswordMode) {
      // Cleanup any existing guessword session if switching away from guessword mode
      if (guesswordUnsubscribeRef.current) {
        guesswordUnsubscribeRef.current()
        guesswordUnsubscribeRef.current = null
      }
      setGuesswordSession(null)
      return
    }

    // Create guessword session - include user ID to prevent collisions between different games
    const questionId = currentQuestion?.question?.id || currentQuestion?.id
    if (!questionId || !user?.uid) return
    const sessionId = `${questionId}_${user.uid}`

    const initGuesswordSession = async () => {
      try {
        devLog('🎯 Initializing guessword session with ID:', sessionId)

        // Get question data
        const question = currentQuestion?.question || currentQuestion

        // Create session in Firestore
        await GuessWordService.createSession(sessionId, {
          questionId: questionId,
          answer: question?.answer || '',
          questionText: question?.text || '',
          difficulty: question?.difficulty || 'medium',
          points: question?.points || 400
        })

        devLog('🎯 GuessWord session created successfully:', sessionId)
        devLog('🎯 QR Code URL should be:', `${window.location.origin}/guessword/${sessionId}`)

        // Subscribe to session updates
        const unsubscribe = GuessWordService.subscribeToSession(sessionId, (sessionData) => {
          if (sessionData) {
            setGuesswordSession(sessionData)
            devLog('🎯 GuessWord session updated:', sessionData.status, 'count:', sessionData.questionCount)
          }
        })

        guesswordUnsubscribeRef.current = unsubscribe
      } catch (error) {
        prodError('Error initializing guessword session:', error)
      }
    }

    initGuesswordSession()

    // Cleanup on unmount or question change
    return () => {
      if (guesswordUnsubscribeRef.current) {
        guesswordUnsubscribeRef.current()
        guesswordUnsubscribeRef.current = null
      }
    }
  }, [currentQuestion?.id, gameData, user?.uid])

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

  // Helper function to get QR timer duration based on points
  const getQrTimerDuration = (points) => {
    // Points-based timing: 200pts=90s, 400pts=60s, 600pts=45s
    if (points === 200) {
      return 90  // Easy
    } else if (points === 400) {
      return 60  // Medium
    } else if (points === 600) {
      return 45  // Hard
    } else {
      return 60  // Default to medium
    }
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
    // Don't use localStorage in preview mode
    if (previewMode) {
      return
    }

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
    // Reset QR mini-game timer
    setQrTimerStarted(false)
    setQrTimeRemaining(getQrTimerDuration(currentQuestion?.question?.points || currentQuestion?.points))
    setQrTimerPaused(false)

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
  }, [currentQuestion, previewMode])

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

  // Handle QR mini-game countdown timer (independent countdown for both screens)
  useEffect(() => {
    if (!qrTimerStarted || qrTimeRemaining <= 0 || qrTimerPaused) return

    const timer = setInterval(() => {
      setQrTimeRemaining(prev => (prev <= 1 ? 0 : prev - 1))
    }, 1000)

    return () => clearInterval(timer)
  }, [qrTimerStarted, qrTimeRemaining, qrTimerPaused])

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

    // Skip question usage tracking in preview mode
    if (!previewMode) {
      // Ensure user ID is set and mark question as used globally
      // Use originalCategoryId for mystery questions, categoryId for regular questions
      const trackingCategoryId = currentQuestion.originalCategoryId || currentQuestion.categoryId
      if (user?.uid) {
        questionUsageTracker.setUserId(user.uid)
        await questionUsageTracker.markQuestionAsUsed(currentQuestion.question || currentQuestion, trackingCategoryId)
      } else {
        devLog('⏳ QuestionView: Skipping global question tracking - user not authenticated')
      }
    }

    // Calculate points (apply double or risk multiplier if active and team matches)
    const basePoints = currentQuestion.points
    const doublePointsInfo = gameState.activatedPerks?.doublePoints
    const riskPointsInfo = gameState.activatedPerks?.riskPoints
    const shouldApplyDouble = doublePointsInfo?.active && doublePointsInfo?.team === teamKey
    const shouldApplyRisk = riskPointsInfo?.active && riskPointsInfo?.team === teamKey

    let finalPoints = basePoints
    let multiplierUsed = null

    if (shouldApplyRisk) {
      finalPoints = basePoints * 3 // Risk: 3x on success
      multiplierUsed = 'risk'
    } else if (shouldApplyDouble) {
      finalPoints = basePoints * 2 // Double: 2x
      multiplierUsed = 'double'
    }

    // Check if opponent had risk perk active and apply penalty
    const opponentTeamKey = teamKey === 'team1' ? 'team2' : 'team1'
    const opponentHadRisk = riskPointsInfo?.active && riskPointsInfo?.team === opponentTeamKey
    const riskPenalty = opponentHadRisk ? basePoints * 2 : 0

    // Award points to the specified team
    setGameState(prev => {
      const newUsedQuestions = new Set([...prev.usedQuestions, currentQuestion.question.id])
      const newUsedPointValues = new Set([...(prev.usedPointValues || []), currentQuestion.pointValueKey])

      // Build state update with winner's points
      const stateUpdate = {
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
            question: currentQuestion.question?.text || currentQuestion.text || '',
            answer: currentQuestion.question?.answer || currentQuestion.answer || '',
            points: finalPoints,
            basePoints: basePoints,
            doublePointsUsed: shouldApplyDouble,
            riskPointsUsed: shouldApplyRisk,
            riskPenalty: opponentHadRisk ? riskPenalty : 0,
            multiplier: multiplierUsed,
            difficulty: currentQuestion.question?.difficulty || currentQuestion.difficulty || '',
            category: currentQuestion.categoryId,
            winner: teamKey,
            loser: opponentHadRisk ? opponentTeamKey : null,
            timestamp: Date.now()
          }
        ],
        // Clear double and risk points after use
        activatedPerks: {
          ...prev.activatedPerks,
          doublePoints: { active: false, team: null },
          riskPoints: { active: false, team: null },
          twoAnswers: { active: false, team: null },
          prison: { active: false, team: null, targetTeam: null }
        },
        // Clear perk lock for next question
        currentQuestionPerkLock: null
      }

      // Apply risk penalty to opponent if they had risk active
      if (opponentHadRisk) {
        stateUpdate[opponentTeamKey] = {
          ...prev[opponentTeamKey],
          score: prev[opponentTeamKey].score - riskPenalty
        }
      }

      // CRITICAL: Save to Firebase immediately after score update (skip in preview mode)
      if (!previewMode) {
        const stateToSave = {
          ...stateUpdate,
          usedQuestions: Array.from(stateUpdate.usedQuestions || []),
          usedPointValues: Array.from(stateUpdate.usedPointValues || [])
        }

        if (isAuthenticated && saveGameState) {
          saveGameState(stateToSave).then(() => {
            devLog('💾 State saved to Firebase immediately after scoring')
          }).catch(err => {
            prodError('❌ Error saving state after scoring:', err)
          })
        }
      }

      return stateUpdate
    })

    // Double points is now cleared in the game state above

    // Clear stored question when completing (skip in preview mode)
    if (!previewMode) {
      localStorage.removeItem('current_question')
    }

    // Return to game board (or admin in preview mode)
    if (previewMode) {
      // Clear preview mode flag before navigating back
      sessionStorage.removeItem('isPreviewMode')
      navigate('/admin')
    } else {
      navigate('/game')
    }
  }

  const handleNoAnswer = async () => {
    // Guard against null currentQuestion
    if (!currentQuestion) return

    // Skip question usage tracking in preview mode
    if (!previewMode) {
      // Ensure user ID is set and mark question as used globally even if no one answered
      // Use originalCategoryId for mystery questions, categoryId for regular questions
      const trackingCategoryId = currentQuestion.originalCategoryId || currentQuestion.categoryId
      if (user?.uid) {
        questionUsageTracker.setUserId(user.uid)
        await questionUsageTracker.markQuestionAsUsed(currentQuestion.question || currentQuestion, trackingCategoryId)
      } else {
        devLog('⏳ QuestionView: Skipping global question tracking - user not authenticated')
      }
    }

    // Check if anyone had risk perk active and apply penalty
    const basePoints = currentQuestion.points
    const riskPointsInfo = gameState.activatedPerks?.riskPoints
    const teamWithRisk = riskPointsInfo?.active ? riskPointsInfo?.team : null
    const riskPenalty = teamWithRisk ? basePoints * 2 : 0

    // Mark question as used without awarding points
    setGameState(prev => {
      const newUsedQuestions = new Set([...prev.usedQuestions, currentQuestion.question.id])
      const newUsedPointValues = new Set([...(prev.usedPointValues || []), currentQuestion.pointValueKey])

      devLog('✅ New used questions set (no answer):', Array.from(newUsedQuestions))
      devLog('✅ New used point values set (no answer):', Array.from(newUsedPointValues))

      const stateUpdate = {
        ...prev,
        usedQuestions: newUsedQuestions,
        usedPointValues: newUsedPointValues,
        // Switch turn to the other team when no one answers
        currentTurn: prev.currentTurn === 'team1' ? 'team2' : 'team1',
        gameHistory: [
          ...prev.gameHistory,
          {
            question: currentQuestion.question?.text || currentQuestion.text || '',
            answer: currentQuestion.question?.answer || currentQuestion.answer || '',
            points: 0, // No points awarded
            basePoints: currentQuestion.question?.points || currentQuestion.points || 0,
            doublePointsUsed: false,
            riskPenalty: riskPenalty,
            difficulty: currentQuestion.question?.difficulty || currentQuestion.difficulty || '',
            category: currentQuestion.categoryId,
            winner: 'none',
            loser: teamWithRisk,
            timestamp: Date.now()
          }
        ]
      }

      // Apply risk penalty if someone had risk active
      if (teamWithRisk) {
        stateUpdate[teamWithRisk] = {
          ...prev[teamWithRisk],
          score: prev[teamWithRisk].score - riskPenalty
        }
      }

      return stateUpdate
    })

    // Clear all perks after question ends
    setGameState(prev => {
      const finalState = {
        ...prev,
        activatedPerks: {
          ...prev.activatedPerks,
          doublePoints: { active: false, team: null },
          riskPoints: { active: false, team: null },
          twoAnswers: { active: false, team: null },
          prison: { active: false, team: null, targetTeam: null }
        },
        // Clear perk lock for next question
        currentQuestionPerkLock: null
      }

      // CRITICAL: Save to Firebase immediately after no-answer update (skip in preview mode)
      if (!previewMode) {
        const stateToSave = {
          ...finalState,
          usedQuestions: Array.from(finalState.usedQuestions || []),
          usedPointValues: Array.from(finalState.usedPointValues || [])
        }

        if (isAuthenticated && saveGameState) {
          saveGameState(stateToSave).then(() => {
            devLog('💾 State saved to Firebase immediately after no-answer')
          }).catch(err => {
            prodError('❌ Error saving state after no-answer:', err)
          })
        }
      }

      return finalState
    })

    // Clear stored question when completing (skip in preview mode)
    if (!previewMode) {
      localStorage.removeItem('current_question')
    }

    // Return to game board (or admin in preview mode)
    if (previewMode) {
      // Clear preview mode flag before navigating back
      sessionStorage.removeItem('isPreviewMode')
      navigate('/admin')
    } else {
      navigate('/game')
    }
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

  // Helper function to get perk icon SVG (matching GameBoard style)
  const getPerkIcon = (perkType, isUsed, isCurrentTurn, size) => {
    const fillColor = isUsed || !isCurrentTurn ? '#6b7280' : '#dc2626'

    switch (perkType) {
      case 'double':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill={fillColor} stroke="none"/>
            <text x="12" y="15" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="bold" stroke="#dc2626" strokeWidth="0.5">2</text>
          </svg>
        )
      case 'phone':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
            <path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill={fillColor} stroke="none"/>
          </svg>
        )
      case 'search':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
            <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3S3 5.91 3 9.5S5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14Z" fill={fillColor} stroke="none"/>
          </svg>
        )
      case 'risk':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
            <rect x="3" y="3" width="18" height="18" rx="3" fill={fillColor} stroke="none"/>
            <circle cx="7" cy="7" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
            <circle cx="17" cy="7" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
            <circle cx="7" cy="17" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
            <circle cx="17" cy="17" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
            <circle cx="12" cy="12" r="1.5" fill="#fff" stroke="#dc2626" strokeWidth="0.5"/>
          </svg>
        )
      case 'twoAnswers':
        return (
          <svg width={size} height={size} viewBox="0 0 72 72" fill="none" className="flex-shrink-0">
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m52.62 31.13 1.8-22.18c-0.3427-4.964-6.779-5.02-7.227-0.026l-2.42 17.36c-0.3 2.179-1.278 3.962-2.166 3.962s-1.845-1.785-2.126-3.967l-2.231-17.34c-0.8196-5.278-7.439-4.322-7.037 0.0011l2.527 21.03"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m53.63 50.08c0 9.872-8.02 16.88-17.89 16.88"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m43.74 47.29v-2.333c0-1.1-1.789-2.2-3.976-2.441l-1.049-0.117c-2.187-0.242-3.976-1.851-3.976-3.774s1.8-3.334 4-3.334h10c2.201-0.0448 4.057 1.632 4.235 3.826l0.657 11.21"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m37.96 50.36c1.63-1.48 3.624-2.5 5.777-2.958"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeMiterlimit="10" strokeWidth="4" d="m18.53 52.1c1.142 8.6 8.539 14.98 17.21 14.86 9.667 0 17.89-6.833 17.89-16.88"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m31.75 49.72c0 1.258-0.6709 2.42-1.76 3.048s-2.431 0.6288-3.52 0-1.76-1.791-1.76-3.048v-15.96c0-1.258 0.6709-2.42 1.76-3.048s2.431-0.6288 3.52 0c1.089 0.6288 1.76 1.791 1.76 3.049z"/>
            <path fill="none" stroke={fillColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m24.71 44.94c0 1.262-0.6709 2.427-1.76 3.058s-2.431 0.6308-3.52 0c-1.089-0.6308-1.76-1.796-1.76-3.058v-7.937c0-1.262 0.6709-2.427 1.76-3.058 1.089-0.6308 2.431-0.6308 3.52 0s1.76 1.796 1.76 3.058z"/>
          </svg>
        )
      case 'prison':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
            <path d="M6 2V22H8V2H6M10 2V22H12V2H10M14 2V22H16V2H14M18 2V22H20V2H18M2 2V4H22V2H2M2 20V22H22V20H2Z" fill={fillColor} stroke="none"/>
          </svg>
        )
      default:
        return null
    }
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

    // Prison perk can be used on opponent's turn, all others require current turn
    const isPrisonPerk = perkType === 'prison'
    if (!isPrisonPerk && gameState.currentTurn !== team) {
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
      },
      // Lock perks for this question - no other perks can be used
      currentQuestionPerkLock: team
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
      return
    }

    // For twoAnswers, activate visual indicator
    if (type === 'twoAnswers') {
      setGameState(prev => ({
        ...prev,
        activatedPerks: {
          ...prev.activatedPerks,
          twoAnswers: { active: true, team }
        }
      }))
      setPerkModalOpen(false)
      setActivePerk({ type: null, team: null })
      return
    }

    // For prison, activate visual indicator
    if (type === 'prison') {
      setGameState(prev => ({
        ...prev,
        activatedPerks: {
          ...prev.activatedPerks,
          prison: { active: true, team, targetTeam: team === 'team1' ? 'team2' : 'team1' }
        }
      }))
      setPerkModalOpen(false)
      setActivePerk({ type: null, team: null })
      return
    }

    // Close modal for any other perks
    setPerkModalOpen(false)
    setActivePerk({ type: null, team: null })
  }

  const handlePerkModalClose = () => {
    setPerkModalOpen(false)
    setActivePerk({ type: null, team: null })
  }


  // Clear all perks when question changes (but not on initial load)
  const [previousQuestionKey, setPreviousQuestionKey] = useState(null)

  useEffect(() => {
    const currentQuestionKey = currentQuestion?.questionKey

    // Only clear perks if this is actually a new question (not initial load)
    if (previousQuestionKey && previousQuestionKey !== currentQuestionKey) {
      setGameState(prev => ({
        ...prev,
        activatedPerks: {
          ...prev.activatedPerks,
          doublePoints: { active: false, team: null },
          riskPoints: { active: false, team: null },
          twoAnswers: { active: false, team: null },
          prison: { active: false, team: null, targetTeam: null }
        },
        // Clear perk lock for new question
        currentQuestionPerkLock: null
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
    <div ref={containerRef} className="bg-[#f5f5dc] dark:bg-slate-900 flex flex-col" style={{
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
            fetchPriority="high"
            onClick={handleImageClick}
          />
        </div>
      )}
      {/* Header - Copy from GameBoard */}
      <div
        ref={headerRef}
        className="bg-gradient-to-r from-red-600 via-red-700 to-red-600 text-white flex-shrink-0 sticky top-0 z-[9998] overflow-visible relative shadow-lg"
        style={{
          padding: `${styles.headerPadding}px`,
          height: `${styles.headerHeight}px`
        }}
      >
        {styles.isPhonePortrait ? (
          /* Portrait Mode: Header with team turn and hamburger menu */
          <div className="flex justify-between items-center h-full">
            <div className="flex items-center" style={{ gap: `${styles.headerFontSize * 0.5}px` }}>
              <LogoDisplay />
              <div className="flex items-center bg-white/20 dark:bg-black/20 rounded-full max-w-[50%]"
                   style={{
                     gap: `${styles.headerFontSize * 0.3}px`,
                     padding: `${styles.headerFontSize * 0.2}px ${styles.headerFontSize * 0.5}px`
                   }}>
                <span className="text-white/90 leading-none flex-shrink-0" style={{ fontSize: `${styles.headerFontSize * 0.85}px` }}>دور:</span>
                <AutoFitText
                  text={gameState.currentTurn === 'team1'
                    ? gameState.team1?.name || 'الفريق 1'
                    : gameState.currentTurn === 'team2'
                    ? gameState.team2?.name || 'الفريق 2'
                    : 'غير محدد'}
                  className="font-bold text-white leading-none flex-1 min-w-0"
                  minFontSize={8}
                  maxFontSize={styles.headerFontSize * 0.85}
                />
                <button
                  onClick={() => setGameState(prev => ({
                    ...prev,
                    currentTurn: prev.currentTurn === 'team1' ? 'team2' : 'team1'
                  }))}
                  className="hover:bg-white/10 text-white rounded-full transition-colors flex items-center justify-center p-0.5 leading-none flex-shrink-0"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="block" style={{ width: `${styles.headerFontSize * 0.85}px`, height: `${styles.headerFontSize * 0.85}px` }}>
                    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="white"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex items-center flex-1 justify-center px-2">
              <h1 className="font-bold text-center truncate max-w-full" style={{ fontSize: `${styles.headerFontSize * 0.85}px` }} dir="auto">
                {gameState.gameName}
              </h1>
            </div>

            <div className="flex items-center gap-2 portrait-menu relative">
              <button
                onClick={toggleDarkMode}
                className="text-white hover:text-red-200 transition-colors p-1"
                title={isDarkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
              >
                {isDarkMode ? '☀️' : '🌙'}
              </button>
              <button
                onClick={() => setBurgerMenuOpen(!burgerMenuOpen)}
                className="bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 text-lg sm:text-xl"
              >
                ☰
              </button>
            </div>
          </div>
        ) : (
          /* Landscape Mode: Original full header */
          <div className={`flex justify-between items-center h-full ${styles.isPhoneLandscape ? 'px-2' : 'md:px-12 lg:px-16 xl:px-20 2xl:px-28'}`}>
            <div className="flex items-center" style={{ gap: `${styles.headerFontSize * 0.5}px` }}>
              <LogoDisplay />
              <div className="flex items-center bg-white/20 dark:bg-black/20 rounded-full max-w-[200px]"
                   style={{
                     gap: `${styles.headerFontSize * 0.3}px`,
                     padding: `${styles.headerFontSize * 0.25}px ${styles.headerFontSize * 0.6}px`
                   }}>
                <span className="text-white/90 leading-none flex-shrink-0" style={{ fontSize: `${styles.headerFontSize * 0.85}px` }}>
                  دور:
                </span>
                <AutoFitText
                  text={gameState.currentTurn === 'team1'
                    ? gameState.team1?.name || 'الفريق 1'
                    : gameState.currentTurn === 'team2'
                    ? gameState.team2?.name || 'الفريق 2'
                    : 'غير محدد'}
                  className="font-bold text-white leading-none flex-1 min-w-0"
                  minFontSize={8}
                  maxFontSize={styles.headerFontSize * 0.85}
                />
                <button
                  onClick={() => setGameState(prev => ({
                    ...prev,
                    currentTurn: prev.currentTurn === 'team1' ? 'team2' : 'team1'
                  }))}
                  className="hover:bg-white/10 text-white rounded-full transition-colors flex items-center justify-center p-0.5 leading-none flex-shrink-0"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="block" style={{ width: `${styles.headerFontSize * 0.85}px`, height: `${styles.headerFontSize * 0.85}px` }}>
                    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="white"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 text-center flex items-center justify-center px-2" style={{ gap: `${styles.headerFontSize * 0.5}px` }}>
              <h1 className="font-bold text-center" style={{
                fontSize: `${Math.max(styles.headerFontSize * 0.7, styles.headerFontSize * 1.2 - ((gameState.gameName?.length || 0) > 15 ? ((gameState.gameName?.length || 0) - 15) * 1.5 : 0))}px`,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%'
              }}>
                {gameState.gameName}
              </h1>
            </div>

            {/* Navigation - Landscape */}
            <div className="flex items-center" style={{ gap: `${styles.headerFontSize * 0.5}px` }}>
              <button
                onClick={toggleDarkMode}
                className="text-white hover:text-red-200 transition-colors p-2"
                title={isDarkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
              >
                {isDarkMode ? '☀️' : '🌙'}
              </button>
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
          </div>
        )}
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

      {/* Preview Mode Banner */}
      {previewMode && (
        <div className="bg-yellow-500 dark:bg-yellow-600 text-black dark:text-gray-900 py-3 px-4 flex items-center justify-between shadow-md z-[9997]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👁️</span>
            <div>
              <p className="font-bold text-lg">وضع المعاينة</p>
              <p className="text-sm">معاينة السؤال - لن يتم احتساب النقاط</p>
            </div>
          </div>
          <button
            onClick={() => {
              // Clear preview mode flag before navigating back
              sessionStorage.removeItem('isPreviewMode')
              navigate('/admin')
            }}
            className="bg-black hover:bg-gray-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-bold transition-colors"
          >
            ← العودة للإدارة
          </button>
        </div>
      )}

      {/* Main Content - New Grid Layout */}
      <div className="flex-1 flex flex-col px-4 py-5 2xl:h-[calc(100vh_-_112px)] 4xl:h-[calc(100vh_-_130px)] xl:h-[calc(100vh-76px)] sm:h-[calc(100vh-92px)] xs:h-[calc(100vh-118px)] h-[calc(100vh-107px)] height-container" style={{
        minHeight: 0
      }}>
        <div className={`xl:grid flex flex-col-reverse landscape:flex landscape:flex-row xl:grid xl:grid-cols-12 gap-x-5 landscape:gap-x-2 xl:gap-x-3 pt-2 sm:pt-4 md:pt-6 lg:pt-8 xl:pt-10 2xl:pt-12 ${styles.teamContainerTopPadding} h-full max-xl:justify-between landscape:justify-start game-panel_wrapper text-center`}>
          {/* Teams Sidebar - xl:col-span-3 */}
          <div className={`xl:col-span-3 xl:order-1 landscape:flex-shrink-0 max-xl:flex max-md:grid grid-cols-2 max-md:flex-col landscape:flex landscape:flex-col max-xl:justify-around max-xl:flex-row-reverse landscape:justify-start max-xl:gap-x-5 ${styles.teamContainerGap} max-sm:gap-x-2 max-xl:[&>*]:flex-shrink-0 styled-scrollbar xl:px-1 landscape:px-1 ${styles.teamContainerPadding} max-xl:w-full max-xl:mx-auto max-xl:items-center landscape:items-stretch xl:h-[calc(90vh_-_112px)] landscape:h-full mb-3 landscape:mb-0 landscpe_btn-view`}
               style={{
                 width: (window.innerWidth > window.innerHeight || window.innerWidth >= 1280) ? `${styles.teamSectionWidth}px` : undefined
               }}>

            {/* Team 1 Section */}
            <section className="about_score_footer_secMain">
              <div className="text-center about_score_footer max-2xl:gap-x-2">
                <div className={`text-white w-full p-1 sm:p-2 md:p-3 lg:p-3.5 max-w-full text-center rounded-[30px] font-bold place-self-center flex justify-center items-center mx-auto team-name_wrapper relative overflow-hidden ${
                  gameState.currentTurn === 'team1' ? 'ring-4 ring-red-400 ring-opacity-60 shadow-lg shadow-red-400/30' : ''
                }`}
                     style={{
                       background: 'linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626)',
                       minHeight: `${styles.teamButtonHeight}px`,
                       padding: `${styles.buttonPadding * 0.4}px ${styles.buttonPadding * 0.8}px`
                     }}>
                  <AutoFitText
                    text={gameState.team1?.name || 'الفريق 1'}
                    className="font-bold"
                    minFontSize={10}
                    maxFontSize={styles.buttonFontSize * 0.8}
                  />
                </div>
                <div className={`text-60 game-text font-bold text-black dark:text-gray-100 ${styles.teamElementSpacing}`} style={{ fontSize: `${styles.teamScoreFontSize}px` }}>
                  {gameState.team1?.score || 0}
                </div>
                <div className={`text-[#231E1E] dark:text-gray-200 xl:text-2xl sm:text-xl text-xs sm:text-sm ${styles.perkTitleSpacing} font-bold whitespace-nowrap`}
                     style={{ fontSize: `${styles.teamHelpFontSize}px` }}>
                  وسائل المساعدة
                </div>

                {/* Helper Tools */}
                <div className={`flex justify-center gap-1 sm:gap-2 md:gap-3 ${styles.perkContainerSpacing}`}>
                  {(gameState.selectedPerks || ['double', 'phone', 'search']).map(perkId => {
                    const isGameBoardOnly = ['double', 'risk'].includes(perkId)
                    const isUsed = (gameState.perkUsage?.team1?.[perkId] || 0) >= 1
                    const isPrisonPerk = perkId === 'prison'
                    const isLockedByOpponent = gameState.currentQuestionPerkLock && gameState.currentQuestionPerkLock !== 'team1'
                    const canActivate = !isLockedByOpponent && (isPrisonPerk || (gameState.currentTurn === 'team1'))

                    return (
                      <button
                        key={perkId}
                        className={`icon-nav-link border-2 rounded-full ${styles.perkButtonPadding} flex items-center justify-center ${
                          isGameBoardOnly || isUsed || isLockedByOpponent
                            ? 'border-gray-600 dark:border-slate-500 bg-gray-200 dark:bg-slate-700 opacity-50 cursor-not-allowed'
                            : !canActivate
                            ? 'border-gray-600 dark:border-slate-500 bg-gray-100 dark:bg-slate-700 opacity-60 cursor-not-allowed'
                            : 'border-red-600 dark:border-red-500 bg-white dark:bg-slate-800 cursor-pointer hover:bg-red-50 dark:hover:bg-slate-700'
                        }`}
                        disabled={isGameBoardOnly || isUsed || isLockedByOpponent || !canActivate}
                        onClick={() => !isGameBoardOnly && !isLockedByOpponent && handlePerkClick(perkId, 'team1')}
                        title={isGameBoardOnly ? 'متاح فقط في لوحة اللعبة' : perkId}
                      >
                        {getPerkIcon(perkId, isUsed || isGameBoardOnly || isLockedByOpponent, canActivate && !isGameBoardOnly, styles.perkIconSize)}
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            {/* Team 2 Section */}
            <section className="about_score_footer_secMain">
              <div className="text-center about_score_footer max-2xl:gap-x-2">
                <div className={`text-white w-full p-1 sm:p-2 md:p-3 lg:p-3.5 max-w-full text-center rounded-[30px] font-bold place-self-center flex justify-center items-center mx-auto team-name_wrapper relative overflow-hidden ${
                  gameState.currentTurn === 'team2' ? 'ring-4 ring-red-400 ring-opacity-60 shadow-lg shadow-red-400/30' : ''
                }`}
                     style={{
                       background: 'linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626)',
                       minHeight: `${styles.teamButtonHeight}px`,
                       padding: `${styles.buttonPadding * 0.4}px ${styles.buttonPadding * 0.8}px`
                     }}>
                  <AutoFitText
                    text={gameState.team2?.name || 'الفريق 2'}
                    className="font-bold"
                    minFontSize={10}
                    maxFontSize={styles.buttonFontSize * 0.8}
                  />
                </div>
                <div className={`text-60 game-text font-bold text-black dark:text-gray-100 ${styles.teamElementSpacing}`} style={{ fontSize: `${styles.teamScoreFontSize}px` }}>
                  {gameState.team2?.score || 0}
                </div>
                <div className={`text-[#231E1E] dark:text-gray-200 xl:text-2xl sm:text-xl text-xs sm:text-sm ${styles.perkTitleSpacing} font-bold whitespace-nowrap`}
                     style={{ fontSize: `${styles.teamHelpFontSize}px` }}>
                  وسائل المساعدة
                </div>

                {/* Helper Tools */}
                <div className={`flex justify-center gap-1 sm:gap-2 md:gap-3 ${styles.perkContainerSpacing}`}>
                  {(gameState.selectedPerks || ['double', 'phone', 'search']).map(perkId => {
                    const isGameBoardOnly = ['double', 'risk'].includes(perkId)
                    const isUsed = (gameState.perkUsage?.team2?.[perkId] || 0) >= 1
                    const isPrisonPerk = perkId === 'prison'
                    const isLockedByOpponent = gameState.currentQuestionPerkLock && gameState.currentQuestionPerkLock !== 'team2'
                    const canActivate = !isLockedByOpponent && (isPrisonPerk || (gameState.currentTurn === 'team2'))

                    return (
                      <button
                        key={perkId}
                        className={`icon-nav-link border-2 rounded-full ${styles.perkButtonPadding} flex items-center justify-center ${
                          isGameBoardOnly || isUsed || isLockedByOpponent
                            ? 'border-gray-600 dark:border-slate-500 bg-gray-200 dark:bg-slate-700 opacity-50 cursor-not-allowed'
                            : !canActivate
                            ? 'border-gray-600 dark:border-slate-500 bg-gray-100 dark:bg-slate-700 opacity-60 cursor-not-allowed'
                            : 'border-red-600 dark:border-red-500 bg-white dark:bg-slate-800 cursor-pointer hover:bg-red-50 dark:hover:bg-slate-700'
                        }`}
                        disabled={isGameBoardOnly || isUsed || isLockedByOpponent || !canActivate}
                        onClick={() => !isGameBoardOnly && !isLockedByOpponent && handlePerkClick(perkId, 'team2')}
                        title={isGameBoardOnly ? 'متاح فقط في لوحة اللعبة' : perkId}
                      >
                        {getPerkIcon(perkId, isUsed || isGameBoardOnly || isLockedByOpponent, canActivate && !isGameBoardOnly, styles.perkIconSize)}
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            {/* Sponsor Logo - landscape/desktop only (inside sidebar) */}
            {sponsorLogo && (styles.isLandscape || styles.isPC) && (
              <div className={`w-full flex justify-center items-center mt-auto pt-2 ${sponsorLogoLoaded ? '' : 'hidden'}`}
                   style={{ maxWidth: `${styles.teamSectionWidth}px` }}>
                <img
                  src={sponsorLogo}
                  alt="Sponsor Logo"
                  className="object-contain"
                  style={{
                    maxWidth: `${styles.teamSectionWidth * 0.95}px`,
                    maxHeight: styles.isShortScreen
                      ? `${Math.min(60, styles.availableHeight * 0.15)}px`
                      : styles.isMobileLayout
                        ? `${Math.min(80, styles.availableHeight * 0.2)}px`
                        : styles.isPC
                          ? `${Math.min(140, styles.availableHeight * 0.18)}px`
                          : `${Math.min(100, styles.availableHeight * 0.18)}px`
                  }}
                  onLoad={() => setSponsorLogoLoaded(true)}
                />
              </div>
            )}
          </div>

          {/* Sponsor Logo - portrait mode only (centered, full width, below teams) */}
          {sponsorLogo && !styles.isLandscape && !styles.isPC && (
            <div className={`w-full flex justify-center items-center py-1 order-first ${sponsorLogoLoaded ? '' : 'hidden'}`}
                 style={{ maxWidth: `${styles.availableWidth}px` }}>
              <img
                src={sponsorLogo}
                alt="Sponsor Logo"
                className="object-contain"
                style={{
                  maxWidth: styles.isUltraNarrow
                    ? `${Math.min(styles.availableWidth * 0.3, 120)}px`
                    : `${Math.min(styles.availableWidth * 0.4, 200)}px`,
                  maxHeight: styles.isMobileLayout
                    ? `${Math.min(50, styles.availableHeight * 0.06)}px`
                    : `${Math.min(70, styles.availableHeight * 0.08)}px`
                }}
                onLoad={() => setSponsorLogoLoaded(true)}
              />
            </div>
          )}

          {/* Main Question Area - xl:col-span-9 */}
          <div className="xl:col-span-9 xl:order-2 landscape:flex-1 max-xl:row-start-1 h-full relative gamemain_section max-xl:mb-7 landscape:mb-0 barcode-box barcode-more bg-[#f5f5dc] dark:bg-slate-900"
               style={{ backgroundColor: isDarkMode ? 'rgb(15 23 42)' : '#f5f5dc' }}>
            <div className="h-full game-mainSec px-3.5 landscape:px-6 xs:px-6 2xl:rounded-[78px] xl:rounded-[54px] rounded-3xl pt-2 game-section_wrapper flex justify-center hint-question-wrapper bg-[#f7f2e6] dark:bg-slate-800"
                 style={{
                   paddingBottom: `${styles.bottomPadding}px`,
                   backgroundColor: isDarkMode ? 'rgb(30 41 59)' : '#f7f2e6',
                   background: isDarkMode
                     ? 'linear-gradient(rgb(30 41 59), rgb(30 41 59)) padding-box, linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626) border-box'
                     : 'linear-gradient(#f7f2e6, #f7f2e6) padding-box, linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626) border-box',
                   border: '5px solid transparent'
                 }}>

              {/* Perk Timer Circle - Bottom Right (phone/search) */}
              {activeTimer.active && (
                <div className="absolute bottom-14 right-2 sm:bottom-16 sm:right-3 md:bottom-20 md:right-6 lg:bottom-24 lg:right-8 z-50 pointer-events-none">
                  <div className="relative w-11 h-11 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24">
                    {/* Circular Progress SVG */}
                    <svg className="transform -rotate-90 w-full h-full drop-shadow-lg" viewBox="0 0 100 100">
                      {/* Background circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        stroke="#e5e7eb"
                        strokeWidth="8"
                        fill="white"
                        fillOpacity="0.9"
                      />
                      {/* Progress circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        stroke="#dc2626"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        strokeDashoffset={`${2 * Math.PI * 40 * (1 - activeTimer.timeLeft / (activeTimer.type === 'phone' ? 30 : 15))}`}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />
                    </svg>
                    {/* Timer text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-sm sm:text-xl md:text-2xl lg:text-3xl font-bold text-red-600">
                        {activeTimer.timeLeft}
                      </div>
                      <div className="mt-0.5 sm:mt-1">
                        {activeTimer.type === 'phone' ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6">
                            <path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill="#dc2626" stroke="none"/>
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6">
                            <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3S3 5.91 3 9.5S5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14Z" fill="#dc2626" stroke="none"/>
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Two Answers Perk Visual - Bottom Right (stacks above timer when both active) */}
              {gameState.activatedPerks?.twoAnswers?.active && (
                <div className={`absolute right-2 sm:right-3 md:right-6 lg:right-8 z-50 pointer-events-none ${
                  activeTimer.active
                    ? 'bottom-28 sm:bottom-36 md:bottom-44 lg:bottom-52'
                    : 'bottom-14 sm:bottom-16 md:bottom-20 lg:bottom-24'
                }`}>
                  <div className="relative w-11 h-11 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 bg-white dark:bg-slate-800 rounded-full border-3 sm:border-4 border-red-600 flex items-center justify-center drop-shadow-lg">
                    <svg viewBox="0 0 72 72" fill="none" className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14">
                      <path fill="none" stroke="#dc2626" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m52.62 31.13 1.8-22.18c-0.3427-4.964-6.779-5.02-7.227-0.026l-2.42 17.36c-0.3 2.179-1.278 3.962-2.166 3.962s-1.845-1.785-2.126-3.967l-2.231-17.34c-0.8196-5.278-7.439-4.322-7.037 0.0011l2.527 21.03"/>
                      <path fill="none" stroke="#dc2626" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m53.63 50.08c0 9.872-8.02 16.88-17.89 16.88"/>
                      <path fill="none" stroke="#dc2626" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m43.74 47.29v-2.333c0-1.1-1.789-2.2-3.976-2.441l-1.049-0.117c-2.187-0.242-3.976-1.851-3.976-3.774s1.8-3.334 4-3.334h10c2.201-0.0448 4.057 1.632 4.235 3.826l0.657 11.21"/>
                      <path fill="none" stroke="#dc2626" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m37.96 50.36c1.63-1.48 3.624-2.5 5.777-2.958"/>
                      <path fill="none" stroke="#dc2626" strokeLinecap="round" strokeMiterlimit="10" strokeWidth="4" d="m18.53 52.1c1.142 8.6 8.539 14.98 17.21 14.86 9.667 0 17.89-6.833 17.89-16.88"/>
                      <path fill="none" stroke="#dc2626" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m31.75 49.72c0 1.258-0.6709 2.42-1.76 3.048s-2.431 0.6288-3.52 0-1.76-1.791-1.76-3.048v-15.96c0-1.258 0.6709-2.42 1.76-3.048s2.431-0.6288 3.52 0c1.089 0.6288 1.76 1.791 1.76 3.049z"/>
                      <path fill="none" stroke="#dc2626" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="m24.71 44.94c0 1.262-0.6709 2.427-1.76 3.058s-2.431 0.6308-3.52 0c-1.089-0.6308-1.76-1.796-1.76-3.058v-7.937c0-1.262 0.6709-2.427 1.76-3.058 1.089-0.6308 2.431-0.6308 3.52 0s1.76 1.796 1.76 3.058z"/>
                    </svg>
                  </div>
                </div>
              )}

              {/* Prison Perk Visual - Bottom Left (stays at base position) */}
              {gameState.activatedPerks?.prison?.active && (
                <div className="absolute bottom-14 left-2 sm:bottom-16 sm:left-3 md:bottom-20 md:left-6 lg:bottom-24 lg:left-8 z-50 pointer-events-none">
                  <div className="relative w-11 h-11 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 bg-white dark:bg-slate-800 rounded-full border-3 sm:border-4 border-red-600 flex items-center justify-center drop-shadow-lg">
                    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14">
                      <path d="M6 2V22H8V2H6M10 2V22H12V2H10M14 2V22H16V2H14M18 2V22H20V2H18M2 2V4H22V2H2M2 20V22H22V20H2Z" fill="#dc2626" stroke="none"/>
                    </svg>
                  </div>
                </div>
              )}

              {/* Double Points Perk Visual - Stacked above prison when both active */}
              {gameState.activatedPerks?.doublePoints?.active && (
                <div className={`absolute left-2 sm:left-3 md:left-6 lg:left-8 z-50 pointer-events-none ${
                  gameState.activatedPerks?.prison?.active
                    ? 'bottom-28 sm:bottom-36 md:bottom-44 lg:bottom-52'
                    : 'bottom-14 sm:bottom-16 md:bottom-20 lg:bottom-24'
                }`}>
                  <div className="relative w-11 h-11 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 bg-white dark:bg-slate-800 rounded-full border-3 sm:border-4 border-red-600 flex items-center justify-center drop-shadow-lg">
                    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#dc2626" stroke="none"/>
                      <text x="12" y="15" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">2</text>
                    </svg>
                  </div>
                </div>
              )}

              {/* Risk Points Perk Visual - Stacked above prison when both active */}
              {gameState.activatedPerks?.riskPoints?.active && (
                <div className={`absolute left-2 sm:left-3 md:left-6 lg:left-8 z-50 pointer-events-none ${
                  gameState.activatedPerks?.prison?.active
                    ? 'bottom-28 sm:bottom-36 md:bottom-44 lg:bottom-52'
                    : 'bottom-14 sm:bottom-16 md:bottom-20 lg:bottom-24'
                }`}>
                  <div className="relative w-11 h-11 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 bg-white dark:bg-slate-800 rounded-full border-3 sm:border-4 border-red-600 flex items-center justify-center drop-shadow-lg">
                    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14">
                      <rect x="3" y="3" width="18" height="18" rx="3" fill="#dc2626" stroke="none"/>
                      <circle cx="7" cy="7" r="1.5" fill="white"/>
                      <circle cx="17" cy="7" r="1.5" fill="white"/>
                      <circle cx="7" cy="17" r="1.5" fill="white"/>
                      <circle cx="17" cy="17" r="1.5" fill="white"/>
                      <circle cx="12" cy="12" r="1.5" fill="white"/>
                    </svg>
                  </div>
                </div>
              )}

              <div className="flex justify-center items-center w-full flex-col h-full question-block-wrapper">

                {/* Question Content - Only show when not in answer mode */}
                {!showAnswer && (() => {
                  const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId
                  const category = gameData?.categories?.find(c => c.id === categoryId)

                  // Check question's original category for QR setting (important for mystery/merged categories)
                  const questionOriginalCategory = currentQuestion?.question?.category || currentQuestion?.category
                  const originalCategory = questionOriginalCategory ? gameData?.categories?.find(c => c.id === questionOriginalCategory) : null

                  // Show QR if current category OR original category has QR enabled
                  const isQrMiniGame = category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true
                  const miniGameType = category?.miniGameType || originalCategory?.miniGameType || 'charades'
                  const isCharadesMode = isQrMiniGame && !['drawing', 'headband', 'guessword'].includes(miniGameType)

                  // Show circular timer ONLY for charades mode (not drawing mode - canvas has its own timer)
                  if (isCharadesMode && qrTimerStarted) {
                    const maxTime = getQrTimerDuration(currentQuestion?.question?.points || currentQuestion?.points)
                    const progress = (qrTimeRemaining / maxTime) * 100

                    // Responsive sizing based on screen size and available width
                    const availableWidth = styles.questionAreaWidth || 300
                    const maxTimerWidth = Math.min(availableWidth * 0.85, 400) // 85% of available width, max 400px

                    let timerSize
                    if (styles.isPC) {
                      timerSize = Math.min(350, styles.imageAreaHeight * 0.7)  // PC: 70% of image area, max 350px
                    } else if (styles.isUltraNarrow || styles.actualVH <= 344) {
                      // Very narrow phones (Z Fold folded, iPhone SE)
                      timerSize = Math.min(Math.max(160, styles.imageAreaHeight * 0.5), maxTimerWidth, 220)
                    } else if (styles.actualVH <= 390) {
                      // iPhone SE and similar
                      timerSize = Math.min(Math.max(180, styles.imageAreaHeight * 0.55), maxTimerWidth, 240)
                    } else {
                      // Standard phones and tablets
                      timerSize = Math.min(Math.max(200, styles.imageAreaHeight * 0.6), maxTimerWidth, 280)
                    }

                    const radius = timerSize * 0.42 // 42% of timer size
                    const strokeWidth = timerSize * 0.07 // 7% of timer size
                    const center = timerSize / 2

                    const circumference = 2 * Math.PI * radius
                    const strokeDashoffset = circumference - (progress / 100) * circumference

                    // Responsive font sizes
                    let timerNumberSize, labelSize
                    if (styles.isPC) {
                      timerNumberSize = Math.max(60, timerSize * 0.25)  // PC: 25% of timer size, min 60px
                      labelSize = Math.max(24, timerSize * 0.1)   // PC: 10% of timer size, min 24px
                    } else if (styles.isUltraNarrow || styles.actualVH <= 344) {
                      // Very narrow/small screens
                      timerNumberSize = Math.max(32, timerSize * 0.2)  // 20% of timer size, min 32px
                      labelSize = Math.max(12, timerSize * 0.075)      // 7.5% of timer size, min 12px
                    } else if (styles.actualVH <= 390) {
                      // iPhone SE and similar
                      timerNumberSize = Math.max(36, timerSize * 0.21)  // 21% of timer size, min 36px
                      labelSize = Math.max(14, timerSize * 0.08)        // 8% of timer size, min 14px
                    } else {
                      // Standard phones
                      timerNumberSize = Math.max(40, timerSize * 0.22)  // 22% of timer size, min 40px
                      labelSize = Math.max(16, timerSize * 0.08)        // 8% of timer size, min 16px
                    }

                    const buttonPadding = styles.isPC
                      ? '12px 32px'
                      : (styles.isUltraNarrow || styles.actualVH <= 344)
                        ? '6px 16px'  // Smaller padding for narrow phones
                        : '8px 24px'
                    const buttonFontSize = styles.isPC
                      ? Math.max(18, styles.buttonFontSize * 1.1)
                      : (styles.isUltraNarrow || styles.actualVH <= 344)
                        ? Math.max(12, styles.buttonFontSize * 0.8)
                        : Math.max(14, styles.buttonFontSize * 0.9)
                    const iconSize = styles.isPC
                      ? 24
                      : (styles.isUltraNarrow || styles.actualVH <= 344)
                        ? 16
                        : 20
                    const buttonGap = styles.isPC
                      ? 12
                      : (styles.isUltraNarrow || styles.actualVH <= 344)
                        ? 6
                        : 8
                    const buttonMarginTop = styles.isPC
                      ? 32
                      : (styles.isUltraNarrow || styles.actualVH <= 344)
                        ? 16
                        : 24

                    // Determine progress color based on remaining time percentage
                    const progressPercent = (qrTimeRemaining / maxTime) * 100
                    let progressColor, progressGlow, glowIntensity
                    if (qrTimeRemaining === 0) {
                      progressColor = "#dc2626"  // Bright red (red-600)
                      progressGlow = "0 0 20px rgba(220, 38, 38, 0.6)"
                      glowIntensity = 'strong'
                    } else if (progressPercent > 50) {
                      progressColor = "#ef4444"  // Medium red (red-500) - plenty of time
                      progressGlow = "0 0 12px rgba(239, 68, 68, 0.4)"
                      glowIntensity = 'soft'
                    } else if (progressPercent > 25) {
                      progressColor = "#dc2626"  // Brighter red (red-600) - warning
                      progressGlow = "0 0 16px rgba(220, 38, 38, 0.5)"
                      glowIntensity = 'medium'
                    } else {
                      progressColor = "#b91c1c"  // Dark red (red-700) - critical
                      progressGlow = "0 0 20px rgba(185, 28, 28, 0.6)"
                      glowIntensity = 'strong'
                    }

                    return (
                      <div className="flex justify-center items-center w-full flex-col h-full">
                        {/* Circular Timer */}
                        <div className="relative flex flex-col items-center justify-center">
                          <svg
                            className="transform -rotate-90"
                            width={timerSize}
                            height={timerSize}
                            style={{
                              overflow: 'visible'
                            }}
                          >
                            {/* Background circle with gradient */}
                            <defs>
                              <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#d4c5b0" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#c8b89a" stopOpacity="0.6" />
                              </linearGradient>
                              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor={progressColor} stopOpacity="1" />
                                <stop offset="100%" stopColor={progressColor} stopOpacity="0.9" />
                              </linearGradient>
                            </defs>

                            {/* Background circle */}
                            <circle
                              cx={center}
                              cy={center}
                              r={radius}
                              stroke="url(#bgGradient)"
                              strokeWidth={strokeWidth}
                              fill="none"
                              opacity="0.7"
                            />
                            {/* Progress circle */}
                            <circle
                              cx={center}
                              cy={center}
                              r={radius}
                              stroke="url(#progressGradient)"
                              strokeWidth={strokeWidth}
                              fill="none"
                              strokeDasharray={circumference}
                              strokeDashoffset={strokeDashoffset}
                              strokeLinecap="round"
                              className="transition-all duration-500 ease-out"
                            />
                          </svg>
                          {/* Time display in center */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span
                              className="font-bold font-cairo"
                              style={{
                                fontSize: `${timerNumberSize}px`,
                                color: qrTimeRemaining <= 10 ? '#dc2626' : '#1a1a1a',
                                textShadow: qrTimeRemaining <= 10
                                  ? '0 0 25px rgba(220, 38, 38, 0.9), 0 3px 6px rgba(0, 0, 0, 0.4)'
                                  : '0 2px 6px rgba(0, 0, 0, 0.3)',
                                transition: 'all 0.3s ease',
                                WebkitTextStroke: qrTimeRemaining <= 10 ? '1px rgba(220, 38, 38, 0.5)' : '0'
                              }}
                            >
                              {qrTimeRemaining}
                            </span>
                            <span
                              className="font-cairo font-semibold"
                              style={{
                                fontSize: `${labelSize}px`,
                                marginTop: `${labelSize * 0.3}px`,
                                color: qrTimeRemaining <= 10 ? '#dc2626' : '#5a5a5a',
                                textShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
                              }}
                            >
                              ثانية
                            </span>
                          </div>
                        </div>

                        {/* Reset Button */}
                        <button
                          type="button"
                          className="bg-red-600 hover:bg-red-700 text-[#f7f2e6] rounded-full font-bold flex items-center active:scale-95 transition-all"
                          style={{
                            padding: buttonPadding,
                            fontSize: `${buttonFontSize}px`,
                            gap: `${buttonGap}px`,
                            marginTop: `${buttonMarginTop}px`,
                            boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4), 0 2px 6px rgba(0, 0, 0, 0.2)',
                            border: '2px solid rgba(247, 242, 230, 0.3)'
                          }}
                          onClick={() => {
                            // Only reset the time, keep the circular timer visible
                            setQrTimeRemaining(getQrTimerDuration(currentQuestion?.question?.points || currentQuestion?.points))
                            setQrTimerPaused(false)
                          }}
                        >
                          <svg
                            viewBox="0 0 44 44"
                            style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
                            fill="#f7f2e6"
                          >
                            <path d="M22 4C12.6 4 5 11.6 5 21C5 30.4 12.6 38 22 38C31.4 38 39 30.4 39 21C39 11.6 31.4 4 22 4ZM22 34C14.8 34 9 28.2 9 21C9 13.8 14.8 8 22 8C29.2 8 35 13.8 35 21C35 28.2 29.2 34 22 34ZM23 13H21V22L28.5 26.2L29.5 24.5L23 21V13Z" />
                            <path d="M18 2H26V6H18V2Z" />
                          </svg>
                          إعادة ضبط الوقت
                        </button>
                      </div>
                    )
                  }

                  // Check if this is drawing mode and drawer is ready (reuse miniGameType from above)
                  const isDrawingMode = (category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true) && miniGameType === 'drawing'
                  const isDrawingActive = isDrawingMode && drawingSession?.drawerReady === true

                  // Show drawing canvas if drawing is active
                  if (isDrawingActive) {
                    return (
                      <div className="flex justify-center items-center w-full flex-col h-full pt-6 md:pt-8">
                        {/* Drawing Canvas - fits inside question area */}
                        <div className="w-full h-full flex items-center justify-center px-2 py-2">
                          <DrawingCanvas
                            strokes={drawingStrokes}
                            width={1920}
                            height={1080}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                      </div>
                    )
                  }

                  // Check if this is headband mode and both players are ready
                  const isHeadbandMode = (category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true) && miniGameType === 'headband'
                  const isHeadbandActive = isHeadbandMode && headbandSession?.status === 'playing'

                  // Show headband counter circles if both players are ready
                  if (isHeadbandActive) {
                    // Extract hints from answers (part after " - ")
                    const extractHint = (answer) => {
                      if (!answer || typeof answer !== 'string') return null
                      const parts = answer.split(' - ')
                      return parts.length > 1 ? parts.slice(1).join(' - ').trim() : null
                    }

                    const teamAHint = extractHint(headbandSession?.answer)
                    const teamBHint = extractHint(headbandSession?.answer2)

                    // Show hints when both teams have reached 7 questions
                    const teamACount = headbandSession?.teamACounter || 0
                    const teamBCount = headbandSession?.teamBCounter || 0
                    const showHints = teamACount >= 7 && teamBCount >= 7

                    return (
                      <div className="flex flex-col justify-center items-center w-full h-full p-4 md:p-8">
                        {/* Explanation text */}
                        <p className="text-center text-gray-700 dark:text-gray-300 text-sm md:text-lg mb-3 md:mb-6 font-medium">
                          🟢 أخضر = أسئلة متبقية | 🔴 أحمر = أسئلة مستخدمة
                        </p>
                        <HeadbandDisplay
                          teamACounter={teamACount}
                          teamBCounter={teamBCount}
                          teamAName={headbandSession?.teamAName || 'فريق أ'}
                          teamBName={headbandSession?.teamBName || 'فريق ب'}
                          maxQuestions={10}
                          teamAHint={teamAHint}
                          teamBHint={teamBHint}
                          showHints={showHints}
                        />
                      </div>
                    )
                  }

                  // Check if this is guessword mode and player is ready
                  const isGuesswordModeActive = (category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true) && miniGameType === 'guessword'
                  const isGuesswordActive = isGuesswordModeActive && guesswordSession?.status === 'playing'

                  // Show guessword counter circles when player is ready
                  if (isGuesswordActive) {
                    return (
                      <div className="flex flex-col justify-center items-center w-full h-full p-4 md:p-8">
                        {/* Explanation text */}
                        <p className="text-center text-gray-700 dark:text-gray-300 text-sm md:text-lg mb-3 md:mb-6 font-medium">
                          🟢 أخضر = أسئلة متبقية | 🔴 أحمر = أسئلة مستخدمة
                        </p>
                        <GuessWordDisplay
                          questionCount={guesswordSession?.questionCount || 0}
                          maxQuestions={guesswordSession?.maxQuestions || 15}
                        />
                      </div>
                    )
                  }

                  // Show normal question content
                  return (
                    <div className="flex justify-center items-center w-full flex-col h-auto md:h-full pt-2">
                    <label className="flex justify-center items-center w-full question-content text-center pb-2 sm:pb-3 font-extrabold text-black dark:text-gray-100"
                           style={{
                             fontSize: `${styles.questionFontSize}px`,
                             lineHeight: styles.questionLineHeight,
                             unicodeBidi: 'plaintext'
                           }}>
                      {currentQuestion ? formatText(currentQuestion.question?.text || currentQuestion.text) : 'جاري تحميل السؤال...'}
                    </label>

                    {/* Tolerance Hint - Modern Design with Arrows */}
                    {currentQuestion?.question?.toleranceHint?.enabled || currentQuestion?.toleranceHint?.enabled ? (
                      <div className="flex justify-center items-center w-full pb-4 landscape:pb-2">
                        <div className="relative inline-flex items-center gap-1.5 sm:gap-2 md:gap-3
                                        bg-gradient-to-br from-amber-50 to-amber-100/80
                                        dark:from-amber-900/30 dark:to-amber-800/40
                                        border-2 border-amber-400/60
                                        dark:border-amber-600/60
                                        shadow-lg shadow-amber-200/50
                                        dark:shadow-amber-900/50
                                        rounded-2xl
                                        px-1.5 py-0.5 sm:px-2 sm:py-1
                                        portrait:px-2 portrait:py-0.5
                                        md:px-3 md:py-1.5
                                        backdrop-blur-sm">

                          {/* Right Arrow - Points RIGHT outward (visually on right in RTL) */}
                          <svg
                            className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6
                                       text-amber-600 dark:text-amber-400 animate-pulse-subtle flex-shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                          >
                            <path
                              d="M10 5L17 12L10 19"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>

                          {/* Tolerance Value */}
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            <span className="font-black text-amber-700 dark:text-amber-300
                                           text-sm sm:text-lg
                                           portrait:text-base
                                           md:text-xl
                                           lg:text-2xl
                                           tracking-tight
                                           drop-shadow-sm">
                              {currentQuestion?.question?.toleranceHint?.value || currentQuestion?.toleranceHint?.value}
                            </span>
                          </div>

                          {/* Left Arrow - Points LEFT outward (visually on left in RTL) */}
                          <svg
                            className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6
                                       text-amber-600 dark:text-amber-400 animate-pulse-subtle flex-shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                          >
                            <path
                              d="M14 19L7 12L14 5"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>

                          {/* Subtle glow effect */}
                          <div className="absolute inset-0 rounded-2xl bg-amber-400/10 blur-sm -z-10"></div>
                        </div>
                      </div>
                    ) : null}

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
                           width: styles.isPC ? '100%' : '90%',
                           maxWidth: styles.isPC ? '100%' : '90%'
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
                           width: styles.isPC ? '100%' : '90%',
                           maxWidth: styles.isPC ? '100%' : '90%'
                         }}>
                      <SmartImage
                        src={currentQuestion?.question?.imageUrl || currentQuestion?.imageUrl}
                        alt={currentQuestion ? (currentQuestion.question?.text || currentQuestion.text) : ''}
                        className="w-full h-full object-contain mx-auto cursor-pointer image"
                        context="question"
                        size="large"
                        fetchPriority="high"
                        onClick={handleImageClick}
                      />
                    </div>
                  )}

                  {/* QR Code for Mini-Game (shown under question) */}
                  {(() => {
                    const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId
                    const category = gameData?.categories?.find(c => c.id === categoryId)

                    // Check question's original category for QR setting (important for mystery/merged categories)
                    const questionOriginalCategory = currentQuestion?.question?.category || currentQuestion?.category
                    const originalCategory = questionOriginalCategory ? gameData?.categories?.find(c => c.id === questionOriginalCategory) : null

                    // Show QR if current category OR original category has QR enabled
                    const isQrMiniGame = category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true
                    const questionId = currentQuestion?.question?.id || currentQuestion?.id
                    // Use unique session ID (questionId + userId) to prevent collisions between different games
                    const sessionId = questionId && user?.uid ? `${questionId}_${user.uid}` : questionId

                    if (!isQrMiniGame || !sessionId) return null

                    return (
                      <div
                        className="relative w-full h-full flex items-center justify-center mx-auto cursor-pointer"
                        style={{
                          display: 'block',
                          height: styles.imageAreaHeight + 'px',
                          maxHeight: styles.imageAreaHeight + 'px',
                          width: styles.isPC ? '100%' : '90%',
                          maxWidth: styles.isPC ? '100%' : '90%'
                        }}
                      >
                        <div className="flex portrait:flex-col landscape:flex-row-reverse items-center justify-center h-full w-full portrait:gap-2 landscape:gap-4 xl:scale-125 2xl:scale-150">
                          {/* QR Code */}
                          <div
                            className="bg-white dark:bg-slate-800 rounded-lg shadow-xl flex-shrink-0 portrait:scale-90"
                            style={{
                              padding: `${Math.max(4, styles.imageAreaHeight * 0.015)}px`
                            }}
                          >
                            <QRCodeWithLogo
                              questionId={sessionId}
                              size={styles.isPC
                                ? Math.min(Math.max(150, styles.imageAreaHeight * 0.5), 350)  // PC: 50%, max 350px
                                : Math.min(Math.max(80, styles.imageAreaHeight * 0.35), 180)  // Mobile: 35%, max 180px
                              }
                              mode={
                                (category?.miniGameType === 'drawing' || originalCategory?.miniGameType === 'drawing') ? 'drawing' :
                                (category?.miniGameType === 'headband' || originalCategory?.miniGameType === 'headband') ? 'headband' :
                                (category?.miniGameType === 'guessword' || originalCategory?.miniGameType === 'guessword') ? 'guessword' :
                                'answer'
                              }
                            />
                          </div>

                          {/* Instructions */}
                          <div className="flex flex-col portrait:gap-1.5 landscape:gap-2.5 portrait:scale-90">
                            {(() => {
                              const type = category?.miniGameType || originalCategory?.miniGameType
                              if (type === 'drawing') return miniGameRules.drawing
                              if (type === 'headband') return miniGameRules.headband || miniGameRules.other
                              // Wait for settings to load before checking custom games
                              if (miniGameSettingsLoaded) {
                                const customGame = customMiniGames.find(g => g.id === type)
                                if (customGame?.rules?.length) return customGame.rules
                              } else if (type && !['charades', 'drawing', 'headband', 'guessword'].includes(type)) {
                                // Custom type but settings not loaded yet - show nothing until loaded
                                return []
                              }
                              return miniGameRules.other
                            })().map((rule, index) => (
                              <div
                                key={index}
                                className="bg-red-600 rounded-full flex items-center shadow-lg whitespace-nowrap"
                                style={{
                                  padding: `${Math.max(4, styles.imageAreaHeight * 0.015)}px ${Math.max(8, styles.imageAreaHeight * 0.028)}px`,
                                  gap: `${Math.max(4, styles.imageAreaHeight * 0.015)}px`
                                }}
                              >
                                <div
                                  className="bg-[#f7f2e6] dark:bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0"
                                  style={{
                                    width: `${Math.max(18, styles.imageAreaHeight * 0.065)}px`,
                                    height: `${Math.max(18, styles.imageAreaHeight * 0.065)}px`
                                  }}
                                >
                                  <span
                                    className="text-red-600 font-bold"
                                    style={{
                                      fontSize: `${Math.max(9, styles.imageAreaHeight * 0.035)}px`
                                    }}
                                  >{index + 1}</span>
                                </div>
                                <p
                                  className="text-white font-semibold leading-tight"
                                  style={{
                                    fontSize: `${Math.max(8, styles.imageAreaHeight * 0.03)}px`
                                  }}
                                >
                                  {rule}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
                  )
                })()}
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
                {(() => {
                  const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId
                  const category = gameData?.categories?.find(c => c.id === categoryId)

                  // Check question's original category for QR setting (important for mystery/merged categories)
                  const questionOriginalCategory = currentQuestion?.question?.category || currentQuestion?.category
                  const originalCategory = questionOriginalCategory ? gameData?.categories?.find(c => c.id === questionOriginalCategory) : null

                  // Show QR if current category OR original category has QR enabled
                  const isQrMiniGame = category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true
                  const miniGameTypeForTimer = category?.miniGameType || originalCategory?.miniGameType || 'charades'
                  const isDrawingModeForTimer = isQrMiniGame && miniGameTypeForTimer === 'drawing'
                  const isHeadbandModeForTimer = isQrMiniGame && miniGameTypeForTimer === 'headband'
                  const isGuesswordModeForTimer = isQrMiniGame && miniGameTypeForTimer === 'guessword'

                  if (isQrMiniGame) {
                    // Headband Mode - No timer at all (counter-based game)
                    if (isHeadbandModeForTimer) {
                      return null
                    }

                    // GuessWord Mode - No timer at all (counter-based game, similar to headband)
                    if (isGuesswordModeForTimer) {
                      return null
                    }

                    // Drawing Mode Timer - Show countdown timer ONLY when drawing is active
                    if (isDrawingModeForTimer) {
                      // Only show timer when drawing has started
                      if (qrTimerStarted) {
                        return (
                          <div className="grid grid-flow-col justify-between gap-3 bg-[#2A2634] rounded-full btn-wrapper mx-auto flex items-center"
                               style={{
                                 padding: `${styles.buttonPadding * 0.4}px ${styles.buttonPadding * 0.8}px`,
                                 maxWidth: `${styles.timerSize}px`
                               }}>
                            <span className="inline-flex items-center text-white justify-center font-cairo font-bold"
                                  style={{ fontSize: `${styles.timerFontSize}px` }}>
                              {qrTimeRemaining} ث
                            </span>

                            <button type="button" className="flex items-center justify-center p-1"
                                    onClick={async () => {
                                      const difficulty = currentQuestion?.question?.difficulty || currentQuestion?.difficulty || 'medium'
                                      const timeLimit = difficulty === 'easy' ? 90 : difficulty === 'hard' ? 45 : 60
                                      setQrTimeRemaining(timeLimit)

                                      // Signal reset to phone via Firestore timestamp
                                      const questionId = currentQuestion?.question?.id || currentQuestion?.id
                                      const sessionId = questionId && user?.uid ? `${questionId}_${user.uid}` : null
                                      if (sessionId && drawingSession) {
                                        await DrawingService.resetTimer(sessionId)
                                        devLog('🔄 Main screen: Timer reset to', timeLimit)
                                      }
                                    }}>
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
                          </div>
                        )
                      }

                      // Drawing mode before timer starts - show nothing (QR code in content area handles it)
                      return null
                    }

                    // Charades Mode - Show Ready button when timer not started
                    if (!qrTimerStarted) {
                      return (
                        <button
                          type="button"
                          className="px-6 py-2 bg-green-600 text-white rounded-full font-bold text-lg hover:bg-green-700 active:scale-95 transition-all"
                          onClick={() => setQrTimerStarted(true)}
                        >
                          جاهز
                        </button>
                      )
                    }
                    // When timer is started for charades, return null (circular timer shown in main content area)
                    return null
                  }

                  // SIMPLE: Don't show normal timer if we have a drawing session
                  // It will appear when drawer starts (qrTimerStarted becomes true)
                  if (drawingSession) {
                    return null
                  }

                  // Normal Timer Controls
                  return (
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
                  )
                })()}

                {/* Report Button */}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    disabled={!user || hasReported || checkingReport}
                    className={`font-bold rounded-xl w-fit flex items-center justify-center gap-1 transition-all ${
                      !user || hasReported
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-red-600 text-white hover:bg-red-700 active:scale-95'
                    }`}
                    style={{
                      fontSize: `${styles.pointsFontSize}px`,
                      padding: `${styles.pointsPadding}px ${styles.pointsPadding * 1.2}px`
                    }}
                    title={!user ? 'يجب تسجيل الدخول للإبلاغ' : (hasReported ? 'تم الإبلاغ عن هذا السؤال' : 'إبلاغ عن السؤال')}
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/>
                    </svg>
                    <span>إبلاغ</span>
                  </button>
                </div>
              </div>
              )}

              {/* Answer Button at Bottom Right - Only show in question mode */}
              {!showAnswer && !showScoring && (
                <div className="absolute bottom-0 translate-y-1/4 left-0 right-0">
                  <div className="flex gap-1 sm:gap-2 landscape:gap-2 justify-end px-1 sm:px-0 landscape:px-0">
                    <div className="md:text-xl sm:text-base text-xs text-white bg-gradient-to-r from-amber-500 to-amber-600 py-1.5 4xl:py-2.5 xl:px-5 lg:px-3 md:px-2.5 sm:px-2 px-2 rounded-2xl w-fit font-bold flex items-center justify-center ml-auto mr-[5%] shadow-md">
                      {currentQuestion?.category || 'فئة السؤال'}
                    </div>
                    <div className="cursor-pointer sm:text-xl 2xl:text-3xl bg-gradient-to-r from-green-600 to-green-700 text-white md:px-6 px-5 py-1 md:py-3 inline-flex items-center justify-center text-center rounded-full go-to-answer font-bold shadow-md"
                         onClick={handleShowAnswer}>
                      الإجابة
                    </div>
                  </div>
                </div>
              )}

              {/* Answer Section - Show answer text and question image */}
              {showAnswer && !showScoring && (
                <div className="flex justify-center items-center w-full flex-col h-full question-block-wrapper absolute inset-0 bg-[#f7f2e6] dark:bg-slate-800"
                     style={{
                       background: isDarkMode
                         ? 'linear-gradient(rgb(30 41 59), rgb(30 41 59)) padding-box, linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626) border-box'
                         : 'linear-gradient(#f7f2e6, #f7f2e6) padding-box, linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626) border-box',
                       border: '5px solid transparent',
                       borderRadius: 'inherit'
                     }}>

                  {/* Report Button - Top Center */}
                  <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 flex justify-between items-center w-full max-w-[90%]">
                    <div></div>
                    <div></div>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setShowReportModal(true)}
                        disabled={!user || hasReported || checkingReport}
                        className={`font-bold rounded-xl w-fit flex items-center justify-center gap-1 transition-all ${
                          !user || hasReported
                            ? 'bg-gray-400 text-white cursor-not-allowed'
                            : 'bg-red-600 text-white hover:bg-red-700 active:scale-95'
                        }`}
                        style={{
                          fontSize: `${styles.pointsFontSize}px`,
                          padding: `${styles.pointsPadding}px ${styles.pointsPadding * 1.2}px`
                        }}
                        title={!user ? 'يجب تسجيل الدخول للإبلاغ' : (hasReported ? 'تم الإبلاغ عن هذا السؤال' : 'إبلاغ عن السؤال')}
                      >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/>
                        </svg>
                        <span>إبلاغ</span>
                      </button>
                    </div>
                  </div>

                  {/* Answer Content - Same as question content */}
                  <div className="flex justify-center items-center w-full flex-col h-auto md:h-full">
                    {/* Answer Text - Hide for headband mode since it shows answers on the cards */}
                    {(() => {
                      const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId
                      const category = gameData?.categories?.find(c => c.id === categoryId)
                      const questionOriginalCategory = currentQuestion?.question?.category || currentQuestion?.category
                      const originalCategory = questionOriginalCategory ? gameData?.categories?.find(c => c.id === questionOriginalCategory) : null
                      const isHeadbandMode = (category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true) &&
                                            (category?.miniGameType === 'headband' || originalCategory?.miniGameType === 'headband')

                      // Skip answer text for headband mode
                      if (isHeadbandMode && headbandSession) {
                        return null
                      }

                      return (
                        <label className="flex justify-center items-center w-full leading-[1.3_!important] question-content text-center pb-4 sm:py-4 font-extrabold text-black dark:text-gray-100 font-arabic"
                               style={{
                                 fontSize: `${styles.questionFontSize}px`,
                                 unicodeBidi: 'plaintext'
                               }}>
                          {currentQuestion ? formatText(currentQuestion.question?.answer || currentQuestion.answer) : 'جاري تحميل الإجابة...'}
                        </label>
                      )
                    })()}

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
                             width: styles.isPC ? '100%' : '90%',
                             maxWidth: styles.isPC ? '100%' : '90%'
                           }}>
                        <QuestionMediaPlayer
                          currentQuestion={currentQuestion}
                          showAnswer={showAnswer}
                          isQuestionMedia={false}
                          styles={styles}
                        />
                      </div>
                    )}

                    {/* Headband Answer Display - show both images when in headband mode */}
                    {(() => {
                      const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId
                      const category = gameData?.categories?.find(c => c.id === categoryId)
                      const questionOriginalCategory = currentQuestion?.question?.category || currentQuestion?.category
                      const originalCategory = questionOriginalCategory ? gameData?.categories?.find(c => c.id === questionOriginalCategory) : null
                      const isHeadbandMode = (category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true) &&
                                            (category?.miniGameType === 'headband' || originalCategory?.miniGameType === 'headband')

                      if (isHeadbandMode && headbandSession) {
                        return (
                          <div className="relative overflow-hidden"
                               style={{
                                 height: (styles.imageAreaHeight * 1.4) + 'px',
                                 maxHeight: (styles.imageAreaHeight * 1.4) + 'px',
                                 width: styles.isPC ? '95%' : '92%',
                                 maxWidth: styles.isPC ? '95%' : '92%'
                               }}>
                            <HeadbandAnswerDisplay
                              answer={headbandSession.answer}
                              answerImage={headbandSession.answerImage}
                              answer2={headbandSession.answer2}
                              answerImage2={headbandSession.answerImage2}
                            />
                          </div>
                        )
                      }
                      return null
                    })()}

                    {/* Answer Image (shown in answer area) - Skip for headband mode as it has its own display */}
                    {(() => {
                      // Check if headband mode - skip normal answer image
                      const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId
                      const category = gameData?.categories?.find(c => c.id === categoryId)
                      const questionOriginalCategory = currentQuestion?.question?.category || currentQuestion?.category
                      const originalCategory = questionOriginalCategory ? gameData?.categories?.find(c => c.id === questionOriginalCategory) : null
                      const isHeadbandMode = (category?.enableQrMiniGame === true || originalCategory?.enableQrMiniGame === true) &&
                                            (category?.miniGameType === 'headband' || originalCategory?.miniGameType === 'headband')

                      // Skip normal answer image for headband mode
                      if (isHeadbandMode && headbandSession) {
                        return null
                      }

                      // First check for answer-specific image
                      const answerImageUrl = currentQuestion?.question?.answerImageUrl ||
                                           currentQuestion?.answerImageUrl ||
                                           currentQuestion?.question?.answerImage ||
                                           currentQuestion?.answerImage

                      // Check if there's answer video/audio media
                      const hasAnswerVideo = currentQuestion?.question?.answerVideoUrl || currentQuestion?.answerVideoUrl
                      const hasAnswerAudio = currentQuestion?.question?.answerAudioUrl || currentQuestion?.answerAudioUrl
                      const hasAnswerMedia = hasAnswerVideo || hasAnswerAudio

                      // For اغاني اجنبية category, only show answerImageUrl (no fallback to question image)
                      if (categoryId === 'اغاني_اجنبية') {
                        return answerImageUrl
                      }

                      // For other categories, fall back to question image ONLY if no answer media exists
                      if (hasAnswerMedia) {
                        // If answer video/audio exists, only show answer image (no fallback)
                        return answerImageUrl
                      }

                      // If no answer media at all, fall back to question image
                      const questionImageUrl = currentQuestion?.question?.imageUrl || currentQuestion?.imageUrl
                      return answerImageUrl || questionImageUrl
                    })() && (
                      <div className="relative overflow-hidden image-text-below-block media-wrapper"
                           style={{
                             display: 'block',
                             height: styles.imageAreaHeight + 'px',
                             maxHeight: styles.imageAreaHeight + 'px',
                             width: styles.isPC ? '100%' : '90%',
                             maxWidth: styles.isPC ? '100%' : '90%'
                           }}>
                        <SmartImage
                          src={(() => {
                            const answerImageUrl = currentQuestion?.question?.answerImageUrl ||
                                                 currentQuestion?.answerImageUrl ||
                                                 currentQuestion?.question?.answerImage ||
                                                 currentQuestion?.answerImage

                            const categoryId = currentQuestion?.categoryId || currentQuestion?.question?.categoryId

                            // Check if there's answer video/audio media
                            const hasAnswerVideo = currentQuestion?.question?.answerVideoUrl || currentQuestion?.answerVideoUrl
                            const hasAnswerAudio = currentQuestion?.question?.answerAudioUrl || currentQuestion?.answerAudioUrl
                            const hasAnswerMedia = hasAnswerVideo || hasAnswerAudio

                            // For اغاني اجنبية category, only show answerImageUrl (no fallback to question image)
                            if (categoryId === 'اغاني_اجنبية') {
                              return answerImageUrl
                            }

                            // For other categories, fall back to question image ONLY if no answer media exists
                            if (hasAnswerMedia) {
                              // If answer video/audio exists, only show answer image (no fallback)
                              return answerImageUrl
                            }

                            // If no answer media at all, fall back to question image
                            const questionImageUrl = currentQuestion?.question?.imageUrl || currentQuestion?.imageUrl
                            return answerImageUrl || questionImageUrl
                          })()}
                          alt={currentQuestion ? (currentQuestion.question?.answer || currentQuestion.answer) : ''}
                          className="w-full h-full object-contain mx-auto cursor-pointer image"
                          context="answer"
                          size="large"
                          fetchPriority="high"
                          onClick={handleImageClick}
                        />
                      </div>
                    )}
                  </div>

                  {/* Navigation Buttons */}
                  <div className="absolute bottom-0 translate-y-1/4 left-0 right-0">
                    <div className="flex items-stretch justify-between">
                      <div className="cursor-pointer 2xl:text-3xl xl:text-xl text-sm text-white md:px-4 px-2 py-1 md:py-3 inline-flex shrink-0 items-center justify-center text-center bg-gradient-to-r from-red-600 to-red-700 rounded-full prev-step-btn font-arabic font-bold shadow-md"
                           onClick={() => setShowAnswer(false)}>
                        <span className="shrink-0">ارجع للسؤال</span>
                      </div>
                      <div className="cursor-pointer 2xl:text-3xl md:text-xl text-base text-white md:px-4 px-2 py-1 md:py-3 inline-flex shrink-0 items-center justify-center text-center bg-gradient-to-r from-blue-600 to-blue-700 rounded-full next-step-btn font-arabic font-bold shadow-md"
                           onClick={handleShowScoring}>
                        <span className="shrink-0">منو جاوب؟</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Scoring Section - Clean scoring area with team buttons only */}
              {showScoring && (
                <div className="flex justify-center items-center w-full flex-col h-full question-block-wrapper absolute inset-0 bg-[#f7f2e6] dark:bg-slate-800"
                     style={{
                       background: isDarkMode
                         ? 'linear-gradient(rgb(30 41 59), rgb(30 41 59)) padding-box, linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626) border-box'
                         : 'linear-gradient(#f7f2e6, #f7f2e6) padding-box, linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626) border-box',
                       border: '5px solid transparent',
                       borderRadius: 'inherit'
                     }}>

                  {/* Team Selection Buttons - Centered in scoring area */}
                  <div className="flex flex-col gap-4 justify-center items-center w-full h-full">
                    {/* Title Text */}
                    <div className="text-center mb-4">
                      <h2 className="text-black dark:text-gray-100 font-bold font-arabic"
                          style={{ fontSize: `${styles.questionFontSize}px` }}>
                        منو جاوب صح؟
                      </h2>
                    </div>

                    {/* First Row - Team Buttons Side by Side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: 'fit-content', margin: '0 auto' }} className="md:gap-6 lg:gap-8">
                      <button
                        onClick={() => handleScoreTeam('team1')}
                        className="text-white font-bold rounded-full font-arabic hover:opacity-90 transition-opacity px-6 py-3 md:px-8 md:py-4 lg:px-10 lg:py-5 xl:px-12 xl:py-6 whitespace-nowrap"
                        style={{
                          fontSize: `${styles.buttonFontSize}px`,
                          background: 'linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626)',
                          minWidth: '120px'
                        }}
                      >
                        {gameState.team1.name}
                      </button>
                      <button
                        onClick={() => handleScoreTeam('team2')}
                        className="text-white font-bold rounded-full font-arabic hover:opacity-90 transition-opacity px-6 py-3 md:px-8 md:py-4 lg:px-10 lg:py-5 xl:px-12 xl:py-6 whitespace-nowrap"
                        style={{
                          fontSize: `${styles.buttonFontSize}px`,
                          background: 'linear-gradient(45deg, #7c2d12, #991b1b, #b91c1c, #dc2626)',
                          minWidth: '120px'
                        }}
                      >
                        {gameState.team2?.name || 'الفريق 2'}
                      </button>
                    </div>

                    {/* Second Row - No One Button Matching Combined Width */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: 'fit-content', margin: '0 auto', position: 'relative' }} className="md:gap-6 lg:gap-8">
                      {/* Invisible team buttons to establish width */}
                      <div className="text-white font-bold rounded-full font-arabic invisible px-6 py-3 md:px-8 md:py-4 lg:px-10 lg:py-5 xl:px-12 xl:py-6 whitespace-nowrap" style={{
                        fontSize: `${styles.buttonFontSize}px`,
                        minWidth: '120px',
                        gridColumn: '1'
                      }}>
                        {gameState.team1.name}
                      </div>
                      <div className="text-white font-bold rounded-full font-arabic invisible px-6 py-3 md:px-8 md:py-4 lg:px-10 lg:py-5 xl:px-12 xl:py-6 whitespace-nowrap" style={{
                        fontSize: `${styles.buttonFontSize}px`,
                        minWidth: '120px',
                        gridColumn: '2'
                      }}>
                        {gameState.team2?.name || 'الفريق 2'}
                      </div>
                      {/* Gray button overlaying full width */}
                      <button
                        onClick={() => handleNoAnswer()}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-full absolute inset-0 flex items-center justify-center"
                        style={{
                          fontSize: `${styles.buttonFontSize}px`
                        }}
                      >
                        محد جاوب
                      </button>
                    </div>
                  </div>

                  {/* Navigation Buttons at Bottom - Return to Answer and Question */}
                  <div className="absolute bottom-0 translate-y-1/4 left-0 right-0">
                    <div className="flex items-stretch justify-between">
                      <div className="cursor-pointer 2xl:text-3xl xl:text-xl text-sm text-white md:px-4 px-2 py-1 md:py-3 inline-flex shrink-0 items-center justify-center text-center bg-gradient-to-r from-red-600 to-red-700 rounded-full prev-step-btn font-arabic font-bold shadow-md"
                           onClick={() => {
                             setShowScoring(false)
                             setShowAnswer(false)
                           }}>
                        <span className="shrink-0">ارجع للسؤال</span>
                      </div>
                      <div className="cursor-pointer 2xl:text-3xl md:text-xl text-base text-white md:px-4 px-2 py-1 md:py-3 inline-flex shrink-0 items-center justify-center text-center bg-gradient-to-r from-blue-600 to-blue-700 rounded-full next-step-btn font-arabic font-bold shadow-md"
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
        teamName={activePerk.team === 'team1' ? (gameState.team1?.name || 'الفريق 1') : (gameState.team2?.name || 'الفريق 2')}
        onConfirm={handlePerkConfirm}
        usageCount={gameState.perkUsage?.[activePerk.team]?.[activePerk.type] || 0}
        maxUses={1}
        readOnly={false}
      />

      {/* Report Modal */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        question={currentQuestion}
        category={currentQuestion?.category || currentQuestion?.categoryName || 'غير محدد'}
        user={user}
        onSuccess={() => {
          setHasReported(true)
          setShowReportModal(false)
        }}
      />
    </div>
  )
}

// Report Modal Component
function ReportModal({ isOpen, onClose, question, category, user, onSuccess }) {
  const [reportTypes, setReportTypes] = useState([])
  const [customMessage, setCustomMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reportOptions = [
    { id: 'wrong_question', label: 'السؤال خاطئ' },
    { id: 'wrong_answer', label: 'الجواب خاطئ' },
    { id: 'unclear_image', label: 'صورة غير واضحة' },
    { id: 'broken_audio', label: 'صوت لا يعمل' },
    { id: 'other', label: 'أخرى' }
  ]

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setReportTypes([])
      setCustomMessage('')
      setSubmitting(false)
    }
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  const handleCheckboxChange = (id) => {
    setReportTypes(prev =>
      prev.includes(id)
        ? prev.filter(t => t !== id)
        : [...prev, id]
    )
  }

  const handleSubmit = async () => {
    if (reportTypes.length === 0 && !customMessage.trim()) {
      alert('الرجاء اختيار سبب الإبلاغ أو كتابة رسالة')
      return
    }

    setSubmitting(true)
    try {
      const questionId = question?.id || question?.question?.id || 'unknown'
      const questionText = question?.text || question?.question?.text || 'غير محدد'
      const answerText = question?.answer || question?.question?.answer || 'غير محدد'

      // Ensure user is authenticated before submitting
      if (!user?.uid) {
        alert('يجب تسجيل الدخول للإبلاغ عن الأسئلة')
        return
      }

      const reportData = {
        questionId,
        questionText,
        answerText,
        category,
        userMessage: customMessage.trim(),
        reportTypes,
        userId: user.uid,
        userName: user.displayName || user.email || 'مستخدم'
      }

      devLog('Submitting report with data:', reportData)

      await FirebaseQuestionsService.submitQuestionReport(reportData)

      devLog('Question report submitted successfully')
      onSuccess()
    } catch (error) {
      prodError('Error submitting question report:', error)
      prodError('Full error object:', error)
      prodError('Error code:', error.code)
      prodError('Error message:', error.message)
      alert(`حدث خطأ أثناء إرسال الإبلاغ:\n\nالخطأ: ${error.code || 'unknown'}\nالرسالة: ${error.message}\n\nالرجاء المحاولة مرة أخرى.`)
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const isMobile = window.innerWidth < 640

  return (
    <div
      className="fixed inset-0 bg-black/75 z-[99999] flex items-center justify-center p-4 transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl border-4 border-red-600 shadow-2xl flex flex-col overflow-hidden max-w-lg w-full max-h-[90vh] transform transition-all duration-200 scale-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-3 sm:p-4 flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-2xl sm:text-3xl">🚩</span>
            <h2 className="font-bold text-lg sm:text-xl lg:text-2xl">إبلاغ عن السؤال</h2>
          </div>
          <button
            onClick={onClose}
            className="bg-red-700 hover:bg-red-800 rounded-full w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center text-white font-bold text-xl sm:text-2xl transition-colors flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
          <div className="space-y-4">
            {/* Question Info */}
            <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-3 sm:p-4 space-y-2">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">السؤال:</p>
                <p className="text-sm sm:text-base font-bold text-gray-800 dark:text-gray-100" dir="rtl">
                  {question?.text || question?.question?.text || 'غير محدد'}
                </p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">الفئة:</p>
                <p className="text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400" dir="rtl">{category}</p>
              </div>
            </div>

            {/* Report Types */}
            <div>
              <p className="font-bold text-sm sm:text-base mb-2 text-gray-900 dark:text-gray-100" dir="rtl">سبب الإبلاغ</p>
              <div className="space-y-2">
                {reportOptions.map(option => (
                  <label
                    key={option.id}
                    className="flex items-center gap-3 p-2 sm:p-3 bg-gray-50 dark:bg-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={reportTypes.includes(option.id)}
                      onChange={() => handleCheckboxChange(option.id)}
                      className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 rounded focus:ring-red-500"
                    />
                    <span className="text-sm sm:text-base font-medium text-gray-700 dark:text-gray-300" dir="rtl">
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Custom Message */}
            <div>
              <p className="font-bold text-sm sm:text-base mb-2 text-gray-900 dark:text-gray-100" dir="rtl">رسالة إضافية (اختياري)</p>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="اكتب أي تفاصيل إضافية..."
                className="w-full p-3 border-2 border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:border-red-500 focus:outline-none text-sm sm:text-base resize-none text-gray-900 dark:text-gray-100"
                rows="4"
                dir="rtl"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 bg-gray-50 dark:bg-slate-700 border-t border-gray-200 dark:border-slate-600 flex gap-3 justify-center">
          <button
            onClick={onClose}
            disabled={submitting}
            className="bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-bold px-5 py-2.5 sm:px-6 sm:py-3 min-w-[100px] transition-colors text-sm sm:text-base lg:text-lg disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold px-5 py-2.5 sm:px-6 sm:py-3 min-w-[100px] transition-colors text-sm sm:text-base lg:text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'جاري الإرسال...' : 'إرسال'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuestionView
