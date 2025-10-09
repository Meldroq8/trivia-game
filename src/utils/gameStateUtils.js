import { devLog, devWarn, prodError } from "./devLog.js"
// Game state utility functions

/**
 * Determines if a game has started based on multiple indicators
 * @param {Object} gameState - The current game state
 * @returns {boolean} - True if game has started, false otherwise
 */
export const hasGameStarted = (gameState) => {
  if (!gameState) return false

  // Multiple indicators that a game has started
  const indicators = [
    // Categories have been selected
    gameState.selectedCategories && gameState.selectedCategories.length > 0,

    // Scores exist (teams have points)
    (gameState.team1 && gameState.team1.score > 0) || (gameState.team2 && gameState.team2.score > 0),

    // Game history exists (questions have been answered)
    gameState.gameHistory && gameState.gameHistory.length > 0,

    // Questions have been used
    gameState.usedQuestions && (
      (gameState.usedQuestions instanceof Set && gameState.usedQuestions.size > 0) ||
      (Array.isArray(gameState.usedQuestions) && gameState.usedQuestions.length > 0) ||
      (typeof gameState.usedQuestions === 'object' && Object.keys(gameState.usedQuestions).length > 0)
    ),

    // Questions have been assigned to categories
    gameState.assignedQuestions && Object.keys(gameState.assignedQuestions).length > 0,

    // A current question exists
    gameState.currentQuestion !== null && gameState.currentQuestion !== undefined,

    // Perks have been used
    gameState.perkUsage && (
      (gameState.perkUsage.team1 && Object.values(gameState.perkUsage.team1).some(count => count > 0)) ||
      (gameState.perkUsage.team2 && Object.values(gameState.perkUsage.team2).some(count => count > 0))
    )
  ]

  // Return true if ANY indicator suggests the game has started
  return indicators.some(indicator => indicator === true)
}

/**
 * Determines if we should stay on the current page (no redirects)
 * @param {Object} gameState - The current game state
 * @param {string} currentRoute - The current route path
 * @returns {boolean} - True if should stay, false if redirects are allowed
 */
export const shouldStayOnCurrentPage = (gameState, currentRoute) => {
  // Always stay if game has started
  if (hasGameStarted(gameState)) {
    return true
  }

  // ALWAYS stay on GameBoard page during refresh/reload
  if (currentRoute === '/game') {
    return true
  }

  // Stay if we're on a game-related route (route restoration scenario)
  const gameRoutes = ['/categories', '/question']
  if (gameRoutes.includes(currentRoute)) {
    return true
  }

  // Stay if currentRoute matches the current location (page refresh)
  if (gameState.currentRoute && gameState.currentRoute === currentRoute) {
    return true
  }

  return false
}

/**
 * Gets the appropriate back navigation route
 * @param {string} currentRoute - Current route
 * @param {Object} gameState - Game state
 * @returns {string} - Route to navigate back to
 */
export const getBackRoute = (currentRoute, gameState) => {
  switch (currentRoute) {
    case '/game':
      // From gameboard, go back to index (not categories)
      return '/'
    case '/question':
      // From question, go back to gameboard
      return '/game'
    case '/categories':
      // From categories, go back to index
      return '/'
    default:
      return '/'
  }
}