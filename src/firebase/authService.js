import { devLog, devWarn, prodError } from "../utils/devLog"
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth'
import { doc, setDoc, getDoc, collection, addDoc, query, where, orderBy, getDocs, updateDoc, deleteDoc, limit } from 'firebase/firestore'
import { auth, db } from './config'
import { settingsService } from './settingsService'

export class AuthService {
  // Simple cache for frequently accessed data
  static cache = new Map()

  // Cache helper methods
  static getCached(key) {
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data
    }
    this.cache.delete(key)
    return null
  }

  static setCached(key, data, ttlMinutes = 5) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMinutes * 60 * 1000
    })
  }

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
      prodError('Error signing up:', error)
      throw error
    }
  }

  // Sign in existing user
  static async signIn(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      return userCredential.user
    } catch (error) {
      prodError('Error signing in:', error)
      throw error
    }
  }

  // Sign out user
  static async signOut() {
    try {
      await signOut(auth)
    } catch (error) {
      prodError('Error signing out:', error)
      throw error
    }
  }

  // Send password reset email
  static async resetPassword(email) {
    try {
      // Configure to use our custom domain/page
      const actionCodeSettings = {
        // This will be the continue URL after password reset
        url: window.location.origin,
        handleCodeInApp: false
      }

      await sendPasswordResetEmail(auth, email, actionCodeSettings)
      devLog('Password reset email sent to:', email)
    } catch (error) {
      prodError('Error sending password reset email:', error)
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
      prodError('Error getting user profile:', error)
      throw error
    }
  }

  // Update user game stats and save complete game data
  static async updateGameStats(uid, gameData) {
    try {
      devLog('💾 Saving game data to Firebase:', { uid, gameData })

      // Completely rebuild the game data structure to ensure no undefined values
      const rebuildGameData = (originalData) => {
        if (!originalData || typeof originalData !== 'object') {
          return null
        }

        // Handle specific game data structure
        const rebuilt = {}

        // Team data
        if (originalData.team1) {
          rebuilt.team1 = {
            name: String(originalData.team1.name || 'الفريق الأول'),
            score: Number(originalData.team1.score || 0)
          }
        }

        if (originalData.team2) {
          rebuilt.team2 = {
            name: String(originalData.team2.name || 'الفريق الثاني'),
            score: Number(originalData.team2.score || 0)
          }
        }

        // Categories - convert to clean array
        if (originalData.selectedCategories) {
          rebuilt.selectedCategories = Array.isArray(originalData.selectedCategories)
            ? originalData.selectedCategories.filter(cat => cat != null).map(cat => String(cat))
            : []
        }

        // Used questions - convert Set/Array to clean array
        if (originalData.usedQuestions) {
          if (originalData.usedQuestions instanceof Set) {
            rebuilt.usedQuestions = Array.from(originalData.usedQuestions).filter(q => q != null).map(q => String(q))
          } else if (Array.isArray(originalData.usedQuestions)) {
            rebuilt.usedQuestions = originalData.usedQuestions.filter(q => q != null).map(q => String(q))
          } else {
            rebuilt.usedQuestions = []
          }
        }

        // Game history - rebuild each entry
        if (originalData.gameHistory && Array.isArray(originalData.gameHistory)) {
          rebuilt.gameHistory = originalData.gameHistory
            .filter(entry => entry != null)
            .map(entry => ({
              questionId: String(entry.questionId || ''),
              winner: String(entry.winner || ''),
              points: Number(entry.points || 0),
              timestamp: entry.timestamp || Date.now(),
              category: String(entry.category || '')
            }))
        }

        // Perk usage
        if (originalData.perkUsage) {
          rebuilt.perkUsage = {
            team1: {
              double: Number(originalData.perkUsage.team1?.double || 0),
              phone: Number(originalData.perkUsage.team1?.phone || 0),
              search: Number(originalData.perkUsage.team1?.search || 0)
            },
            team2: {
              double: Number(originalData.perkUsage.team2?.double || 0),
              phone: Number(originalData.perkUsage.team2?.phone || 0),
              search: Number(originalData.perkUsage.team2?.search || 0)
            }
          }
        }

        // Activated perks
        if (originalData.activatedPerks) {
          rebuilt.activatedPerks = {
            doublePoints: {
              active: Boolean(originalData.activatedPerks.doublePoints?.active || false),
              team: originalData.activatedPerks.doublePoints?.team ?
                    String(originalData.activatedPerks.doublePoints.team) : null
            }
          }
        }

        // Current turn
        if (originalData.currentTurn) {
          rebuilt.currentTurn = String(originalData.currentTurn)
        }

        // Game name
        if (originalData.gameName) {
          rebuilt.gameName = String(originalData.gameName)
        }

        // CRITICAL: Assigned questions for payment model - store only question IDs and metadata
        if (originalData.assignedQuestions && typeof originalData.assignedQuestions === 'object') {
          rebuilt.assignedQuestions = {}
          devLog('🔧 Processing assignedQuestions (ID-based):', originalData.assignedQuestions)

          for (const [buttonKey, assignment] of Object.entries(originalData.assignedQuestions)) {
            if (assignment && typeof assignment === 'object') {
              // Store only the essential data: questionId and metadata
              rebuilt.assignedQuestions[String(buttonKey)] = {
                questionId: String(assignment.questionId || ''),
                categoryId: String(assignment.categoryId || ''),
                points: Number(assignment.points || 0),
                category: String(assignment.category || ''),
                buttonIndex: Number(assignment.buttonIndex || 0)
              }
            }
          }

          devLog('🔧 Rebuilt assignedQuestions (simplified):', rebuilt.assignedQuestions)
        }

        return rebuilt
      }

      const gameDataForFirebase = rebuildGameData(gameData.gameData)

      devLog('🔄 Rebuilt game data for Firebase:')
      devLog(JSON.stringify(gameDataForFirebase, null, 2))
      devLog('📊 Final score:', gameData.finalScore)

      // Check if this is a game continuation (updating existing game)
      const gameId = gameData.gameData?.gameId
      const isGameContinuation = gameData.gameData?.isGameContinuation

      // Build the final document with guaranteed clean data
      // Get user's display name for leaderboard
      const currentUser = AuthService.currentUser
      const userName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'لاعب مجهول'

      const documentToSave = {
        userId: String(uid),
        userName: String(userName),
        gameData: gameDataForFirebase,
        finalScore: Number(gameData.finalScore || 0),
        updatedAt: new Date(),
        isComplete: true
      }

      // Only set createdAt for new games
      if (!isGameContinuation) {
        documentToSave.createdAt = new Date()
      }

      devLog('📄 Final document to save:')
      devLog(JSON.stringify(documentToSave, null, 2))
      devLog('🔄 Is game continuation:', isGameContinuation)
      devLog('🆔 Game ID:', gameId)
      devLog('📊 Will increment gamesPlayed?', !isGameContinuation)

      // Save or update game in games collection
      if (isGameContinuation && gameId) {
        // Update existing game
        devLog('📝 Updating existing game:', gameId)
        const gameRef = doc(db, 'games', gameId)
        await updateDoc(gameRef, documentToSave)
      } else {
        // Create new game
        devLog('🆕 Creating new game')
        await addDoc(collection(db, 'games'), documentToSave)
      }

      // Update user stats (only increment games played for new games)
      const userRef = doc(db, 'users', uid)
      const userDoc = await getDoc(userRef)

      if (userDoc.exists()) {
        const currentStats = userDoc.data().gameStats || {}

        await setDoc(userRef, {
          gameStats: {
            gamesPlayed: isGameContinuation
              ? (currentStats.gamesPlayed || 0) // Don't increment for continuations
              : (currentStats.gamesPlayed || 0) + 1, // Increment for new games
            totalScore: (currentStats.totalScore || 0) + gameData.finalScore,
            favoriteCategories: currentStats.favoriteCategories || [],
            lastPlayed: new Date()
          }
        }, { merge: true })
      }

      devLog('✅ Game data saved to Firebase successfully')

      // Update public leaderboard after successful game save (async, non-blocking)
      try {
        devLog('🏆 Updating public leaderboard...')
        await AuthService.updateLeaderboard()
        devLog('✅ Public leaderboard updated successfully')
      } catch (leaderboardError) {
        prodError('⚠️ Failed to update leaderboard (non-critical):', leaderboardError)
        // Don't throw - leaderboard update failure shouldn't break game saving
      }
    } catch (error) {
      prodError('❌ Error updating game stats:', error)
      throw error
    }
  }

  // Get user's games
  static async getUserGames(uid) {
    try {
      devLog('📖 Loading games for user:', uid)

      const gamesQuery = query(
        collection(db, 'games'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(4) // Show only the last 4 games in My Games
      )

      const snapshot = await getDocs(gamesQuery)
      const games = []

      snapshot.forEach((doc) => {
        games.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date()
        })
      })

      devLog('📚 Loaded', games.length, 'games')
      return games
    } catch (error) {
      prodError('❌ Error getting user games:', error)
      throw error
    }
  }

  // Delete a user's game
  static async deleteGame(gameId) {
    try {
      devLog('🗑️ Deleting game:', gameId)

      const gameRef = doc(db, 'games', gameId)
      await deleteDoc(gameRef)

      devLog('✅ Game deleted successfully')
    } catch (error) {
      prodError('❌ Error deleting game:', error)
      throw error
    }
  }

  // ===== SETTINGS METHODS =====

  // App settings (logo, global config)
  static async getAppSettings() {
    return await settingsService.getAppSettings()
  }

  static async saveAppSettings(settings) {
    return await settingsService.saveAppSettings(settings)
  }

  static subscribeToAppSettings(callback) {
    return settingsService.subscribeToAppSettings(callback)
  }

  // User settings
  static async getUserSettings(userId = null) {
    return await settingsService.getUserSettings(userId)
  }

  static async saveUserSettings(settings, userId = null) {
    return await settingsService.saveUserSettings(settings, userId)
  }

  // Game state persistence
  static async saveGameState(gameState, userId = null) {
    return await settingsService.saveGameState(gameState, userId)
  }

  static async getGameState(userId = null) {
    return await settingsService.getGameState(userId)
  }

  // Statistics
  static async saveUserStats(stats, userId = null) {
    return await settingsService.saveUserStats(stats, userId)
  }

  static async getUserStats(userId = null) {
    return await settingsService.getUserStats(userId)
  }

  // Migration
  static async migrateFromLocalStorage() {
    return await settingsService.migrateFromLocalStorage()
  }

  static clearLocalStorageCache() {
    settingsService.clearLocalStorageCache()
  }

  // ===== USER MANAGEMENT METHODS =====

  /**
   * Get all users (admin only)
   */
  static async getAllUsers() {
    try {
      devLog('📖 Loading all users')

      const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(usersQuery)
      const users = []

      snapshot.forEach((doc) => {
        const userData = doc.data()
        users.push({
          id: doc.id,
          ...userData,
          createdAt: userData.createdAt?.toDate?.() || new Date()
        })
      })

      devLog('📚 Loaded', users.length, 'users')
      return users
    } catch (error) {
      prodError('❌ Error getting all users:', error)
      throw error
    }
  }

  /**
   * Update user role (admin only)
   */
  static async updateUserRole(userId, role) {
    try {
      devLog('🔧 Updating user role:', { userId, role })

      const userRef = doc(db, 'users', userId)
      const updateData = {
        updatedAt: new Date()
      }

      // Set role flags
      if (role === 'admin') {
        updateData.isAdmin = true
        updateData.isModerator = false
      } else if (role === 'moderator') {
        updateData.isAdmin = false
        updateData.isModerator = true
      } else {
        updateData.isAdmin = false
        updateData.isModerator = false
      }

      await updateDoc(userRef, updateData)
      devLog('✅ User role updated successfully')
      return true
    } catch (error) {
      prodError('❌ Error updating user role:', error)
      throw error
    }
  }

  /**
   * Search users by email or display name
   */
  static async searchUsers(searchTerm) {
    try {
      devLog('🔍 Searching users with term:', searchTerm)

      const usersQuery = query(collection(db, 'users'))
      const snapshot = await getDocs(usersQuery)
      const users = []

      snapshot.forEach((doc) => {
        const userData = doc.data()
        const email = userData.email?.toLowerCase() || ''
        const displayName = userData.displayName?.toLowerCase() || ''
        const searchLower = searchTerm.toLowerCase()

        if (email.includes(searchLower) || displayName.includes(searchLower)) {
          users.push({
            id: doc.id,
            ...userData,
            createdAt: userData.createdAt?.toDate?.() || new Date()
          })
        }
      })

      devLog('🔎 Found', users.length, 'matching users')
      return users
    } catch (error) {
      prodError('❌ Error searching users:', error)
      throw error
    }
  }

  // ===== LEADERBOARD METHODS =====

  /**
   * Get public leaderboard (accessible to everyone)
   */
  static async getPublicLeaderboard() {
    try {
      // Check cache first (5 minute TTL)
      const cached = AuthService.getCached('leaderboard')
      if (cached) {
        devLog('🏆 Using cached leaderboard:', cached.length, 'entries')
        return cached
      }

      devLog('🏆 Loading public leaderboard from users collection')

      // Load from users collection instead - their gameStats should be populated
      const usersSnapshot = await getDocs(collection(db, 'users'))
      const leaderboard = []

      usersSnapshot.forEach(doc => {
        const userData = doc.data()
        const gamesPlayed = userData.gameStats?.gamesPlayed || 0

        // Only include users who have played at least one game
        if (gamesPlayed > 0) {
          leaderboard.push({
            id: doc.id,
            userId: doc.id,
            name: userData.displayName || userData.email?.split('@')[0] || 'لاعب مجهول',
            gamesPlayed: gamesPlayed,
            lastUpdated: userData.gameStats?.lastPlayed || new Date()
          })
        }
      })

      devLog('🏆 Loaded', leaderboard.length, 'users with games')

      // Sort by games played
      const sortedLeaderboard = leaderboard
        .sort((a, b) => (b.gamesPlayed || 0) - (a.gamesPlayed || 0))
        .slice(0, 10)

      devLog('🏆 Sorted top 10:', sortedLeaderboard)

      // Cache the result for 5 minutes (longer for unauthenticated to reduce errors)
      AuthService.setCached('leaderboard', sortedLeaderboard, AuthService.currentUser ? 5 : 60)

      return sortedLeaderboard
    } catch (error) {
      // If permission denied (not logged in), return empty array instead of throwing
      if (error.code === 'permission-denied') {
        devLog('⚠️ Leaderboard not accessible (not logged in) - returning empty array')
        return []
      }
      prodError('❌ Error loading public leaderboard:', error)
      throw error
    }
  }

  /**
   * Update leaderboard (admin only - usually called when game stats change)
   */
  static async updateLeaderboard() {
    try {
      const currentUser = AuthService.currentUser
      if (!currentUser) {
        devLog('⚠️ No user logged in, skipping leaderboard update')
        return []
      }

      // Count games for current user only
      const gamesQuery = query(
        collection(db, 'games'),
        where('userId', '==', currentUser.uid)
      )
      const gamesSnapshot = await getDocs(gamesQuery)
      const gameCount = gamesSnapshot.size

      if (gameCount === 0) {
        devLog('⚠️ No games found for current user')
        return []
      }

      const userName = currentUser.displayName || currentUser.email?.split('@')[0] || 'لاعب مجهول'

      // Update only current user's entry in leaderboard
      const leaderboardRef = doc(db, 'leaderboard', currentUser.uid)
      await setDoc(leaderboardRef, {
        userId: currentUser.uid,
        name: userName,
        gamesPlayed: gameCount,
        lastUpdated: new Date()
      })

      devLog('✅ Leaderboard entry updated for current user')

      // Invalidate leaderboard cache
      AuthService.cache.delete('leaderboard')

      // Return updated public leaderboard
      return await AuthService.getPublicLeaderboard()
    } catch (error) {
      prodError('❌ Error updating leaderboard:', error)
      throw error
    }
  }
}