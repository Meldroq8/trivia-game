import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, deleteDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { devLog, prodError } from '../utils/devLog'

/**
 * Service for managing real-time headband game sessions
 * Two players face off - each showing an image for the other to guess
 */
export class HeadbandService {
  /**
   * Create a new headband session
   * @param {string} sessionId - Unique session ID (questionId_userId)
   * @param {object} data - Session data
   */
  static async createSession(sessionId, data) {
    try {
      // Filter out undefined values - Firebase doesn't accept undefined
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      )

      await setDoc(doc(db, 'headbandSessions', sessionId), {
        ...cleanData,
        status: 'waiting', // 'waiting', 'playing', 'finished'

        // Team A player
        teamAConnected: false,
        teamAReady: false,
        teamACounter: 0,
        teamAPlayerId: null,

        // Team B player
        teamBConnected: false,
        teamBReady: false,
        teamBCounter: 0,
        teamBPlayerId: null,

        createdAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp()
      })
      devLog('🎭 Headband session created:', sessionId)
    } catch (error) {
      prodError('Error creating headband session:', error)
      throw error
    }
  }

  /**
   * Join a team in the session
   * @param {string} sessionId
   * @param {string} team - 'A' or 'B'
   * @param {string} playerId - Browser session ID to prevent duplicates
   */
  static async joinTeam(sessionId, team, playerId) {
    try {
      const sessionRef = doc(db, 'headbandSessions', sessionId)
      const sessionSnap = await getDoc(sessionRef)

      if (!sessionSnap.exists()) {
        throw new Error('Session not found')
      }

      const data = sessionSnap.data()

      // Check if player is already in the other team
      if (team === 'A' && data.teamBPlayerId === playerId) {
        // Remove from team B first
        await updateDoc(sessionRef, {
          teamBConnected: false,
          teamBPlayerId: null,
          teamBReady: false
        })
      } else if (team === 'B' && data.teamAPlayerId === playerId) {
        // Remove from team A first
        await updateDoc(sessionRef, {
          teamAConnected: false,
          teamAPlayerId: null,
          teamAReady: false
        })
      }

      // Join the selected team
      if (team === 'A') {
        await updateDoc(sessionRef, {
          teamAConnected: true,
          teamAPlayerId: playerId,
          teamAReady: false,
          lastHeartbeat: serverTimestamp()
        })
      } else {
        await updateDoc(sessionRef, {
          teamBConnected: true,
          teamBPlayerId: playerId,
          teamBReady: false,
          lastHeartbeat: serverTimestamp()
        })
      }

      devLog(`🎭 Player joined Team ${team}:`, playerId)
    } catch (error) {
      prodError('Error joining team:', error)
      throw error
    }
  }

  /**
   * Mark player as ready
   * @param {string} sessionId
   * @param {string} team - 'A' or 'B'
   */
  static async markReady(sessionId, team) {
    try {
      const sessionRef = doc(db, 'headbandSessions', sessionId)

      if (team === 'A') {
        await updateDoc(sessionRef, {
          teamAReady: true,
          lastHeartbeat: serverTimestamp()
        })
      } else {
        await updateDoc(sessionRef, {
          teamBReady: true,
          lastHeartbeat: serverTimestamp()
        })
      }

      // Check if both are ready to start the game
      const sessionSnap = await getDoc(sessionRef)
      const data = sessionSnap.data()

      if (data.teamAReady && data.teamBReady) {
        await updateDoc(sessionRef, {
          status: 'playing'
        })
        devLog('🎭 Both players ready, game started!')
      }

      devLog(`🎭 Team ${team} marked ready`)
    } catch (error) {
      prodError('Error marking ready:', error)
      throw error
    }
  }

  /**
   * Increment counter (when opponent asks a question)
   * @param {string} sessionId
   * @param {string} team - 'A' or 'B' (the team whose counter to increment)
   */
  static async incrementCounter(sessionId, team) {
    try {
      const sessionRef = doc(db, 'headbandSessions', sessionId)
      const sessionSnap = await getDoc(sessionRef)

      if (!sessionSnap.exists()) {
        throw new Error('Session not found')
      }

      const data = sessionSnap.data()
      const currentCount = team === 'A' ? data.teamACounter : data.teamBCounter

      // Max 10 questions
      if (currentCount >= 10) {
        devLog('🎭 Counter already at max (10)')
        return
      }

      if (team === 'A') {
        await updateDoc(sessionRef, {
          teamACounter: currentCount + 1,
          lastHeartbeat: serverTimestamp()
        })
      } else {
        await updateDoc(sessionRef, {
          teamBCounter: currentCount + 1,
          lastHeartbeat: serverTimestamp()
        })
      }

      devLog(`🎭 Team ${team} counter: ${currentCount + 1}/10`)
    } catch (error) {
      prodError('Error incrementing counter:', error)
      throw error
    }
  }

  /**
   * Send heartbeat to indicate player is still connected
   */
  static async sendHeartbeat(sessionId, team) {
    try {
      const updates = {
        lastHeartbeat: serverTimestamp()
      }

      if (team === 'A') {
        updates.teamAConnected = true
      } else if (team === 'B') {
        updates.teamBConnected = true
      }

      await updateDoc(doc(db, 'headbandSessions', sessionId), updates)
    } catch (error) {
      // Silent fail for heartbeats
    }
  }

  /**
   * Mark session as finished
   */
  static async finishSession(sessionId) {
    try {
      await updateDoc(doc(db, 'headbandSessions', sessionId), {
        status: 'finished',
        finishedAt: serverTimestamp()
      })
      devLog('🎭 Headband session finished:', sessionId)
    } catch (error) {
      prodError('Error finishing session:', error)
      throw error
    }
  }

  /**
   * Delete a headband session (cleanup)
   */
  static async deleteSession(sessionId) {
    try {
      await deleteDoc(doc(db, 'headbandSessions', sessionId))
      devLog('🎭 Headband session deleted:', sessionId)
    } catch (error) {
      prodError('Error deleting session:', error)
      throw error
    }
  }

  /**
   * Listen to headband session changes
   * @param {string} sessionId
   * @param {function} callback - Called with session data on changes
   * @returns {function} Unsubscribe function
   */
  static subscribeToSession(sessionId, callback) {
    const sessionRef = doc(db, 'headbandSessions', sessionId)

    return onSnapshot(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        callback(data)
      } else {
        callback(null)
      }
    }, (error) => {
      prodError('Error listening to headband session:', error)
      callback(null)
    })
  }

  /**
   * Get session data (one-time read)
   */
  static async getSession(sessionId) {
    try {
      const sessionDoc = await getDoc(doc(db, 'headbandSessions', sessionId))
      return sessionDoc.exists() ? sessionDoc.data() : null
    } catch (error) {
      prodError('Error getting session:', error)
      return null
    }
  }

  /**
   * Generate a unique player ID for this browser session
   */
  static generatePlayerId() {
    // Check if we already have a player ID in session storage
    let playerId = sessionStorage.getItem('headband_player_id')
    if (!playerId) {
      playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      sessionStorage.setItem('headband_player_id', playerId)
    }
    return playerId
  }
}

export default HeadbandService
