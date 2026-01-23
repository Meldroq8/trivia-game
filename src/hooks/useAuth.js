import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect, useCallback } from 'react'
import { AuthService } from '../firebase/authService'
import { questionUsageTracker } from '../utils/questionUsageTracker'

export const useAuth = () => {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsubscribe = AuthService.onAuthStateChanged(async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser)
          // Get user profile from Firestore
          const profile = await AuthService.getUserProfile(firebaseUser.uid)
          setUserProfile(profile)
        } else {
          setUser(null)
          setUserProfile(null)
        }
      } catch (error) {
        prodError('Auth state change error:', error)
        setError(error.message)
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  // Sync question usage from game history once per session
  useEffect(() => {
    const syncUsageFromHistory = async () => {
      if (!user?.uid) return

      // Set user ID in tracker
      questionUsageTracker.setUserId(user.uid)

      try {
        // Check if sync is needed BEFORE loading games (saves Firebase reads)
        const needsSync = await questionUsageTracker.shouldSync()
        if (!needsSync) {
          return // Skip - already synced or in progress
        }

        devLog('🔄 Starting usage sync from game history...')
        devLog('📖 Loading ALL games for usage sync, user:', user.uid)
        // Fetch ALL user games (not limited to 4)
        const allGames = await AuthService.getAllUserGamesForSync(user.uid)
        // Sync usage data from game history
        await questionUsageTracker.syncUsageFromGameHistory(allGames)
      } catch (error) {
        prodError('❌ Error syncing usage from history:', error)
      }
    }

    syncUsageFromHistory()
  }, [user?.uid])

  const signUp = async (email, password, displayName) => {
    try {
      setError(null)
      setLoading(true)
      const user = await AuthService.signUp(email, password, displayName)
      return user
    } catch (error) {
      setError(error.message)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email, password) => {
    try {
      setError(null)
      setLoading(true)
      const user = await AuthService.signIn(email, password)
      return user
    } catch (error) {
      setError(error.message)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      setError(null)
      await AuthService.signOut()
    } catch (error) {
      setError(error.message)
      throw error
    }
  }

  const resetPassword = async (email) => {
    try {
      setError(null)
      await AuthService.resetPassword(email)
    } catch (error) {
      setError(error.message)
      throw error
    }
  }

  const changePassword = async (currentPassword, newPassword) => {
    try {
      setError(null)
      await AuthService.changePassword(currentPassword, newPassword)
    } catch (error) {
      setError(error.message)
      throw error
    }
  }

  const updateGameStats = async (gameData) => {
    if (user) {
      try {
        // Log which user the game is being saved for (helps debug issues)
        devLog('🎮 Saving game for user:', {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email
        })
        await AuthService.updateGameStats(user.uid, gameData)
      } catch (error) {
        prodError('Error updating game stats:', error)
      }
    } else {
      devWarn('⚠️ Cannot save game - no user logged in!')
    }
  }

  const getUserGames = useCallback(async () => {
    if (user) {
      try {
        return await AuthService.getUserGames(user.uid)
      } catch (error) {
        prodError('Error getting user games:', error)
        return []
      }
    }
    return []
  }, [user])

  const deleteGame = useCallback(async (gameId) => {
    if (user) {
      try {
        const result = await AuthService.deleteGame(gameId)
        // DON'T sync counters on game deletion - this causes data loss for categories
        // whose questions aren't properly tracked in game history.
        // Counters will stay as-is (slightly overcount but no data loss).
        // User can manually reset individual categories if needed.
        devLog('🗑️ Game deleted - keeping existing question counters')
        // Just clear the cache so next load gets fresh data from Firebase
        questionUsageTracker.clearCache()
        return result
      } catch (error) {
        prodError('Error deleting game:', error)
        throw error
      }
    }
  }, [user])

  return {
    user,
    userProfile,
    loading,
    error,
    signUp,
    signIn,
    signOut,
    resetPassword,
    changePassword,
    updateGameStats,
    getUserGames,
    deleteGame,
    isAuthenticated: !!user,
    isAdmin: !!userProfile?.isAdmin,
    isModerator: !!userProfile?.isModerator,
    isAdminOrModerator: !!(userProfile?.isAdmin || userProfile?.isModerator),
    // Settings methods
    getAppSettings: AuthService.getAppSettings,
    saveAppSettings: AuthService.saveAppSettings,
    subscribeToAppSettings: AuthService.subscribeToAppSettings,
    getUserSettings: AuthService.getUserSettings,
    saveUserSettings: AuthService.saveUserSettings,
    saveGameState: AuthService.saveGameState,
    getGameState: AuthService.getGameState,
    saveUserStats: AuthService.saveUserStats,
    getUserStats: AuthService.getUserStats,
    migrateFromLocalStorage: AuthService.migrateFromLocalStorage,
    clearLocalStorageCache: AuthService.clearLocalStorageCache,
    // User management methods (admin only)
    getAllUsers: AuthService.getAllUsers,
    updateUserRole: AuthService.updateUserRole,
    searchUsers: AuthService.searchUsers,
    // Analytics methods (admin only)
    getAllGames: AuthService.getAllGames,
    // Leaderboard methods
    getPublicLeaderboard: AuthService.getPublicLeaderboard,
    updateLeaderboard: AuthService.updateLeaderboard
  }
}