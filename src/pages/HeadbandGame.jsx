import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import HeadbandService from '../services/headbandService'
import LogoDisplay from '../components/LogoDisplay'
import SmartImage from '../components/SmartImage'
import { devLog, prodError } from '../utils/devLog'

function HeadbandGame() {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sessionEnded, setSessionEnded] = useState(false)

  // Player state
  const [playerId] = useState(() => HeadbandService.generatePlayerId())
  const [selectedTeam, setSelectedTeam] = useState(null) // 'A' or 'B'
  const [isReady, setIsReady] = useState(false)

  // Heartbeat interval ref
  const heartbeatIntervalRef = useRef(null)

  // Subscribe to session data
  useEffect(() => {
    devLog('🎭 HeadbandGame: Subscribing to session:', sessionId)

    const unsubscribe = HeadbandService.subscribeToSession(sessionId, (sessionData) => {
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
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [sessionId, playerId])

  // Heartbeat system
  useEffect(() => {
    if (!selectedTeam || !sessionId) return

    heartbeatIntervalRef.current = setInterval(() => {
      HeadbandService.sendHeartbeat(sessionId, selectedTeam)
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
      await HeadbandService.joinTeam(sessionId, team, playerId)
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
      await HeadbandService.markReady(sessionId, selectedTeam)
      setIsReady(true)
    } catch (err) {
      prodError('Error marking ready:', err)
      setError('حدث خطأ. يرجى المحاولة مرة أخرى')
    }
  }

  // Handle counter increment
  const handleIncrementCounter = async () => {
    if (!selectedTeam) return

    // Increment the OTHER team's counter (since we're counting their questions)
    const otherTeam = selectedTeam === 'A' ? 'B' : 'A'

    try {
      await HeadbandService.incrementCounter(sessionId, otherTeam)
    } catch (err) {
      prodError('Error incrementing counter:', err)
    }
  }

  // Get current player's data
  const getMyData = () => {
    if (!session || !selectedTeam) return null

    if (selectedTeam === 'A') {
      return {
        answer: session.answer,
        image: session.answerImage,
        counter: session.teamBCounter || 0 // Show how many questions Team B asked (I'm counting for them)
      }
    } else {
      return {
        answer: session.answer2,
        image: session.answerImage2,
        counter: session.teamACounter || 0 // Show how many questions Team A asked (I'm counting for them)
      }
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

  // Error state
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

  // Playing state - show image and counter
  if (isReady && session?.status === 'playing') {
    const myData = getMyData()
    // When I press button, I increment OTHER team's counter
    // So teamBCounter = questions Team A counted (Team B's questions)
    // And teamACounter = questions Team B counted (Team A's questions)

    // For Team A: opponent's questions = teamBCounter (what I counted)
    // For Team A: my questions = teamACounter (what opponent counted for me)
    const opponentQuestionsCount = selectedTeam === 'A' ? session.teamBCounter : session.teamACounter
    const myQuestionsCount = selectedTeam === 'A' ? session.teamACounter : session.teamBCounter

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 py-2 px-4 flex items-center justify-between">
          <LogoDisplay />
          <div className="bg-white/20 rounded-full px-3 py-1">
            <span className="text-white font-bold text-xs">أسئلتك: {myQuestionsCount}/10</span>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          {/* Image Container */}
          <div className="bg-white rounded-2xl shadow-2xl p-4 max-w-md w-full">
            {/* Answer Text Above Image */}
            <div className="text-center mb-4">
              <p className="text-2xl font-bold text-gray-900">
                {myData?.answer || 'جاري التحميل...'}
              </p>
            </div>

            {/* Image */}
            <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden mb-4">
              {myData?.image ? (
                <SmartImage
                  src={myData.image}
                  alt="الصورة"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <span className="text-6xl">🖼️</span>
                </div>
              )}
            </div>

            {/* Counter Display */}
            <div className="text-center mb-4">
              <p className="text-base font-bold text-gray-800 mb-2">عدد أسئلة الخصم</p>
              <span className="text-4xl font-bold text-red-600">{opponentQuestionsCount}</span>
              <span className="text-2xl text-gray-600"> / 10</span>
            </div>

            {/* Counter Button */}
            <button
              onClick={handleIncrementCounter}
              disabled={opponentQuestionsCount >= 10}
              className={`w-full py-4 rounded-xl font-bold text-xl transition-all ${
                opponentQuestionsCount >= 10
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white active:scale-95'
              }`}
            >
              {opponentQuestionsCount >= 10 ? 'انتهت الأسئلة' : 'الخصم سأل +1'}
            </button>
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

  // Team Selection State
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

          {/* Team Selection - Responsive Grid */}
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
              {/* Team Header */}
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

              {/* Team Status */}
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
              {/* Team Header */}
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

              {/* Team Status */}
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

          {/* Waiting for other player to be ready */}
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

export default HeadbandGame
