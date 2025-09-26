import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGameHistory, getTeamStats, getCategoryStats, getPerformanceTrends } from '../utils/gameStats'
import { useAuth } from '../hooks/useAuth'

function Statistics() {
  const [gameHistory, setGameHistory] = useState([])
  const [teamStats, setTeamStats] = useState({})
  const [categoryStats, setCategoryStats] = useState({})
  const [activeTab, setActiveTab] = useState('history')
  const navigate = useNavigate()
  const { isAuthenticated, loading } = useAuth()

  // Redirect to home if not authenticated (but only after loading is complete)
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, loading, navigate])

  useEffect(() => {
    // Load all statistics
    setGameHistory(getGameHistory())
    setTeamStats(getTeamStats())
    setCategoryStats(getCategoryStats())
  }, [])

  return (
    <div className="min-h-screen p-4">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">إحصائيات اللعبة</h1>
          <button
            onClick={() => navigate('/game')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            العودة إلى اللعبة
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="إجمالي الألعاب"
          value={gameHistory.length}
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
          value={gameHistory.reduce((total, game) => total + game.answeredQuestions, 0)}
          icon="❓"
          color="bg-purple-500"
        />
        <StatCard
          title="وقت اللعب"
          value={`${gameHistory.reduce((total, game) => total + (game.duration || 0), 0)} د`}
          icon="⏱️"
          color="bg-orange-500"
        />
      </div>

      {/* Tabs */}
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg mb-8">
        <div className="flex border-b">
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
          {activeTab === 'history' && <GameHistoryTab history={gameHistory} />}
          {activeTab === 'teams' && <TeamStatsTab teamStats={teamStats} />}
          {activeTab === 'categories' && <CategoryStatsTab categoryStats={categoryStats} />}
        </div>
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
          ? 'bg-blue-600 text-white'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {title}
    </button>
  )
}

function GameHistoryTab({ history }) {
  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl mb-4">📊</div>
        <p className="text-xl">لا توجد ألعاب مسجلة بعد</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold mb-4">آخر الألعاب</h3>
      {history.slice(0, 10).map((game, index) => (
        <GameHistoryCard key={game.id} game={game} index={index} />
      ))}
    </div>
  )
}

function GameHistoryCard({ game, index }) {
  const getWinnerColor = () => {
    if (game.winner === game.team1.name) return 'text-blue-600'
    if (game.winner === game.team2.name) return 'text-red-600'
    return 'text-yellow-600'
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 border-l-4 border-blue-500">
      <div className="flex justify-between items-center mb-2">
        <div className="font-bold text-gray-800">
          لعبة #{history.length - index}
        </div>
        <div className="text-sm text-gray-600">{game.date}</div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-3">
        <div className="text-center">
          <div className="font-bold text-blue-600">{game.team1.name}</div>
          <div className="text-2xl font-bold">{game.team1.score}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">VS</div>
          <div className={`font-bold ${getWinnerColor()}`}>
            {game.winner}
          </div>
        </div>
        <div className="text-center">
          <div className="font-bold text-red-600">{game.team2.name}</div>
          <div className="text-2xl font-bold">{game.team2.score}</div>
        </div>
      </div>

      <div className="flex justify-between text-sm text-gray-600">
        <span>{game.answeredQuestions} / {game.totalQuestions} سؤال</span>
        <span>{game.duration || 0} دقيقة</span>
      </div>
    </div>
  )
}

function TeamStatsTab({ teamStats }) {
  const teams = Object.entries(teamStats).sort((a, b) => b[1].wins - a[1].wins)

  if (teams.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl mb-4">👥</div>
        <p className="text-xl">لا توجد إحصائيات فرق متاحة</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold mb-4">إحصائيات الفرق</h3>
      {teams.map(([teamName, stats], index) => (
        <TeamStatsCard key={teamName} teamName={teamName} stats={stats} rank={index + 1} />
      ))}
    </div>
  )
}

function TeamStatsCard({ teamName, stats, rank }) {
  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold mr-3 ${
            rank === 1 ? 'bg-yellow-500' : rank === 2 ? 'bg-gray-400' : rank === 3 ? 'bg-orange-600' : 'bg-gray-500'
          }`}>
            {rank}
          </div>
          <div className="font-bold text-lg">{teamName}</div>
        </div>
        <div className="text-sm text-gray-600">
          معدل الفوز: {winRate}%
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-green-600">{stats.wins}</div>
          <div className="text-sm text-gray-600">انتصارات</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-600">{stats.losses}</div>
          <div className="text-sm text-gray-600">هزائم</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-600">{stats.averagePoints}</div>
          <div className="text-sm text-gray-600">متوسط النقاط</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-purple-600">{stats.highestScore}</div>
          <div className="text-sm text-gray-600">أعلى نتيجة</div>
        </div>
      </div>
    </div>
  )
}

function CategoryStatsTab({ categoryStats }) {
  const categories = Object.entries(categoryStats)

  if (categories.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl mb-4">📊</div>
        <p className="text-xl">لا توجد إحصائيات فئات متاحة</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold mb-4">إحصائيات الفئات</h3>
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
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-bold text-lg">{category}</h4>
        <div className="text-sm text-gray-600">
          معدل النجاح: {successRate}%
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-green-600">{stats.correctAnswers}</div>
          <div className="text-sm text-gray-600">إجابات صحيحة</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-600">{stats.noAnswers}</div>
          <div className="text-sm text-gray-600">بدون إجابة</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-600">{stats.totalQuestions}</div>
          <div className="text-sm text-gray-600">مجموع الأسئلة</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="bg-gray-200 rounded-full h-2">
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