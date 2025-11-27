import { GoogleGenAI } from "@google/genai"
import { devLog, prodError } from '../utils/devLog'

/**
 * Service for verifying trivia questions using Gemini 2.5 Pro API
 * Checks grammar, factual accuracy, and answer correctness
 * Supports both Arabic and English content
 */
class QuestionVerificationService {
  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY
    this.ai = null
    this.model = "gemini-2.5-pro"
    this.maxRetries = 3
    this.baseDelay = 2000 // 2 seconds base delay for retries
  }

  /**
   * Sleep utility for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Execute API call with automatic retry on rate limit (429) errors
   */
  async executeWithRetry(apiCall, context = '') {
    let lastError = null

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await apiCall()
      } catch (error) {
        lastError = error
        const errorMessage = error.message || ''

        // Check if it's a rate limit error (429)
        if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
          // Extract retry delay from error if available
          const retryMatch = errorMessage.match(/retry.*?(\d+\.?\d*)s/i)
          let waitTime = retryMatch ? parseFloat(retryMatch[1]) * 1000 : this.baseDelay * attempt

          // Cap at 60 seconds max
          waitTime = Math.min(waitTime, 60000)

          devLog(`⏳ Rate limit hit${context ? ` (${context})` : ''}. Attempt ${attempt}/${this.maxRetries}. Waiting ${Math.round(waitTime/1000)}s...`)

          if (attempt < this.maxRetries) {
            await this.sleep(waitTime)
            continue
          }
        }

        // For non-rate-limit errors or final attempt, throw
        throw error
      }
    }

    throw lastError
  }

  /**
   * Initialize the AI client
   */
  initialize() {
    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey })
    }
    return this.ai
  }

  /**
   * Detect if text contains Arabic
   */
  containsArabic(text) {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/
    return arabicRegex.test(text)
  }

  /**
   * Detect if text contains English
   */
  containsEnglish(text) {
    const englishRegex = /[a-zA-Z]/
    return englishRegex.test(text)
  }

  /**
   * Get language context for the prompt
   */
  getLanguageContext(question) {
    const answerText = Array.isArray(question.answer) ? question.answer[0] : (question.answer || '')
    const hasArabicQuestion = this.containsArabic(question.text || '')
    const hasEnglishQuestion = this.containsEnglish(question.text || '')
    const hasArabicAnswer = this.containsArabic(answerText)
    const hasEnglishAnswer = this.containsEnglish(answerText)

    const languages = []
    if (hasArabicQuestion || hasArabicAnswer) languages.push('Arabic')
    if (hasEnglishQuestion || hasEnglishAnswer) languages.push('English')

    return {
      languages: languages.join(' and '),
      hasArabic: hasArabicQuestion || hasArabicAnswer,
      hasEnglish: hasEnglishQuestion || hasEnglishAnswer,
      isMixed: languages.length > 1
    }
  }

  /**
   * Check if a question is an instruction/rule question that should be skipped
   * These are not real trivia questions but game instructions
   */
  isInstructionQuestion(question) {
    const text = String(question.text || '').toLowerCase()
    // Handle answer that might be an array or object
    const rawAnswer = question.answer
    const answer = String(Array.isArray(rawAnswer) ? rawAnswer[0] : (rawAnswer || '')).toLowerCase()

    // Patterns that indicate instruction questions
    const instructionPatterns = [
      'إقرأ القوانين',
      'اقرأ القوانين',
      'امسح الباركود',
      'اسكن الباركود',
      'scan the barcode',
      'read the rules',
      'قوانين اللعبة',
      'تعليمات',
      'instructions',
      'اضغط جاهز',
      'press ready',
      'mini game',
      'ميني قيم'
    ]

    // Check if text or answer contains any instruction pattern
    for (const pattern of instructionPatterns) {
      if (text.includes(pattern.toLowerCase()) || answer.includes(pattern.toLowerCase())) {
        return true
      }
    }

    // Also skip questions with very short answers that are just instructions
    if (answer.length < 3 || text.length < 10) {
      return true
    }

    return false
  }

  /**
   * Verify multiple questions in a single API call (batch of up to 5)
   * @param {Array} questions - Array of question objects
   * @returns {Promise<Array>} Array of verification results
   */
  async verifyQuestionsBatch(questions) {
    if (!questions || questions.length === 0) return []

    // Filter out instruction questions first
    const toVerify = []
    const skippedResults = []

    for (const question of questions) {
      if (this.isInstructionQuestion(question)) {
        skippedResults.push({
          questionId: question.id,
          questionText: question.text,
          answer: question.answer,
          status: 'skip',
          skipped: true,
          reason: 'instruction_question',
          grammarIssues: [],
          factualAccuracy: 'not_applicable',
          notes: 'سؤال تعليمات - تم تخطيه تلقائياً',
          verifiedAt: new Date().toISOString()
        })
      } else {
        toVerify.push(question)
      }
    }

    // If all questions were skipped, return early
    if (toVerify.length === 0) return skippedResults

    try {
      this.initialize()

      // Build the batch prompt
      const questionsText = toVerify.map((q, idx) => {
        const answerText = Array.isArray(q.answer) ? q.answer[0] : (q.answer || '')
        const categoryName = q.categoryName || q.categoryId || 'عام'
        return `[سؤال ${idx + 1}] (ID: ${q.id})
السؤال: ${q.text}
الإجابة: ${answerText}
الفئة: ${categoryName}`
      }).join('\n\n')

      const prompt = `مدقق أسئلة تريفيا. راجع هذه الأسئلة:

${questionsText}

⚠️ خطوات التحقق:
1. هل السؤال كامل ومفهوم؟ (ليس ناقص أو مقطوع)
2. هل الإجابة كاملة؟ (ليست ناقصة أو فارغة)
3. هل توجد أخطاء إملائية واضحة؟
4. ابحث في الإنترنت وتحقق: هل الإجابة صحيحة لهذا السؤال بالتحديد؟

🚨 تحذير مهم جداً:
- اقرأ السؤال بدقة شديدة قبل البحث
- ابحث عن الإجابة الصحيحة للسؤال المطروح بالضبط
- لا تخلط بين دول أو أشخاص أو أحداث مختلفة!
- مثال: إذا السؤال عن "الكويت" لا تبحث عن "الإمارات"

✅ متى تختار "pass" (تم التحقق):
- السؤال والإجابة كاملين
- الإجابة صحيحة بعد التحقق من الإنترنت
- لا توجد أخطاء إملائية واضحة

❌ متى تختار "flag" (يحتاج مراجعة):
- السؤال ناقص أو غير مكتمل
- الإجابة فارغة أو ناقصة
- أخطاء إملائية واضحة
- الإجابة خاطئة بعد التحقق من الإنترنت

⚠️ قاعدة الاقتراحات:
- إذا الإجابة صحيحة: suggestedQuestion = null
- إذا الإجابة خاطئة: اقترح سؤال يكون جوابه = الإجابة الحالية

أجب بـ JSON array فقط (بدون أي نص إضافي):
[
  {
    "id": "question_id",
    "status": "pass" أو "flag",
    "grammarIssues": [],
    "factualAccuracy": "verified" أو "incorrect",
    "suggestedQuestion": null,
    "suggestedAnswer": null,
    "notes": "سبب قصير"
  }
]`

      const response = await this.executeWithRetry(
        () => this.ai.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }]
          }
        }),
        `batch of ${toVerify.length} questions`
      )

      const results = this.parseBatchResponse(response, toVerify)
      devLog(`✅ Batch verified ${results.length} questions`)

      // Combine skipped results with verified results
      return [...skippedResults, ...results]

    } catch (error) {
      prodError('Error in batch verification:', error)
      // Return error results for all questions that were supposed to be verified
      const errorResults = toVerify.map(q => ({
        questionId: q.id,
        questionText: q.text,
        answer: q.answer,
        status: 'error',
        error: error.message,
        grammarIssues: [],
        factualAccuracy: 'unknown',
        notes: 'حدث خطأ أثناء التحقق'
      }))
      return [...skippedResults, ...errorResults]
    }
  }

  /**
   * Parse batch AI response
   */
  parseBatchResponse(response, questions) {
    let text = response.text || ''
    devLog('Raw batch AI response:', text.substring(0, 1000))

    try {
      // Clean up the response
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      // Try to find JSON array in the text
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        text = jsonMatch[0]
      }

      const parsed = JSON.parse(text)

      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array')
      }

      // Map parsed results to questions
      return questions.map(question => {
        const result = parsed.find(r => r.id === question.id) || parsed[questions.indexOf(question)] || {}
        return {
          questionId: question.id,
          questionText: question.text,
          answer: question.answer,
          status: result.status || 'flag',
          grammarIssues: result.grammarIssues || [],
          factualAccuracy: result.factualAccuracy || 'uncertain',
          suggestedQuestion: result.suggestedQuestion || null,
          suggestedAnswer: result.suggestedAnswer || null,
          notes: result.notes || '',
          sources: result.sources || [],
          verifiedAt: new Date().toISOString()
        }
      })

    } catch (parseError) {
      devLog('Failed to parse batch response:', parseError.message)
      // Fallback: return flag status for all questions
      return questions.map(question => ({
        questionId: question.id,
        questionText: question.text,
        answer: question.answer,
        status: 'flag',
        grammarIssues: [],
        factualAccuracy: 'uncertain',
        suggestedQuestion: null,
        suggestedAnswer: null,
        notes: 'تعذر تحليل الاستجابة',
        sources: [],
        verifiedAt: new Date().toISOString()
      }))
    }
  }

  /**
   * Verify a single question
   * @param {Object} question - Question object with text, answer, options, etc.
   * @returns {Promise<Object>} Verification result
   */
  async verifyQuestion(question) {
    try {
      // Skip instruction questions - auto-approve them
      if (this.isInstructionQuestion(question)) {
        devLog('⏭️ Skipping instruction question:', question.text?.substring(0, 50))
        return {
          questionId: question.id,
          questionText: question.text,
          answer: question.answer,
          status: 'skip',
          skipped: true,
          reason: 'instruction_question',
          grammarIssues: [],
          factualAccuracy: 'not_applicable',
          notes: 'سؤال تعليمات - تم تخطيه تلقائياً',
          verifiedAt: new Date().toISOString()
        }
      }

      this.initialize()

      const langContext = this.getLanguageContext(question)
      const categoryName = question.categoryName || question.categoryId || 'عام'
      // Handle answer that might be an array
      const answerText = Array.isArray(question.answer) ? question.answer[0] : (question.answer || '')

      const prompt = `مدقق أسئلة تريفيا. راجع هذا السؤال:

السؤال: ${question.text}
الإجابة: ${answerText}
الفئة: ${categoryName}

⚠️ خطوات التحقق:
1. هل السؤال كامل ومفهوم؟ (ليس ناقص أو مقطوع)
2. هل الإجابة كاملة؟ (ليست ناقصة أو فارغة)
3. هل توجد أخطاء إملائية واضحة؟
4. ابحث في الإنترنت وتحقق: هل الإجابة صحيحة لهذا السؤال بالتحديد؟

🚨 تحذير مهم جداً:
- اقرأ السؤال بدقة شديدة قبل البحث
- ابحث عن الإجابة الصحيحة للسؤال المطروح بالضبط
- لا تخلط بين دول أو أشخاص أو أحداث مختلفة!

✅ متى تختار "pass":
- السؤال والإجابة كاملين
- الإجابة صحيحة بعد التحقق
- لا توجد أخطاء إملائية واضحة

❌ متى تختار "flag":
- السؤال ناقص أو غير مكتمل
- الإجابة فارغة أو ناقصة
- أخطاء إملائية واضحة
- الإجابة خاطئة بعد التحقق

أجب JSON فقط:
{
  "status": "pass" أو "flag",
  "grammarIssues": ["أخطاء إملائية/نحوية"],
  "factualAccuracy": "verified" أو "incorrect",
  "suggestedQuestion": null,
  "suggestedAnswer": null,
  "notes": "سبب قصير",
  "sources": []
}`

      const response = await this.executeWithRetry(
        () => this.ai.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }] // Enable web search for fact-checking
          }
        }),
        `question: ${question.text?.substring(0, 30)}...`
      )

      const result = this.parseResponse(response, question)
      devLog('✅ Question verified:', question.text?.substring(0, 50) + '...')
      return result

    } catch (error) {
      prodError('Error verifying question:', error)
      return {
        questionId: question.id,
        status: 'error',
        error: error.message,
        grammarIssues: [],
        factualAccuracy: 'unknown',
        notes: 'حدث خطأ أثناء التحقق'
      }
    }
  }

  /**
   * Parse the AI response
   */
  parseResponse(response, question) {
    let text = response.text || ''
    devLog('Raw AI response:', text.substring(0, 500))

    try {
      // Clean up the response - remove markdown code blocks if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      // Try to find JSON object in the text
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        text = jsonMatch[0]
      }

      // Try to parse as JSON
      const parsed = JSON.parse(text)

      return {
        questionId: question.id,
        questionText: question.text,
        answer: question.answer,
        status: parsed.status || 'flag',
        grammarIssues: parsed.grammarIssues || [],
        factualAccuracy: parsed.factualAccuracy || 'uncertain',
        suggestedQuestion: parsed.suggestedQuestion || null,
        suggestedAnswer: parsed.suggestedAnswer || null,
        clarityScore: parsed.clarityScore || 3,
        suggestedCorrection: parsed.suggestedCorrection || '',
        notes: parsed.notes || '',
        sources: parsed.sources || [],
        verifiedAt: new Date().toISOString()
      }
    } catch (parseError) {
      devLog('Failed to parse AI response:', parseError.message, 'Text:', text.substring(0, 300))

      // Fallback - try to extract fields using regex
      const extractField = (fieldName) => {
        const regex = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]*)"`)
        const match = text.match(regex)
        return match ? match[1] : null
      }

      const status = extractField('status') || (text.includes('pass') ? 'pass' : 'flag')
      const factualAccuracy = extractField('factualAccuracy') || 'uncertain'
      const suggestedQuestion = extractField('suggestedQuestion')
      const suggestedAnswer = extractField('suggestedAnswer')
      const notes = extractField('notes') || 'تعذر تحليل الاستجابة'

      return {
        questionId: question.id,
        questionText: question.text,
        answer: question.answer,
        status: status,
        grammarIssues: [],
        factualAccuracy: factualAccuracy,
        suggestedQuestion: suggestedQuestion,
        suggestedAnswer: suggestedAnswer,
        notes: notes,
        sources: [],
        verifiedAt: new Date().toISOString()
      }
    }
  }

  /**
   * Verify multiple questions in batch
   * @param {Array} questions - Array of question objects
   * @param {Function} onProgress - Progress callback (current, total, result)
   * @param {Object} options - Batch options
   * @returns {Promise<Object>} Batch results with statistics
   */
  async verifyBatch(questions, onProgress = null, options = {}) {
    const {
      delayMs = 500, // Delay between requests to avoid rate limiting
      stopOnError = false,
      maxRetries = 2
    } = options

    const results = {
      total: questions.length,
      passed: 0,
      flagged: 0,
      errors: 0,
      items: []
    }

    devLog(`🔍 Starting batch verification of ${questions.length} questions...`)

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i]
      let result = null
      let retries = 0

      while (retries <= maxRetries) {
        try {
          result = await this.verifyQuestion(question)
          break
        } catch (error) {
          retries++
          if (retries > maxRetries) {
            result = {
              questionId: question.id,
              status: 'error',
              error: error.message,
              notes: 'فشل التحقق بعد عدة محاولات'
            }
            if (stopOnError) throw error
          } else {
            // Wait before retry
            await new Promise(r => setTimeout(r, 1000 * retries))
          }
        }
      }

      // Update statistics
      if (result.status === 'pass') {
        results.passed++
      } else if (result.status === 'flag') {
        results.flagged++
      } else {
        results.errors++
      }

      results.items.push(result)

      // Progress callback
      if (onProgress) {
        onProgress(i + 1, questions.length, result)
      }

      // Rate limiting delay (except for last item)
      if (i < questions.length - 1) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    }

    devLog(`✅ Batch verification complete: ${results.passed} passed, ${results.flagged} flagged, ${results.errors} errors`)
    return results
  }

  /**
   * Quick check - just verify factual accuracy without full analysis
   */
  async quickFactCheck(questionText, answer) {
    try {
      this.initialize()

      const prompt = `Fact check: Is "${answer}" the correct answer to "${questionText}"?
Search the web and respond with just: YES, NO, or UNCERTAIN`

      const response = await this.executeWithRetry(
        () => this.ai.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }]
          }
        }),
        'quick fact check'
      )

      const text = (response.text || '').trim().toUpperCase()

      if (text.includes('YES')) return 'verified'
      if (text.includes('NO')) return 'incorrect'
      return 'uncertain'

    } catch (error) {
      prodError('Quick fact check error:', error)
      return 'error'
    }
  }

  /**
   * Suggest improvements for a question
   */
  async suggestImprovements(question) {
    try {
      this.initialize()

      const prompt = `You are a trivia question editor. Improve this question for clarity and accuracy:

Question: ${question.text}
Answer: ${question.answer}

Provide an improved version that:
1. Is clearer and unambiguous
2. Has correct grammar
3. Is engaging for players

Respond in JSON format:
{
  "improvedQuestion": "the improved question text",
  "improvedAnswer": "the improved answer if needed",
  "changes": ["list of changes made"],
  "explanation": "brief explanation in Arabic"
}`

      const response = await this.executeWithRetry(
        () => this.ai.models.generateContent({
          model: this.model,
          contents: prompt
        }),
        'suggest improvements'
      )

      let text = response.text || ''
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      return JSON.parse(text)

    } catch (error) {
      prodError('Suggest improvements error:', error)
      return {
        error: error.message,
        improvedQuestion: question.text,
        improvedAnswer: question.answer
      }
    }
  }
}

// Export singleton instance
export const questionVerificationService = new QuestionVerificationService()
export default questionVerificationService
