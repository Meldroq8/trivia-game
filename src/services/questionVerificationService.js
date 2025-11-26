import { GoogleGenAI } from "@google/genai"
import { devLog, prodError } from '../utils/devLog'

/**
 * Service for verifying trivia questions using Gemini 3 API
 * Checks grammar, factual accuracy, and answer correctness
 * Supports both Arabic and English content
 */
class QuestionVerificationService {
  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY
    this.ai = null
    this.model = "gemini-3-pro-preview"
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

المطلوب:
1. تحقق من القواعد والإملاء والصياغة
2. ابحث في الإنترنت: هل الإجابة صحيحة للسؤال؟

⚠️ قواعد التحقق من الإجابة:
- إذا الإجابة صحيحة أو صحيحة جزئياً = factualAccuracy: "verified"
- فقط إذا الإجابة خاطئة 100% = factualAccuracy: "incorrect"
- لأسئلة الأفلام/المسلسلات/الفن: كن متساهلاً
- إذا لم تجد معلومات كافية = اعتبرها "verified"

⚠️ متى تكتب suggestedQuestion:
1. إذا الإجابة خاطئة 100% = اكتب سؤال جديد يناسب الإجابة الحالية
2. إذا صياغة السؤال سيئة = أعد صياغته مع الحفاظ على نفس الموضوع والمسلسل/الفيلم!
   مثال: "ما اسم الممثلة في طاش ما طاش؟" → "من هي الممثلة التي شاركت في طاش ما طاش؟"
   لا تغير المسلسل أو الموضوع - فقط حسّن الصياغة!

أجب JSON فقط:
{
  "status": "pass" أو "flag",
  "grammarIssues": ["أخطاء إملائية/نحوية"],
  "factualAccuracy": "verified" أو "incorrect",
  "suggestedQuestion": "سؤال محسن أو بديل",
  "notes": "سبب قصير",
  "sources": []
}`

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }] // Enable web search for fact-checking
        }
      })

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
      const notes = extractField('notes') || 'تعذر تحليل الاستجابة'

      return {
        questionId: question.id,
        questionText: question.text,
        answer: question.answer,
        status: status,
        grammarIssues: [],
        factualAccuracy: factualAccuracy,
        suggestedQuestion: suggestedQuestion,
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

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      })

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

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt
      })

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
