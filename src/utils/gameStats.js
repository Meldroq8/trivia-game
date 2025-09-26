// Game Statistics and History Management

export const STORAGE_KEYS = {
  GAME_HISTORY: 'trivia-game-history',
  TEAM_STATS: 'trivia-game-team-stats'
}

// Save a completed game to history
export const saveGameToHistory = (gameData) => {
  console.log('💾 saveGameToHistory called with:', gameData)

  const history = getGameHistory()
  console.log('📖 Current history length:', history.length)

  const gameRecord = {
    id: Date.now(),
    timestamp: Date.now(),
    date: new Date().toLocaleDateString('ar-EG'),
    team1: gameData.team1,
    team2: gameData.team2,
    selectedCategories: gameData.selectedCategories,
    totalQuestions: gameData.selectedCategories?.length * 6 || 0,
    answeredQuestions: gameData.usedQuestions?.size || 0,
    gameHistory: gameData.gameHistory || [],
    winner: determineWinner(gameData.team1, gameData.team2),
    duration: calculateGameDuration(gameData.gameHistory)
  }

  console.log('📋 Game record created:', gameRecord)

  history.unshift(gameRecord) // Add to beginning of array

  // Keep only last 50 games
  const trimmedHistory = history.slice(0, 50)

  localStorage.setItem(STORAGE_KEYS.GAME_HISTORY, JSON.stringify(trimmedHistory))
  console.log('💾 Game saved to localStorage. New history length:', trimmedHistory.length)

  // Update team statistics
  updateTeamStats(gameRecord)
  console.log('📊 Team statistics updated')

  return gameRecord
}

// Get all game history
export const getGameHistory = () => {
  try {
    const history = localStorage.getItem(STORAGE_KEYS.GAME_HISTORY)
    return history ? JSON.parse(history) : []
  } catch (error) {
    console.error('Error loading game history:', error)
    return []
  }
}

// Get team statistics
export const getTeamStats = () => {
  try {
    const stats = localStorage.getItem(STORAGE_KEYS.TEAM_STATS)
    return stats ? JSON.parse(stats) : {}
  } catch (error) {
    console.error('Error loading team stats:', error)
    return {}
  }
}

// Update team statistics
const updateTeamStats = (gameRecord) => {
  const stats = getTeamStats()

  // Update stats for both teams
  updateTeamStat(stats, gameRecord.team1, gameRecord.winner === gameRecord.team1.name)
  updateTeamStat(stats, gameRecord.team2, gameRecord.winner === gameRecord.team2.name)

  localStorage.setItem(STORAGE_KEYS.TEAM_STATS, JSON.stringify(stats))
}

// Update individual team statistics
const updateTeamStat = (stats, team, won) => {
  if (!stats[team.name]) {
    stats[team.name] = {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      totalPoints: 0,
      averagePoints: 0,
      highestScore: 0,
      firstPlayed: Date.now(),
      lastPlayed: Date.now()
    }
  }

  const teamStats = stats[team.name]

  teamStats.gamesPlayed++
  teamStats.totalPoints += team.score
  teamStats.averagePoints = Math.round(teamStats.totalPoints / teamStats.gamesPlayed)
  teamStats.highestScore = Math.max(teamStats.highestScore, team.score)
  teamStats.lastPlayed = Date.now()

  if (won === true) {
    teamStats.wins++
  } else if (won === false) {
    teamStats.losses++
  } else {
    teamStats.draws++
  }
}

// Determine winner
const determineWinner = (team1, team2) => {
  if (team1.score > team2.score) return team1.name
  if (team2.score > team1.score) return team2.name
  return 'تعادل' // Draw
}

// Calculate game duration
const calculateGameDuration = (gameHistory) => {
  if (!gameHistory || gameHistory.length === 0) return 0

  const firstQuestion = Math.min(...gameHistory.map(q => q.timestamp))
  const lastQuestion = Math.max(...gameHistory.map(q => q.timestamp))

  return Math.round((lastQuestion - firstQuestion) / 1000 / 60) // Duration in minutes
}

// Get category statistics
export const getCategoryStats = () => {
  const history = getGameHistory()
  const categoryStats = {}

  history.forEach(game => {
    game.gameHistory.forEach(question => {
      // Extract category from question (you might need to adjust this based on your data structure)
      const category = question.category || 'Unknown'

      if (!categoryStats[category]) {
        categoryStats[category] = {
          totalQuestions: 0,
          correctAnswers: 0,
          incorrectAnswers: 0,
          noAnswers: 0,
          averageDifficulty: []
        }
      }

      const stats = categoryStats[category]
      stats.totalQuestions++

      if (question.winner) {
        stats.correctAnswers++
      } else if (question.winner === null) {
        stats.noAnswers++
      } else {
        stats.incorrectAnswers++
      }
    })
  })

  return categoryStats
}

// Get recent performance trends
export const getPerformanceTrends = (teamName, lastNGames = 10) => {
  const history = getGameHistory()
  const teamGames = history.filter(game =>
    game.team1.name === teamName || game.team2.name === teamName
  ).slice(0, lastNGames)

  return teamGames.map(game => ({
    date: game.date,
    score: game.team1.name === teamName ? game.team1.score : game.team2.score,
    won: game.winner === teamName,
    opponentScore: game.team1.name === teamName ? game.team2.score : game.team1.score
  }))
}

// Clear all statistics (admin function)
export const clearAllStats = () => {
  localStorage.removeItem(STORAGE_KEYS.GAME_HISTORY)
  localStorage.removeItem(STORAGE_KEYS.TEAM_STATS)
}

// Export game statistics
export const exportStats = () => {
  return {
    gameHistory: getGameHistory(),
    teamStats: getTeamStats(),
    categoryStats: getCategoryStats(),
    exportDate: new Date().toISOString()
  }
}