import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, deleteDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { devLog, prodError } from '../utils/devLog'

/**
 * Service for managing real-time rasbras (head-to-head quiz) game sessions
 * Two players each answer 5 MCQ questions at their own pace within a shared timer
 */
export class RasbrasService {
  /**
   * Create a new rasbras session
   * @param {string} sessionId - Unique session ID (questionId_userId)
   * @param {object} data - Session data including questions array
   */
  static async createSession(sessionId, data) {
    try {
      // Filter out undefined values - Firebase doesn't accept undefined
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      )

      await setDoc(doc(db, 'rasbrasSessions', sessionId), {
        ...cleanData,
        status: 'waiting', // 'waiting', 'playing', 'finished'

        // Team A player
        teamAConnected: false,
        teamAReady: false,
        teamAPlayerId: null,
        teamACurrentQ: 0,
        teamACorrect: 0,
        teamAFinished: false,
        teamAFinishedAt: null,

        // Team B player
        teamBConnected: false,
        teamBReady: false,
        teamBPlayerId: null,
        teamBCurrentQ: 0,
        teamBCorrect: 0,
        teamBFinished: false,
        teamBFinishedAt: null,

        timerDuration: 45,
        gameStartedAt: null,

        createdAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp()
      })
      devLog('⚡ Rasbras session created:', sessionId)
    } catch (error) {
      prodError('Error creating rasbras session:', error)
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
      const sessionRef = doc(db, 'rasbrasSessions', sessionId)
      const sessionSnap = await getDoc(sessionRef)

      if (!sessionSnap.exists()) {
        throw new Error('Session not found')
      }

      const data = sessionSnap.data()

      // Check if player is already in the other team
      if (team === 'A' && data.teamBPlayerId === playerId) {
        await updateDoc(sessionRef, {
          teamBConnected: false,
          teamBPlayerId: null,
          teamBReady: false
        })
      } else if (team === 'B' && data.teamAPlayerId === playerId) {
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

      devLog(`⚡ Player joined Team ${team}:`, playerId)
    } catch (error) {
      prodError('Error joining team:', error)
      throw error
    }
  }

  /**
   * Mark player as ready. If both ready, start the game.
   * @param {string} sessionId
   * @param {string} team - 'A' or 'B'
   */
  static async markReady(sessionId, team) {
    try {
      const sessionRef = doc(db, 'rasbrasSessions', sessionId)

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
          status: 'playing',
          gameStartedAt: serverTimestamp()
        })
        devLog('⚡ Both players ready, rasbras game started!')
      }

      devLog(`⚡ Team ${team} marked ready`)
    } catch (error) {
      prodError('Error marking ready:', error)
      throw error
    }
  }

  /**
   * Submit an answer for a question
   * @param {string} sessionId
   * @param {string} team - 'A' or 'B'
   * @param {number} questionIndex - Current question index (0-4)
   * @param {string} selectedOption - The option the player selected
   */
  static async submitAnswer(sessionId, team, questionIndex, selectedOption) {
    try {
      const sessionRef = doc(db, 'rasbrasSessions', sessionId)
      const sessionSnap = await getDoc(sessionRef)

      if (!sessionSnap.exists()) {
        throw new Error('Session not found')
      }

      const data = sessionSnap.data()
      const questions = data.questions || []
      const currentQ = questions[questionIndex]

      if (!currentQ) return

      const isCorrect = selectedOption === currentQ.answer
      const prefix = team === 'A' ? 'teamA' : 'teamB'
      const currentCorrect = data[`${prefix}Correct`] || 0
      const nextQ = questionIndex + 1
      const isFinished = nextQ >= questions.length

      const updates = {
        [`${prefix}CurrentQ`]: nextQ,
        [`${prefix}Correct`]: isCorrect ? currentCorrect + 1 : currentCorrect,
        lastHeartbeat: serverTimestamp()
      }

      if (isFinished) {
        updates[`${prefix}Finished`] = true
        updates[`${prefix}FinishedAt`] = serverTimestamp()
      }

      await updateDoc(sessionRef, updates)

      devLog(`⚡ Team ${team} answered Q${questionIndex + 1}: ${isCorrect ? 'correct' : 'wrong'} (${nextQ}/${questions.length})`)
    } catch (error) {
      prodError('Error submitting answer:', error)
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

      await updateDoc(doc(db, 'rasbrasSessions', sessionId), updates)
    } catch (error) {
      // Silent fail for heartbeats
    }
  }

  /**
   * Mark session as finished
   */
  static async finishSession(sessionId) {
    try {
      await updateDoc(doc(db, 'rasbrasSessions', sessionId), {
        status: 'finished',
        finishedAt: serverTimestamp()
      })
      devLog('⚡ Rasbras session finished:', sessionId)
    } catch (error) {
      prodError('Error finishing session:', error)
      throw error
    }
  }

  /**
   * Delete a rasbras session (cleanup)
   */
  static async deleteSession(sessionId) {
    try {
      await deleteDoc(doc(db, 'rasbrasSessions', sessionId))
      devLog('⚡ Rasbras session deleted:', sessionId)
    } catch (error) {
      prodError('Error deleting session:', error)
      throw error
    }
  }

  /**
   * Listen to rasbras session changes
   * @param {string} sessionId
   * @param {function} callback - Called with session data on changes
   * @returns {function} Unsubscribe function
   */
  static subscribeToSession(sessionId, callback) {
    const sessionRef = doc(db, 'rasbrasSessions', sessionId)

    return onSnapshot(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        callback(data)
      } else {
        callback(null)
      }
    }, (error) => {
      prodError('Error listening to rasbras session:', error)
      callback(null)
    })
  }

  /**
   * Get session data (one-time read)
   */
  static async getSession(sessionId) {
    try {
      const sessionDoc = await getDoc(doc(db, 'rasbrasSessions', sessionId))
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
    let playerId = sessionStorage.getItem('rasbras_player_id')
    if (!playerId) {
      playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      sessionStorage.setItem('rasbras_player_id', playerId)
    }
    return playerId
  }
}

export default RasbrasService
