import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, deleteDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { devLog, prodError } from '../utils/devLog'

/**
 * Service for managing real-time charade game sessions
 * Phone users scan QR code to see the answer they need to act out
 */
export class CharadeService {
  /**
   * Create a new charade session
   * @param {string} sessionId - Unique session ID (usually visitorId_visitorCount or similar)
   * @param {object} data - Session data with answer info
   */
  static async createSession(sessionId, data) {
    try {
      // Filter out undefined values - Firebase doesn't accept undefined
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      )

      await setDoc(doc(db, 'charadeSessions', sessionId), {
        ...cleanData,
        status: 'active', // 'active', 'finished'
        createdAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎭 Charade session created:', sessionId)
    } catch (error) {
      prodError('Error creating charade session:', error)
      throw error
    }
  }

  /**
   * Get session data (one-time read)
   * @param {string} sessionId
   * @returns {Promise<Object|null>} Session data or null
   */
  static async getSession(sessionId) {
    try {
      const sessionDoc = await getDoc(doc(db, 'charadeSessions', sessionId))
      return sessionDoc.exists() ? sessionDoc.data() : null
    } catch (error) {
      prodError('Error getting charade session:', error)
      return null
    }
  }

  /**
   * Listen to charade session changes
   * @param {string} sessionId
   * @param {function} callback - Called with session data on changes
   * @returns {function} Unsubscribe function
   */
  static subscribeToSession(sessionId, callback) {
    const sessionRef = doc(db, 'charadeSessions', sessionId)

    return onSnapshot(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        callback(data)
      } else {
        callback(null)
      }
    }, (error) => {
      prodError('Error listening to charade session:', error)
      callback(null)
    })
  }

  /**
   * Mark session as finished
   * @param {string} sessionId
   */
  static async finishSession(sessionId) {
    try {
      await updateDoc(doc(db, 'charadeSessions', sessionId), {
        status: 'finished',
        finishedAt: serverTimestamp()
      })
      devLog('🎭 Charade session finished:', sessionId)
    } catch (error) {
      prodError('Error finishing charade session:', error)
      throw error
    }
  }

  /**
   * Delete a charade session (cleanup)
   * @param {string} sessionId
   */
  static async deleteSession(sessionId) {
    try {
      await deleteDoc(doc(db, 'charadeSessions', sessionId))
      devLog('🎭 Charade session deleted:', sessionId)
    } catch (error) {
      prodError('Error deleting charade session:', error)
      throw error
    }
  }

  /**
   * Update session with new answer data (when question changes)
   * @param {string} sessionId
   * @param {object} answerData - New answer data
   */
  static async updateAnswer(sessionId, answerData) {
    try {
      const cleanData = Object.fromEntries(
        Object.entries(answerData).filter(([_, value]) => value !== undefined)
      )

      await updateDoc(doc(db, 'charadeSessions', sessionId), {
        ...cleanData,
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎭 Charade session answer updated:', sessionId)
    } catch (error) {
      prodError('Error updating charade session:', error)
      throw error
    }
  }

  /**
   * Mark player as ready (phone user pressed ready button)
   * This triggers the timer on the main screen
   * @param {string} sessionId
   */
  static async markPlayerReady(sessionId) {
    try {
      await updateDoc(doc(db, 'charadeSessions', sessionId), {
        playerReady: true,
        playerReadyAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎭 Charade player marked as ready:', sessionId)
    } catch (error) {
      prodError('Error marking charade player ready:', error)
      throw error
    }
  }
}

export default CharadeService
