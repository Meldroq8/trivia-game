import { db, auth } from './config'
import {
  doc,
  setDoc,
  getDoc,
  collection,
  onSnapshot,
  updateDoc,
  deleteField
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

/**
 * Firebase Settings Service
 * Replaces localStorage for all app settings and user preferences
 */
class SettingsService {
  constructor() {
    this.listeners = new Map()
    this.currentUser = null
    this.appSettingsCache = null
    this.userSettingsCache = null

    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user
      if (user) {
        this.loadUserSettings()
      } else {
        this.userSettingsCache = null
      }
    })
  }

  // App-wide settings (shared across all users)
  static APP_SETTINGS_DOC = 'app-settings'

  // User-specific settings paths
  getUserSettingsDoc(userId) {
    return `users/${userId}/settings/preferences`
  }

  getUserGameStateDoc(userId) {
    return `users/${userId}/game-state/current`
  }

  getUserStatsDoc(userId) {
    return `users/${userId}/stats/data`
  }

  // ===== APP SETTINGS (Logo, Global Config) =====

  /**
   * Save app-wide settings (logo, etc.)
   */
  async saveAppSettings(settings) {
    try {
      // Clean settings of undefined values
      const cleanedSettings = this.cleanUndefinedValues(settings)

      const docRef = doc(db, 'settings', SettingsService.APP_SETTINGS_DOC)
      await setDoc(docRef, {
        ...cleanedSettings,
        updatedAt: new Date().toISOString()
      }, { merge: true })

      this.appSettingsCache = { ...this.appSettingsCache, ...cleanedSettings }
      console.log('✅ App settings saved to Firebase')
      return true
    } catch (error) {
      console.error('❌ Error saving app settings:', error)
      return false
    }
  }

  /**
   * Load app-wide settings
   */
  async getAppSettings() {
    try {
      if (this.appSettingsCache) {
        return this.appSettingsCache
      }

      const docRef = doc(db, 'settings', SettingsService.APP_SETTINGS_DOC)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        this.appSettingsCache = docSnap.data()
        return this.appSettingsCache
      }

      return {}
    } catch (error) {
      console.error('❌ Error loading app settings:', error)
      return {}
    }
  }

  /**
   * Listen for app settings changes in real-time
   */
  subscribeToAppSettings(callback) {
    const docRef = doc(db, 'settings', SettingsService.APP_SETTINGS_DOC)
    const unsubscribe = onSnapshot(docRef, (doc) => {
      if (doc.exists()) {
        this.appSettingsCache = doc.data()
        callback(this.appSettingsCache)
      }
    })
    return unsubscribe
  }

  // ===== USER SETTINGS =====

  /**
   * Save user-specific settings
   */
  async saveUserSettings(settings, userId = null) {
    try {
      const uid = userId || this.currentUser?.uid
      if (!uid) {
        console.warn('⚠️ No user ID for saving settings')
        return false
      }

      // Clean settings of undefined values
      const cleanedSettings = this.cleanUndefinedValues(settings)

      const docRef = doc(db, ...this.getUserSettingsDoc(uid).split('/'))
      await setDoc(docRef, {
        ...cleanedSettings,
        updatedAt: new Date().toISOString()
      }, { merge: true })

      this.userSettingsCache = { ...this.userSettingsCache, ...cleanedSettings }
      console.log('✅ User settings saved to Firebase')
      return true
    } catch (error) {
      console.error('❌ Error saving user settings:', error)
      return false
    }
  }

  /**
   * Load user-specific settings
   */
  async getUserSettings(userId = null) {
    try {
      const uid = userId || this.currentUser?.uid
      if (!uid) return {}

      if (this.userSettingsCache) {
        return this.userSettingsCache
      }

      const docRef = doc(db, ...this.getUserSettingsDoc(uid).split('/'))
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        this.userSettingsCache = docSnap.data()
        return this.userSettingsCache
      }

      return {}
    } catch (error) {
      console.error('❌ Error loading user settings:', error)
      return {}
    }
  }

  /**
   * Load user settings on auth change
   */
  async loadUserSettings() {
    if (this.currentUser) {
      await this.getUserSettings()
    }
  }

  // ===== GAME STATE PERSISTENCE =====

  /**
   * Clean object of undefined values recursively
   */
  cleanUndefinedValues(obj) {
    if (obj === null || obj === undefined) {
      return null
    }

    if (Array.isArray(obj)) {
      return obj.filter(item => item !== undefined).map(item => this.cleanUndefinedValues(item))
    }

    if (obj instanceof Set) {
      return Array.from(obj).filter(item => item !== undefined)
    }

    if (typeof obj === 'object') {
      const cleaned = {}
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          cleaned[key] = this.cleanUndefinedValues(value)
        }
      }
      return cleaned
    }

    return obj
  }

  /**
   * Save current game state to Firebase
   */
  async saveGameState(gameState, userId = null) {
    try {
      const uid = userId || this.currentUser?.uid
      if (!uid) {
        console.warn('⚠️ No user ID for saving game state')
        return false
      }

      // Clean the game state of undefined values
      const cleanedGameState = this.cleanUndefinedValues(gameState)

      const docRef = doc(db, ...this.getUserGameStateDoc(uid).split('/'))
      await setDoc(docRef, {
        gameState: cleanedGameState,
        savedAt: new Date().toISOString()
      })

      console.log('✅ Game state saved to Firebase')
      return true
    } catch (error) {
      console.error('❌ Error saving game state:', error)
      return false
    }
  }

  /**
   * Load saved game state from Firebase
   */
  async getGameState(userId = null) {
    try {
      const uid = userId || this.currentUser?.uid
      if (!uid) return null

      const docRef = doc(db, ...this.getUserGameStateDoc(uid).split('/'))
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        const data = docSnap.data()
        return data.gameState
      }

      return null
    } catch (error) {
      console.error('❌ Error loading game state:', error)
      return null
    }
  }

  // ===== STATISTICS =====

  /**
   * Save user statistics
   */
  async saveUserStats(stats, userId = null) {
    try {
      const uid = userId || this.currentUser?.uid
      if (!uid) return false

      // Clean stats of undefined values
      const cleanedStats = this.cleanUndefinedValues(stats)

      const docRef = doc(db, ...this.getUserStatsDoc(uid).split('/'))
      await setDoc(docRef, {
        ...cleanedStats,
        updatedAt: new Date().toISOString()
      }, { merge: true })

      console.log('✅ User stats saved to Firebase')
      return true
    } catch (error) {
      console.error('❌ Error saving user stats:', error)
      return false
    }
  }

  /**
   * Load user statistics
   */
  async getUserStats(userId = null) {
    try {
      const uid = userId || this.currentUser?.uid
      if (!uid) return {}

      const docRef = doc(db, ...this.getUserStatsDoc(uid).split('/'))
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        return docSnap.data()
      }

      return {}
    } catch (error) {
      console.error('❌ Error loading user stats:', error)
      return {}
    }
  }

  // ===== DATA MIGRATION HELPERS =====

  /**
   * Migrate localStorage data to Firebase
   */
  async migrateFromLocalStorage() {
    try {
      console.log('🔄 Starting localStorage to Firebase migration...')

      // Migrate app settings (logo)
      const logo = localStorage.getItem('trivia-game-logo')
      const logoSize = localStorage.getItem('trivia-game-logo-size')
      if (logo || logoSize) {
        await this.saveAppSettings({
          logo: logo || null,
          logoSize: logoSize || 'medium'
        })
        console.log('✅ Migrated logo settings')
      }

      if (this.currentUser) {
        // Migrate game state
        const gameState = localStorage.getItem('trivia-game-state')
        if (gameState) {
          try {
            const parsedState = JSON.parse(gameState)
            await this.saveGameState(parsedState)
            console.log('✅ Migrated game state')
          } catch (e) {
            console.warn('⚠️ Could not migrate game state:', e)
          }
        }

        // Migrate admin tab preference
        const adminTab = localStorage.getItem('adminActiveTab')
        if (adminTab) {
          await this.saveUserSettings({ adminActiveTab: adminTab })
          console.log('✅ Migrated admin tab preference')
        }
      }

      console.log('✅ Migration completed')
      return true
    } catch (error) {
      console.error('❌ Migration failed:', error)
      return false
    }
  }

  /**
   * Clear localStorage after successful migration
   */
  clearLocalStorageCache() {
    const keysToRemove = [
      'trivia-game-logo',
      'trivia-game-logo-size',
      'trivia-game-state',
      'adminActiveTab'
    ]

    keysToRemove.forEach(key => {
      localStorage.removeItem(key)
    })

    console.log('🗑️ Cleared migrated localStorage keys')
  }

  // ===== CLEANUP =====

  /**
   * Clear all user data from Firebase
   */
  async clearUserData(userId = null) {
    try {
      const uid = userId || this.currentUser?.uid
      if (!uid) return false

      // Clear user settings, game state, and stats
      const settingsRef = doc(db, ...this.getUserSettingsDoc(uid).split('/'))
      const gameStateRef = doc(db, ...this.getUserGameStateDoc(uid).split('/'))
      const statsRef = doc(db, ...this.getUserStatsDoc(uid).split('/'))

      await Promise.all([
        setDoc(settingsRef, {}),
        setDoc(gameStateRef, {}),
        setDoc(statsRef, {})
      ])

      this.userSettingsCache = null
      console.log('🗑️ Cleared all user data from Firebase')
      return true
    } catch (error) {
      console.error('❌ Error clearing user data:', error)
      return false
    }
  }
}

// Export singleton instance
export const settingsService = new SettingsService()
export default settingsService