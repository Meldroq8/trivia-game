import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, deleteDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { devLog, prodError } from '../utils/devLog'

/**
 * Service for managing GuessWord game sessions
 * Single player game where team asks yes/no questions to guess the word
 * Limited to 15 questions
 */
export class GuessWordService {
  static MAX_QUESTIONS = 15

  /**
   * Create a new guessword session
   * @param {string} sessionId - Unique session ID
   * @param {object} data - Session data with answer info
   */
  static async createSession(sessionId, data) {
    try {
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      )

      await setDoc(doc(db, 'guesswordSessions', sessionId), {
        ...cleanData,
        status: 'waiting', // 'waiting', 'playing', 'finished'
        questionCount: 0,
        maxQuestions: this.MAX_QUESTIONS,
        playerReady: false,
        playerConnected: false,
        createdAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎯 GuessWord session created:', sessionId)
    } catch (error) {
      prodError('Error creating guessword session:', error)
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
      const sessionDoc = await getDoc(doc(db, 'guesswordSessions', sessionId))
      return sessionDoc.exists() ? sessionDoc.data() : null
    } catch (error) {
      prodError('Error getting guessword session:', error)
      return null
    }
  }

  /**
   * Listen to guessword session changes
   * @param {string} sessionId
   * @param {function} callback - Called with session data on changes
   * @returns {function} Unsubscribe function
   */
  static subscribeToSession(sessionId, callback) {
    const sessionRef = doc(db, 'guesswordSessions', sessionId)

    return onSnapshot(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        callback(data)
      } else {
        callback(null)
      }
    }, (error) => {
      prodError('Error listening to guessword session:', error)
      callback(null)
    })
  }

  /**
   * Mark player as connected
   * @param {string} sessionId
   */
  static async markConnected(sessionId) {
    try {
      await updateDoc(doc(db, 'guesswordSessions', sessionId), {
        playerConnected: true,
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎯 GuessWord player connected:', sessionId)
    } catch (error) {
      prodError('Error marking guessword player connected:', error)
      throw error
    }
  }

  /**
   * Mark player as ready and start the game
   * @param {string} sessionId
   */
  static async markReady(sessionId) {
    try {
      await updateDoc(doc(db, 'guesswordSessions', sessionId), {
        playerReady: true,
        status: 'playing',
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎯 GuessWord player ready, game started:', sessionId)
    } catch (error) {
      prodError('Error marking guessword player ready:', error)
      throw error
    }
  }

  /**
   * Increment question counter
   * @param {string} sessionId
   */
  static async incrementCounter(sessionId) {
    try {
      const session = await this.getSession(sessionId)
      if (!session) throw new Error('Session not found')

      const newCount = Math.min((session.questionCount || 0) + 1, this.MAX_QUESTIONS)

      await updateDoc(doc(db, 'guesswordSessions', sessionId), {
        questionCount: newCount,
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎯 GuessWord counter incremented:', newCount)
    } catch (error) {
      prodError('Error incrementing guessword counter:', error)
      throw error
    }
  }

  /**
   * Send heartbeat to keep session alive
   * @param {string} sessionId
   */
  static async sendHeartbeat(sessionId) {
    try {
      await updateDoc(doc(db, 'guesswordSessions', sessionId), {
        lastHeartbeat: serverTimestamp()
      })
    } catch (error) {
      // Silent fail for heartbeat
    }
  }

  /**
   * Mark session as finished
   * @param {string} sessionId
   */
  static async finishSession(sessionId) {
    try {
      await updateDoc(doc(db, 'guesswordSessions', sessionId), {
        status: 'finished',
        finishedAt: serverTimestamp()
      })
      devLog('🎯 GuessWord session finished:', sessionId)
    } catch (error) {
      prodError('Error finishing guessword session:', error)
      throw error
    }
  }

  /**
   * Delete a guessword session (cleanup)
   * @param {string} sessionId
   */
  static async deleteSession(sessionId) {
    try {
      await deleteDoc(doc(db, 'guesswordSessions', sessionId))
      devLog('🎯 GuessWord session deleted:', sessionId)
    } catch (error) {
      prodError('Error deleting guessword session:', error)
      throw error
    }
  }
}

export default GuessWordService
