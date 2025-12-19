import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LogoDisplay from '../components/LogoDisplay'
import { devLog, devWarn, prodError } from '../utils/devLog'
import { trackGameFinish } from '../services/categoryStatsService'

function Results({ gameState, setGameState }) {
  const [confettiPieces, setConfettiPieces] = useState([])
  const [showStats, setShowStats] = useState(false)
  const [gameAlreadySaved, setGameAlreadySaved] = useState(false)
  const [statsAlreadyTracked, setStatsAlreadyTracked] = useState(false)
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  })
  const navigate = useNavigate()
  const { updateGameStats, isAuthenticated, loading, isAdmin } = useAuth()

  // Set page title
  useEffect(() => {
    document.title = 'راس براس - النتائج'
  }, [])

  // Track dimensions for responsive sizing
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Calculate responsive styles - matching Header component
  const getResponsiveStyles = () => {
    const { width, height } = dimensions
    const isPC = width >= 1024 && height >= 768

    let baseFontSize = 16
    if (height <= 390) {
      baseFontSize = 14
    } else if (height <= 430) {
      baseFontSize = 15
    } else if (height <= 568) {
      baseFontSize = 16
    } else if (height <= 667) {
      baseFontSize = 17
    } else if (height <= 812) {
      baseFontSize = 18
    } else if (height <= 896) {
      baseFontSize = 19
    } else if (height <= 1024) {
      baseFontSize = 20
    } else {
      baseFontSize = isPC ? 24 : 20
    }

    const globalScaleFactor = 1.0
    const headerFontSize = baseFontSize * globalScaleFactor
    const buttonPadding = Math.max(8, globalScaleFactor * 12)
    const headerPadding = Math.max(8, buttonPadding * 0.25)
    const headerHeight = Math.max(56, headerFontSize * 3)

    return {
      headerFontSize,
      headerPadding,
      headerHeight
    }
  }

  const styles = getResponsiveStyles()

  // Redirect to home if not authenticated (but only after loading is complete)
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, loading, navigate])

  const { team1, team2, gameHistory, selectedCategories, usedQuestions } = gameState

  // Debug logging and automatic save
  useEffect(() => {
    devLog('🏆 Results page loaded with game state:')
    devLog('Team 1:', team1)
    devLog('Team 2:', team2)
    devLog('Game History:', gameHistory)
    devLog('Selected Categories:', selectedCategories)
    devLog('Used Questions:', usedQuestions)
    devLog('Total questions expected:', selectedCategories?.length * 6)
    devLog('Questions answered:', usedQuestions?.size)

    // Automatically save game statistics to Firebase when results page loads
    // Save even if no questions answered (user ended game immediately)
    if (!gameAlreadySaved && gameState) {
      devLog('🎯 Auto-saving game statistics to Firebase...')
      devLog('🔐 Auth state - loading:', loading, 'authenticated:', isAuthenticated)

      // Save to Firebase if authenticated (but wait for auth loading to complete)
      if (!loading) {
        if (isAuthenticated) {
          devLog('💾 Saving game to Firebase - GameName:', gameState.gameName, 'Timestamp:', new Date().toISOString())
          setGameAlreadySaved(true) // Mark as saved BEFORE saving to prevent race condition duplicates

          updateGameStats({
            finalScore: Math.max(team1?.score || 0, team2?.score || 0),
            gameData: gameState
          }).then(() => {
            devLog('✅ Game auto-saved to Firebase successfully')
            // Set flag so CategorySelection knows to refresh question counts
            sessionStorage.setItem('gameJustCompleted', 'true')
          }).catch(error => {
            prodError('❌ Error auto-saving to Firebase:', error)
            setGameAlreadySaved(false) // Reset if save failed so it can retry
          })
        } else {
          devLog('ℹ️ User not authenticated, skipping Firebase save')
          setGameAlreadySaved(true) // Still mark as processed to prevent duplicate attempts
        }
      } else {
        devLog('⏳ Waiting for authentication to load...')
      }
    }
  }, [gameState, isAuthenticated, updateGameStats, gameAlreadySaved, loading])

  // Track game finish for category analytics
  useEffect(() => {
    // Skip tracking for admin users (testing games)
    if (isAdmin) {
      devLog('📊 Skipping game finish tracking (admin user)')
      return
    }

    if (!statsAlreadyTracked && gameState && gameState.gameHistory?.length > 0) {
      devLog('📊 Tracking game finish for category analytics...')
      setStatsAlreadyTracked(true)

      trackGameFinish(gameState)
        .then(() => {
          devLog('✅ Game finish tracked for analytics')
        })
        .catch(error => {
          prodError('❌ Error tracking game finish:', error)
        })
    }
  }, [gameState, statsAlreadyTracked, isAdmin])

  // Determine winner
  const winner = team1.score > team2.score ? 'team1' : team2.score > team1.score ? 'team2' : 'draw'
  const isDraw = winner === 'draw'

  useEffect(() => {
    // Generate confetti pieces
    const pieces = []
    for (let i = 0; i < 50; i++) {
      pieces.push({
        id: i,
        left: Math.random() * 100,
        animationDelay: Math.random() * 3,
        color: getRandomColor()
      })
    }
    setConfettiPieces(pieces)

    // Show stats after animation
    const timer = setTimeout(() => {
      setShowStats(true)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  const getRandomColor = () => {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff']
    return colors[Math.floor(Math.random() * colors.length)]
  }

  const handleExit = () => {
    devLog('🚪 Exiting to home...')

    // Reset game state including perks and continuation flags
    setGameState({
      team1: { name: 'الفريق الأول', score: 0 },
      team2: { name: 'الفريق الثاني', score: 0 },
      selectedCategories: [],
      usedQuestions: new Set(),
      currentQuestion: null,
      gameHistory: [],
      // Explicitly clear continuation flags for new games
      isGameContinuation: false,
      gameId: null,
      perkUsage: {
        team1: { double: 0, phone: 0, search: 0 },
        team2: { double: 0, phone: 0, search: 0 }
      },
      activatedPerks: {
        doublePoints: { active: false, team: null }
      }
    })

    // Navigate to home with flag to refresh leaderboard
    navigate('/', { state: { fromGame: true, timestamp: Date.now() } })
  }

  const getWinnerEmoji = () => {
    if (isDraw) return '🤝'
    return '🏆'
  }

  const getWinnerText = () => {
    if (isDraw) return 'تعادل!'
    return winner === 'team1' ? `${team1.name} فاز!` : `${team2.name} فاز!`
  }

  const getScoreDifference = () => {
    return Math.abs(team1.score - team2.score)
  }

  const gameStats = {
    totalQuestions: selectedCategories.length * 6,
    answeredQuestions: usedQuestions.size,
    completionPercentage: Math.round((usedQuestions.size / (selectedCategories.length * 6)) * 100),
    duration: gameHistory.length > 0 ? Math.round((Date.now() - gameHistory[0].timestamp) / 1000 / 60) : 0
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f7f2e6] dark:bg-slate-900 overflow-hidden">
      {/* Header - matching consistent sizing */}
      <div
        className="bg-gradient-to-r from-red-600 via-red-700 to-red-600 dark:from-red-700 dark:via-red-800 dark:to-red-700 text-white flex-shrink-0 sticky top-0 z-10 overflow-hidden shadow-lg"
        style={{
          padding: `${styles.headerPadding}px`,
          height: `${styles.headerHeight}px`
        }}
      >
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center gap-3">
            <LogoDisplay />
          </div>

          <div className="flex-1 text-center">
            <h1
              className="font-bold"
              style={{ fontSize: `${styles.headerFontSize * 0.9}px` }}
            >
              نتائج المباراة
            </h1>
          </div>

          <button
            onClick={handleExit}
            className="bg-red-700 hover:bg-red-800 rounded-lg transition-colors px-3 py-1"
            style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}
          >
            العودة للرئيسية
          </button>
        </div>
      </div>

      {/* Confetti Animation Container */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 50 }}>
        {confettiPieces.map((piece) => (
          <div
            key={piece.id}
            className="absolute w-3 h-3 animate-confetti"
            style={{
              left: `${piece.left}%`,
              backgroundColor: piece.color,
              animationDelay: `${piece.animationDelay}s`,
              top: '-10px'
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 landscape:p-2 bg-[#f7f2e6] dark:bg-slate-900 overflow-y-auto">
        {/* Main Results Card */}
        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-2xl sm:rounded-3xl landscape:rounded-2xl shadow-2xl p-4 sm:p-8 landscape:p-4 w-full max-w-4xl text-center animate-fadeIn relative z-10"
             style={{ color: '#1f2937' }}>
        {/* Winner Announcement */}
        <div className="mb-4 sm:mb-8 landscape:mb-4">
          <div className="text-5xl sm:text-8xl landscape:text-6xl mb-2 sm:mb-4 landscape:mb-2">{getWinnerEmoji()}</div>
          <h1 className="text-2xl sm:text-4xl md:text-6xl landscape:text-3xl font-bold mb-2 sm:mb-4 landscape:mb-2 text-gray-800 dark:text-gray-100">
            {getWinnerText()}
          </h1>
          {!isDraw && (
            <p className="text-base sm:text-xl landscape:text-lg text-red-600 dark:text-red-400">
              بفارق {getScoreDifference()} نقطة
            </p>
          )}
        </div>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-4 sm:gap-8 landscape:gap-4 mb-4 sm:mb-8 landscape:mb-4">
          <div className={`p-3 sm:p-6 landscape:p-3 rounded-2xl ${winner === 'team1' ? 'bg-yellow-100 dark:bg-yellow-900/40 border-4 landscape:border-2 border-yellow-400 dark:border-yellow-600' : 'bg-blue-50 dark:bg-blue-900/30'}`}>
            <div className="text-lg sm:text-2xl landscape:text-base font-bold text-blue-800 dark:text-blue-300 mb-1 sm:mb-2 landscape:mb-1">{team1.name}</div>
            <div className="text-3xl sm:text-5xl landscape:text-3xl font-bold text-blue-600 dark:text-blue-400">{team1.score}</div>
            {winner === 'team1' && <div className="text-yellow-600 dark:text-yellow-400 font-bold mt-1 sm:mt-2 landscape:mt-1 text-sm sm:text-base landscape:text-xs">🏆 الفائز</div>}
          </div>

          <div className={`p-3 sm:p-6 landscape:p-3 rounded-2xl ${winner === 'team2' ? 'bg-yellow-100 dark:bg-yellow-900/40 border-4 landscape:border-2 border-yellow-400 dark:border-yellow-600' : 'bg-red-50 dark:bg-red-900/30'}`}>
            <div className="text-lg sm:text-2xl landscape:text-base font-bold text-red-800 dark:text-red-300 mb-1 sm:mb-2 landscape:mb-1">{team2.name}</div>
            <div className="text-3xl sm:text-5xl landscape:text-3xl font-bold text-red-600 dark:text-red-400">{team2.score}</div>
            {winner === 'team2' && <div className="text-yellow-600 dark:text-yellow-400 font-bold mt-1 sm:mt-2 landscape:mt-1 text-sm sm:text-base landscape:text-xs">🏆 الفائز</div>}
          </div>
        </div>

        {/* Game Statistics */}
        {showStats && (
          <div className="bg-gray-50 dark:bg-slate-700 rounded-2xl p-6 mb-8 animate-fadeIn">
            <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">إحصائيات اللعبة</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{gameStats.answeredQuestions}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">أسئلة مجاوبة</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{gameStats.totalQuestions}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">مجموع الأسئلة</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{gameStats.completionPercentage}%</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">نسبة الإنجاز</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{gameStats.duration}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">دقيقة</div>
              </div>
            </div>
          </div>
        )}

        {/* Performance Analysis */}
        {showStats && gameHistory.length > 0 && (
          <div className="bg-gray-50 dark:bg-slate-700 rounded-2xl p-6 mb-8 animate-fadeIn">
            <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">تحليل الأداء</h3>
            <div className="grid md:grid-cols-2 gap-6 text-center">
              <div>
                <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-2">{team1.name}</h4>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-green-600 dark:text-green-400 font-bold">
                      {gameHistory.filter(q => q.winner === 'team1').length}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400"> إجابات صحيحة</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-blue-600 dark:text-blue-400 font-bold">
                      {Math.round((gameHistory.filter(q => q.winner === 'team1').length / gameHistory.length) * 100) || 0}%
                    </span>
                    <span className="text-gray-600 dark:text-gray-400"> معدل النجاح</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-red-800 dark:text-red-300 mb-2">{team2.name}</h4>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-green-600 dark:text-green-400 font-bold">
                      {gameHistory.filter(q => q.winner === 'team2').length}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400"> إجابات صحيحة</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-blue-600 dark:text-blue-400 font-bold">
                      {Math.round((gameHistory.filter(q => q.winner === 'team2').length / gameHistory.length) * 100) || 0}%
                    </span>
                    <span className="text-gray-600 dark:text-gray-400"> معدل النجاح</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-center mt-2 sm:mt-0">
          <button
            onClick={handleExit}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 sm:py-3 landscape:py-2 px-4 sm:px-6 landscape:px-4 rounded-xl transform transition-all duration-200 hover:scale-105 text-sm sm:text-base landscape:text-sm"
          >
            الخروج
          </button>
        </div>

        {/* Motivational Message */}
        <div className="mt-3 sm:mt-6 landscape:mt-3 p-3 sm:p-4 landscape:p-3 bg-gradient-to-r from-red-100 to-blue-100 dark:from-red-900/40 dark:to-blue-900/40 rounded-xl">
          <p className="text-gray-800 dark:text-gray-200 font-medium text-sm sm:text-base landscape:text-sm">
            {isDraw ?
              "لعبة رائعة! كلا الفريقين أظهر مهارات متميزة 👏" :
              winner === 'team1' ?
                `تهانينا ${team1.name}! 🎉 أداء ممتاز واستحقاق للفوز` :
                `تهانينا ${team2.name}! 🎉 أداء ممتاز واستحقاق للفوز`
            }
          </p>
        </div>
        </div>
      </div>
    </div>
  )
}

export default Results