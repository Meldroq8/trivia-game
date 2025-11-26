import { GoogleGenAI } from "@google/genai"
import { devLog, prodError } from '../utils/devLog'

/**
 * Service for verifying trivia questions using Gemini 3 API
 * Checks grammar, factual accuracy, and answer correctness
 * Supports both Arabic and English content
 */
class QuestionVerificationService {
  constructor() {
    this.apiKey = "AIzaSyDa6TNyHp7Q33qLMuHKBT1FjE30FK65Ifs"
    this.ai = null
    this.model = "gemini-2.0-flash" // Using stable model, can upgrade to gemini-3-pro-preview when available
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
    const hasArabicQuestion = this.containsArabic(question.text || '')
    const hasEnglishQuestion = this.containsEnglish(question.text || '')
    const hasArabicAnswer = this.containsArabic(question.answer || '')
    const hasEnglishAnswer = this.containsEnglish(question.answer || '')

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
    const text = (question.text || '').toLowerCase()
    const answer = (question.answer || '').toLowerCase()

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

      const prompt = `أنت مدقق أسئلة تريفيا. راجع السؤال والإجابة التالية.

السؤال: ${question.text}
الإجابة: ${question.answer}
${question.options?.length ? `الخيارات: ${question.options.join('، ')}` : ''}
الفئة/التصنيف: ${categoryName}

مهم جداً: هذا السؤال من فئة "${categoryName}" - ضع ذلك في اعتبارك عند التحقق.
إذا كان السؤال يتعلق بقصة أو لعبة أو فيلم معين في هذه الفئة، فالإجابة صحيحة ضمن سياق تلك القصة.

قم بالتحقق من:
1. صحة القواعد النحوية والإملائية
2. وضوح صياغة السؤال - هل هو واضح وغير غامض؟
3. صحة الإجابة - ابحث في الإنترنت للتأكد
4. هل الإجابة تجيب فعلاً على السؤال المطروح؟
5. إذا كانت هناك خيارات، هل الإجابة الصحيحة موجودة بينها؟

مهم: ابحث في الإنترنت للتحقق من صحة الإجابة.

أجب بصيغة JSON فقط (بدون markdown أو code blocks) - جميع النصوص يجب أن تكون بالعربية:
{
  "status": "pass" أو "flag",
  "grammarIssues": ["قائمة مشاكل القواعد بالعربية إن وجدت"],
  "factualAccuracy": "verified" أو "incorrect" أو "uncertain",
  "correctAnswer": "الإجابة الصحيحة بالعربية إن كانت مختلفة",
  "clarityScore": 1-5,
  "suggestedCorrection": "التصحيح المقترح بالعربية إن وجد",
  "notes": "شرح مختصر بالعربية عن سبب التقييم",
  "sources": ["روابط المصادر المستخدمة للتحقق"]
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
    try {
      let text = response.text || ''

      // Clean up the response - remove markdown code blocks if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      // Try to parse as JSON
      const parsed = JSON.parse(text)

      return {
        questionId: question.id,
        questionText: question.text,
        answer: question.answer,
        status: parsed.status || 'flag',
        grammarIssues: parsed.grammarIssues || [],
        factualAccuracy: parsed.factualAccuracy || 'uncertain',
        correctAnswer: parsed.correctAnswer || null,
        clarityScore: parsed.clarityScore || 3,
        suggestedCorrection: parsed.suggestedCorrection || '',
        notes: parsed.notes || '',
        sources: parsed.sources || [],
        verifiedAt: new Date().toISOString()
      }
    } catch (parseError) {
      devLog('Failed to parse AI response, using fallback:', parseError)

      // Fallback - try to extract meaning from raw text
      const text = response.text || ''
      const isPass = text.toLowerCase().includes('"status": "pass"') ||
                     text.toLowerCase().includes("'status': 'pass'")

      return {
        questionId: question.id,
        questionText: question.text,
        answer: question.answer,
        status: isPass ? 'pass' : 'flag',
        grammarIssues: [],
        factualAccuracy: 'uncertain',
        notes: 'تعذر تحليل استجابة الذكاء الاصطناعي بشكل كامل',
        rawResponse: text.substring(0, 500),
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
