import { devLog, devWarn, prodError } from "../utils/devLog"
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth'
import { doc, setDoc, getDoc, collection, addDoc, query, where, orderBy, getDocs, updateDoc, deleteDoc, limit, onSnapshot } from 'firebase/firestore'
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

      // Create user document in Firestore
      // Note: isAdmin is NEVER set to true on signup - this is enforced by Firestore rules
      // Admins must be manually assigned via the database or by existing admins
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: displayName,
        createdAt: new Date(),
        isAdmin: false, // Always false - Firestore rules prevent isAdmin:true on create
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
      await sendPasswordResetEmail(auth, email)
      devLog('Password reset email sent to:', email)
    } catch (error) {
      prodError('Error sending password reset email:', error)
      throw error
    }
  }

  // Change password (requires current password for security)
  static async changePassword(currentPassword, newPassword) {
    try {
      const user = auth.currentUser
      if (!user || !user.email) {
        throw new Error('No user logged in')
      }

      // Reauthenticate user with current password (Firebase security requirement)
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)

      // Update to new password
      await updatePassword(user, newPassword)
      devLog('Password changed successfully for:', user.email)
    } catch (error) {
      prodError('Error changing password:', error)
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

        // Game history - rebuild each entry (including question text and answer for analytics)
        if (originalData.gameHistory && Array.isArray(originalData.gameHistory)) {
          rebuilt.gameHistory = originalData.gameHistory
            .filter(entry => entry != null)
            .map(entry => ({
              questionId: String(entry.questionId || ''),
              question: String(entry.question || ''),
              answer: String(entry.answer || ''),
              difficulty: String(entry.difficulty || ''),
              winner: String(entry.winner || ''),
              points: Number(entry.points || 0),
              basePoints: Number(entry.basePoints || entry.points || 0),
              timestamp: entry.timestamp || Date.now(),
              category: String(entry.category || '')
            }))
        }

        // Perk usage - include all perk types
        if (originalData.perkUsage) {
          rebuilt.perkUsage = {
            team1: {
              double: Number(originalData.perkUsage.team1?.double || 0),
              phone: Number(originalData.perkUsage.team1?.phone || 0),
              search: Number(originalData.perkUsage.team1?.search || 0),
              risk: Number(originalData.perkUsage.team1?.risk || 0),
              prison: Number(originalData.perkUsage.team1?.prison || 0),
              twoAnswers: Number(originalData.perkUsage.team1?.twoAnswers || 0)
            },
            team2: {
              double: Number(originalData.perkUsage.team2?.double || 0),
              phone: Number(originalData.perkUsage.team2?.phone || 0),
              search: Number(originalData.perkUsage.team2?.search || 0),
              risk: Number(originalData.perkUsage.team2?.risk || 0),
              prison: Number(originalData.perkUsage.team2?.prison || 0),
              twoAnswers: Number(originalData.perkUsage.team2?.twoAnswers || 0)
            }
          }
        }

        // Activated perks - include all perk types
        if (originalData.activatedPerks) {
          rebuilt.activatedPerks = {
            doublePoints: {
              active: Boolean(originalData.activatedPerks.doublePoints?.active || false),
              team: originalData.activatedPerks.doublePoints?.team ?
                    String(originalData.activatedPerks.doublePoints.team) : null
            },
            riskPoints: {
              active: Boolean(originalData.activatedPerks.riskPoints?.active || false),
              team: originalData.activatedPerks.riskPoints?.team ?
                    String(originalData.activatedPerks.riskPoints.team) : null
            },
            twoAnswers: {
              active: Boolean(originalData.activatedPerks.twoAnswers?.active || false),
              team: originalData.activatedPerks.twoAnswers?.team ?
                    String(originalData.activatedPerks.twoAnswers.team) : null
            },
            prison: {
              active: Boolean(originalData.activatedPerks.prison?.active || false),
              team: originalData.activatedPerks.prison?.team ?
                    String(originalData.activatedPerks.prison.team) : null,
              targetTeam: originalData.activatedPerks.prison?.targetTeam ?
                    String(originalData.activatedPerks.prison.targetTeam) : null
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

        // Game ID - critical for updating existing games
        if (originalData.gameId) {
          rebuilt.gameId = String(originalData.gameId)
        }

        // Game started timestamp
        if (originalData.gameStartedAt) {
          rebuilt.gameStartedAt = originalData.gameStartedAt
        }

        // Selected perks
        if (originalData.selectedPerks && Array.isArray(originalData.selectedPerks)) {
          rebuilt.selectedPerks = originalData.selectedPerks.filter(p => p != null).map(p => String(p))
        }

        // Used point values - convert Set/Array to clean array
        if (originalData.usedPointValues) {
          if (originalData.usedPointValues instanceof Set) {
            rebuilt.usedPointValues = Array.from(originalData.usedPointValues).filter(v => v != null).map(v => String(v))
          } else if (Array.isArray(originalData.usedPointValues)) {
            rebuilt.usedPointValues = originalData.usedPointValues.filter(v => v != null).map(v => String(v))
          } else {
            rebuilt.usedPointValues = []
          }
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
      const currentUser = AuthService.getCurrentUser()
      const userName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'لاعب مجهول'

      // Determine if this is a complete game or in-progress save
      const isComplete = gameData.isComplete !== undefined ? gameData.isComplete : true

      const documentToSave = {
        userId: String(uid),
        userName: String(userName),
        gameData: gameDataForFirebase,
        finalScore: Number(gameData.finalScore || 0),
        updatedAt: new Date(),
        isComplete: isComplete
      }

      // Store gameId in the document for reference
      if (gameId) {
        documentToSave.gameId = gameId
      }

      devLog('📄 Final document to save:')
      devLog(JSON.stringify(documentToSave, null, 2))
      devLog('🆔 Game ID:', gameId)
      devLog('✅ Is complete:', isComplete)

      // Save or update game in games collection
      // Use setDoc with merge to avoid needing read permissions for existence check
      // IMPORTANT: Use isGameContinuation flag to determine if this is a new game
      // New games have isGameContinuation: false, continued games have isGameContinuation: true
      let isNewGame = !isGameContinuation
      devLog('🎮 Is game continuation:', isGameContinuation, '→ Is new game:', isNewGame)

      // Check if this game was already counted (prevents double-counting from re-renders)
      let alreadyCounted = false
      if (gameId) {
        const gameRef = doc(db, 'games', gameId)

        // Check existing game document for statsCounted flag
        const existingGame = await getDoc(gameRef)
        if (existingGame.exists()) {
          alreadyCounted = existingGame.data().statsCounted === true
        }

        // Use setDoc with merge: true - creates if not exists, updates if exists
        // Also set createdAt only if it doesn't exist (using merge)
        devLog('💾 Saving game with ID:', gameId)
        await setDoc(gameRef, {
          ...documentToSave,
          createdAt: documentToSave.createdAt || new Date()
        }, { merge: true })
      } else {
        // Fallback: no gameId - create with auto-generated ID
        devLog('🆕 Creating new game (no gameId)')
        documentToSave.createdAt = new Date()
        await addDoc(collection(db, 'games'), documentToSave)
      }

      // Update user stats (only increment games played for NEW + COMPLETE games that haven't been counted)
      // Don't count: auto-saves (isComplete: false), continued games (isGameContinuation: true), or already counted games
      const shouldCountGame = isNewGame && isComplete && !alreadyCounted
      devLog('📊 Should count game:', shouldCountGame, '(isNewGame:', isNewGame, ', isComplete:', isComplete, ', alreadyCounted:', alreadyCounted, ')')

      const userRef = doc(db, 'users', uid)
      const userDoc = await getDoc(userRef)

      if (userDoc.exists()) {
        const currentStats = userDoc.data().gameStats || {}

        await setDoc(userRef, {
          gameStats: {
            gamesPlayed: shouldCountGame
              ? (currentStats.gamesPlayed || 0) + 1 // Increment only for new complete games
              : (currentStats.gamesPlayed || 0), // Don't increment for auto-saves or continued games
            totalScore: (currentStats.totalScore || 0) + (shouldCountGame ? gameData.finalScore : 0),
            favoriteCategories: currentStats.favoriteCategories || [],
            lastPlayed: new Date()
          }
        }, { merge: true })

        // Mark game as counted to prevent future double-counting
        if (shouldCountGame && gameId) {
          const gameRef = doc(db, 'games', gameId)
          await setDoc(gameRef, { statsCounted: true }, { merge: true })
          devLog('✅ Game marked as statsCounted')
        }
      }

      devLog('✅ Game data saved to Firebase successfully')

      // Update public leaderboard only for complete games (not auto-saves)
      if (isComplete) {
        try {
          devLog('🏆 Updating public leaderboard...')
          await AuthService.updateLeaderboard()
          devLog('✅ Public leaderboard updated successfully')
        } catch (leaderboardError) {
          prodError('⚠️ Failed to update leaderboard (non-critical):', leaderboardError)
          // Don't throw - leaderboard update failure shouldn't break game saving
        }
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

  // Get ALL games (admin only - for analytics)
  static async getAllGames(options = {}) {
    try {
      devLog('📊 Loading all games for analytics')

      const { startDate, endDate } = options
      let gamesQuery

      if (startDate && endDate) {
        // With date filtering
        gamesQuery = query(
          collection(db, 'games'),
          where('createdAt', '>=', startDate),
          where('createdAt', '<=', endDate),
          orderBy('createdAt', 'desc')
        )
      } else {
        // All games
        gamesQuery = query(
          collection(db, 'games'),
          orderBy('createdAt', 'desc')
        )
      }

      const snapshot = await getDocs(gamesQuery)
      const games = []

      snapshot.forEach((doc) => {
        const data = doc.data()
        games.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date()
        })
      })

      devLog('📊 Loaded', games.length, 'games for analytics')
      return games
    } catch (error) {
      prodError('❌ Error getting all games:', error)
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

      // Cache the result for 1 minute for everyone (short TTL for quick updates)
      AuthService.setCached('leaderboard', sortedLeaderboard, 1)

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
   * Invalidate leaderboard cache after game stats change
   * Note: Leaderboard data is read from users.gameStats (updated in updateGameStats)
   * This method just ensures cache is cleared so fresh data is fetched
   */
  static async updateLeaderboard() {
    try {
      // Invalidate leaderboard cache so next fetch gets fresh data from users collection
      AuthService.cache.delete('leaderboard')
      devLog('🏆 Leaderboard cache invalidated - will fetch fresh data on next request')

      // Return updated public leaderboard with fresh data
      return await AuthService.getPublicLeaderboard()
    } catch (error) {
      prodError('❌ Error updating leaderboard:', error)
      throw error
    }
  }

  /**
   * Subscribe to real-time leaderboard updates
   * @param {Function} callback - Called with updated leaderboard data whenever it changes
   * @returns {Function} Unsubscribe function
   */
  static subscribeToLeaderboard(callback) {
    devLog('🏆 Setting up real-time leaderboard subscription')

    const usersRef = collection(db, 'users')

    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      try {
        const leaderboard = []

        snapshot.forEach(doc => {
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

        // Sort by games played and get top 10
        const sortedLeaderboard = leaderboard
          .sort((a, b) => (b.gamesPlayed || 0) - (a.gamesPlayed || 0))
          .slice(0, 10)

        devLog('🏆 Real-time leaderboard update:', sortedLeaderboard.length, 'entries')

        // Update cache with fresh data
        AuthService.setCached('leaderboard', sortedLeaderboard, 1)

        // Call the callback with updated data
        callback(sortedLeaderboard)
      } catch (error) {
        prodError('❌ Error processing leaderboard snapshot:', error)
        callback([])
      }
    }, (error) => {
      // Handle permission errors gracefully
      if (error.code === 'permission-denied') {
        devLog('⚠️ Real-time leaderboard not accessible - returning empty array')
        callback([])
      } else {
        prodError('❌ Error in leaderboard subscription:', error)
        callback([])
      }
    })

    return unsubscribe
  }
}