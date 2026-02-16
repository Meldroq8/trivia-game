import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import RasbrasService from '../services/rasbrasService'
import LogoDisplay from '../components/LogoDisplay'
import { devLog, prodError } from '../utils/devLog'

function RasbrasGame() {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sessionEnded, setSessionEnded] = useState(false)

  // Player state
  const [playerId] = useState(() => RasbrasService.generatePlayerId())
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [isReady, setIsReady] = useState(false)

  // Quiz state
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [finished, setFinished] = useState(false)
  const [answerFeedback, setAnswerFeedback] = useState(null) // { index, correct }
  const [timeRemaining, setTimeRemaining] = useState(30)
  const [gameActive, setGameActive] = useState(false)

  // Refs
  const heartbeatIntervalRef = useRef(null)
  const timerIntervalRef = useRef(null)
  const gameStartTimeRef = useRef(null)

  // Subscribe to session data
  useEffect(() => {
    devLog('⚡ RasbrasGame: Subscribing to session:', sessionId)

    const unsubscribe = RasbrasService.subscribeToSession(sessionId, (sessionData) => {
      if (!sessionData) {
        setSessionEnded(true)
        setLoading(false)
        return
      }

      if (sessionData.status === 'finished') {
        setSessionEnded(true)
        setLoading(false)
        return
      }

      // Valid active session
      setSessionEnded(false)
      setSession(sessionData)
      setLoading(false)

      // Check if this player is already in a team
      if (sessionData.teamAPlayerId === playerId) {
        setSelectedTeam('A')
        setIsReady(sessionData.teamAReady)
      } else if (sessionData.teamBPlayerId === playerId) {
        setSelectedTeam('B')
        setIsReady(sessionData.teamBReady)
      }

      // Track game start for timer
      if (sessionData.status === 'playing' && sessionData.gameStartedAt && !gameStartTimeRef.current) {
        const startTime = sessionData.gameStartedAt?.toDate ? sessionData.gameStartedAt.toDate() : new Date(sessionData.gameStartedAt)
        gameStartTimeRef.current = startTime
        setGameActive(true)
      }
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [sessionId, playerId])

  // Timer countdown
  useEffect(() => {
    if (!gameActive || finished) return

    timerIntervalRef.current = setInterval(() => {
      if (!gameStartTimeRef.current) return

      const elapsed = (Date.now() - gameStartTimeRef.current.getTime()) / 1000
      const remaining = Math.max(0, 30 - elapsed)
      setTimeRemaining(Math.ceil(remaining))

      if (remaining <= 0) {
        // Time's up - mark as finished
        setFinished(true)
        setGameActive(false)
        clearInterval(timerIntervalRef.current)
      }
    }, 100)

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [gameActive, finished])

  // Heartbeat system
  useEffect(() => {
    if (!selectedTeam || !sessionId) return

    heartbeatIntervalRef.current = setInterval(() => {
      RasbrasService.sendHeartbeat(sessionId, selectedTeam)
    }, 2000)

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }
  }, [selectedTeam, sessionId])

  // Handle team selection
  const handleSelectTeam = async (team) => {
    try {
      await RasbrasService.joinTeam(sessionId, team, playerId)
      setSelectedTeam(team)
      setIsReady(false)
    } catch (err) {
      prodError('Error selecting team:', err)
      setError('حدث خطأ. يرجى المحاولة مرة أخرى')
    }
  }

  // Handle ready button
  const handleReady = async () => {
    if (!selectedTeam) return

    // Check if both players are in the same team
    if (selectedTeam === 'A' && session?.teamBPlayerId === null) {
      // Check if someone else is in team A
      if (session?.teamAPlayerId && session.teamAPlayerId !== playerId) {
        setError('يجب أن يكون هناك لاعب في كل فريق')
        return
      }
    }
    if (selectedTeam === 'B' && session?.teamAPlayerId === null) {
      if (session?.teamBPlayerId && session.teamBPlayerId !== playerId) {
        setError('يجب أن يكون هناك لاعب في كل فريق')
        return
      }
    }

    // Check that both teams have players
    const teamAHasPlayer = session?.teamAPlayerId !== null
    const teamBHasPlayer = session?.teamBPlayerId !== null

    if (!teamAHasPlayer || !teamBHasPlayer) {
      setError('يجب أن يكون هناك لاعب في كل فريق')
      setTimeout(() => setError(''), 3000)
      return
    }

    try {
      await RasbrasService.markReady(sessionId, selectedTeam)
      setIsReady(true)
    } catch (err) {
      prodError('Error marking ready:', err)
      setError('حدث خطأ. يرجى المحاولة مرة أخرى')
    }
  }

  // Handle answer selection
  const handleSelectAnswer = useCallback(async (optionIndex) => {
    if (answerFeedback || finished || !session?.questions) return

    const questions = session.questions
    const currentQuestion = questions[currentQIndex]
    if (!currentQuestion) return

    const selectedOption = currentQuestion.options[optionIndex]
    const isCorrect = selectedOption === currentQuestion.answer

    // Show feedback
    setAnswerFeedback({ index: optionIndex, correct: isCorrect })

    // Submit to Firestore
    try {
      await RasbrasService.submitAnswer(sessionId, selectedTeam, currentQIndex, selectedOption)
    } catch (err) {
      prodError('Error submitting answer:', err)
    }

    // Auto-advance after feedback delay
    setTimeout(() => {
      const nextQ = currentQIndex + 1
      if (isCorrect) {
        setCorrectCount(prev => prev + 1)
      }

      if (nextQ >= questions.length) {
        setFinished(true)
        setGameActive(false)
      } else {
        setCurrentQIndex(nextQ)
      }
      setAnswerFeedback(null)
    }, 500)
  }, [answerFeedback, finished, session?.questions, currentQIndex, sessionId, selectedTeam])

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f2e6] dark:bg-slate-900">
        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl p-6 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-3"></div>
          <h1 className="text-lg font-bold text-red-800 dark:text-red-400">جاري التحميل...</h1>
        </div>
      </div>
    )
  }

  // Session ended state
  if (sessionEnded) {
    return (
      <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="text-5xl mb-4">👋</div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">انتهت الجلسة</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">تم إنهاء هذه الجلسة من الشاشة الرئيسية</p>
          <button
            onClick={() => navigate('/')}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    )
  }

  // Error state (no session)
  if (error && !session) {
    return (
      <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">خطأ</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    )
  }

  // Finished state - waiting for result
  if (finished && isReady && session?.status === 'playing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col">
        <div className="bg-gradient-to-r from-red-600 to-red-700 py-2 px-4 flex items-center justify-between">
          <LogoDisplay />
          <div className="bg-white/20 rounded-full px-3 py-1">
            <span className="text-white font-bold text-xs">✓ {correctCount}/5</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">انتهيت!</h2>
            <p className="text-gray-600 mb-4">انتظر النتيجة...</p>
            <div className="bg-green-100 rounded-xl p-4">
              <p className="text-green-800 font-bold text-lg">
                إجابات صحيحة: {correctCount} من 5
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Playing state - show quiz
  if (isReady && session?.status === 'playing') {
    const questions = session.questions || []
    const currentQuestion = questions[currentQIndex]

    // No questions available - show error
    if (!questions.length || !currentQuestion) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col">
          <div className="bg-gradient-to-r from-red-600 to-red-700 py-2 px-4 flex justify-center">
            <LogoDisplay />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">لا توجد أسئلة</h2>
              <p className="text-gray-600">هذا السؤال لا يحتوي على أسئلة راس براس. يرجى إضافة الأسئلة من ملف Excel باستخدام أعمدة Question1-Question5.</p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 py-2 px-4 flex items-center justify-between">
          <LogoDisplay />
          <div className="bg-white/20 rounded-full px-3 py-1">
            <span className="text-white font-bold text-xs">✓ {correctCount}</span>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          {/* Timer above question */}
          <div className="flex justify-center mb-4">
            <div
              className={`rounded-full flex items-center justify-center border-2 ${
                timeRemaining <= 10
                  ? 'bg-red-500 border-red-400 animate-pulse'
                  : 'bg-white/20 border-white/30'
              }`}
              style={{ width: '56px', height: '56px' }}
            >
              <span className="text-white font-bold text-xl">{timeRemaining}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-md w-full">
            {/* Progress */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-bold text-gray-500">سؤال {currentQIndex + 1}/5</span>
              <div className="flex gap-1">
                {questions.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full ${
                      i < currentQIndex ? 'bg-green-500' :
                      i === currentQIndex ? 'bg-red-600' :
                      'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Question */}
            <div className="text-center mb-5">
              <h2 className="text-xl font-bold text-gray-900 leading-relaxed">
                {currentQuestion.question}
              </h2>
            </div>

            {/* Options */}
            <div className="flex flex-col gap-3">
              {currentQuestion.options.map((option, index) => {
                let bgClass = 'bg-gray-100 hover:bg-gray-200 text-gray-900 active:scale-[0.98]'

                if (answerFeedback !== null) {
                  if (index === answerFeedback.index) {
                    bgClass = answerFeedback.correct
                      ? 'bg-green-500 text-white scale-[1.02]'
                      : 'bg-red-500 text-white scale-[1.02]'
                  } else {
                    bgClass = 'bg-gray-100 text-gray-400'
                  }
                }

                return (
                  <button
                    key={index}
                    onClick={() => handleSelectAnswer(index)}
                    disabled={answerFeedback !== null}
                    className={`w-full py-3.5 px-4 rounded-xl font-bold text-lg transition-all duration-200 ${bgClass}`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Error Toast */}
        {error && (
          <div className="fixed bottom-4 left-4 right-4 bg-red-500 text-white p-3 rounded-lg text-center font-bold">
            {error}
          </div>
        )}
      </div>
    )
  }

  // Team Selection State (same pattern as HeadbandGame)
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 to-red-700 flex flex-col">
      {/* Header */}
      <div className="bg-black/20 py-3 px-4 flex justify-center">
        <LogoDisplay />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-w-lg w-full">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 text-center mb-6">
            اختر فريقك
          </h2>

          {/* Team Selection */}
          <div className="grid grid-cols-1 landscape:grid-cols-2 gap-4 mb-6">
            {/* Team A */}
            <div
              onClick={() => handleSelectTeam('A')}
              className={`relative cursor-pointer rounded-xl border-4 transition-all ${
                selectedTeam === 'A'
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
                  : session?.teamAPlayerId && session.teamAPlayerId !== playerId
                    ? 'border-gray-300 bg-gray-100 dark:bg-gray-700 opacity-50'
                    : 'border-gray-300 hover:border-red-400 bg-gray-50 dark:bg-slate-700'
              }`}
            >
              <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-600">
                <span className="font-bold text-lg text-gray-800 dark:text-gray-100">{session?.teamAName || 'الفريق 1'}</span>
                <button
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    selectedTeam === 'A'
                      ? 'bg-green-500 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  {selectedTeam === 'A' ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="p-4 min-h-[80px] flex items-center justify-center">
                {session?.teamAConnected ? (
                  <div className="text-center">
                    <div className="text-3xl mb-1">✅</div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {session.teamAPlayerId === playerId ? 'أنت هنا' : 'لاعب متصل'}
                    </span>
                    {session.teamAReady && (
                      <div className="text-green-600 font-bold text-sm mt-1">جاهز!</div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-400">
                    <div className="text-3xl mb-1">👤</div>
                    <span className="text-sm">في انتظار لاعب</span>
                  </div>
                )}
              </div>
            </div>

            {/* Team B */}
            <div
              onClick={() => handleSelectTeam('B')}
              className={`relative cursor-pointer rounded-xl border-4 transition-all ${
                selectedTeam === 'B'
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
                  : session?.teamBPlayerId && session.teamBPlayerId !== playerId
                    ? 'border-gray-300 bg-gray-100 dark:bg-gray-700 opacity-50'
                    : 'border-gray-300 hover:border-red-400 bg-gray-50 dark:bg-slate-700'
              }`}
            >
              <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-600">
                <span className="font-bold text-lg text-gray-800 dark:text-gray-100">{session?.teamBName || 'الفريق 2'}</span>
                <button
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    selectedTeam === 'B'
                      ? 'bg-green-500 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  {selectedTeam === 'B' ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="p-4 min-h-[80px] flex items-center justify-center">
                {session?.teamBConnected ? (
                  <div className="text-center">
                    <div className="text-3xl mb-1">✅</div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {session.teamBPlayerId === playerId ? 'أنت هنا' : 'لاعب متصل'}
                    </span>
                    {session.teamBReady && (
                      <div className="text-green-600 font-bold text-sm mt-1">جاهز!</div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-400">
                    <div className="text-3xl mb-1">👤</div>
                    <span className="text-sm">في انتظار لاعب</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ready Button */}
          {selectedTeam && !isReady && (
            <button
              onClick={handleReady}
              disabled={!session?.teamAConnected || !session?.teamBConnected}
              className={`w-full py-4 rounded-xl font-bold text-xl transition-all ${
                session?.teamAConnected && session?.teamBConnected
                  ? 'bg-green-600 hover:bg-green-700 text-white active:scale-95'
                  : 'bg-gray-400 text-gray-600 cursor-not-allowed'
              }`}
            >
              {session?.teamAConnected && session?.teamBConnected
                ? '✅ جاهز'
                : 'في انتظار اللاعب الآخر...'}
            </button>
          )}

          {/* Waiting for other player */}
          {isReady && session?.status === 'waiting' && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-4 border-green-600 mx-auto mb-2"></div>
              <p className="text-gray-600 dark:text-gray-400 font-bold">
                في انتظار اللاعب الآخر ليكون جاهزاً...
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg text-center">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default RasbrasGame
