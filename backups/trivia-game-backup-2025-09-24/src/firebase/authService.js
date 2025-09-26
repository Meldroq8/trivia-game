import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth, db } from './config'

export class AuthService {
  // Sign up new user
  static async signUp(email, password, displayName) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      // Update user profile
      await updateProfile(user, { displayName })

      // Check if this is the first user (make them admin)
      const isFirstUser = email === 'f17@live.at' // You can change this email

      // Create user document in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: displayName,
        createdAt: new Date(),
        isAdmin: isFirstUser, // First specific user becomes admin
        gameStats: {
          gamesPlayed: 0,
          totalScore: 0,
          favoriteCategories: []
        },
        subscription: {
          plan: 'free',
          status: 'active'
        }
      })

      return user
    } catch (error) {
      console.error('Error signing up:', error)
      throw error
    }
  }

  // Sign in existing user
  static async signIn(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      return userCredential.user
    } catch (error) {
      console.error('Error signing in:', error)
      throw error
    }
  }

  // Sign out user
  static async signOut() {
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Error signing out:', error)
      throw error
    }
  }

  // Get current user
  static getCurrentUser() {
    return auth.currentUser
  }

  // Listen to auth state changes
  static onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback)
  }

  // Get user profile from Firestore
  static async getUserProfile(uid) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid))
      if (userDoc.exists()) {
        return userDoc.data()
      }
      return null
    } catch (error) {
      console.error('Error getting user profile:', error)
      throw error
    }
  }

  // Update user game stats
  static async updateGameStats(uid, gameData) {
    try {
      const userRef = doc(db, 'users', uid)
      const userDoc = await getDoc(userRef)

      if (userDoc.exists()) {
        const currentStats = userDoc.data().gameStats || {}

        await setDoc(userRef, {
          gameStats: {
            gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
            totalScore: (currentStats.totalScore || 0) + gameData.finalScore,
            favoriteCategories: currentStats.favoriteCategories || [],
            lastPlayed: new Date()
          }
        }, { merge: true })
      }
    } catch (error) {
      console.error('Error updating game stats:', error)
      throw error
    }
  }
}