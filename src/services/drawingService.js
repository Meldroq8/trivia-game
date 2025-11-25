import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, increment, deleteDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { devLog, prodError } from '../utils/devLog'

/**
 * Service for managing real-time drawing sessions
 */
export class DrawingService {
  /**
   * Create a new drawing session
   * @param {string} sessionId - Unique session ID (usually questionId)
   * @param {object} data - Session data (questionId, teamTurn, difficulty)
   * @returns {Promise<void>}
   */
  static async createSession(sessionId, data) {
    try {
      await setDoc(doc(db, 'drawingSessions', sessionId), {
        ...data,
        status: 'waiting', // 'waiting', 'drawing', 'finished'
        drawerConnected: false,
        drawerReady: false,
        strokes: [],
        createdAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎨 Drawing session created:', sessionId)
    } catch (error) {
      prodError('Error creating drawing session:', error)
      throw error
    }
  }

  /**
   * Mark drawer as connected
   */
  static async connectDrawer(sessionId) {
    try {
      await updateDoc(doc(db, 'drawingSessions', sessionId), {
        drawerConnected: true,
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎨 Drawer connected to session:', sessionId)
    } catch (error) {
      prodError('Error connecting drawer:', error)
      throw error
    }
  }

  /**
   * Mark drawer as ready to start
   */
  static async markDrawerReady(sessionId) {
    try {
      await updateDoc(doc(db, 'drawingSessions', sessionId), {
        drawerReady: true,
        status: 'drawing',
        startedAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎨 Drawer marked ready, drawing started')
    } catch (error) {
      prodError('Error marking drawer ready:', error)
      throw error
    }
  }

  /**
   * Send heartbeat to indicate drawer is still connected
   */
  static async sendHeartbeat(sessionId) {
    try {
      await updateDoc(doc(db, 'drawingSessions', sessionId), {
        lastHeartbeat: serverTimestamp(),
        drawerConnected: true
      })
    } catch (error) {
      // Silent fail for heartbeats - don't spam console
    }
  }

  /**
   * Add a stroke to the drawing
   * @param {string} sessionId
   * @param {object} stroke - { points: [{x, y}], tool: 'pen'|'eraser', timestamp }
   */
  static async addStroke(sessionId, stroke) {
    try {
      const sessionRef = doc(db, 'drawingSessions', sessionId)
      const sessionDoc = await getDoc(sessionRef)

      if (!sessionDoc.exists()) {
        throw new Error('Session not found')
      }

      const currentStrokes = sessionDoc.data().strokes || []

      await updateDoc(sessionRef, {
        strokes: [...currentStrokes, stroke],
        lastHeartbeat: serverTimestamp()
      })
    } catch (error) {
      prodError('Error adding stroke:', error)
      throw error
    }
  }

  /**
   * Add multiple strokes (batch update for performance)
   */
  static async addStrokes(sessionId, newStrokes) {
    try {
      const sessionRef = doc(db, 'drawingSessions', sessionId)
      const sessionDoc = await getDoc(sessionRef)

      if (!sessionDoc.exists()) {
        throw new Error('Session not found')
      }

      const currentStrokes = sessionDoc.data().strokes || []

      await updateDoc(sessionRef, {
        strokes: [...currentStrokes, ...newStrokes],
        lastHeartbeat: serverTimestamp()
      })
    } catch (error) {
      prodError('Error adding strokes:', error)
      throw error
    }
  }

  /**
   * Clear all strokes (clear canvas button)
   */
  static async clearStrokes(sessionId) {
    try {
      await updateDoc(doc(db, 'drawingSessions', sessionId), {
        strokes: [],
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎨 Canvas cleared')
    } catch (error) {
      prodError('Error clearing strokes:', error)
      throw error
    }
  }

  /**
   * Reset timer - updates timerResetAt timestamp to signal phones to reset
   */
  static async resetTimer(sessionId) {
    try {
      // Use current timestamp instead of serverTimestamp for immediate detection
      const now = Date.now()
      await updateDoc(doc(db, 'drawingSessions', sessionId), {
        timerResetAt: now // Use milliseconds timestamp for easy comparison
      })
      devLog('🎨 Timer reset signal sent at:', now)
    } catch (error) {
      prodError('Error resetting timer:', error)
      throw error
    }
  }

  /**
   * Mark session as finished
   */
  static async finishSession(sessionId) {
    try {
      await updateDoc(doc(db, 'drawingSessions', sessionId), {
        status: 'finished',
        finishedAt: serverTimestamp()
      })
      devLog('🎨 Drawing session finished:', sessionId)
    } catch (error) {
      prodError('Error finishing session:', error)
      throw error
    }
  }

  /**
   * Delete a drawing session (cleanup)
   */
  static async deleteSession(sessionId) {
    try {
      await deleteDoc(doc(db, 'drawingSessions', sessionId))
      devLog('🎨 Drawing session deleted:', sessionId)
    } catch (error) {
      prodError('Error deleting session:', error)
      throw error
    }
  }

  /**
   * Listen to drawing session changes
   * @param {string} sessionId
   * @param {function} callback - Called with session data on changes
   * @returns {function} Unsubscribe function
   */
  static subscribeToSession(sessionId, callback) {
    const sessionRef = doc(db, 'drawingSessions', sessionId)

    return onSnapshot(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        callback(data)
      } else {
        callback(null)
      }
    }, (error) => {
      prodError('Error listening to drawing session:', error)
      callback(null)
    })
  }

  /**
   * Get session data (one-time read)
   */
  static async getSession(sessionId) {
    try {
      const sessionDoc = await getDoc(doc(db, 'drawingSessions', sessionId))
      return sessionDoc.exists() ? sessionDoc.data() : null
    } catch (error) {
      prodError('Error getting session:', error)
      return null
    }
  }
}

export default DrawingService
