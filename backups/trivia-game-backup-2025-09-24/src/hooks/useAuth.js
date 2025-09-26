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
        console.error('Auth state change error:', error)
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

  const updateGameStats = async (gameData) => {
    if (user) {
      try {
        await AuthService.updateGameStats(user.uid, gameData)
      } catch (error) {
        console.error('Error updating game stats:', error)
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
    updateGameStats,
    isAuthenticated: !!user,
    isAdmin: !!userProfile?.isAdmin
  }
}