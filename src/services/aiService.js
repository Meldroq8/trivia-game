import { devLog, devWarn, prodError } from "../utils/devLog"

/**
 * ⚠️ DEPRECATED: This service uses client-side API keys which is INSECURE
 *
 * Use AIServiceSecure (from aiServiceSecure.js) instead, which calls AI services
 * via Firebase Functions and keeps API keys on the server.
 *
 * This file is kept for backward compatibility and local development only.
 * It will NOT work in production deployments without exposing your API keys.
 */

class AIService {
  constructor() {
    // Check if API keys are available (local development only)
    this.openAIKey = import.meta.env.VITE_OPENAI_API_KEY || ''
    this.googleSearchKey = import.meta.env.VITE_GOOGLE_SEARCH_API_KEY || ''
    this.googleSearchEngineId = import.meta.env.VITE_GOOGLE_SEARCH_ENGINE_ID || ''

    if (this.openAIKey || this.googleSearchKey) {
      devWarn('⚠️ Using insecure client-side AI service. Switch to AIServiceSecure for production!')
    }
  }

  /**
   * Improve question text and answer using ChatGPT
   * @param {string} questionText - Original question text
   * @param {string} answerText - Original answer text
   * @param {string} categoryName - Category name for context
   * @param {string} difficulty - Question difficulty
   * @returns {Promise<{improvedQuestion: string, improvedAnswer: string, suggestedDifficulty: string, explanation: string}>}
   */
  async improveQuestion(questionText, answerText = '', categoryName = '', difficulty = 'medium') {
    if (!this.openAIKey) {
      throw new Error('OpenAI API key not configured. Please set VITE_OPENAI_API_KEY in .env file')
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openAIKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Cheaper and faster model
          messages: [
            {
              role: 'system',
              content: `أنت خبير صارم جداً في تحسين أسئلة الترفيه والمعلومات العامة بالعربية وتقييم صعوبتها بدقة عالية.

قواعد صارمة:
1. حسّن صياغة السؤال لتكون أوضح وأدق (لكن احتفظ بالمعنى الأساسي)
2. أضف الأسماء الإنجليزية بين قوسين () بعد الأسماء العربية
3. حسّن الإجابة لتكون مختصرة ومباشرة ودقيقة - لا تضف شروحات طويلة، فقط الإجابة الصحيحة
4. قيّم صعوبة السؤال بواقعية شديدة - كن صارماً جداً:
   - easy: فقط المعلومات البديهية جداً التي يعرفها 95%+ من الناس (عواصم دول كبرى جداً فقط: مصر، السعودية، أمريكا)
   - medium: معلومات يعرفها 30-50% من الناس (عواصم دول متوسطة، شخصيات مشهورة عالمياً، حقائق ثقافية عامة)
   - hard: أي معلومة دقيقة أو متخصصة يعرفها أقل من 30% (عواصم دول صغيرة، تواريخ محددة، أرقام دقيقة، أسماء غير مشهورة)
5. يجب أن يكون الرد JSON صحيح
6. IMPORTANT: أكثر من 60% من الأسئلة يجب أن تكون hard - كن صارماً جداً!`
            },
            {
              role: 'user',
              content: `حسّن هذا السؤال والإجابة بإضافة الأسماء الإنجليزية وتحسين الدقة والوضوح:

السؤال: ${questionText}
الإجابة: ${answerText}
الفئة: ${categoryName || 'عام'}
الصعوبة الحالية: ${difficulty}

معايير صارمة جداً للصعوبة:
- easy: فقط المعلومات الأساسية جداً التي يعرفها الجميع تقريباً (مثل: ما عاصمة مصر؟ كم عدد أيام الأسبوع؟)
- medium: معلومات ثقافية عامة لكن ليست أساسية (مثل: من مخترع الهاتف؟ ما عاصمة فرنسا؟)
- hard: أي شيء آخر! عواصم دول صغيرة، تواريخ محددة، أرقام دقيقة، أسماء غير مشهورة جداً

أمثلة واقعية (كن صارماً):
- "ما عاصمة مصر؟" → easy (القاهرة - يعرفها الجميع)
- "ما عاصمة السعودية؟" → easy (الرياض - معروفة جداً)
- "ما عاصمة فرنسا؟" → medium (باريس - مشهورة لكن ليست أساسية)
- "ما عاصمة النمسا؟" → hard (فيينا - دولة أوروبية صغيرة)
- "ما عاصمة كرواتيا؟" → hard (زغرب - قليل جداً يعرفها)
- "ما عاصمة إستونيا؟" → hard (تالين - دولة صغيرة جداً)
- "من مخترع الكهرباء؟" → medium (إديسون - شخصية مشهورة)
- "في أي عام اخترع التلفاز؟" → hard (1927 - تاريخ محدد)
- "كم عدد لاعبي كرة القدم؟" → easy (11 لاعب - معلومة أساسية)
- "كم عدد لاعبي الرجبي؟" → hard (15 لاعب - رياضة غير مشهورة)
- "كم عدد كواكب المجموعة الشمسية؟" → medium (8 كواكب - معلومة علمية عامة)
- "ما هو أبعد كوكب عن الشمس؟" → hard (نبتون - معلومة دقيقة)

أمثلة للتحسين:
مثال 1:
السؤال: "في أي دولة يقع مضيق جبل طارق؟"
الإجابة: "المغرب وإسبانيا"
التحسين:
- السؤال: "بين أي دولتين يقع مضيق جبل طارق (Strait of Gibraltar)؟"
- الإجابة: "بين المغرب وإسبانيا" (مختصرة ومباشرة)

مثال 2:
السؤال: "من اخترع المصباح الكهربائي؟"
الإجابة: "توماس إديسون اخترعه في عام 1879"
التحسين:
- السؤال: "من اخترع المصباح الكهربائي (Light Bulb)؟"
- الإجابة: "توماس إديسون (Thomas Edison)" (بدون تواريخ، فقط الاسم)

أرجع JSON فقط:
{
  "improvedQuestion": "السؤال المحسّن مع الأسماء الإنجليزية",
  "improvedAnswer": "الإجابة المختصرة والمباشرة بدون شرح",
  "suggestedDifficulty": "easy أو medium أو hard",
  "explanation": "ملخص قصير للتحسينات"
}`
            }
          ],
          temperature: 0.7,
          max_tokens: 500,
          response_format: { type: "json_object" }
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'Failed to improve question')
      }

      const data = await response.json()

      try {
        const result = JSON.parse(data.choices[0].message.content)

        return {
          improvedQuestion: result.improvedQuestion,
          improvedAnswer: result.improvedAnswer || answerText, // Fallback to original if not provided
          suggestedDifficulty: result.suggestedDifficulty,
          explanation: result.explanation
        }
      } catch (parseError) {
        prodError('Failed to parse ChatGPT response:', data.choices[0].message.content)
        throw new Error('فشل معالجة رد الذكاء الاصطناعي. حاول مرة أخرى.')
      }
    } catch (error) {
      prodError('Error improving question:', error)
      throw error
    }
  }

  /**
   * Search for images using Google Custom Search
   * @param {string} searchQuery - Search query (can be question text or custom query)
   * @param {number} numResults - Number of results to return (default 8)
   * @param {number} startIndex - Starting index for pagination (default 1)
   * @returns {Promise<Array<{url: string, thumbnail: string, title: string, source: string}>>}
   */
  async searchImages(searchQuery, numResults = 8, startIndex = 1) {
    if (!this.googleSearchKey || !this.googleSearchEngineId) {
      throw new Error('Google Search API not configured. Please set VITE_GOOGLE_SEARCH_API_KEY and VITE_GOOGLE_SEARCH_ENGINE_ID in .env file')
    }

    try {
      const url = new URL('https://www.googleapis.com/customsearch/v1')
      url.searchParams.append('key', this.googleSearchKey)
      url.searchParams.append('cx', this.googleSearchEngineId)
      url.searchParams.append('q', searchQuery)
      url.searchParams.append('searchType', 'image')
      url.searchParams.append('num', Math.min(numResults, 10)) // Google allows max 10 per request
      url.searchParams.append('start', startIndex.toString()) // Pagination support
      url.searchParams.append('safe', 'active') // Safe search
      url.searchParams.append('imgSize', 'large') // Request large images for better quality
      url.searchParams.append('imgType', 'photo') // Prefer photos over clipart

      const response = await fetch(url)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'Failed to search images')
      }

      const data = await response.json()

      if (!data.items || data.items.length === 0) {
        return []
      }

      return data.items.map(item => ({
        url: item.link,
        thumbnail: item.image.thumbnailLink,
        title: item.title,
        source: item.displayLink,
        width: item.image.width,
        height: item.image.height,
        contextLink: item.image.contextLink
      }))
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
    // Simple keyword extraction - no AI needed
    // Remove common question words and keep important nouns
    const removeWords = [
      'ما', 'من', 'هو', 'هي', 'ماذا', 'أين', 'متى', 'كيف', 'لماذا', 'كم',
      'في', 'على', 'إلى', 'عن', 'مع', 'ال', 'الذي', 'التي', 'اللذان', 'اللتان',
      'هل', 'أم', 'أو', 'لكن', 'بل', 'أن', 'إن', 'كان', 'يكون', 'اسم', 'يسمى',
      'تسمى', 'معنى', 'مفهوم', 'تعريف', 'يعني', 'الصحيح', 'الصحيحة', 'التالي', 'التالية'
    ]

    // Clean the question
    let query = questionText
      .replace(/؟/g, '') // Remove question marks
      .replace(/[()]/g, '') // Remove parentheses
      .trim()

    // Split into words and filter
    const words = query.split(/\s+/)
      .filter(word => word.length > 2) // Keep words longer than 2 chars
      .filter(word => !removeWords.includes(word)) // Remove common words
      .slice(0, 5) // Keep first 5 important words

    query = words.join(' ')

    // If we have a category, add it for better context
    if (categoryName && categoryName !== 'mystery') {
      query = `${categoryName} ${query}`
    }

    // Use ChatGPT to generate smart English search query
    if (this.openAIKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openAIKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are an expert at creating effective English image search queries. Generate SHORT, specific search terms (2-4 words) that will find the most relevant images.'
              },
              {
                role: 'user',
                content: `Given this EXACT question and answer pair, create an English image search query:

QUESTION (EXACT): ${questionText}
ANSWER (EXACT): ${correctAnswer || 'Not provided'}
Category: ${categoryName || 'general'}
Searching for: ${imageTarget === 'answer' ? 'IMAGE OF THE ANSWER' : 'IMAGE FOR THE QUESTION'}

${imageTarget === 'answer'
  ? `Your task: Create a search query for an image of "${correctAnswer}"
- The image must show/represent: ${correctAnswer}
- Context: This is the answer to "${questionText}"
- Use the question context to understand what aspect of "${correctAnswer}" to show
- Focus on "${correctAnswer}" as the main subject`
  : `Your task: Create a search query for an image that illustrates the question concept
- The question asks: ${questionText}
- The correct answer is: ${correctAnswer}
- Create a query that shows what the question is asking about
- The answer helps you understand the context, but image should illustrate the question topic`}

Return ONLY 2-4 English search words. No quotes, no explanations.

Examples:
Answer image: Question="من هو مخترع التلفاز؟", Answer="جون بيرد" → "John Baird portrait"
Answer image: Question="ما هي عاصمة فرنسا؟", Answer="باريس" → "Paris cityscape"
Question image: Question="من هو مخترع التلفاز؟", Answer="جون بيرد" → "television invention"
Question image: Question="ما هي عاصمة فرنسا؟", Answer="باريس" → "France capital"`
              }
            ],
            temperature: 0.3,
            max_tokens: 20
          })
        })

        if (response.ok) {
          const data = await response.json()
          const aiQuery = data.choices[0].message.content.trim().replace(/['"]/g, '')
          return aiQuery
        }
      } catch (error) {
        prodError('ChatGPT search query failed, falling back to translation:', error)
      }
    }

    // Fallback: Translate to English using Google Translate API (free, no API key needed)
    try {
      const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(query)}`
      const translateResponse = await fetch(translateUrl)
      const translateData = await translateResponse.json()

      // Extract translated text from response
      const translatedQuery = translateData[0][0][0]
      return translatedQuery
    } catch (error) {
      return query // Last resort: use Arabic keywords
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

export default new AIService()
