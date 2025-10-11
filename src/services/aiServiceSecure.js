import { devLog, devWarn, prodError } from "../utils/devLog"
import { auth } from '../firebase/config'

/**
 * Secure AI Service using Firebase Functions
 * OpenAI and Google API keys are stored securely on the server, never exposed to clients
 */

const FUNCTIONS_BASE_URL = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL ||
  `https://${import.meta.env.VITE_FIREBASE_PROJECT_ID}.web.app/api`

class AIServiceSecure {
  /**
   * Get the current user's ID token for authentication
   */
  async getIdToken() {
    const user = auth.currentUser
    if (!user) {
      throw new Error('User not authenticated')
    }
    return await user.getIdToken()
  }

  /**
   * Improve question text and answer using ChatGPT (via Firebase Function)
   * @param {string} questionText - Original question text
   * @param {string} answerText - Original answer text
   * @param {string} categoryName - Category name for context
   * @param {string} difficulty - Question difficulty
   * @returns {Promise<{improvedQuestion: string, improvedAnswer: string, suggestedDifficulty: string, explanation: string}>}
   */
  async improveQuestion(questionText, answerText = '', categoryName = '', difficulty = 'medium') {
    try {
      devLog('Calling secure AI service to improve question...')

      // Get authentication token
      const idToken = await this.getIdToken()

      // Call Firebase Function
      const response = await fetch(`${FUNCTIONS_BASE_URL}/aiImproveQuestion`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questionText,
          answerText,
          categoryName,
          difficulty,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Failed with status ${response.status}`)
      }

      const result = await response.json()
      devLog('Question improvement completed successfully')

      return {
        improvedQuestion: result.improvedQuestion,
        improvedAnswer: result.improvedAnswer || answerText,
        suggestedDifficulty: result.suggestedDifficulty,
        explanation: result.explanation
      }
    } catch (error) {
      prodError('Error improving question:', error)
      throw error
    }
  }

  /**
   * Search for images using Google Custom Search (via Firebase Function)
   * @param {string} searchQuery - Search query (can be question text or custom query)
   * @param {number} numResults - Number of results to return (default 8)
   * @param {number} startIndex - Starting index for pagination (default 1)
   * @returns {Promise<Array<{url: string, thumbnail: string, title: string, source: string}>>}
   */
  async searchImages(searchQuery, numResults = 8, startIndex = 1) {
    try {
      // Validate search query
      if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
        throw new Error('يجب إدخال نص للبحث عن الصور')
      }

      const cleanQuery = searchQuery.trim()
      devLog(`Searching images for: "${cleanQuery}"`)

      // Get authentication token
      const idToken = await this.getIdToken()

      // Call Firebase Function
      const response = await fetch(`${FUNCTIONS_BASE_URL}/aiSearchImages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchQuery: cleanQuery,
          numResults: Math.max(1, Math.min(numResults, 10)),
          startIndex: Math.max(1, Math.min(startIndex, 91)),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Failed with status ${response.status}`)
      }

      const result = await response.json()
      devLog(`Found ${result.images?.length || 0} images`)

      return result.images || []
    } catch (error) {
      prodError('Error searching images:', error)
      throw error
    }
  }

  /**
   * Generate a better search query from question text using ChatGPT
   * This helps get more relevant image results
   * @param {string} questionText - The question text
   * @param {string} categoryName - Category name for context
   * @param {string} correctAnswer - The correct answer text for better context
   * @param {string} imageTarget - 'question' or 'answer' - what the image is for
   * @returns {Promise<string>}
   */
  async generateImageSearchQuery(questionText, categoryName = '', correctAnswer = '', imageTarget = 'question') {
    try {
      devLog(`Generating smart image search query for ${imageTarget}...`)
      devLog(`Input data:`, { questionText, categoryName, correctAnswer, imageTarget })

      // Get authentication token
      const idToken = await this.getIdToken()

      // Call Firebase Function to use OpenAI for smart query generation
      const response = await fetch(`${FUNCTIONS_BASE_URL}/aiGenerateImageQuery`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questionText,
          categoryName,
          correctAnswer,
          imageTarget
        }),
      })

      if (response.ok) {
        const result = await response.json()
        devLog(`Generated search query: "${result.searchQuery}"`)
        return result.searchQuery
      } else {
        // Fallback to simple translation if AI fails
        devWarn('AI query generation failed, using simple translation')
      }
    } catch (error) {
      devWarn('AI query generation error, using fallback:', error)
    }

    // Fallback: Simple keyword extraction + translation
    const removeWords = [
      'ما', 'من', 'هو', 'هي', 'ماذا', 'أين', 'متى', 'كيف', 'لماذا', 'كم',
      'في', 'على', 'إلى', 'عن', 'مع', 'ال', 'الذي', 'التي', 'هل', 'أم', 'أو'
    ]

    let query = (imageTarget === 'answer' ? correctAnswer : questionText)
      .replace(/؟/g, '')
      .replace(/[()]/g, '')
      .trim()

    const words = query.split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !removeWords.includes(word))
      .slice(0, 5)

    query = words.join(' ')

    // Translate to English
    try {
      const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(query)}`
      const translateResponse = await fetch(translateUrl)
      const translateData = await translateResponse.json()
      return translateData[0][0][0]
    } catch (error) {
      return query
    }
  }

  /**
   * Download image from URL and return as blob
   * This will be used to re-upload to S3/CloudFront
   * Uses multiple CORS proxy fallbacks
   * @param {string} imageUrl - URL of the image to download
   * @returns {Promise<Blob>}
   */
  async downloadImage(imageUrl) {
    // List of CORS proxies to try (in order)
    const proxies = [
      // Proxy 1: corsproxy.io (most reliable)
      `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`,
      // Proxy 2: api.allorigins.win
      `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`,
      // Proxy 3: cors-anywhere alternative
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(imageUrl)}`
    ]

    let lastError = null

    // Try each proxy in sequence
    for (let i = 0; i < proxies.length; i++) {
      try {
        const response = await fetch(proxies[i], {
          method: 'GET',
          headers: {
            'Accept': 'image/*'
          }
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const blob = await response.blob()

        // Verify it's an image (or at least has content)
        if (blob.size === 0) {
          throw new Error('Empty response')
        }

        // Convert to proper image blob if needed
        const imageBlob = blob.type.startsWith('image/')
          ? blob
          : new Blob([blob], { type: 'image/jpeg' })

        return imageBlob
      } catch (error) {
        lastError = error
        // Continue to next proxy
      }
    }

    // All proxies failed
    throw new Error(`فشل تحميل الصورة من جميع الخوادم. جرب صورة أخرى. (${lastError?.message || 'Unknown error'})`)
  }
}

export default new AIServiceSecure()
