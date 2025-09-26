import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import PresentationModeToggle from '../components/PresentationModeToggle'

function QuestionView({ gameState, setGameState }) {
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showScoring, setShowScoring] = useState(false)
  const [timerActive, setTimerActive] = useState(true)
  const navigate = useNavigate()
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)

  const { currentQuestion } = gameState

  useEffect(() => {
    if (!currentQuestion) {
      navigate('/game')
      return
    }

    // Reset timer when question changes
    setTimeElapsed(0)
    setShowAnswer(false)
    setShowScoring(false)
    setTimerActive(true)

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

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [currentQuestion, navigate])

  useEffect(() => {
    if (!timerActive) return

    const timer = setInterval(() => {
      setTimeElapsed(prev => prev + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [timerActive])

  const handleShowAnswer = () => {
    setShowAnswer(true)
    setTimerActive(false)
  }

  const handleShowScoring = () => {
    setShowScoring(true)
  }

  const handleScoreTeam = (teamKey) => {
    console.log('🎯 Scoring team:', teamKey)
    console.log('📝 Marking question as used:', currentQuestion.questionKey)
    console.log('🔍 Current question:', currentQuestion)

    // Award points to the specified team
    setGameState(prev => {
      const newUsedQuestions = new Set([...prev.usedQuestions, currentQuestion.questionKey])
      const newUsedPointValues = new Set([...(prev.usedPointValues || []), currentQuestion.pointValueKey])

      console.log('✅ New used questions set:', Array.from(newUsedQuestions))
      console.log('✅ New used point values set:', Array.from(newUsedPointValues))

      return {
        ...prev,
        [teamKey]: {
          ...prev[teamKey],
          score: prev[teamKey].score + currentQuestion.points
        },
        usedQuestions: newUsedQuestions,
        usedPointValues: newUsedPointValues,
        gameHistory: [
          ...prev.gameHistory,
          {
            question: currentQuestion.text,
            answer: currentQuestion.answer,
            points: currentQuestion.points,
            difficulty: currentQuestion.difficulty,
            category: currentQuestion.categoryId,
            winner: teamKey,
            timestamp: Date.now()
          }
        ]
      }
    })

    // Return to game board
    navigate('/game')
  }

  const handleNoAnswer = () => {
    console.log('❌ No answer - marking question as used:', currentQuestion.questionKey)

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
        gameHistory: [
          ...prev.gameHistory,
          {
            question: currentQuestion.text,
            answer: currentQuestion.answer,
            points: currentQuestion.points,
            difficulty: currentQuestion.difficulty,
            category: currentQuestion.categoryId,
            winner: null,
            timestamp: Date.now()
          }
        ]
      }
    })

    // Return to game board
    navigate('/game')
  }

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
    const isUltraNarrow = W < 400 // Very narrow phones in portrait
    const isMobileLayout = W < 768
    const isLandscape = W > safeHeight // Landscape orientation
    const isShortScreen = safeHeight < 500 // Z Fold and short screens - height-based detection!
    const isTallScreen = safeHeight > 900 // Tall screens can use more space
    console.log('DEVICE DEBUG: W =', W, 'safeHeight =', safeHeight, 'isShortScreen =', isShortScreen)

    // More accurate space calculation
    const actualHeaderHeight = headerHeight || 80
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

    // Adjust question area for different devices
    let questionAreaHeight
    if (isShortScreen) {
      // Z Fold and short screens - use smaller percentage to prevent overflow
      questionAreaHeight = Math.min(availableHeight * 0.75, 250)
      console.log('SHORT SCREEN DEBUG: availableHeight =', availableHeight, 'questionAreaHeight =', questionAreaHeight)
    } else {
      // Other devices - maximize space
      questionAreaHeight = Math.min(availableHeight * 0.95, 500)
    }
    const questionAreaWidth = '100%'

    // Timer scaling - globally scaled with minimum viable size
    const baseTimerSize = Math.max(140, Math.min(200, W * 0.12))
    const timerSize = Math.round(baseTimerSize * globalScaleFactor)
    const timerFontSize = Math.max(10, Math.min(18, timerSize * 0.08))
    const timerEmojiSize = Math.max(16, Math.min(24, timerSize * 0.1))

    // Text scaling - globally scaled based on screen type
    let baseFontSize
    if (isUltraNarrow) {
      baseFontSize = Math.max(10, Math.min(16, W * 0.03))
    } else if (isMobileLayout) {
      baseFontSize = Math.max(12, Math.min(20, W * 0.025))
    } else {
      baseFontSize = Math.max(14, Math.min(24, W * 0.02))
    }

    const questionFontSize = Math.round(baseFontSize * globalScaleFactor)
    const answerFontSize = Math.round(baseFontSize * globalScaleFactor)

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

    const buttonFontSize = Math.round(baseButtonFontSize * globalScaleFactor)
    const buttonPadding = Math.round(baseButtonPadding * globalScaleFactor)

    // Universal image area scaling - adaptive to available space
    const imageAreaPercentage = Math.max(0.15, Math.min(0.4, 0.2 + (globalScaleFactor - 0.8) * 0.15))
    const imageAreaHeight = Math.max(60, Math.round(questionAreaHeight * imageAreaPercentage))

    // Team section scaling - keep Z Fold working, fix others
    let teamSectionWidth
    if (isUltraNarrow) {
      teamSectionWidth = Math.max(120, Math.min(160, W * 0.4)) // Z Fold settings - don't touch!
    } else if (isMobileLayout) {
      teamSectionWidth = Math.max(120, Math.min(160, W * 0.25))
    } else {
      teamSectionWidth = Math.max(140, Math.min(200, W * 0.2))
    }
    // Keep team section stable
    teamSectionWidth = Math.round(teamSectionWidth)

    // Team text scaling - keep readable, minimal height scaling
    const teamNameFontSize = Math.max(12, Math.min(22, teamSectionWidth * 0.08))
    const teamScoreFontSize = Math.max(20, Math.min(65, teamSectionWidth * 0.23))
    const teamHelpFontSize = Math.max(9, Math.min(15, teamSectionWidth * 0.055))
    const teamIconSize = Math.max(20, Math.min(45, teamSectionWidth * 0.14))

    // Header scaling - globally scaled
    const baseHeaderFont = Math.max(8, Math.min(16, W * 0.015))
    const headerFontSize = Math.round(baseHeaderFont * globalScaleFactor)
    const footerButtonSize = Math.max(20, Math.min(60, safeHeight * 0.05))

    // Scoring section scaling - globally scaled and space-efficient
    const baseScoreWidth = Math.max(60, Math.min(140, availableWidth * 0.18))
    const baseScoreHeight = Math.max(30, Math.min(70, availableHeight * 0.06))
    const baseScoreFont = Math.max(8, Math.min(16, baseScoreWidth * 0.08))

      const scoringButtonWidth = Math.round(baseScoreWidth * globalScaleFactor)
      const scoringButtonHeight = Math.round(baseScoreHeight * globalScaleFactor)
      const scoringFontSize = Math.round(baseScoreFont * globalScaleFactor)

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

  const styles = getResponsiveStyles()

  return (
    <div ref={containerRef} className="bg-gradient-to-br from-blue-900 via-purple-900 to-red-900 flex flex-col" style={{
      minHeight: '100vh'
    }}>
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
      <div className="flex-1 flex flex-col">
        <div className="bg-white flex-1 flex">
          {/* Main Content Area - Full Height Split Layout */}
          <div className="flex flex-1 h-full">
            {/* Left Side - Teams - Responsive Width - Full Height */}
            <div className="flex flex-col flex-shrink-0 h-full" style={{ width: `${styles.teamSectionWidth}px` }}>
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
                    fontSize: `${styles.teamNameFontSize}px`,
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
                    <div className="bg-white bg-opacity-20 rounded-full flex items-center justify-center" style={{
                      width: `${styles.teamIconSize}px`,
                      height: `${styles.teamIconSize}px`,
                      fontSize: `${styles.teamIconSize * 0.6}px`
                    }}>⏰</div>
                    <div className="bg-white bg-opacity-20 rounded-full flex items-center justify-center" style={{
                      width: `${styles.teamIconSize}px`,
                      height: `${styles.teamIconSize}px`,
                      fontSize: `${styles.teamIconSize * 0.6}px`
                    }}>📞</div>
                    <div className="bg-white bg-opacity-20 rounded-full flex items-center justify-center" style={{
                      width: `${styles.teamIconSize}px`,
                      height: `${styles.teamIconSize}px`,
                      fontSize: `${styles.teamIconSize * 0.6}px`
                    }}>🙋</div>
                  </div>
                </div>
              </div>

              {/* Team 2 */}
              <div className="flex-1 bg-red-600 text-white flex flex-col items-center justify-center rounded-bl-3xl" style={{ padding: `${Math.max(2, styles.buttonPadding * 0.25)}px` }}>
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="font-bold text-center" style={{
                    fontSize: `${styles.teamNameFontSize}px`,
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
                    <div className="bg-white bg-opacity-20 rounded-full flex items-center justify-center" style={{
                      width: `${styles.teamIconSize}px`,
                      height: `${styles.teamIconSize}px`,
                      fontSize: `${styles.teamIconSize * 0.6}px`
                    }}>⏰</div>
                    <div className="bg-white bg-opacity-20 rounded-full flex items-center justify-center" style={{
                      width: `${styles.teamIconSize}px`,
                      height: `${styles.teamIconSize}px`,
                      fontSize: `${styles.teamIconSize * 0.6}px`
                    }}>📞</div>
                    <div className="bg-white bg-opacity-20 rounded-full flex items-center justify-center" style={{
                      width: `${styles.teamIconSize}px`,
                      height: `${styles.teamIconSize}px`,
                      fontSize: `${styles.teamIconSize * 0.6}px`
                    }}>🙋</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Question and Image */}
            <div className="flex-1 flex flex-col relative h-full" style={{ padding: `${Math.max(8, styles.buttonPadding * 0.75)}px` }}>
              <div className="bg-white rounded-2xl border-4 border-red-600 flex flex-col relative" style={{
                outline: '2px solid #dc2626',
                outlineOffset: '2px',
                height: `${styles.questionAreaHeight}px`
              }}>
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

                    <div className="flex items-center justify-center" style={{ padding: `${Math.max(1, styles.buttonPadding * 0.03125)}px ${Math.max(2, styles.buttonPadding * 0.0625)}px` }}>
                      <h2 className="font-bold text-gray-800 text-center" dir="rtl" style={{ fontSize: `${styles.questionFontSize}px` }}>
                        {currentQuestion.question?.text || currentQuestion.text}
                      </h2>
                    </div>

                    {/* Question Image Area - Fixed Height */}
                    <div className="flex-1 flex items-start justify-center" style={{
                      minHeight: `${styles.imageAreaHeight}px`,
                      height: `${styles.imageAreaHeight}px`,
                      paddingLeft: `${Math.max(1, styles.buttonPadding * 0.125)}px`,
                      paddingRight: `${Math.max(1, styles.buttonPadding * 0.125)}px`,
                      paddingTop: `${Math.max(1, styles.buttonPadding * 0.03125)}px`
                    }}>
                      {currentQuestion.question?.imageUrl ? (
                        <img
                          src={currentQuestion.question.imageUrl}
                          alt="سؤال"
                          className="rounded-lg"
                          style={{
                            maxWidth: '50%',
                            maxHeight: '60%',
                            width: 'auto',
                            height: 'auto',
                            objectFit: 'contain'
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full"></div>
                      )}
                    </div>
                  </>
                ) : showAnswer && !showScoring ? (
                  <>
                    {/* Answer Section */}
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
                    <div className="flex-1 flex items-start justify-center pt-1" style={{
                      minHeight: `${styles.imageAreaHeight}px`,
                      height: `${styles.imageAreaHeight}px`,
                      paddingLeft: `${styles.buttonPadding * 0.25}px`,
                      paddingRight: `${styles.buttonPadding * 0.25}px`
                    }}>
                      {(currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || currentQuestion.question?.imageUrl) ? (
                        <img
                          src={currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || currentQuestion.question?.imageUrl}
                          alt="إجابة"
                          className="rounded-lg"
                          style={{
                            maxWidth: '50%',
                            maxHeight: '60%',
                            width: 'auto',
                            height: 'auto',
                            objectFit: 'contain'
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full"></div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Scoring Section */}
                    <div className="flex-1 flex items-center justify-center" style={{ padding: `${styles.buttonPadding * 0.5}px` }}>
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
                  </>
                )}
              </div>

              {/* الإجابة Button - Overlapping left bottom corner */}
              {!showAnswer && (
                <button
                  onClick={handleShowAnswer}
                  className="absolute bg-green-600 hover:bg-green-700 text-white font-bold rounded-full shadow-lg border-2 border-white z-10"
                  style={{
                    left: `${styles.buttonPadding}px`,
                    top: `${styles.questionAreaHeight - 25}px`,
                    fontSize: `${styles.buttonFontSize}px`,
                    padding: `${styles.buttonPadding * 0.5}px ${styles.buttonPadding}px`
                  }}
                >
                  الإجابة
                </button>
              )}

              {/* منو جاوب صح Button - When showing answer */}
              {showAnswer && !showScoring && (
                <button
                  onClick={handleShowScoring}
                  className="absolute bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-full shadow-lg border-2 border-white z-10"
                  style={{
                    left: `${styles.buttonPadding}px`,
                    top: `${styles.questionAreaHeight - 25}px`,
                    fontSize: `${styles.buttonFontSize}px`,
                    padding: `${styles.buttonPadding * 0.5}px ${styles.buttonPadding}px`
                  }}
                >
                  منو جاوب صح؟
                </button>
              )}

              {/* الرجوع للإجابة Button - When showing scoring */}
              {showScoring && (
                <button
                  onClick={() => setShowScoring(false)}
                  className="absolute bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-lg border-2 border-white z-10"
                  style={{
                    left: `${styles.buttonPadding}px`,
                    top: `${styles.questionAreaHeight - 25}px`,
                    fontSize: `${styles.buttonFontSize}px`,
                    padding: `${styles.buttonPadding * 0.5}px ${styles.buttonPadding}px`
                  }}
                >
                  الرجوع للإجابة
                </button>
              )}

              {/* Points Display - Top right corner */}
              <div
                className="absolute bg-blue-600 text-white font-bold rounded-full shadow-lg border-2 border-white z-10"
                style={{
                  right: `${styles.buttonPadding}px`,
                  top: `${Math.max(-15, -10) + 10}px`,
                  fontSize: `${styles.buttonFontSize}px`,
                  padding: `${styles.buttonPadding * 0.5}px ${styles.buttonPadding}px`
                }}
              >
                {currentQuestion.points} نقطة
              </div>

              {/* الرجوع للسؤال Button - Bottom right corner when showing answer or scoring */}
              {(showAnswer || showScoring) && (
                <button
                  onClick={() => {
                    setShowAnswer(false)
                    setShowScoring(false)
                  }}
                  className="absolute bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-full shadow-lg border-2 border-white z-10"
                  style={{
                    right: `${styles.buttonPadding}px`,
                    top: `${styles.questionAreaHeight - 25}px`,
                    fontSize: `${styles.buttonFontSize}px`,
                    padding: `${styles.buttonPadding * 0.5}px ${styles.buttonPadding}px`
                  }}
                >
                  الرجوع للسؤال
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}

export default QuestionView