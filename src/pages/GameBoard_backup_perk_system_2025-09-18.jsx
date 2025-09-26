import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameDataLoader } from '../utils/gameDataLoader'
import PresentationModeToggle from '../components/PresentationModeToggle'
import { useAuth } from '../hooks/useAuth'
import AudioPlayer from '../components/AudioPlayer'
import PerkModal from '../components/PerkModal'

function GameBoard({ gameState, setGameState }) {
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const footerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)
  const [footerHeight, setFooterHeight] = useState(0)
  const [gameData, setGameData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingError, setLoadingError] = useState(null)

  // Perk system state
  const [perkModalOpen, setPerkModalOpen] = useState(false)
  const [activePerk, setActivePerk] = useState({ type: null, team: null })

  // Redirect to home if not authenticated (but only after loading is complete)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, authLoading, navigate])

  // Load game data from Firebase
  useEffect(() => {
    const loadGameData = async () => {
      try {
        setLoading(true)
        setLoadingError(null)

        console.log('🎮 GameBoard: Loading game data...')
        const data = await GameDataLoader.loadGameData()

        if (data) {
          setGameData(data)
          console.log('✅ GameBoard: Game data loaded successfully')
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
        } catch (fallbackError) {
          console.error('❌ GameBoard: Fallback failed:', fallbackError)
        }
      } finally {
        setLoading(false)
      }
    }

    loadGameData()
  }, [])

  useEffect(() => {
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
  }, [gameState.selectedCategories.length, navigate])

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

  const handleQuestionClick = (categoryId, points, buttonIndex = 0) => {
    const category = getCategoryById(categoryId)
    if (!category) return

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

    // Filter questions by difficulty
    const questionsWithDifficulty = questions.filter(q => q.difficulty === targetDifficulty)

    console.log(`🎯 Looking for ${targetDifficulty} questions (${points} points) in category: ${categoryId}`)
    console.log(`📊 Found ${questionsWithDifficulty.length} ${targetDifficulty} questions out of ${questions.length} total`)

    if (questionsWithDifficulty.length === 0) {
      console.warn(`❌ No ${targetDifficulty} questions found for category: ${categoryId}`)
      console.log(`📋 Available difficulties:`, questions.map(q => q.difficulty))

      // Smart fallback: try nearby difficulties
      let fallbackDifficulty = null
      let fallbackQuestions = []

      if (targetDifficulty === 'easy') {
        // For easy (200): try medium, then hard
        console.log(`🔄 Trying fallback: easy → medium → hard`)
        fallbackQuestions = questions.filter(q => q.difficulty === 'medium')
        if (fallbackQuestions.length > 0) {
          fallbackDifficulty = 'medium'
        } else {
          fallbackQuestions = questions.filter(q => q.difficulty === 'hard')
          fallbackDifficulty = 'hard'
        }
      } else if (targetDifficulty === 'medium') {
        // For medium (400): try easy, then hard
        console.log(`🔄 Trying fallback: medium → easy → hard`)
        fallbackQuestions = questions.filter(q => q.difficulty === 'easy')
        if (fallbackQuestions.length > 0) {
          fallbackDifficulty = 'easy'
        } else {
          fallbackQuestions = questions.filter(q => q.difficulty === 'hard')
          fallbackDifficulty = 'hard'
        }
      } else if (targetDifficulty === 'hard') {
        // For hard (600): try medium, then easy
        console.log(`🔄 Trying fallback: hard → medium → easy`)
        fallbackQuestions = questions.filter(q => q.difficulty === 'medium')
        if (fallbackQuestions.length > 0) {
          fallbackDifficulty = 'medium'
        } else {
          fallbackQuestions = questions.filter(q => q.difficulty === 'easy')
          fallbackDifficulty = 'easy'
        }
      }

      if (fallbackQuestions.length > 0) {
        // Get unused questions from fallback difficulty
        const unusedFallbackQuestions = fallbackQuestions.filter(question => {
          const originalIndex = questions.indexOf(question)
          return !isQuestionUsed(categoryId, originalIndex)
        })

        if (unusedFallbackQuestions.length > 0) {
          const fallbackQuestion = unusedFallbackQuestions[Math.floor(Math.random() * unusedFallbackQuestions.length)]
          const fallbackIndex = questions.indexOf(fallbackQuestion)

          console.log(`✅ Using ${fallbackDifficulty} question as fallback: "${fallbackQuestion.text}" (requested ${points} points)`)

          setGameState(prev => ({
            ...prev,
            currentQuestion: {
              categoryId,
              questionIndex: fallbackIndex,
              question: fallbackQuestion,
              points,
              category: category.name,
              questionKey: `${categoryId}-${fallbackIndex}`,
              pointValueKey: `${categoryId}-${points}-${buttonIndex}`
            }
          }))

          navigate('/question')
          return
        }
      }

      // Final fallback: use any unused question
      const anyUnusedQuestions = questions.filter((question, index) => {
        return !isQuestionUsed(categoryId, index)
      })

      if (anyUnusedQuestions.length > 0) {
        const finalFallback = anyUnusedQuestions[0]
        const finalIndex = questions.indexOf(finalFallback)
        console.log(`🆘 Final fallback: using any available question (${finalFallback.difficulty})`)

        setGameState(prev => ({
          ...prev,
          currentQuestion: {
            categoryId,
            questionIndex: finalIndex,
            question: finalFallback,
            points,
            category: category.name,
            questionKey: `${categoryId}-${finalIndex}`,
            pointValueKey: `${categoryId}-${points}-${buttonIndex}`
          }
        }))

        navigate('/question')
      } else {
        console.error(`❌ No unused questions available in category: ${categoryId}`)
      }
      return
    }

    // Get unused questions of the target difficulty
    const availableQuestions = questionsWithDifficulty.filter((question, index) => {
      const originalIndex = questions.indexOf(question)
      return !isQuestionUsed(categoryId, originalIndex)
    })

    if (availableQuestions.length === 0) {
      console.warn(`No unused ${targetDifficulty} questions available for category: ${categoryId}`)
      return
    }

    // Pick a random question from available ones
    const randomQuestion = availableQuestions[Math.floor(Math.random() * availableQuestions.length)]
    const originalQuestionIndex = questions.indexOf(randomQuestion)

    console.log(`✅ Selected ${targetDifficulty} question: "${randomQuestion.text}" (${points} points)`)

    setGameState(prev => ({
      ...prev,
      currentQuestion: {
        categoryId,
        questionIndex: originalQuestionIndex,
        question: randomQuestion,
        points,
        category: category.name,
        questionKey: `${categoryId}-${originalQuestionIndex}`,
        pointValueKey: `${categoryId}-${points}-${buttonIndex}`
      }
    }))

    navigate('/question')
  }

  // Perk handling functions
  const handlePerkClick = (perkType, team) => {
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

    // Check if perk is already used up (max 3 uses per perk per team)
    const currentUsage = gameState.perkUsage?.[team]?.[type] || 0
    if (currentUsage >= 3) return

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

    // Single-line font scaling - optimized for ultra-narrow screens
    const getCardFontSize = (categoryName, cardWidth, cardHeight, buttonFontSize) => {
      const textLength = categoryName ? categoryName.length : 10
      // Reduce padding on ultra-narrow screens to give more space for text
      const padding = isUltraNarrow ? 8 : 16 // 4px each side for ultra-narrow, 8px for others
      const availableWidth = cardWidth - padding
      const minFontSize = isUltraNarrow ? 5 : isMobileLayout ? 7 : 8

      // More conservative character width estimation for ultra-narrow
      const charWidthRatio = isUltraNarrow ? 0.7 : 0.6 // Wider estimation for narrow screens
      const maxFontSizeForWidth = (availableWidth / textLength) / charWidthRatio

      // Height constraints - match the actual smaller text section height
      const textSectionHeight = Math.max(18, Math.min(30, cardHeight * 0.06))
      const maxFontSizeForHeight = textSectionHeight * 0.9

      // Use the more restrictive constraint
      let scaledFontSize = Math.min(maxFontSizeForWidth, maxFontSizeForHeight)

      // More aggressive scaling for ultra-narrow screens
      if (isUltraNarrow) {
        if (textLength > 15) {
          scaledFontSize *= 0.7 // Very aggressive for ultra-narrow + long text
        } else if (textLength > 10) {
          scaledFontSize *= 0.8
        }
      } else {
        // Standard scaling for other screens
        if (textLength > 20) {
          scaledFontSize *= 0.8
        } else if (textLength > 15) {
          scaledFontSize *= 0.9
        }
      }

      // Limit to button font size but allow smaller on ultra-narrow if needed
      const maxAllowedSize = Math.min(buttonFontSize, isUltraNarrow ? 14 : isMobileLayout ? 18 : 20)
      return Math.max(minFontSize, Math.min(maxAllowedSize, scaledFontSize))
    }

    // Header and footer scaling
    const headerFontSize = Math.max(12, Math.min(24, W * 0.02))
    const footerButtonSize = Math.max(30, Math.min(60, H * 0.08))

    return {
      cardWidth: cardWidth,
      cardHeight: cardHeight,
      buttonWidth: constrainedButtonWidth,
      buttonHeight: actualFinalButtonHeight,
      fontSize: fontSize,
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
      isUltraNarrow: isUltraNarrow
    }
  }

  const styles = getResponsiveStyles()


  if (!gameState.selectedCategories.length) {
    return <div>Loading...</div>
  }

  // Show loading state
  if (loading) {
    return (
      <div className="h-screen bg-white flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600 mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">جاري تحميل لوحة اللعبة...</h2>
          <p className="text-gray-600">Loading game board from Firebase...</p>
        </div>
      </div>
    )
  }

  // Show error state
  if (loadingError) {
    return (
      <div className="h-screen bg-white flex flex-col items-center justify-center p-4">
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

  // Show loading if no game data
  if (!gameData) {
    return (
      <div className="h-screen bg-white flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-4xl mb-4">🎯</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">جاري إعداد اللعبة...</h2>
          <p className="text-gray-600">Preparing game data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-white flex flex-col" ref={containerRef}>
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

          <div className="flex items-center">
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
        className="flex-1 bg-white flex flex-col items-center justify-center"
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
                        height: `${Math.max(18, Math.min(30, styles.cardHeight * 0.06))}px`,
                        width: `${styles.cardWidth}px`,
                        margin: '0',
                        padding: `0 ${styles.isUltraNarrow ? 4 : 8}px`,
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
      <div ref={footerRef} className="bg-white border-t-2 border-gray-200 p-2 flex-shrink-0 sticky bottom-0 z-10">
        <div className="flex justify-between items-center max-w-6xl mx-auto">
          {/* Team 1 Controls (Left) */}
          <div className="flex items-center gap-2">
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
              className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
              style={{
                width: `${styles.footerButtonSize}px`,
                height: `${styles.footerButtonSize}px`,
                fontSize: `${styles.headerFontSize}px`
              }}
            >
              -
            </button>
            <div
              className="bg-white border-2 border-gray-300 rounded-full flex items-center justify-center font-bold"
              style={{
                width: `${styles.footerButtonSize * 1.3}px`,
                height: `${styles.footerButtonSize * 1.3}px`,
                fontSize: `${styles.headerFontSize}px`
              }}
            >
              {gameState.team1.score}
            </div>
            <button
              onClick={() => setGameState(prev => ({
                ...prev,
                team1: { ...prev.team1, score: prev.team1.score + 100 }
              }))}
              className="bg-green-500 hover:bg-green-600 text-white rounded-full font-bold transition-colors"
              style={{
                width: `${styles.footerButtonSize}px`,
                height: `${styles.footerButtonSize}px`,
                fontSize: `${styles.headerFontSize}px`
              }}
            >
              +
            </button>
            {/* Team 1 Perks - Right of score */}
            <div className="flex items-center gap-1">
              <div
                className="w-6 h-6 bg-gray-200 border border-gray-300 rounded-md flex items-center justify-center text-xs text-gray-500 cursor-pointer hover:bg-gray-300 transition-colors"
                onClick={() => handlePerkClick('double', 'team1')}
              >
                ×2
              </div>
              <div
                className="w-6 h-6 bg-gray-200 border border-gray-300 rounded-md flex items-center justify-center text-xs text-gray-500 cursor-pointer hover:bg-gray-300 transition-colors"
                onClick={() => handlePerkClick('phone', 'team1')}
              >
                📞
              </div>
              <div
                className="w-6 h-6 bg-gray-200 border border-gray-300 rounded-md flex items-center justify-center text-xs text-gray-500 cursor-pointer hover:bg-gray-300 transition-colors"
                onClick={() => handlePerkClick('search', 'team1')}
              >
                🔍
              </div>
            </div>
          </div>

          {/* Center divider */}
          <div className="flex-1 flex justify-center items-center">
            <div className="w-0.5 h-12 bg-red-600"></div>
          </div>

          {/* Team 2 Controls (Right) */}
          <div className="flex items-center gap-2">
            {/* Team 2 Perks - Left of score */}
            <div className="flex items-center gap-1">
              <div
                className="w-6 h-6 bg-gray-200 border border-gray-300 rounded-md flex items-center justify-center text-xs text-gray-500 cursor-pointer hover:bg-gray-300 transition-colors"
                onClick={() => handlePerkClick('double', 'team2')}
              >
                ×2
              </div>
              <div
                className="w-6 h-6 bg-gray-200 border border-gray-300 rounded-md flex items-center justify-center text-xs text-gray-500 cursor-pointer hover:bg-gray-300 transition-colors"
                onClick={() => handlePerkClick('phone', 'team2')}
              >
                📞
              </div>
              <div
                className="w-6 h-6 bg-gray-200 border border-gray-300 rounded-md flex items-center justify-center text-xs text-gray-500 cursor-pointer hover:bg-gray-300 transition-colors"
                onClick={() => handlePerkClick('search', 'team2')}
              >
                🔍
              </div>
            </div>
            <button
              onClick={() => setGameState(prev => ({
                ...prev,
                team2: { ...prev.team2, score: Math.max(0, prev.team2.score - 100) }
              }))}
              className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
              style={{
                width: `${styles.footerButtonSize}px`,
                height: `${styles.footerButtonSize}px`,
                fontSize: `${styles.headerFontSize}px`
              }}
            >
              -
            </button>
            <div
              className="bg-white border-2 border-gray-300 rounded-full flex items-center justify-center font-bold"
              style={{
                width: `${styles.footerButtonSize * 1.3}px`,
                height: `${styles.footerButtonSize * 1.3}px`,
                fontSize: `${styles.headerFontSize}px`
              }}
            >
              {gameState.team2.score}
            </div>
            <button
              onClick={() => setGameState(prev => ({
                ...prev,
                team2: { ...prev.team2, score: prev.team2.score + 100 }
              }))}
              className="bg-green-500 hover:bg-green-600 text-white rounded-full font-bold transition-colors"
              style={{
                width: `${styles.footerButtonSize}px`,
                height: `${styles.footerButtonSize}px`,
                fontSize: `${styles.headerFontSize}px`
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
        maxUses={3}
      />
    </div>
  )
}

export default GameBoard