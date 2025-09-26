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
  const footerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)
  const [footerHeight, setFooterHeight] = useState(0)

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

      if (footerRef.current) {
        const footerRect = footerRef.current.getBoundingClientRect()
        setFooterHeight(footerRect.height)
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

  // Calculate responsive styles based on dimensions
  const calculateStyles = () => {
    const { width: W, height: H } = dimensions
    if (!W || !H) return { headerFontSize: 16, footerButtonSize: 40 }

    const actualHeaderHeight = headerHeight || 80
    const actualFooterHeight = footerHeight || 100

    const headerFontSize = Math.max(12, Math.min(24, W * 0.02))
    const footerButtonSize = Math.max(30, Math.min(60, H * 0.08))

    return {
      headerFontSize: headerFontSize,
      footerButtonSize: footerButtonSize,
    }
  }

  const styles = calculateStyles()

  return (
    <div ref={containerRef} className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-red-900 flex flex-col">
      {/* Header - Copy from GameBoard */}
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

      {/* Main Content - Full Screen with Header/Footer */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white flex-1 overflow-hidden" style={{ border: '3px solid #dc2626' }}>
          {/* Main Content Area - Full Height Split Layout */}
          <div className="flex flex-1">
            {/* Left Side - Teams - Fixed Width - Full Height */}
            <div className="w-80 flex flex-col flex-shrink-0 h-full">
              {/* Team 1 */}
              <div className="flex-1 bg-red-600 text-white p-6 flex flex-col items-center justify-center">
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="text-3xl font-bold mb-6">{gameState.team1.name}</div>
                  <div className="text-8xl font-bold mb-6">{gameState.team1.score}</div>
                  <div className="text-xl mb-8">وسائل المساعدة</div>
                  <div className="flex gap-6">
                    <div className="bg-white bg-opacity-20 rounded-full w-16 h-16 flex items-center justify-center text-2xl">⏰</div>
                    <div className="bg-white bg-opacity-20 rounded-full w-16 h-16 flex items-center justify-center text-2xl">📞</div>
                    <div className="bg-white bg-opacity-20 rounded-full w-16 h-16 flex items-center justify-center text-2xl">🙋</div>
                  </div>
                </div>
              </div>

              {/* Team 2 */}
              <div className="flex-1 bg-red-600 text-white p-6 flex flex-col items-center justify-center">
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="text-3xl font-bold mb-6">{gameState.team2.name}</div>
                  <div className="text-8xl font-bold mb-6">{gameState.team2.score}</div>
                  <div className="text-xl mb-8">وسائل المساعدة</div>
                  <div className="flex gap-6">
                    <div className="bg-white bg-opacity-20 rounded-full w-16 h-16 flex items-center justify-center text-2xl">⏰</div>
                    <div className="bg-white bg-opacity-20 rounded-full w-16 h-16 flex items-center justify-center text-2xl">📞</div>
                    <div className="bg-white bg-opacity-20 rounded-full w-16 h-16 flex items-center justify-center text-2xl">🙋</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Question and Image */}
            <div className="flex-1 pt-4 px-4 pb-2 flex flex-col relative">
              <div className="bg-white rounded-2xl border-4 border-red-600 flex flex-col overflow-hidden" style={{ outline: '2px solid #dc2626', outlineOffset: '2px', height: '60vh', minHeight: '60vh', maxHeight: '60vh' }}>
                {!showAnswer ? (
                  <>
                    {/* Timer Section */}
                    <div className="flex justify-center pt-4 pb-2">
                      <div className={`${getTimerBg()} hover:opacity-90 text-white font-bold py-4 px-4 rounded-full text-lg shadow-lg border-2 border-white flex items-center gap-3`} style={{ width: '200px', minWidth: '200px' }}>
                        <button
                          onClick={() => setTimerActive(!timerActive)}
                          className="hover:bg-gray-700 rounded transition-colors text-2xl flex-shrink-0"
                        >
                          {timerActive ? '❚❚' : '▶'}
                        </button>
                        <div className="font-bold text-center flex-1">
                          {String(Math.floor(timeElapsed / 60)).padStart(2, '0')}:{String(timeElapsed % 60).padStart(2, '0')}
                        </div>
                        <button
                          onClick={() => setTimeElapsed(0)}
                          className="hover:bg-gray-700 rounded transition-colors text-2xl flex-shrink-0"
                        >
                          ⟳
                        </button>
                      </div>
                    </div>

                    <div className="py-1 px-2 flex items-center justify-center">
                      <h2 className="text-xl font-bold text-gray-800 text-center" dir="rtl">
                        {currentQuestion.question?.text || currentQuestion.text}
                      </h2>
                    </div>

                    {/* Question Image Area - Fixed Height */}
                    <div className="flex-1 flex items-start justify-center px-4 pt-1" style={{ minHeight: '35vh', height: '35vh' }}>
                      {currentQuestion.question?.imageUrl ? (
                        <img
                          src={currentQuestion.question.imageUrl}
                          alt="سؤال"
                          className="rounded-lg"
                          style={{
                            maxWidth: '60%',
                            maxHeight: '70%',
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
                    <div className="pt-8 pb-4 px-2 flex items-center justify-center">
                      <h2 className="text-xl font-bold text-black text-center" dir="rtl">
                        {currentQuestion.question?.answer || currentQuestion.answer}
                      </h2>
                    </div>

                    {/* Answer Image Area - Fixed Height */}
                    <div className="flex-1 flex items-start justify-center px-4 pt-1" style={{ minHeight: '35vh', height: '35vh' }}>
                      {(currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || currentQuestion.question?.imageUrl) ? (
                        <img
                          src={currentQuestion.question?.answerImageUrl || currentQuestion.answerImageUrl || currentQuestion.question?.imageUrl}
                          alt="إجابة"
                          className="rounded-lg"
                          style={{
                            maxWidth: '60%',
                            maxHeight: '70%',
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
                    <div className="flex-1 flex items-center justify-center p-8">
                      <div className="text-center">
                        <h3 className="text-4xl font-bold text-gray-800 mb-12" dir="rtl">منو جاوب صح؟</h3>
                        <div className="grid grid-cols-3 gap-6 max-w-4xl mx-auto">
                          <button
                            onClick={() => handleScoreTeam('team1')}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-6 px-8 rounded-xl text-2xl"
                          >
                            {gameState.team1.name}
                            <div className="text-lg opacity-75">+{currentQuestion.points} نقطة</div>
                          </button>
                          <button
                            onClick={handleNoAnswer}
                            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-6 px-8 rounded-xl text-2xl"
                          >
                            لا أحد أجاب
                            <div className="text-lg opacity-75">+0 نقطة</div>
                          </button>
                          <button
                            onClick={() => handleScoreTeam('team2')}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-6 px-8 rounded-xl text-2xl"
                          >
                            {gameState.team2.name}
                            <div className="text-lg opacity-75">+{currentQuestion.points} نقطة</div>
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
                  className="absolute bottom-0 left-6 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-full text-lg shadow-lg border-2 border-white z-10"
                  style={{ transform: 'translateY(-1.5px)' }}
                >
                  الإجابة
                </button>
              )}

              {/* منو جاوب صح Button - When showing answer */}
              {showAnswer && !showScoring && (
                <button
                  onClick={handleShowScoring}
                  className="absolute bottom-0 left-6 bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-8 rounded-full text-lg shadow-lg border-2 border-white z-10"
                  style={{ transform: 'translateY(-1.5px)' }}
                >
                  منو جاوب صح؟
                </button>
              )}

              {/* الرجوع للإجابة Button - When showing scoring */}
              {showScoring && (
                <button
                  onClick={() => setShowScoring(false)}
                  className="absolute bottom-0 left-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-full text-lg shadow-lg border-2 border-white z-10"
                  style={{ transform: 'translateY(-1.5px)' }}
                >
                  الرجوع للإجابة
                </button>
              )}

              {/* Points Display - Top right corner */}
              <div
                className="absolute top-0 right-6 bg-blue-600 text-white font-bold py-4 px-8 rounded-full text-lg shadow-lg border-2 border-white z-10"
                style={{ transform: 'translateY(-1.5px)' }}
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
                  className="absolute bottom-0 right-6 bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 px-8 rounded-full text-lg shadow-lg border-2 border-white z-10"
                  style={{ transform: 'translateY(-1.5px)' }}
                >
                  الرجوع للسؤال
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Footer - Copy from GameBoard */}
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
                team1: { ...prev.team1, score: Math.max(0, prev.team1.score - 10) }
              }))}
              className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors flex items-center justify-center"
              style={{
                width: `${styles.footerButtonSize}px`,
                height: `${styles.footerButtonSize}px`,
                fontSize: `${styles.headerFontSize}px`
              }}
            >
              -
            </button>
            <div
              className="bg-gray-100 border-2 border-gray-300 rounded-full flex items-center justify-center font-bold text-gray-800"
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
                team1: { ...prev.team1, score: prev.team1.score + 10 }
              }))}
              className="bg-green-500 hover:bg-green-600 text-white rounded-full font-bold transition-colors flex items-center justify-center"
              style={{
                width: `${styles.footerButtonSize}px`,
                height: `${styles.footerButtonSize}px`,
                fontSize: `${styles.headerFontSize}px`
              }}
            >
              +
            </button>
          </div>

          {/* Team 2 Controls (Right) */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGameState(prev => ({
                ...prev,
                team2: { ...prev.team2, score: Math.max(0, prev.team2.score - 10) }
              }))}
              className="bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors flex items-center justify-center"
              style={{
                width: `${styles.footerButtonSize}px`,
                height: `${styles.footerButtonSize}px`,
                fontSize: `${styles.headerFontSize}px`
              }}
            >
              -
            </button>
            <div
              className="bg-gray-100 border-2 border-gray-300 rounded-full flex items-center justify-center font-bold text-gray-800"
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
                team2: { ...prev.team2, score: prev.team2.score + 10 }
              }))}
              className="bg-green-500 hover:bg-green-600 text-white rounded-full font-bold transition-colors flex items-center justify-center"
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
    </div>
  )
}

export default QuestionView