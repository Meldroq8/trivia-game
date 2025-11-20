import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LogoDisplay from '../components/LogoDisplay'
import { devLog, devWarn, prodError } from '../utils/devLog'

function Statistics() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [teamStats, setTeamStats] = useState({})
  const [categoryStats, setCategoryStats] = useState({})
  const [activeTab, setActiveTab] = useState('history')
  const navigate = useNavigate()
  const { isAuthenticated, user, getUserGames, loading: authLoading } = useAuth()

  // Set page title
  useEffect(() => {
    document.title = 'لمّه - الإحصائيات'
  }, [])

  // Redirect to home if not authenticated (but only after loading is complete)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, authLoading, navigate])

  // Load games from Firebase
  useEffect(() => {
    const loadGames = async () => {
      if (!isAuthenticated || !user) return

      try {
        setLoading(true)
        devLog('📊 Loading games for statistics...')
        const userGames = await getUserGames()

        // Sort games by date (newest first)
        const sortedGames = userGames
          .filter(game => game.gameData && game.gameData.selectedCategories)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

        setGames(sortedGames)

        // Calculate statistics from Firebase data
        calculateTeamStats(sortedGames)
        calculateCategoryStats(sortedGames)

        devLog('📊 Statistics loaded:', sortedGames.length, 'games')
      } catch (error) {
        prodError('❌ Error loading games for statistics:', error)
      } finally {
        setLoading(false)
      }
    }

    loadGames()
  }, [isAuthenticated, user])

  // Calculate team statistics from Firebase games
  const calculateTeamStats = (games) => {
    const stats = {}

    games.forEach(game => {
      const gameData = game.gameData
      if (!gameData.team1 || !gameData.team2) return

      // Initialize team stats if they don't exist
      [gameData.team1, gameData.team2].forEach(team => {
        if (!stats[team.name]) {
          stats[team.name] = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            totalPoints: 0,
            averagePoints: 0,
            highestScore: 0
          }
        }
      })

      // Determine winner
      let winner = null
      if (gameData.team1.score > gameData.team2.score) {
        winner = gameData.team1.name
      } else if (gameData.team2.score > gameData.team1.score) {
        winner = gameData.team2.name
      }

      // Update stats for both teams
      [gameData.team1, gameData.team2].forEach(team => {
        const teamStats = stats[team.name]
        teamStats.gamesPlayed++
        teamStats.totalPoints += team.score
        teamStats.averagePoints = Math.round(teamStats.totalPoints / teamStats.gamesPlayed)
        teamStats.highestScore = Math.max(teamStats.highestScore, team.score)

        if (winner === team.name) {
          teamStats.wins++
        } else if (winner === null) {
          teamStats.draws++
        } else {
          teamStats.losses++
        }
      })
    })

    setTeamStats(stats)
  }

  // Calculate category statistics from Firebase games
  const calculateCategoryStats = (games) => {
    const stats = {}

    games.forEach(game => {
      const gameData = game.gameData
      if (!gameData.gameHistory) return

      gameData.gameHistory.forEach(question => {
        const category = question.category || 'Unknown'

        if (!stats[category]) {
          stats[category] = {
            totalQuestions: 0,
            correctAnswers: 0,
            noAnswers: 0
          }
        }

        const categoryStats = stats[category]
        categoryStats.totalQuestions++

        if (question.winner && question.winner !== 'none') {
          categoryStats.correctAnswers++
        } else {
          categoryStats.noAnswers++
        }
      })
    })

    setCategoryStats(stats)
  }

  return (
    <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900">
      {/* Header - Red theme matching website */}
      <div className="bg-red-600 text-white flex-shrink-0 sticky top-0 z-10 overflow-hidden h-16 md:h-20 lg:h-24">
        <div className="flex items-center justify-between max-w-6xl mx-auto h-full px-4">
          <div className="flex items-center gap-3">
            <LogoDisplay />
          </div>

          <div className="flex-1 text-center">
            <h1 className="text-2xl font-bold">إحصائيات اللعبة</h1>
          </div>

          <button
            onClick={() => navigate('/')}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
          >
            <span className="md:hidden text-xl">←</span>
            <span className="hidden md:inline">العودة للرئيسية</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">

      {/* Loading State */}
      {loading || authLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">جاري تحميل الإحصائيات...</p>
        </div>
      ) : (
        <>
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              title="إجمالي الألعاب"
              value={games.length}
              icon="🎮"
              color="bg-blue-500"
            />
            <StatCard
              title="الفرق المسجلة"
              value={Object.keys(teamStats).length}
              icon="👥"
              color="bg-green-500"
            />
            <StatCard
              title="أسئلة مجاوبة"
              value={games.reduce((total, game) => {
                const usedQuestionsSize = Array.isArray(game.gameData.usedQuestions)
                  ? game.gameData.usedQuestions.length
                  : (game.gameData.usedQuestions?.size || 0)
                return total + usedQuestionsSize
              }, 0)}
              icon="❓"
              color="bg-red-500"
            />
            <StatCard
              title="متوسط النقاط"
              value={games.length > 0 ? Math.round(games.reduce((total, game) => {
                return total + (game.gameData.team1?.score || 0) + (game.gameData.team2?.score || 0)
              }, 0) / (games.length * 2)) : 0}
              icon="📊"
              color="bg-orange-500"
            />
          </div>

          {/* Tabs */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg mb-8">
            <div className="flex border-b dark:border-slate-700">
          <TabButton
            active={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            title="تاريخ الألعاب"
          />
          <TabButton
            active={activeTab === 'teams'}
            onClick={() => setActiveTab('teams')}
            title="إحصائيات الفرق"
          />
          <TabButton
            active={activeTab === 'categories'}
            onClick={() => setActiveTab('categories')}
            title="إحصائيات الفئات"
          />
        </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'history' && <GameHistoryTab games={games} />}
            {activeTab === 'teams' && <TeamStatsTab teamStats={teamStats} />}
            {activeTab === 'categories' && <CategoryStatsTab categoryStats={categoryStats} />}
          </div>
          </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, color }) {
  return (
    <div className={`${color} text-white rounded-2xl p-4 shadow-lg`}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-90">{title}</div>
    </div>
  )
}

function TabButton({ active, onClick, title }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-4 px-6 font-bold transition-colors ${
        active
          ? 'bg-red-600 text-white'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
      }`}
    >
      {title}
    </button>
  )
}

function GameHistoryTab({ games }) {
  if (games.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <div className="text-4xl mb-4">📊</div>
        <p className="text-xl">لا توجد ألعاب مسجلة بعد</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold mb-4 text-red-600 dark:text-red-400">آخر الألعاب</h3>
      {games.slice(0, 10).map((game, index) => (
        <GameHistoryCard key={game.id} game={game} index={index} />
      ))}
    </div>
  )
}

function GameHistoryCard({ game, index }) {
  const gameData = game.gameData

  // Determine winner
  let winner = 'تعادل'
  let winnerColor = 'text-yellow-600'

  if (gameData.team1.score > gameData.team2.score) {
    winner = gameData.team1.name
    winnerColor = 'text-blue-600'
  } else if (gameData.team2.score > gameData.team1.score) {
    winner = gameData.team2.name
    winnerColor = 'text-red-600'
  }

  // Calculate answered questions
  const usedQuestionsSize = Array.isArray(gameData.usedQuestions)
    ? gameData.usedQuestions.length
    : (gameData.usedQuestions?.size || 0)

  const totalQuestions = gameData.selectedCategories?.length * 6 || 0

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-4 border-l-4 border-blue-500">
      <div className="flex justify-between items-center mb-2">
        <div className="font-bold text-gray-800 dark:text-gray-100">
          {gameData.gameName || `لعبة #${index + 1}`}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">{formatDate(game.createdAt)}</div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-3">
        <div className="text-center">
          <div className="font-bold text-blue-600">{gameData.team1.name}</div>
          <div className="text-2xl font-bold text-red-600">{gameData.team1.score}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">VS</div>
          <div className={`font-bold ${winnerColor}`}>
            {winner}
          </div>
        </div>
        <div className="text-center">
          <div className="font-bold text-red-600">{gameData.team2.name}</div>
          <div className="text-2xl font-bold text-red-600">{gameData.team2.score}</div>
        </div>
      </div>

      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>{usedQuestionsSize} / {totalQuestions} سؤال</span>
        <span>{game.isComplete ? 'مكتملة' : 'قيد التقدم'}</span>
      </div>

      {/* Categories */}
      <div className="mt-2">
        <div className="flex flex-wrap gap-1">
          {gameData.selectedCategories?.slice(0, 3).map((category, idx) => (
            <span key={idx} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
              {category.replace(/_/g, ' ')}
            </span>
          ))}
          {gameData.selectedCategories?.length > 3 && (
            <span className="text-xs text-gray-500">+{gameData.selectedCategories.length - 3} أخرى</span>
          )}
        </div>
      </div>
    </div>
  )
}

function TeamStatsTab({ teamStats }) {
  const teams = Object.entries(teamStats).sort((a, b) => b[1].wins - a[1].wins)

  if (teams.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <div className="text-4xl mb-4">👥</div>
        <p className="text-xl">لا توجد إحصائيات فرق متاحة</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold mb-4 dark:text-gray-100">إحصائيات الفرق</h3>
      {teams.map(([teamName, stats], index) => (
        <TeamStatsCard key={teamName} teamName={teamName} stats={stats} rank={index + 1} />
      ))}
    </div>
  )
}

function TeamStatsCard({ teamName, stats, rank }) {
  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0

  return (
    <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold mr-3 ${
            rank === 1 ? 'bg-yellow-500' : rank === 2 ? 'bg-gray-400' : rank === 3 ? 'bg-orange-600' : 'bg-gray-500'
          }`}>
            {rank}
          </div>
          <div className="font-bold text-lg dark:text-gray-100">{teamName}</div>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          معدل الفوز: {winRate}%
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.wins}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">انتصارات</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.losses}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">هزائم</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.averagePoints}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">متوسط النقاط</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.highestScore}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">أعلى نتيجة</div>
        </div>
      </div>
    </div>
  )
}

function CategoryStatsTab({ categoryStats }) {
  const categories = Object.entries(categoryStats)

  if (categories.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <div className="text-4xl mb-4">📊</div>
        <p className="text-xl">لا توجد إحصائيات فئات متاحة</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold mb-4 dark:text-gray-100">إحصائيات الفئات</h3>
      {categories.map(([category, stats]) => (
        <CategoryStatsCard key={category} category={category} stats={stats} />
      ))}
    </div>
  )
}

function CategoryStatsCard({ category, stats }) {
  const successRate = stats.totalQuestions > 0
    ? Math.round((stats.correctAnswers / stats.totalQuestions) * 100)
    : 0

  return (
    <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-bold text-lg dark:text-gray-100">{category}</h4>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          معدل النجاح: {successRate}%
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.correctAnswers}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">إجابات صحيحة</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.noAnswers}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">بدون إجابة</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalQuestions}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">مجموع الأسئلة</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="bg-gray-200 dark:bg-slate-600 rounded-full h-2">
          <div
            className="bg-green-500 rounded-full h-2 transition-all duration-300"
            style={{ width: `${successRate}%` }}
          ></div>
        </div>
      </div>
    </div>
  )
}

export default Statistics