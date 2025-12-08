import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect } from 'react'
import { AuthService } from '../firebase/authService'

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
        await AuthService.updateGameStats(user.uid, gameData)
      } catch (error) {
        prodError('Error updating game stats:', error)
      }
    }
  }

  const getUserGames = async () => {
    if (user) {
      try {
        return await AuthService.getUserGames(user.uid)
      } catch (error) {
        prodError('Error getting user games:', error)
        return []
      }
    }
    return []
  }

  const deleteGame = async (gameId) => {
    if (user) {
      try {
        return await AuthService.deleteGame(gameId)
      } catch (error) {
        prodError('Error deleting game:', error)
        throw error
      }
    }
  }

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