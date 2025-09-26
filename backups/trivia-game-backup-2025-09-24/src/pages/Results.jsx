import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveGameToHistory } from '../utils/gameStats'
import { useAuth } from '../hooks/useAuth'

function Results({ gameState, setGameState }) {
  const [confettiPieces, setConfettiPieces] = useState([])
  const [showStats, setShowStats] = useState(false)
  const navigate = useNavigate()
  const { updateGameStats, isAuthenticated, loading } = useAuth()

  // Redirect to home if not authenticated (but only after loading is complete)
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, loading, navigate])

  const { team1, team2, gameHistory, selectedCategories, usedQuestions } = gameState

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

  const handleSaveAndExit = async () => {
    // Save game to history
    saveGameToHistory(gameState)

    // Save to Firebase if user is logged in
    if (isAuthenticated) {
      try {
        await updateGameStats({
          finalScore: Math.max(team1.score, team2.score),
          gameData: gameState
        })
      } catch (error) {
        console.error('Error saving game stats:', error)
      }
    }

    // Reset game state including perks
    setGameState({
      team1: { name: 'الفريق الأول', score: 0 },
      team2: { name: 'الفريق الثاني', score: 0 },
      selectedCategories: [],
      usedQuestions: new Set(),
      currentQuestion: null,
      gameHistory: [],
      perkUsage: {
        team1: { double: 0, phone: 0, search: 0 },
        team2: { double: 0, phone: 0, search: 0 }
      },
      activatedPerks: {
        doublePoints: { active: false, team: null }
      }
    })

    // Navigate to home
    navigate('/')
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Confetti Animation */}
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

      {/* Main Results Card */}
      <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 w-full max-w-4xl text-center animate-fadeIn relative z-10">
        {/* Winner Announcement */}
        <div className="mb-8">
          <div className="text-8xl mb-4">{getWinnerEmoji()}</div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 text-gray-800">
            {getWinnerText()}
          </h1>
          {!isDraw && (
            <p className="text-xl text-gray-600">
              بفارق {getScoreDifference()} نقطة
            </p>
          )}
        </div>

        {/* Scores */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className={`p-6 rounded-2xl ${winner === 'team1' ? 'bg-yellow-100 border-4 border-yellow-400' : 'bg-blue-50'}`}>
            <div className="text-2xl font-bold text-blue-800 mb-2">{team1.name}</div>
            <div className="text-5xl font-bold text-blue-600">{team1.score}</div>
            {winner === 'team1' && <div className="text-yellow-600 font-bold mt-2">🏆 الفائز</div>}
          </div>

          <div className={`p-6 rounded-2xl ${winner === 'team2' ? 'bg-yellow-100 border-4 border-yellow-400' : 'bg-red-50'}`}>
            <div className="text-2xl font-bold text-red-800 mb-2">{team2.name}</div>
            <div className="text-5xl font-bold text-red-600">{team2.score}</div>
            {winner === 'team2' && <div className="text-yellow-600 font-bold mt-2">🏆 الفائز</div>}
          </div>
        </div>

        {/* Game Statistics */}
        {showStats && (
          <div className="bg-gray-50 rounded-2xl p-6 mb-8 animate-fadeIn">
            <h3 className="text-xl font-bold mb-4">إحصائيات اللعبة</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{gameStats.answeredQuestions}</div>
                <div className="text-sm text-gray-600">أسئلة مجاوبة</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{gameStats.totalQuestions}</div>
                <div className="text-sm text-gray-600">مجموع الأسئلة</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">{gameStats.completionPercentage}%</div>
                <div className="text-sm text-gray-600">نسبة الإنجاز</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{gameStats.duration}</div>
                <div className="text-sm text-gray-600">دقيقة</div>
              </div>
            </div>
          </div>
        )}

        {/* Performance Analysis */}
        {showStats && gameHistory.length > 0 && (
          <div className="bg-gray-50 rounded-2xl p-6 mb-8 animate-fadeIn">
            <h3 className="text-xl font-bold mb-4">تحليل الأداء</h3>
            <div className="grid md:grid-cols-2 gap-6 text-center">
              <div>
                <h4 className="font-bold text-blue-800 mb-2">{team1.name}</h4>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-green-600 font-bold">
                      {gameHistory.filter(q => q.winner === 'team1').length}
                    </span>
                    <span className="text-gray-600"> إجابات صحيحة</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-blue-600 font-bold">
                      {Math.round((gameHistory.filter(q => q.winner === 'team1').length / gameHistory.length) * 100) || 0}%
                    </span>
                    <span className="text-gray-600"> معدل النجاح</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-red-800 mb-2">{team2.name}</h4>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-green-600 font-bold">
                      {gameHistory.filter(q => q.winner === 'team2').length}
                    </span>
                    <span className="text-gray-600"> إجابات صحيحة</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-blue-600 font-bold">
                      {Math.round((gameHistory.filter(q => q.winner === 'team2').length / gameHistory.length) * 100) || 0}%
                    </span>
                    <span className="text-gray-600"> معدل النجاح</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid md:grid-cols-3 gap-4">
          <button
            onClick={() => navigate('/statistics')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transform transition-all duration-200 hover:scale-105"
          >
            📊 عرض الإحصائيات
          </button>

          <button
            onClick={handleSaveAndExit}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl transform transition-all duration-200 hover:scale-105"
          >
            💾 حفظ والخروج
          </button>

          <button
            onClick={() => navigate('/categories')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transform transition-all duration-200 hover:scale-105"
          >
            🔄 لعب مرة أخرى
          </button>
        </div>

        {/* Motivational Message */}
        <div className="mt-6 p-4 bg-gradient-to-r from-purple-100 to-blue-100 rounded-xl">
          <p className="text-gray-700 font-medium">
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
  )
}

export default Results