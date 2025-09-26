import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameDataLoader } from '../utils/gameDataLoader'
import PresentationModeToggle from '../components/PresentationModeToggle'
import { useAuth } from '../hooks/useAuth'
import AudioPlayer from '../components/AudioPlayer'
import PerkModal from '../components/PerkModal'
import gamePreloader from '../utils/preloader'
import questionUsageTracker from '../utils/questionUsageTracker'

function GameBoard({ gameState, setGameState, stateLoaded }) {
  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const footerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)
  const [footerHeight, setFooterHeight] = useState(0)
  const [gameData, setGameData] = useState(null)
  const [loadingError, setLoadingError] = useState(null)

  // Perk system state
  const [perkModalOpen, setPerkModalOpen] = useState(false)
  const [activePerk, setActivePerk] = useState({ type: null, team: null })

  // Set user ID for question tracker when user changes
  useEffect(() => {
    if (user?.uid) {
      questionUsageTracker.setUserId(user.uid)
    }
  }, [user])

  // Redirect to home if not authenticated (but only after loading is complete)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, authLoading])

  // Smart preloading function - only preload questions that might be used
  const startSmartPreloading = async (data) => {
    if (!data || !gameState.selectedCategories.length) return

    try {
      // Get only the questions we might actually use (2 per difficulty per category)
      const questionsToPreload = []

      gameState.selectedCategories.forEach(categoryId => {
        if (data.questions[categoryId]) {
          const questions = data.questions[categoryId]

          // Group by difficulty
          const byDifficulty = {
            easy: questions.filter(q => q.difficulty === 'easy'),
            medium: questions.filter(q => q.difficulty === 'medium'),
            hard: questions.filter(q => q.difficulty === 'hard')
          }

          // Take up to 2 questions per difficulty (6 total per category)
          Object.values(byDifficulty).forEach(difficultyQuestions => {
            questionsToPreload.push(...difficultyQuestions.slice(0, 2))
          })
        }
      })

      console.log(`🎯 Smart preloading ${questionsToPreload.length} likely questions (max 6 per category)`)

      // Start background preloading without blocking UI or showing progress
      gamePreloader.preloadQuestionAssets(questionsToPreload).catch(error => {
        console.warn('⚠️ Background preloading failed (non-critical):', error)
      })

    } catch (error) {
      console.warn('⚠️ Smart preloading error (non-critical):', error)
    }
  }

  // Load game data from Firebase
  useEffect(() => {
    const loadGameData = async () => {
      try {
        setLoadingError(null)

        console.log('🎮 GameBoard: Loading game data...')
        const data = await GameDataLoader.loadGameData()

        if (data) {
          setGameData(data)
          console.log('✅ GameBoard: Game data loaded successfully')

          // Update question pool for global usage tracking
          questionUsageTracker.updateQuestionPool(data)

          // Start smart preloading (6 questions per category in background)
          startSmartPreloading(data)
        } else {
          throw new Error('No game data received')
        }
      } catch (error) {
        console.error('❌ GameBoard: Error loading game data:', error)
        setLoadingError(error.message)

        // Try fallback
        try {
          const fallbackData = await GameDataLoader.loadSampleData()
          setGameData(fallbackData)
          console.log('🔄 GameBoard: Using fallback data')

          // Update question pool for global usage tracking with fallback data
          questionUsageTracker.updateQuestionPool(fallbackData)

          // Start smart preloading with fallback data
          startSmartPreloading(fallbackData)
        } catch (fallbackError) {
          console.error('❌ GameBoard: Fallback failed:', fallbackError)
          setLoadingError('Unable to load game data. Please refresh the page.')
        }
      }
    }

    loadGameData()
  }, [])

  useEffect(() => {
    // Wait for state to be loaded before redirecting
    if (!stateLoaded) return

    if (!gameState.selectedCategories.length) {
      navigate('/categories')
      return
    }

    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: rect.height })
      }

      if (headerRef.current) {
        const headerRect = headerRef.current.getBoundingClientRect()
        setHeaderHeight(headerRect.height)
      }

      if (footerRef.current) {
        const footerRect = footerRef.current.getBoundingClientRect()
        setFooterHeight(footerRect.height)
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [gameState.selectedCategories.length, navigate, stateLoaded])

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

  const isQuestionUsed = (categoryId, questionIndex) => {
    return gameState.usedQuestions.has(`${categoryId}-${questionIndex}`)
  }

  const isPointValueUsed = (categoryId, points, buttonIndex) => {
    // Check if this specific button has been used for this category
    // Each button is tracked individually with category-points-buttonIndex

    // Create a key pattern for this specific button
    const pointValueKey = `${categoryId}-${points}-${buttonIndex}`

    // Check if this specific button was used
    const usedQuestions = Array.from(gameState.usedQuestions)
    const isUsed = gameState.usedPointValues && gameState.usedPointValues.has(pointValueKey)


    return isUsed || false
  }

  const getPoints = () => [200, 400, 600]

  const getQuestionPoints = (questionIndex) => {
    const points = getPoints()
    return points[questionIndex]
  }

  const handleQuestionClick = async (categoryId, points, buttonIndex = 0) => {
    const category = getCategoryById(categoryId)
    if (!category) return

    // Create unique button key for persistent question mapping
    const buttonKey = `${categoryId}-${points}-${buttonIndex}`

    // Check if we already have a question assigned to this button
    if (gameState.assignedQuestions?.[buttonKey]) {
      const assignedQuestion = gameState.assignedQuestions[buttonKey]
      console.log(`🔒 Using previously assigned question for button ${buttonKey}:`, assignedQuestion.question.text)

      setGameState(prev => ({
        ...prev,
        currentQuestion: assignedQuestion
      }))
      navigate('/question')
      return
    }

    // Get questions from Firebase data
    let questions
    if (gameData && gameData.questions && gameData.questions[categoryId]) {
      questions = gameData.questions[categoryId]
    } else {
      console.error('No questions found for category:', categoryId)
      return
    }

    if (!questions || questions.length === 0) {
      console.warn(`No questions found for category: ${categoryId}`)
      return
    }

    // Determine difficulty based on points
    let targetDifficulty
    if (points === 200) {
      targetDifficulty = 'easy'
    } else if (points === 400) {
      targetDifficulty = 'medium'
    } else if (points === 600) {
      targetDifficulty = 'hard'
    } else {
      console.warn(`Invalid points value: ${points}`)
      return
    }

    // Filter questions by difficulty and global usage
    const questionsWithDifficulty = questions.filter(q => q.difficulty === targetDifficulty)
    const availableQuestionsByDifficulty = await questionUsageTracker.getAvailableQuestions(questionsWithDifficulty, targetDifficulty)

    console.log(`🎯 Looking for ${targetDifficulty} questions (${points} points) in category: ${categoryId}`)
    console.log(`📊 Found ${questionsWithDifficulty.length} ${targetDifficulty} questions, ${availableQuestionsByDifficulty.length} unused globally`)

    if (availableQuestionsByDifficulty.length === 0) {
      console.warn(`❌ No unused ${targetDifficulty} questions found for category: ${categoryId}`)

      // Smart fallback: try nearby difficulties with global usage filtering
      let fallbackDifficulty = null
      let fallbackQuestions = []

      if (targetDifficulty === 'easy') {
        // For easy (200): try medium, then hard
        console.log(`🔄 Trying fallback: easy → medium → hard`)
        fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'medium'), 'medium')
        if (fallbackQuestions.length > 0) {
          fallbackDifficulty = 'medium'
        } else {
          fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'hard'), 'hard')
          fallbackDifficulty = 'hard'
        }
      } else if (targetDifficulty === 'medium') {
        // For medium (400): try easy, then hard
        console.log(`🔄 Trying fallback: medium → easy → hard`)
        fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'easy'), 'easy')
        if (fallbackQuestions.length > 0) {
          fallbackDifficulty = 'easy'
        } else {
          fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'hard'), 'hard')
          fallbackDifficulty = 'hard'
        }
      } else if (targetDifficulty === 'hard') {
        // For hard (600): try medium, then easy
        console.log(`🔄 Trying fallback: hard → medium → easy`)
        fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'medium'), 'medium')
        if (fallbackQuestions.length > 0) {
          fallbackDifficulty = 'medium'
        } else {
          fallbackQuestions = await questionUsageTracker.getAvailableQuestions(questions.filter(q => q.difficulty === 'easy'), 'easy')
          fallbackDifficulty = 'easy'
        }
      }

      if (fallbackQuestions.length > 0) {
        const fallbackQuestion = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)]
        const fallbackIndex = questions.indexOf(fallbackQuestion)

        console.log(`✅ Using ${fallbackDifficulty} question as fallback: "${fallbackQuestion.text}" (requested ${points} points)`)

        const fallbackQuestionData = {
          categoryId,
          questionIndex: fallbackIndex,
          question: fallbackQuestion,
          points,
          category: category.name,
          questionKey: `${categoryId}-${fallbackIndex}`,
          pointValueKey: `${categoryId}-${points}-${buttonIndex}`
        }

        setGameState(prev => ({
          ...prev,
          currentQuestion: fallbackQuestionData,
          // Store this fallback question assignment for persistence
          assignedQuestions: {
            ...prev.assignedQuestions,
            [buttonKey]: fallbackQuestionData
          }
        }))

        navigate('/question')
        return
      }

      // Final fallback: use any globally available question
      const anyAvailableQuestions = await questionUsageTracker.getAvailableQuestions(questions)

      if (anyAvailableQuestions.length > 0) {
        const finalFallback = anyAvailableQuestions[0]
        const finalIndex = questions.indexOf(finalFallback)
        console.log(`🆘 Final fallback: using any globally available question (${finalFallback.difficulty})`)

        const finalQuestionData = {
          categoryId,
          questionIndex: finalIndex,
          question: finalFallback,
          points,
          category: category.name,
          questionKey: `${categoryId}-${finalIndex}`,
          pointValueKey: `${categoryId}-${points}-${buttonIndex}`
        }

        setGameState(prev => ({
          ...prev,
          currentQuestion: finalQuestionData,
          // Store this final fallback question assignment for persistence
          assignedQuestions: {
            ...prev.assignedQuestions,
            [buttonKey]: finalQuestionData
          }
        }))

        navigate('/question')
      } else {
        console.error(`❌ No globally available questions remain in category: ${categoryId}`)
      }
      return
    }

    // Use globally filtered available questions
    if (availableQuestionsByDifficulty.length === 0) {
      console.warn(`No globally unused ${targetDifficulty} questions available for category: ${categoryId}`)
      return
    }

    // Pick a random question from globally available ones
    const randomQuestion = availableQuestionsByDifficulty[Math.floor(Math.random() * availableQuestionsByDifficulty.length)]
    const originalQuestionIndex = questions.indexOf(randomQuestion)

    console.log(`✅ Selected ${targetDifficulty} question: "${randomQuestion.text}" (${points} points)`)

    const questionData = {
      categoryId,
      questionIndex: originalQuestionIndex,
      question: randomQuestion,
      points,
      category: category.name,
      questionKey: `${categoryId}-${originalQuestionIndex}`,
      pointValueKey: `${categoryId}-${points}-${buttonIndex}`
    }

    setGameState(prev => ({
      ...prev,
      currentQuestion: questionData,
      // Store this question assignment for persistence
      assignedQuestions: {
        ...prev.assignedQuestions,
        [buttonKey]: questionData
      }
    }))

    navigate('/question')
  }

  // Perk handling functions
  const handlePerkClick = (perkType, team) => {
    // Check if perk is already used (max 1 use per perk per team)
    const currentUsage = gameState.perkUsage?.[team]?.[perkType] || 0
    if (currentUsage >= 1) return

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

    // Store perk activation for use in QuestionView
    if (type === 'double') {
      setGameState(prev => ({
        ...prev,
        activatedPerks: {
          ...prev.activatedPerks,
          doublePoints: { active: true, team }
        }
      }))
    }

    // Close modal
    setPerkModalOpen(false)
    setActivePerk({ type: null, team: null })
  }

  const handlePerkModalClose = () => {
    setPerkModalOpen(false)
    setActivePerk({ type: null, team: null })
  }

  // Mobile-first responsive system - start with square proportions and scale up
  const getResponsiveStyles = () => {
    const W = window.innerWidth // Use window width directly for better device detection
    const H = window.innerHeight

    // PC Auto-scaling: Apply 2x scaling for desktop/PC users for better visibility
    const isPC = W >= 1024 && H >= 768 // Desktop/laptop detection
    const pcScaleFactor = isPC ? 2.0 : 1.0 // 200% scaling for PC, normal for mobile/tablet

    // Calculate available space for game board
    const actualHeaderHeight = headerHeight || 80
    const actualFooterHeight = footerHeight || 100
    const padding = 20
    const availableHeight = H - actualHeaderHeight - actualFooterHeight - (padding * 2)
    const availableWidth = W - (padding * 2)

    // Mobile-first approach: Start with square cards and scale
    const rows = 2
    const cols = 3
    const isUltraNarrow = W < 400 // Z Fold, very narrow phones
    const isMobileLayout = W < 768

    // Aggressive gap reduction for ultra-narrow screens to maximize content space
    let rowGap, colGap
    if (isUltraNarrow) {
      rowGap = Math.max(1, Math.min(2, W * 0.002)) // Very small gaps for ultra-narrow
      colGap = Math.max(1, Math.min(1, W * 0.001)) // Minimal column gaps
    } else if (isMobileLayout) {
      rowGap = Math.max(2, Math.min(5, W * 0.004)) // Reduced max from 6 to 5
      colGap = Math.max(2, Math.min(3, W * 0.003)) // Reduced max from 4 to 3
    } else {
      rowGap = Math.max(5, Math.min(10, W * 0.007)) // Reduced max from 12 to 10
      colGap = Math.max(3, Math.min(6, W * 0.005)) // Reduced max from 8 to 6
    }

    // Calculate space for each category group
    const totalRowGaps = rowGap * (rows - 1)
    const totalColGaps = colGap * (cols - 1)
    const categoryGroupHeight = (availableHeight - totalRowGaps) / rows
    const categoryGroupWidth = (availableWidth - totalColGaps) / cols

    // Ultra-aggressive gap optimization for narrow screens
    let minColGap, maxColGap, minRowGap, maxRowGap
    if (isUltraNarrow) {
      minColGap = 1; maxColGap = 3; minRowGap = 1; maxRowGap = 2 // Minimal gaps for ultra-narrow
    } else if (isMobileLayout) {
      minColGap = 3; maxColGap = 10; minRowGap = 2; maxRowGap = 6 // Reduced gaps
    } else {
      minColGap = 6; maxColGap = 16; minRowGap = 4; maxRowGap = 12 // Reduced gaps
    }

    const baseInnerColGap = Math.max(minColGap, Math.min(maxColGap, categoryGroupWidth * (isUltraNarrow ? 0.015 : 0.025))) // Much smaller multiplier for ultra-narrow
    const baseInnerRowGap = Math.max(minRowGap, Math.min(maxRowGap, categoryGroupHeight * (isUltraNarrow ? 0.008 : 0.015))) // Much smaller multiplier for ultra-narrow

    // Optimize space utilization: Use more of available space
    // For the new [WIDE_BTN][CARD] layout, allocate space efficiently
    const buttonColumnWidth = Math.min(140, categoryGroupWidth * 0.4) // Wider button columns for badge style
    const availableCardWidth = categoryGroupWidth - buttonColumnWidth - baseInnerColGap

    // Responsive card system with dynamic aspect ratios
    let cardWidth, cardHeight, buttonHeight

    // Calculate optimal button height - bigger buttons within each category
    const baseButtonHeight = (categoryGroupHeight * 0.9) / 4 // Keep original category spacing

    // Cleaner card proportions like the reference images
    let cardAspectRatio
    if (isUltraNarrow) {
      cardAspectRatio = 0.85 // Slightly taller for narrow screens
      buttonHeight = Math.max(30, baseButtonHeight)
    } else if (isMobileLayout) {
      cardAspectRatio = 1.1 // Slightly rectangular (11:10 ratio)
      buttonHeight = Math.max(35, baseButtonHeight)
    } else {
      cardAspectRatio = 1.25 // More rectangular for desktop (5:4 ratio)
      buttonHeight = Math.max(35, baseButtonHeight)
    }

    // Calculate card width first, height will be set to match buttons later
    const maxCardWidth = isUltraNarrow
      ? availableCardWidth * 1.0 // Use more space on ultra-narrow
      : availableCardWidth * 0.95

    // Only calculate card width here, height will be forced to match button column
    if (cardAspectRatio >= 1.0) {
      cardWidth = Math.min(maxCardWidth, availableCardWidth * (isUltraNarrow ? 1.0 : 0.95))
    } else {
      // For taller cards, calculate width from a reasonable height estimate
      const estimatedHeight = categoryGroupHeight * 0.8
      cardWidth = estimatedHeight * cardAspectRatio
      cardWidth = Math.min(cardWidth, maxCardWidth)
    }

    // Apply minimum and maximum card width limits
    const minCardWidth = isUltraNarrow ? 80 : 60
    const maxCardWidthLimit = isUltraNarrow ? 130 : isMobileLayout ? 200 : 280 // Increased card width limits
    cardWidth = Math.max(minCardWidth, Math.min(cardWidth, maxCardWidthLimit))

    // cardHeight will be set later to match button column exactly

    buttonHeight = Math.min(buttonHeight, categoryGroupHeight * 0.3) // Allow bigger buttons

    // Calculate gaps first - make gaps smaller to give more space to buttons
    const innerColGap = Math.max(8, Math.min(30, categoryGroupWidth * 0.04))
    const innerRowGap = Math.max(2, Math.min(8, buttonHeight * 0.15)) // Much smaller gaps within category

    // Recalculate button height with smaller gaps to make buttons bigger
    const totalGapSpace = innerRowGap * 2 // Space for 2 gaps between 3 buttons
    const availableButtonSpace = categoryGroupHeight * 0.9 - totalGapSpace
    const finalButtonHeight = Math.max(buttonHeight, availableButtonSpace / 3) // Use available space for bigger buttons

    // Card dimensions are now calculated above with responsive aspect ratios

    // Consistent button scaling system - same proportions on all devices
    // Calculate button dimensions based purely on available space
    const availableButtonHeight = (categoryGroupHeight * 0.9 - (2 * baseInnerRowGap)) / 3
    const actualFinalButtonHeight = Math.max(
      25, // Single minimum height for all devices
      Math.min(availableButtonHeight, categoryGroupHeight * 0.25) // Same constraint for all
    )

    // Consistent button width calculation - same aspect ratio for all devices
    const BUTTON_ASPECT_RATIO = 2.0 // Same aspect ratio for all devices
    const calculatedButtonWidth = actualFinalButtonHeight * BUTTON_ASPECT_RATIO

    // Calculate available space for buttons
    const availableSpaceForButtons = (categoryGroupWidth - cardWidth - baseInnerColGap) * 0.45

    // Apply same size limits across all devices
    const maxButtonWidth = Math.min(
      availableSpaceForButtons, // Space-based limit
      calculatedButtonWidth * 1.2 // Allow slightly larger but keep proportional
    )
    const minButtonWidth = 45 // Same minimum for all devices

    const constrainedButtonWidth = Math.max(minButtonWidth, Math.min(calculatedButtonWidth, maxButtonWidth))

    // Calculate the actual gaps used in the layout
    const actualInnerRowGap = Math.max(2, Math.min(8, actualFinalButtonHeight * 0.15))

    // Force card height to exactly match button column height
    const finalButtonColumnHeight = (actualFinalButtonHeight * 3) + (actualInnerRowGap * 2)
    cardHeight = Math.min(finalButtonColumnHeight, categoryGroupHeight * 0.95) // Ensure it fits within available space


    // Consistent button font sizing - same scaling for all devices
    const baseFontSize = Math.min(
      actualFinalButtonHeight * 0.6, // Same proportion for all devices
      constrainedButtonWidth * 0.25 // Same proportion for all devices
    )

    // Same font size limits for all devices
    const minFontSize = 10
    const maxFontSize = 22

    const fontSize = Math.max(minFontSize, Math.min(maxFontSize, baseFontSize))

    // More rounded buttons like the reference images
    const buttonBorderRadius = Math.max(
      actualFinalButtonHeight * 0.45, // Much more rounded - almost pill-shaped
      isUltraNarrow ? 12 : 16 // Minimum roundness
    )

    // Enhanced per-category font scaling - each category adjusts individually
    const getCardFontSize = (categoryName, cardWidth, cardHeight, buttonFontSize) => {
      const textLength = categoryName ? categoryName.length : 10
      // Match the JSX padding exactly
      const padding = isUltraNarrow ? 12 : 20 // 6px or 10px each side = 12px or 20px total
      const availableWidth = cardWidth - padding
      const minFontSize = isUltraNarrow ? 5 : isMobileLayout ? 7 : 8

      // Height constraints - match the actual smaller text section height (scale for PC)
      const baseTextSectionHeight = Math.max(18, Math.min(30, cardHeight * 0.06))
      const textSectionHeight = baseTextSectionHeight * pcScaleFactor
      const maxFontSizeForHeight = textSectionHeight * 0.85 // Leave some margin

      // Much more conservative character width estimation for Arabic text
      // Arabic characters are generally wider and need more space
      let charWidthRatio
      if (textLength <= 6) {
        charWidthRatio = 0.8 // Very short text - still conservative
      } else if (textLength <= 10) {
        charWidthRatio = 0.85 // Short text
      } else if (textLength <= 14) {
        charWidthRatio = 0.9 // Medium text
      } else if (textLength <= 18) {
        charWidthRatio = 0.95 // Long text
      } else {
        charWidthRatio = 1.0 // Very long text - most conservative
      }

      // Add extra safety margin for Arabic text
      const maxFontSizeForWidth = (availableWidth / textLength) / charWidthRatio * 0.85

      // Use the more restrictive constraint (width or height)
      let scaledFontSize = Math.min(maxFontSizeForWidth, maxFontSizeForHeight)

      // More aggressive scaling for Arabic text to prevent cutoff
      if (textLength > 20) {
        scaledFontSize *= 0.7 // Very aggressive for very long text
      } else if (textLength > 16) {
        scaledFontSize *= 0.75 // Aggressive for long text
      } else if (textLength > 12) {
        scaledFontSize *= 0.8 // Moderate for medium-long text
      } else if (textLength > 8) {
        scaledFontSize *= 0.85 // Slight reduction for medium text
      }
      // Very short text (<=8 chars) keeps full calculated size

      // Set reasonable bounds
      const maxAllowedSize = Math.min(buttonFontSize, isUltraNarrow ? 14 : isMobileLayout ? 18 : 24)
      const finalSize = Math.max(minFontSize, Math.min(maxAllowedSize, scaledFontSize))

      return finalSize * pcScaleFactor
    }

    // Header and footer scaling (apply PC scale factor)
    const headerFontSize = Math.max(12, Math.min(24, W * 0.02)) * pcScaleFactor
    const footerButtonSize = Math.max(30, Math.min(60, H * 0.08)) * pcScaleFactor

    return {
      cardWidth: cardWidth,
      cardHeight: cardHeight,
      buttonWidth: constrainedButtonWidth,
      buttonHeight: actualFinalButtonHeight,
      fontSize: fontSize * pcScaleFactor,
      buttonBorderRadius: buttonBorderRadius,
      getCardFontSize: getCardFontSize,
      headerFontSize: headerFontSize,
      footerButtonSize: footerButtonSize,
      categoryGroupWidth: categoryGroupWidth,
      categoryGroupHeight: categoryGroupHeight,
      innerColGap: innerColGap,
      innerRowGap: actualInnerRowGap,
      rowGap: rowGap,
      colGap: colGap,
      availableHeight: availableHeight,
      availableWidth: availableWidth,
      isUltraNarrow: isUltraNarrow,
      pcScaleFactor: pcScaleFactor,
      actualHeaderHeight: headerHeight || 80,
      actualFooterHeight: footerHeight || 100,
      padding: 20
    }
  }

  const styles = getResponsiveStyles()


  if (!gameState.selectedCategories.length) {
    return <div>Loading...</div>
  }

  // Never show loading screen - use skeleton instead

  // Show error state
  if (loadingError) {
    return (
      <div className="h-screen bg-[#f7f2e6] flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-6xl mb-4">🎮</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">خطأ في تحميل اللعبة</h2>
          <p className="text-gray-600 mb-4">{loadingError}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
            >
              إعادة المحاولة
            </button>
            <button
              onClick={() => navigate('/categories')}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
            >
              العودة للفئات
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show skeleton game board if no game data instead of loading screen
  const showSkeleton = !gameData

  return (
    <div className="h-screen bg-[#f7f2e6] flex flex-col" ref={containerRef}>
      {/* Red Header Bar */}
      <div ref={headerRef} className="bg-red-600 text-white p-3 flex-shrink-0 sticky top-0 z-10">
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
                : 'لا يوجد'}
            </span>
            <button
              onClick={() => setGameState(prev => ({
                ...prev,
                currentTurn: prev.currentTurn === 'team1' ? 'team2' : 'team1'
              }))}
              className="bg-red-700 hover:bg-red-800 text-white px-2 py-1 rounded-lg font-bold transition-colors"
              style={{ fontSize: `${styles.headerFontSize * 1}px` }}
            >
              🔄
            </button>
          </div>

          <div className="flex items-center gap-4">
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
              onClick={() => navigate('/categories')}
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

      {/* Game Board - Perfect Scaled Layout */}
      <div
        className="flex-1 bg-[#f7f2e6] flex flex-col items-center justify-center"
        style={{ padding: '20px' }}
      >
        <div
          className="grid grid-cols-3 grid-rows-2"
          style={{
            gap: `${styles.rowGap}px ${styles.colGap}px`,
            width: `${styles.availableWidth}px`,
            height: `${styles.availableHeight}px`
          }}
        >
          {gameState.selectedCategories.slice(0, 6).map((categoryId, categoryIndex) => {
            const category = getCategoryById(categoryId)

            // Show skeleton if loading
            if (showSkeleton) {
              return (
                <div
                  key={`skeleton-${categoryIndex}`}
                  className="relative flex items-center justify-center animate-pulse"
                  style={{
                    width: `${styles.categoryGroupWidth}px`,
                    height: `${styles.categoryGroupHeight}px`,
                    maxHeight: `${styles.categoryGroupHeight}px`
                  }}
                >
                  {/* Skeleton buttons */}
                  <div className="absolute inset-0 flex flex-col justify-center items-center" style={{ gap: `${styles.innerRowGap}px`, zIndex: 30 }}>
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="bg-gray-200 rounded"
                        style={{
                          width: `${styles.cardWidth + (styles.buttonWidth * 1.6)}px`,
                          height: `${styles.buttonHeight}px`,
                          borderRadius: `${styles.buttonBorderRadius}px`
                        }}
                      />
                    ))}
                  </div>
                  {/* Skeleton card */}
                  <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 50 }}>
                    <div
                      className="bg-gray-100 border-2 border-gray-200 rounded shadow-lg"
                      style={{
                        width: `${styles.cardWidth}px`,
                        height: `${styles.cardHeight}px`
                      }}
                    />
                  </div>
                </div>
              )
            }

            if (!category) return null

            return (
              <div
                key={categoryId}
                className="relative flex items-center justify-center"
                style={{
                  width: `${styles.categoryGroupWidth}px`,
                  height: `${styles.categoryGroupHeight}px`,
                  maxHeight: `${styles.categoryGroupHeight}px`
                }}
              >
                {/* Wide Buttons spanning full width */}
                <div
                  className="absolute inset-0 flex flex-col justify-center items-center"
                  style={{
                    gap: `${styles.innerRowGap}px`,
                    zIndex: 30
                  }}
                >
                  {/* 200 Points Wide Button - Sized to match card coverage */}
                  <div
                    className="shadow-md overflow-hidden cursor-pointer"
                    style={{
                      width: `${styles.cardWidth + (styles.buttonWidth * 1.6)}px`, // Card width + space for both badges
                      height: `${styles.buttonHeight}px`,
                      borderRadius: `${styles.buttonBorderRadius}px`,
                      border: 'none'
                    }}
                  >
                    <div className="flex h-full">
                      {/* Left Badge */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 200, 0);
                        }}
                        disabled={isPointValueUsed(categoryId, 200, 0)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 200, 0)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120,
                          pointerEvents: 'auto'
                        }}
                      >
                        200
                      </button>
                      {/* Center Spacer for Card - matches card width exactly */}
                      <div
                        className="bg-transparent"
                        style={{ width: `${styles.cardWidth}px` }}
                      />
                      {/* Right Badge */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 200, 1);
                        }}
                        disabled={isPointValueUsed(categoryId, 200, 1)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 200, 1)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120,
                          pointerEvents: 'auto'
                        }}
                      >
                        200
                      </button>
                    </div>
                  </div>

                  {/* 400 Points Wide Button - Sized to match card coverage */}
                  <div
                    className="shadow-md overflow-hidden cursor-pointer"
                    style={{
                      width: `${styles.cardWidth + (styles.buttonWidth * 1.6)}px`, // Card width + space for both badges
                      height: `${styles.buttonHeight}px`,
                      borderRadius: `${styles.buttonBorderRadius}px`
                    }}
                  >
                    <div className="flex h-full">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 400, 0);
                        }}
                        disabled={isPointValueUsed(categoryId, 400, 0)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 400, 0)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120
                        }}
                      >
                        400
                      </button>
                      <div
                        className="bg-white"
                        style={{
                          width: `${styles.cardWidth}px`,
                          height: '100%',
                          border: 'none',
                          pointerEvents: 'auto'
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 400, 1);
                        }}
                        disabled={isPointValueUsed(categoryId, 400, 1)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 400, 1)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120
                        }}
                      >
                        400
                      </button>
                    </div>
                  </div>

                  {/* 600 Points Wide Button - Sized to match card coverage */}
                  <div
                    className="shadow-md overflow-hidden cursor-pointer"
                    style={{
                      width: `${styles.cardWidth + (styles.buttonWidth * 1.6)}px`, // Card width + space for both badges
                      height: `${styles.buttonHeight}px`,
                      borderRadius: `${styles.buttonBorderRadius}px`
                    }}
                  >
                    <div className="flex h-full">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 600, 0);
                        }}
                        disabled={isPointValueUsed(categoryId, 600, 0)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 600, 0)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120
                        }}
                      >
                        600
                      </button>
                      <div
                        className="bg-white"
                        style={{
                          width: `${styles.cardWidth}px`,
                          height: '100%',
                          border: 'none',
                          pointerEvents: 'auto'
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(categoryId, 600, 1);
                        }}
                        disabled={isPointValueUsed(categoryId, 600, 1)}
                        className={`flex-none px-2 font-bold transition-all duration-200 ${
                          isPointValueUsed(categoryId, 600, 1)
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        style={{
                          width: `${styles.buttonWidth * 0.8}px`, // Fixed width for badges
                          fontSize: `${styles.fontSize * 0.8}px`,
                          position: 'relative',
                          zIndex: 120
                        }}
                      >
                        600
                      </button>
                    </div>
                  </div>
                </div>

                {/* Category Card positioned in center, perfectly aligned with button gaps */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 50, pointerEvents: 'none' }}>
                  <div
                    className="flex flex-col border-2 border-gray-300 shadow-lg overflow-hidden bg-white"
                    style={{
                      width: `${styles.cardWidth}px`,
                      height: `${styles.cardHeight}px`,
                      zIndex: 100,
                      backgroundColor: 'white'
                    }}
                  >
                    {/* Image section */}
                    <div
                      className="flex-1 relative bg-gradient-to-br from-gray-200 to-gray-400"
                      style={{
                        backgroundImage: category.imageUrl ? `url(${category.imageUrl})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                      }}
                    >
                      {!category.imageUrl && category.image && (
                        <div className="absolute inset-0 flex items-center justify-center"
                             style={{ fontSize: `${styles.cardWidth * 0.3}px` }}>
                          {category.image}
                        </div>
                      )}
                    </div>

                    {/* Text section inside card - single line */}
                    <div
                      className="bg-gray-300 text-gray-800 text-center font-bold flex-shrink-0 flex items-center justify-center relative"
                      style={{
                        fontSize: `${styles.getCardFontSize(category.name, styles.cardWidth, styles.cardHeight, styles.fontSize)}px`,
                        lineHeight: '1',
                        height: `${Math.max(18, Math.min(30, styles.cardHeight * 0.06)) * styles.pcScaleFactor}px`,
                        width: `${styles.cardWidth}px`,
                        margin: '0',
                        padding: `0 ${styles.isUltraNarrow ? 6 : 10}px`,
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        zIndex: 25
                      }}
                    >
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {category.name}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            )
          })}
        </div>
      </div>

      {/* Footer Score Controls */}
      <div ref={footerRef} className="bg-[#f7f2e6] border-t-2 border-gray-200 flex-shrink-0 sticky bottom-0 z-10" style={{
        paddingLeft: `${styles.pcScaleFactor > 1 ? 64 : 16}px`,
        paddingRight: `${styles.pcScaleFactor > 1 ? 64 : 16}px`,
        paddingTop: `${styles.pcScaleFactor > 1 ? 32 : 12}px`,
        paddingBottom: `${styles.pcScaleFactor > 1 ? 32 : 12}px`
      }}>
        <div className="flex justify-between items-center w-full">
          {/* Team 1 Controls (Left) */}
          <div className="flex items-center" style={{ gap: `${styles.pcScaleFactor > 1 ? 24 : 12}px` }}>
            <button
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full font-bold transition-colors"
              style={{ fontSize: `${styles.headerFontSize * 0.9}px` }}
            >
              {gameState.team1.name}
            </button>
            <button
              onClick={() => setGameState(prev => ({
                ...prev,
                team1: { ...prev.team1, score: Math.max(0, prev.team1.score - 100) }
              }))}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full font-bold transition-colors"
              style={{
                fontSize: `${styles.headerFontSize * 0.9}px`
              }}
            >
              -
            </button>
            <div
              className="bg-white border-2 border-gray-300 px-6 py-2 rounded-full flex items-center justify-center font-bold"
              style={{
                fontSize: `${styles.headerFontSize}px`,
                color: '#B91C1C',
                minWidth: `${styles.footerButtonSize * 2}px`,
                width: `${styles.footerButtonSize * 2}px`
              }}
            >
              {gameState.team1.score}
            </div>
            <button
              onClick={() => setGameState(prev => ({
                ...prev,
                team1: { ...prev.team1, score: prev.team1.score + 100 }
              }))}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full font-bold transition-colors"
              style={{
                fontSize: `${styles.headerFontSize * 0.9}px`
              }}
            >
              +
            </button>
            {/* Team 1 Perks - Right of score */}
            <div className="flex items-center" style={{ gap: `${styles.pcScaleFactor > 1 ? 16 : 8}px` }}>
              <div
                className={`border rounded-full flex items-center justify-center transition-colors ${
                  (gameState.perkUsage?.team1?.double || 0) >= 1
                    ? 'bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50'
                    : gameState.currentTurn !== 'team1'
                    ? 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed opacity-30'
                    : 'bg-gray-200 border-gray-300 text-gray-500 cursor-pointer hover:bg-gray-300'
                }`}
                style={{
                  width: `${styles.footerButtonSize * 0.5}px`,
                  height: `${styles.footerButtonSize * 0.5}px`,
                  fontSize: `${styles.headerFontSize * 0.5}px`
                }}
                onClick={() => handlePerkClick('double', 'team1')}
              >
                ×2
              </div>
              <div
                className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                style={{
                  width: `${styles.footerButtonSize * 0.5}px`,
                  height: `${styles.footerButtonSize * 0.5}px`,
                  fontSize: `${styles.headerFontSize * 0.5}px`
                }}
                title="متاح فقط أثناء السؤال"
              >
                📞
              </div>
              <div
                className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                style={{
                  width: `${styles.footerButtonSize * 0.5}px`,
                  height: `${styles.footerButtonSize * 0.5}px`,
                  fontSize: `${styles.headerFontSize * 0.5}px`
                }}
                title="متاح فقط أثناء السؤال"
              >
                🔍
              </div>
            </div>
          </div>

          {/* Team 2 Controls (Right Corner) */}
          <div className="flex items-center" style={{ gap: `${styles.pcScaleFactor > 1 ? 24 : 12}px` }}>
            {/* Team 2 Perks - Left of score */}
            <div className="flex items-center" style={{ gap: `${styles.pcScaleFactor > 1 ? 16 : 8}px` }}>
              <div
                className={`border rounded-full flex items-center justify-center transition-colors ${
                  (gameState.perkUsage?.team2?.double || 0) >= 1
                    ? 'bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50'
                    : gameState.currentTurn !== 'team2'
                    ? 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed opacity-30'
                    : 'bg-gray-200 border-gray-300 text-gray-500 cursor-pointer hover:bg-gray-300'
                }`}
                style={{
                  width: `${styles.footerButtonSize * 0.5}px`,
                  height: `${styles.footerButtonSize * 0.5}px`,
                  fontSize: `${styles.headerFontSize * 0.5}px`
                }}
                onClick={() => handlePerkClick('double', 'team2')}
              >
                ×2
              </div>
              <div
                className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                style={{
                  width: `${styles.footerButtonSize * 0.5}px`,
                  height: `${styles.footerButtonSize * 0.5}px`,
                  fontSize: `${styles.headerFontSize * 0.5}px`
                }}
                title="متاح فقط أثناء السؤال"
              >
                📞
              </div>
              <div
                className="bg-gray-400 border-gray-500 text-gray-600 cursor-not-allowed opacity-50 border rounded-full flex items-center justify-center transition-colors"
                style={{
                  width: `${styles.footerButtonSize * 0.5}px`,
                  height: `${styles.footerButtonSize * 0.5}px`,
                  fontSize: `${styles.headerFontSize * 0.5}px`
                }}
                title="متاح فقط أثناء السؤال"
              >
                🔍
              </div>
            </div>
            <button
              onClick={() => setGameState(prev => ({
                ...prev,
                team2: { ...prev.team2, score: Math.max(0, prev.team2.score - 100) }
              }))}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full font-bold transition-colors"
              style={{
                fontSize: `${styles.headerFontSize * 0.9}px`
              }}
            >
              -
            </button>
            <div
              className="bg-white border-2 border-gray-300 px-6 py-2 rounded-full flex items-center justify-center font-bold"
              style={{
                fontSize: `${styles.headerFontSize}px`,
                color: '#B91C1C',
                minWidth: `${styles.footerButtonSize * 2}px`,
                width: `${styles.footerButtonSize * 2}px`
              }}
            >
              {gameState.team2.score}
            </div>
            <button
              onClick={() => setGameState(prev => ({
                ...prev,
                team2: { ...prev.team2, score: prev.team2.score + 100 }
              }))}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full font-bold transition-colors"
              style={{
                fontSize: `${styles.headerFontSize * 0.9}px`
              }}
            >
              +
            </button>
            <button
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full font-bold transition-colors"
              style={{ fontSize: `${styles.headerFontSize * 0.9}px` }}
            >
              {gameState.team2.name}
            </button>
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

export default GameBoard