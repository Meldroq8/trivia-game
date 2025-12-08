import { devLog, prodError } from '../utils/devLog'
import { getAuth } from 'firebase/auth'

/**
 * Service for verifying trivia questions using Claude Opus 4.5 API
 * Uses Firebase Functions as a secure proxy to keep API keys server-side
 * Checks grammar, factual accuracy, and answer correctness
 * Supports both Arabic and English content
 */
class QuestionVerificationService {
  constructor() {
    this.maxRetries = 3
    this.baseDelay = 2000 // 2 seconds base delay for retries
    // Firebase Functions URL
    this.functionBaseUrl = 'https://us-central1-lamah-357f3.cloudfunctions.net'
  }

  /**
   * Get auth token for Firebase Functions
   */
  async getAuthToken() {
    const auth = getAuth()
    const user = auth.currentUser
    if (!user) {
      throw new Error('User not authenticated')
    }
    return await user.getIdToken()
  }

  /**
   * Sleep utility for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Execute API call with automatic retry on rate limit errors
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
        if (errorMessage.includes('429') || errorMessage.includes('rate') || errorMessage.includes('overloaded')) {
          let waitTime = this.baseDelay * attempt

          // Cap at 60 seconds max
          waitTime = Math.min(waitTime, 60000)

          devLog(`Rate limit hit${context ? ` (${context})` : ''}. Attempt ${attempt}/${this.maxRetries}. Waiting ${Math.round(waitTime/1000)}s...`)

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
   * Call Claude API via Firebase Function (secure, server-side)
   */
  async callClaude(prompt, maxTokens = 4096) {
    const token = await this.getAuthToken()

    const response = await fetch(`${this.functionBaseUrl}/claudeVerifyQuestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        prompt,
        maxTokens
      })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      throw new Error(error.error || `API request failed with status ${response.status}`)
    }

    const data = await response.json()
    return {
      text: data.text || ''
    }
  }

  /**
   * Call Claude API for batch operations via Firebase Function
   */
  async callClaudeBatch(prompt, maxTokens = 8192) {
    const token = await this.getAuthToken()

    const response = await fetch(`${this.functionBaseUrl}/claudeVerifyBatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        prompt,
        maxTokens
      })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      throw new Error(error.error || `API request failed with status ${response.status}`)
    }

    const data = await response.json()
    return {
      text: data.text || ''
    }
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
      // Build the batch prompt
      const questionsText = toVerify.map((q, idx) => {
        const answerText = Array.isArray(q.answer) ? q.answer[0] : (q.answer || '')
        const categoryName = q.categoryName || q.categoryId || 'عام'
        const difficulty = q.difficulty || 'medium'
        return `[سؤال ${idx + 1}] (ID: ${q.id})
السؤال: ${q.text}
الإجابة: ${answerText}
الفئة: ${categoryName}
الصعوبة المحددة: ${difficulty}`
      }).join('\n\n')

      const prompt = `مدقق أسئلة تريفيا. راجع هذه الأسئلة:

${questionsText}

⚠️ خطوات التحقق:
1. هل السؤال كامل ومفهوم؟ (ليس ناقص أو مقطوع)
2. هل الإجابة كاملة؟ (ليست ناقصة أو فارغة)
3. هل توجد أخطاء إملائية واضحة؟
4. تحقق من معرفتك: هل الإجابة صحيحة لهذا السؤال بالتحديد؟
5. هل مستوى صعوبة السؤال يتناسب مع الصعوبة المحددة؟

📊 مستويات الصعوبة:
- easy (سهل): أسئلة معلومات عامة بسيطة، يعرفها معظم الناس
- medium (متوسط): أسئلة تحتاج بعض المعرفة، ليست واضحة للجميع
- hard (صعب): أسئلة تحتاج معرفة متخصصة أو تفاصيل دقيقة

🚨 تحذير مهم جداً:
- اقرأ السؤال بدقة شديدة قبل التحقق
- تحقق من الإجابة الصحيحة للسؤال المطروح بالضبط
- لا تخلط بين دول أو أشخاص أو أحداث مختلفة!
- مثال: إذا السؤال عن "الكويت" لا تخلط مع "الإمارات"

✅ متى تختار "pass" (تم التحقق):
- السؤال والإجابة كاملين
- الإجابة صحيحة بعد التحقق
- لا توجد أخطاء إملائية واضحة
- مستوى الصعوبة متناسب

❌ متى تختار "flag" (يحتاج مراجعة):
- السؤال ناقص أو غير مكتمل
- الإجابة فارغة أو ناقصة
- أخطاء إملائية واضحة
- الإجابة خاطئة بعد التحقق
- مستوى الصعوبة غير متناسب مع السؤال

⚠️ قاعدة الاقتراحات المهمة:
🔴 الإجابة مرتبطة بصورة! عند اقتراح سؤال جديد يجب أن تكون الإجابة الحالية صحيحة له!

- إذا الإجابة صحيحة والصعوبة متناسبة والسؤال جيد: لا تقترح شيء (null)
- إذا الإجابة خاطئة: اقترح سؤال مختلف يكون جوابه الصحيح = الإجابة المكتوبة بالضبط
- إذا السؤال غير واضح أو ممل: اقترح صياغة أفضل وأكثر تشويقاً (نفس الإجابة)
- إذا الصعوبة غير متناسبة: اقترح سؤال معدل يناسب الصعوبة (نفس الإجابة)
- إذا اقترحت سؤال جديد يغير المعنى: يجب أن تقترح إجابة مرتبطة بالإجابة الأصلية

✨ قاعدة تحسين الأسئلة (مهمة جداً):
- حوّل الأسئلة المملة إلى أسئلة مثيرة ومشوقة
- استخدم تفاصيل دقيقة ترفع مستوى السؤال بدلاً من الأسئلة المباشرة جداً
- مثال سيء: "من هي أخت بلاك بانثر؟" ← مثال جيد: "من هي الأميرة التي تترأس مجموعة واكاندا للتصميم (Wakandan Design Group)؟"
- مثال سيء: "ما اسم صديق سبايدرمان؟" ← مثال جيد: "من هو أفضل صديق لبيتر باركر الذي اكتشف هويته السرية في (Spider-Man: Homecoming)؟"
- الأسئلة الجيدة تختبر المعرفة العميقة وليس فقط المعلومات السطحية

✂️ قاعدة الاختصار:
- عند اقتراح سؤال جديد: اجعله أقصر من السؤال الأصلي
- الأسئلة المختصرة أفضل - أزل الكلمات الزائدة والتفاصيل غير الضرورية
- الإجابات يجب أن تكون مختصرة (كلمة أو كلمتين أو ثلاث كحد أقصى)
- إذا الإجابة طويلة: اقترح نسخة مختصرة في suggestedAnswer (نفس المعنى!)

🌍 قاعدة الأسماء الأجنبية (مهمة):
- أسماء الأفلام/المسلسلات/الأغاني/الشخصيات الأجنبية: أضف الاسم الإنجليزي بين قوسين
- في السؤال: استخدم الاسم الإنجليزي بين قوسين
- في الإجابة: أضف الاسم الإنجليزي بين قوسين بعد الاسم العربي
- مثال: "شوري" ← "شوري (Shuri)"
- مثال: "فيلم الأبديون" ← "فيلم (Eternals)"

🎯 أمثلة تحسين:
- سؤال ممل: "من هي قائدة مجموعة واكاندا للتصميم؟" ← سؤال مشوق: "من هي الأميرة العبقرية التي تترأس مجموعة واكاندا للتصميم (Wakandan Design Group) وتطور تقنيات الفايبرانيوم؟" + إجابة: "شوري (Shuri)"
- إجابة طويلة: "جمهورية مصر العربية" ← suggestedAnswer: "مصر"
- سؤال طويل ممل: "ما هو اسم الكوكب الثالث؟" ← سؤال أفضل: "ما الكوكب الوحيد المعروف بوجود حياة فيه؟"

🔴 قاعدة ذهبية:
- السؤال المقترح يجب أن تكون إجابته = الإجابة الحالية أو إجابة مرتبطة بها
- إذا السؤال المقترح له إجابة مختلفة ← يجب ملء suggestedAnswer بإجابة مرتبطة بالأصلية
- لا تقترح سؤال إجابته مختلفة تماماً عن الإجابة الحالية!
- في notes: اشرح لماذا السؤال بهذه الصعوبة وما الذي يجعله مميزاً

أجب بـ JSON array فقط (بدون أي نص إضافي):
[
  {
    "id": "question_id",
    "status": "pass" أو "flag",
    "grammarIssues": [],
    "factualAccuracy": "verified" أو "incorrect",
    "difficultyMatch": true أو false,
    "actualDifficulty": "easy" أو "medium" أو "hard",
    "suggestedQuestion": null أو "السؤال المحسن/المعدل",
    "suggestedAnswer": null أو "الإجابة المختصرة (نفس المعنى)",
    "notes": "سبب التعديل أو سبب الرفض"
  }
]`

      const response = await this.executeWithRetry(
        () => this.callClaude(prompt),
        `batch of ${toVerify.length} questions`
      )

      const results = this.parseBatchResponse(response, toVerify)
      devLog(`Batch verified ${results.length} questions`)

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

      let parsed
      try {
        parsed = JSON.parse(text)
      } catch (jsonErr) {
        devLog('Initial JSON parse failed, attempting repairs...', jsonErr.message)
        // Try to repair common JSON issues
        let repaired = text
          // Remove trailing commas
          .replace(/,(\s*[}\]])/g, '$1')
          // Fix unquoted property names
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3')
          // Fix single quotes to double quotes
          .replace(/'/g, '"')
          // Remove any control characters
          .replace(/[\x00-\x1F\x7F]/g, '')

        try {
          parsed = JSON.parse(repaired)
        } catch (repairErr) {
          // Last resort: extract individual objects
          devLog('Repair failed, extracting individual objects...')
          parsed = this.extractObjectsFromText(text, questions)
          if (parsed.length === 0) {
            throw new Error('Could not parse JSON response')
          }
        }
      }

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
          difficulty: question.difficulty,
          status: result.status || 'flag',
          grammarIssues: result.grammarIssues || [],
          factualAccuracy: result.factualAccuracy || 'uncertain',
          difficultyMatch: result.difficultyMatch !== false, // default to true if not specified
          actualDifficulty: result.actualDifficulty || question.difficulty || 'medium',
          suggestedQuestion: result.suggestedQuestion || null,
          suggestedAnswer: result.suggestedAnswer || null,
          notes: result.notes || '',
          sources: result.sources || [],
          verifiedAt: new Date().toISOString()
        }
      })

    } catch (parseError) {
      devLog('Failed to parse batch response:', parseError.message, 'Text:', text.substring(0, 500))
      // Try to extract at least status from the text
      return questions.map(question => {
        const hasPass = text.toLowerCase().includes('pass') || text.includes('verified')
        return {
          questionId: question.id,
          questionText: question.text,
          answer: question.answer,
          difficulty: question.difficulty,
          status: hasPass ? 'pass' : 'flag',
          grammarIssues: [],
          factualAccuracy: 'uncertain',
          difficultyMatch: true,
          actualDifficulty: question.difficulty || 'medium',
          suggestedQuestion: null,
          suggestedAnswer: null,
          notes: `تعذر تحليل الاستجابة بشكل كامل`,
          sources: [],
          verifiedAt: new Date().toISOString()
        }
      })
    }
  }

  /**
   * Extract individual JSON objects from malformed text
   */
  extractObjectsFromText(text, questions) {
    const results = []

    // Try to match individual objects with id and status
    const objectRegex = /\{\s*"id"\s*:\s*"([^"]+)"[\s\S]*?"status"\s*:\s*"([^"]+)"[\s\S]*?\}/g
    let match

    while ((match = objectRegex.exec(text)) !== null) {
      const id = match[1]
      const fullMatch = match[0]

      // Extract other fields from this object
      const statusMatch = fullMatch.match(/"status"\s*:\s*"([^"]+)"/)
      const notesMatch = fullMatch.match(/"notes"\s*:\s*"([^"]*)"/)
      const factualMatch = fullMatch.match(/"factualAccuracy"\s*:\s*"([^"]+)"/)
      const diffMatch = fullMatch.match(/"actualDifficulty"\s*:\s*"([^"]+)"/)
      const suggestedQMatch = fullMatch.match(/"suggestedQuestion"\s*:\s*"([^"]*)"/)
      const suggestedAMatch = fullMatch.match(/"suggestedAnswer"\s*:\s*"([^"]*)"/)

      results.push({
        id: id,
        status: statusMatch ? statusMatch[1] : 'flag',
        notes: notesMatch ? notesMatch[1] : '',
        factualAccuracy: factualMatch ? factualMatch[1] : 'uncertain',
        actualDifficulty: diffMatch ? diffMatch[1] : 'medium',
        suggestedQuestion: suggestedQMatch && suggestedQMatch[1] !== 'null' ? suggestedQMatch[1] : null,
        suggestedAnswer: suggestedAMatch && suggestedAMatch[1] !== 'null' ? suggestedAMatch[1] : null
      })
    }

    return results
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
        devLog('Skipping instruction question:', question.text?.substring(0, 50))
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

      const categoryName = question.categoryName || question.categoryId || 'عام'
      // Handle answer that might be an array
      const answerText = Array.isArray(question.answer) ? question.answer[0] : (question.answer || '')
      const difficulty = question.difficulty || 'medium'

      const prompt = `مدقق أسئلة تريفيا. راجع هذا السؤال:

السؤال: ${question.text}
الإجابة: ${answerText}
الفئة: ${categoryName}
الصعوبة المحددة: ${difficulty}

⚠️ خطوات التحقق:
1. هل السؤال كامل ومفهوم؟ (ليس ناقص أو مقطوع)
2. هل الإجابة كاملة؟ (ليست ناقصة أو فارغة)
3. هل توجد أخطاء إملائية واضحة؟
4. تحقق من معرفتك: هل الإجابة صحيحة لهذا السؤال بالتحديد؟
5. هل مستوى صعوبة السؤال يتناسب مع الصعوبة المحددة؟

📊 مستويات الصعوبة:
- easy (سهل): أسئلة معلومات عامة بسيطة، يعرفها معظم الناس
- medium (متوسط): أسئلة تحتاج بعض المعرفة، ليست واضحة للجميع
- hard (صعب): أسئلة تحتاج معرفة متخصصة أو تفاصيل دقيقة

🚨 تحذير مهم جداً:
- اقرأ السؤال بدقة شديدة قبل التحقق
- تحقق من الإجابة الصحيحة للسؤال المطروح بالضبط
- لا تخلط بين دول أو أشخاص أو أحداث مختلفة!

✅ متى تختار "pass":
- السؤال والإجابة كاملين
- الإجابة صحيحة بعد التحقق
- لا توجد أخطاء إملائية واضحة
- مستوى الصعوبة متناسب

❌ متى تختار "flag":
- السؤال ناقص أو غير مكتمل
- الإجابة فارغة أو ناقصة
- أخطاء إملائية واضحة
- الإجابة خاطئة بعد التحقق
- مستوى الصعوبة غير متناسب مع السؤال

⚠️ قاعدة الاقتراحات المهمة:
🔴 الإجابة مرتبطة بصورة! عند اقتراح سؤال جديد يجب أن تكون الإجابة الحالية صحيحة له!

- إذا الإجابة صحيحة والصعوبة متناسبة والسؤال جيد: لا تقترح شيء (null)
- إذا الإجابة خاطئة: اقترح سؤال مختلف يكون جوابه الصحيح = الإجابة المكتوبة بالضبط
- إذا السؤال غير واضح أو ممل: اقترح صياغة أفضل وأكثر تشويقاً (نفس الإجابة)
- إذا الصعوبة غير متناسبة: اقترح سؤال معدل يناسب الصعوبة (نفس الإجابة)
- إذا اقترحت سؤال جديد يغير المعنى: يجب أن تقترح إجابة مرتبطة بالإجابة الأصلية

✨ قاعدة تحسين الأسئلة (مهمة جداً):
- حوّل الأسئلة المملة إلى أسئلة مثيرة ومشوقة
- استخدم تفاصيل دقيقة ترفع مستوى السؤال بدلاً من الأسئلة المباشرة جداً
- مثال سيء: "من هي أخت بلاك بانثر؟" ← مثال جيد: "من هي الأميرة التي تترأس مجموعة واكاندا للتصميم (Wakandan Design Group)؟"
- الأسئلة الجيدة تختبر المعرفة العميقة وليس فقط المعلومات السطحية

✂️ قاعدة الاختصار:
- عند اقتراح سؤال جديد: اجعله أقصر من السؤال الأصلي
- الأسئلة المختصرة أفضل - أزل الكلمات الزائدة والتفاصيل غير الضرورية
- الإجابات يجب أن تكون مختصرة (كلمة أو كلمتين أو ثلاث كحد أقصى)
- إذا الإجابة طويلة: اقترح نسخة مختصرة في suggestedAnswer (نفس المعنى!)

🌍 قاعدة الأسماء الأجنبية (مهمة):
- أسماء الأفلام/المسلسلات/الأغاني/الشخصيات الأجنبية: أضف الاسم الإنجليزي بين قوسين
- في السؤال: استخدم الاسم الإنجليزي بين قوسين
- في الإجابة: أضف الاسم الإنجليزي بين قوسين بعد الاسم العربي
- مثال: "شوري" ← "شوري (Shuri)"

🎯 أمثلة تحسين:
- سؤال ممل: "من هي قائدة مجموعة واكاندا؟" ← سؤال مشوق: "من هي الأميرة العبقرية التي تترأس (Wakandan Design Group)؟" + إجابة: "شوري (Shuri)"
- إجابة طويلة: "جمهورية مصر العربية" ← suggestedAnswer: "مصر"

🔴 قاعدة ذهبية:
- السؤال المقترح يجب أن تكون إجابته = الإجابة الحالية أو إجابة مرتبطة بها
- إذا السؤال المقترح له إجابة مختلفة ← يجب ملء suggestedAnswer بإجابة مرتبطة بالأصلية
- لا تقترح سؤال إجابته مختلفة تماماً عن الإجابة الحالية!
- في notes: اشرح لماذا السؤال بهذه الصعوبة وما الذي يجعله مميزاً

أجب JSON فقط:
{
  "status": "pass" أو "flag",
  "grammarIssues": ["أخطاء إملائية/نحوية"],
  "factualAccuracy": "verified" أو "incorrect",
  "difficultyMatch": true أو false,
  "actualDifficulty": "easy" أو "medium" أو "hard",
  "suggestedQuestion": null أو "السؤال المحسن/المعدل",
  "suggestedAnswer": null أو "الإجابة المختصرة (نفس المعنى)",
  "notes": "سبب التعديل أو سبب الرفض",
  "sources": []
}`

      const response = await this.executeWithRetry(
        () => this.callClaude(prompt),
        `question: ${question.text?.substring(0, 30)}...`
      )

      const result = this.parseResponse(response, question)
      devLog('Question verified:', question.text?.substring(0, 50) + '...')
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
        difficulty: question.difficulty,
        status: parsed.status || 'flag',
        grammarIssues: parsed.grammarIssues || [],
        factualAccuracy: parsed.factualAccuracy || 'uncertain',
        difficultyMatch: parsed.difficultyMatch !== false,
        actualDifficulty: parsed.actualDifficulty || question.difficulty || 'medium',
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
      const actualDifficulty = extractField('actualDifficulty')
      const notes = extractField('notes') || 'تعذر تحليل الاستجابة'

      return {
        questionId: question.id,
        questionText: question.text,
        answer: question.answer,
        difficulty: question.difficulty,
        status: status,
        grammarIssues: [],
        factualAccuracy: factualAccuracy,
        difficultyMatch: !actualDifficulty || actualDifficulty === question.difficulty,
        actualDifficulty: actualDifficulty || question.difficulty || 'medium',
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

    devLog(`Starting batch verification of ${questions.length} questions...`)

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

    devLog(`Batch verification complete: ${results.passed} passed, ${results.flagged} flagged, ${results.errors} errors`)
    return results
  }

  /**
   * Quick check - just verify factual accuracy without full analysis
   */
  async quickFactCheck(questionText, answer) {
    try {
      const prompt = `Fact check: Is "${answer}" the correct answer to "${questionText}"?
Respond with just: YES, NO, or UNCERTAIN`

      const response = await this.executeWithRetry(
        () => this.callClaude(prompt, 100),
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
        () => this.callClaude(prompt),
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

  /**
   * Rebalance difficulties after initial analysis (second pass)
   * Takes all analyzed questions and intelligently redistributes to achieve equal distribution
   * @param {Array} analyzedQuestions - Array of questions with suggestedDifficulty from first pass
   * @param {number} targetPerDifficulty - Target count per difficulty level
   * @returns {Promise<Array>} Array with rebalanced difficulty suggestions
   */
  async rebalanceDifficulties(analyzedQuestions, targetPerDifficulty) {
    if (!analyzedQuestions || analyzedQuestions.length === 0) return []

    let results = [...analyzedQuestions]

    // Calculate current suggested distribution
    const calcDist = (questions) => {
      const dist = { easy: 0, medium: 0, hard: 0 }
      questions.forEach(q => {
        const diff = q.suggestedDifficulty || 'medium'
        if (dist[diff] !== undefined) dist[diff]++
      })
      return dist
    }

    const isBalanced = (dist) => ['easy', 'medium', 'hard'].every(
      diff => Math.abs(dist[diff] - targetPerDifficulty) <= 1
    )

    let currentDist = calcDist(results)

    if (isBalanced(currentDist)) {
      devLog('Distribution already balanced, skipping rebalance')
      return results
    }

    // Calculate exact moves needed
    const calcMoves = (dist) => {
      const moves = []
      const excess = {}
      const deficit = {}

      for (const diff of ['easy', 'medium', 'hard']) {
        const delta = dist[diff] - targetPerDifficulty
        if (delta > 0) excess[diff] = delta
        else if (delta < 0) deficit[diff] = Math.abs(delta)
      }

      // Prioritize adjacent moves: easy<->medium, medium<->hard
      const adjacentPairs = [
        ['easy', 'medium'],
        ['medium', 'hard']
      ]

      for (const [a, b] of adjacentPairs) {
        // Move from a to b
        if (excess[a] && deficit[b]) {
          const count = Math.min(excess[a], deficit[b])
          moves.push({ from: a, to: b, count })
          excess[a] -= count
          deficit[b] -= count
          if (excess[a] === 0) delete excess[a]
          if (deficit[b] === 0) delete deficit[b]
        }
        // Move from b to a
        if (excess[b] && deficit[a]) {
          const count = Math.min(excess[b], deficit[a])
          moves.push({ from: b, to: a, count })
          excess[b] -= count
          deficit[a] -= count
          if (excess[b] === 0) delete excess[b]
          if (deficit[a] === 0) delete deficit[a]
        }
      }

      // Handle any remaining (easy<->hard if needed)
      if (excess['easy'] && deficit['hard']) {
        const count = Math.min(excess['easy'], deficit['hard'])
        moves.push({ from: 'easy', to: 'hard', count })
      }
      if (excess['hard'] && deficit['easy']) {
        const count = Math.min(excess['hard'], deficit['easy'])
        moves.push({ from: 'hard', to: 'easy', count })
      }

      return moves
    }

    const moves = calcMoves(currentDist)
    devLog('Required moves:', moves)

    if (moves.length === 0) {
      return results
    }

    try {
      // Build specific move requests
      for (const move of moves) {
        // Get questions in the 'from' category
        const candidates = results.filter(q => q.suggestedDifficulty === move.from)

        if (candidates.length === 0) continue

        // Build prompt for AI to pick which questions to move
        const candidatesText = candidates.map((q, idx) => {
          return `[${idx + 1}] ID: ${q.questionId}
السؤال: ${q.questionText}
الإجابة: ${Array.isArray(q.answer) ? q.answer[0] : q.answer}`
        }).join('\n\n')

        const prompt = `اختر ${move.count} أسئلة لتحويلها من "${move.from}" إلى "${move.to}"

الأسئلة المرشحة (حالياً ${move.from}):
${candidatesText}

📌 اختر الأسئلة الأقرب لصعوبة "${move.to}":
- إذا التحويل من easy إلى medium: اختر الأسئلة الأصعب قليلاً
- إذا التحويل من medium إلى easy: اختر الأسئلة الأسهل
- إذا التحويل من medium إلى hard: اختر الأسئلة التي تحتاج معرفة أعمق
- إذا التحويل من hard إلى medium: اختر الأسئلة الأقل تخصصاً

🔴 مهم جداً: يجب اختيار بالضبط ${move.count} سؤال!

أجب بـ JSON array فقط - IDs الأسئلة المختارة:
["id1", "id2", ...]`

        const response = await this.executeWithRetry(
          () => this.callClaude(prompt),
          `picking ${move.count} questions: ${move.from}->${move.to}`
        )

        let text = response.text || ''
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          text = jsonMatch[0]
        }

        let selectedIds = []
        try {
          selectedIds = JSON.parse(text)
        } catch {
          // Try to extract IDs with regex
          const idMatches = text.matchAll(/"([^"]+)"/g)
          for (const m of idMatches) {
            selectedIds.push(m[1])
          }
        }

        // Apply the moves
        let moved = 0
        results = results.map(q => {
          if (moved < move.count && selectedIds.includes(q.questionId)) {
            moved++
            return {
              ...q,
              suggestedDifficulty: move.to,
              needsChange: move.to !== q.currentDifficulty,
              reason: `${q.reason || ''} -> نُقل من ${move.from} إلى ${move.to} للتوازن`
            }
          }
          return q
        })

        devLog(`Moved ${moved} questions from ${move.from} to ${move.to}`)
      }

      // Final verification
      const finalDist = calcDist(results)
      devLog('Final distribution:', finalDist)

      return results

    } catch (error) {
      prodError('Error in difficulty rebalancing:', error)
      // Return original analysis on error
      return analyzedQuestions
    }
  }

  /**
   * Analyze difficulty only for a batch of questions (for difficulty balancer)
   * @param {Array} questions - Array of question objects
   * @returns {Promise<Array>} Array of difficulty analysis results
   */
  async analyzeDifficultyBatch(questions) {
    if (!questions || questions.length === 0) return []

    try {
      // Calculate current distribution and target
      const total = questions.length
      const targetPerDifficulty = Math.floor(total / 3)
      const currentDist = { easy: 0, medium: 0, hard: 0 }
      questions.forEach(q => {
        const diff = q.difficulty || 'medium'
        if (currentDist[diff] !== undefined) currentDist[diff]++
      })

      const questionsText = questions.map((q, idx) => {
        const answerText = Array.isArray(q.answer) ? q.answer[0] : (q.answer || '')
        return `[${idx + 1}] (ID: ${q.id})
السؤال: ${q.text}
الإجابة: ${answerText}
الصعوبة الحالية: ${q.difficulty || 'غير محدد'}`
      }).join('\n\n')

      const prompt = `محلل وموازن صعوبة أسئلة تريفيا.

🎯 الهدف الرئيسي: توزيع الأسئلة بالتساوي!
- إجمالي الأسئلة: ${total}
- الهدف لكل صعوبة: ${targetPerDifficulty} سؤال
- التوزيع الحالي: easy=${currentDist.easy}, medium=${currentDist.medium}, hard=${currentDist.hard}

⚖️ قواعد التوازن (مهمة جداً):
1. يجب أن يكون الناتج النهائي متوازن: ~${targetPerDifficulty} لكل صعوبة
2. إذا كانت صعوبة معينة أكثر من الهدف، غيّر بعض أسئلتها لصعوبة أخرى
3. إذا كانت صعوبة معينة أقل من الهدف، غيّر أسئلة من صعوبات أخرى إليها
4. اختر الأسئلة الأقرب للصعوبة المطلوبة للتغيير

الأسئلة:
${questionsText}

📊 معايير تحديد الصعوبة:
- easy (سهل): معلومات عامة يعرفها أغلب الناس، أسئلة مباشرة وبسيطة
- medium (متوسط): تحتاج معرفة جيدة، ليست واضحة للجميع، تفاصيل غير شائعة
- hard (صعب): تحتاج معرفة متخصصة، تفاصيل دقيقة جداً، معلومات نادرة

🔄 كيفية الموازنة:
- الأسئلة التي يمكن أن تكون easy أو medium: اخترها حسب الحاجة للتوازن
- الأسئلة التي يمكن أن تكون medium أو hard: اخترها حسب الحاجة للتوازن
- الأولوية للتوازن على التصنيف الدقيق (إذا السؤال يقع بين صعوبتين، اختر الصعوبة التي تحتاج أسئلة أكثر)

أجب بـ JSON array فقط:
[
  {
    "id": "question_id",
    "currentDifficulty": "الصعوبة الحالية",
    "suggestedDifficulty": "easy أو medium أو hard",
    "needsChange": true أو false,
    "reason": "سبب قصير للتصنيف"
  }
]`

      const response = await this.executeWithRetry(
        () => this.callClaude(prompt),
        `difficulty analysis batch of ${questions.length}`
      )

      let text = response.text || ''
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        text = jsonMatch[0]
      }

      // Try to repair common JSON issues
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch (parseErr) {
        devLog('JSON parse failed, attempting repair...', parseErr.message)
        // Try to fix common issues
        let repaired = text
          // Fix Arabic text breaking JSON (unescaped quotes in strings)
          .replace(/:\s*"([^"]*)"([^,}\]"])/g, ': "$1"$2')
          // Remove trailing commas before ] or }
          .replace(/,(\s*[}\]])/g, '$1')
          // Fix unquoted property names
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3')

        try {
          parsed = JSON.parse(repaired)
        } catch (repairErr) {
          // Last resort: try to extract individual objects
          devLog('Repair failed, extracting individual results...')
          const objectMatches = text.matchAll(/\{[^{}]*"id"\s*:\s*"([^"]+)"[^{}]*"suggestedDifficulty"\s*:\s*"([^"]+)"[^{}]*\}/g)
          parsed = []
          for (const match of objectMatches) {
            parsed.push({
              id: match[1],
              suggestedDifficulty: match[2],
              needsChange: true,
              reason: 'تم استخراج جزئي'
            })
          }
          if (parsed.length === 0) {
            throw new Error('Could not parse or repair JSON response')
          }
        }
      }

      return questions.map(question => {
        const result = parsed.find(r => r.id === question.id) || parsed[questions.indexOf(question)] || {}
        return {
          questionId: question.id,
          questionText: question.text,
          answer: question.answer,
          imageUrl: question.imageUrl || null,
          audioUrl: question.audioUrl || null,
          videoUrl: question.videoUrl || null,
          currentDifficulty: question.difficulty || 'unset',
          suggestedDifficulty: result.suggestedDifficulty || question.difficulty || 'medium',
          needsChange: result.needsChange || (result.suggestedDifficulty && result.suggestedDifficulty !== question.difficulty),
          reason: result.reason || ''
        }
      })

    } catch (error) {
      prodError('Error in difficulty analysis:', error)
      return questions.map(q => ({
        questionId: q.id,
        questionText: q.text,
        answer: q.answer,
        imageUrl: q.imageUrl || null,
        audioUrl: q.audioUrl || null,
        videoUrl: q.videoUrl || null,
        currentDifficulty: q.difficulty || 'unset',
        suggestedDifficulty: q.difficulty || 'medium',
        needsChange: false,
        reason: 'خطأ في التحليل',
        error: error.message
      }))
    }
  }
}

// Export singleton instance
export const questionVerificationService = new QuestionVerificationService()
export default questionVerificationService
