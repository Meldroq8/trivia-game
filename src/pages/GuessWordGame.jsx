import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import GuessWordService from '../services/guessWordService'
import LogoDisplay from '../components/LogoDisplay'
import { devLog, prodError } from '../utils/devLog'

function GuessWordGame() {
  const { sessionId } = useParams()

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isReady, setIsReady] = useState(false)

  // Heartbeat interval ref
  const heartbeatIntervalRef = useRef(null)

  // Subscribe to session data
  useEffect(() => {
    if (!sessionId) {
      setError('رابط غير صالح')
      setLoading(false)
      return
    }

    devLog('🎯 GuessWordGame: Subscribing to session:', sessionId)

    const unsubscribe = GuessWordService.subscribeToSession(sessionId, (sessionData) => {
      if (!sessionData) {
        setError('الجلسة غير موجودة - تأكد من أن السؤال معروض على الشاشة الرئيسية')
        setLoading(false)
        return
      }

      if (sessionData.status === 'finished') {
        setError('انتهت هذه الجلسة')
        setLoading(false)
        return
      }

      setSession(sessionData)
      setIsReady(sessionData.playerReady || false)
      setLoading(false)
    })

    // Mark player as connected
    GuessWordService.markConnected(sessionId).catch(err => {
      devLog('Error marking connected:', err)
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [sessionId])

  // Heartbeat system
  useEffect(() => {
    if (!sessionId) return

    heartbeatIntervalRef.current = setInterval(() => {
      GuessWordService.sendHeartbeat(sessionId)
    }, 3000)

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }
  }, [sessionId])

  // Handle ready button
  const handleReady = async () => {
    try {
      await GuessWordService.markReady(sessionId)
      setIsReady(true)
    } catch (err) {
      prodError('Error marking ready:', err)
      setError('حدث خطأ. يرجى المحاولة مرة أخرى')
    }
  }

  // Handle counter increment
  const handleIncrementCounter = async () => {
    if (!session || session.questionCount >= GuessWordService.MAX_QUESTIONS) return

    try {
      await GuessWordService.incrementCounter(sessionId)
    } catch (err) {
      prodError('Error incrementing counter:', err)
    }
  }

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

  // Error state
  if (error && !session) {
    return (
      <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">خطأ</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
        </div>
      </div>
    )
  }

  // Playing state - show word and counter
  if (isReady && session?.status === 'playing') {
    const questionCount = session.questionCount || 0
    const maxQuestions = session.maxQuestions || 15
    const questionsRemaining = maxQuestions - questionCount

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 py-3 px-4 flex items-center justify-between">
          <LogoDisplay />
          <div className="bg-white/20 rounded-full px-4 py-2">
            <span className="text-white font-bold text-sm">
              {questionsRemaining > 0 ? `متبقي ${questionsRemaining} سؤال` : 'انتهت الأسئلة'}
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          {/* Word Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            {/* The Word */}
            <div className="text-center mb-6">
              <p className="text-sm text-gray-500 mb-2">الكلمة المطلوبة</p>
              <p className="text-4xl font-bold text-gray-900">
                {session.answer || 'جاري التحميل...'}
              </p>
            </div>

            {/* Counter Display */}
            <div className="text-center mb-6 bg-gray-100 rounded-xl p-4">
              <p className="text-sm font-bold text-gray-600 mb-2">عدد الأسئلة</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-5xl font-bold text-red-600">{questionCount}</span>
                <span className="text-3xl text-gray-400">/</span>
                <span className="text-3xl text-gray-600">{maxQuestions}</span>
              </div>
            </div>

            {/* Counter Button */}
            <button
              onClick={handleIncrementCounter}
              disabled={questionCount >= maxQuestions}
              className={`w-full py-5 rounded-xl font-bold text-xl transition-all ${
                questionCount >= maxQuestions
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white active:scale-95 shadow-lg'
              }`}
            >
              {questionCount >= maxQuestions ? (
                <span>انتهت الأسئلة ❌</span>
              ) : (
                <span>سؤال +1 ✋</span>
              )}
            </button>

            {/* Help Text */}
            <p className="text-center text-gray-500 text-sm mt-4">
              اضغط عند كل سؤال يسأله فريقك
            </p>
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

  // Waiting state - show ready button
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 to-red-700 flex flex-col">
      {/* Header */}
      <div className="bg-black/20 py-3 px-4 flex justify-center">
        <LogoDisplay />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-4">
            🎯 خمن الكلمة
          </h2>

          <p className="text-gray-600 text-center mb-6">
            فريقك سيسألك أسئلة نعم/لا لتخمين الكلمة
            <br />
            لديهم 15 سؤال فقط!
          </p>

          {/* Word Preview (hidden until ready) */}
          <div className="bg-gray-100 rounded-xl p-4 mb-6 text-center">
            <p className="text-sm text-gray-500 mb-2">الكلمة المطلوبة</p>
            <p className="text-3xl font-bold text-gray-900">
              {session?.answer || '???'}
            </p>
          </div>

          {/* Ready Button */}
          {!isReady && (
            <button
              onClick={handleReady}
              className="w-full py-4 rounded-xl font-bold text-xl bg-green-600 hover:bg-green-700 text-white active:scale-95 transition-all shadow-lg"
            >
              ✅ جاهز - ابدأ اللعبة
            </button>
          )}

          {/* Waiting state after ready */}
          {isReady && session?.status === 'waiting' && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-4 border-green-600 mx-auto mb-2"></div>
              <p className="text-gray-600 font-bold">جاري البدء...</p>
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

export default GuessWordGame
