import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'
import Busboy from 'busboy'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'

// Initialize Firebase Admin
initializeApp()

// Define secrets for AWS credentials
const awsAccessKeyId = defineSecret('AWS_ACCESS_KEY_ID')
const awsSecretAccessKey = defineSecret('AWS_SECRET_ACCESS_KEY')

// Define secrets for AI services
const openaiApiKey = defineSecret('OPENAI_API_KEY')
const googleSearchApiKey = defineSecret('GOOGLE_SEARCH_API_KEY')
const googleSearchEngineId = defineSecret('GOOGLE_SEARCH_ENGINE_ID')

// S3 Upload Proxy - Secure server-side uploads
export const s3Upload = onRequest(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 300, // 5 minutes for large files
    memory: '1GiB',
    secrets: [awsAccessKeyId, awsSecretAccessKey],
  },
  async (req, res) => {
    // Set CORS headers FIRST - before any other processing
    // This ensures they're sent even if there's an error
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    res.set('Access-Control-Max-Age', '86400') // 24 hours
    res.set('Access-Control-Allow-Credentials', 'false')

    // Handle preflight OPTIONS request immediately
    if (req.method === 'OPTIONS') {
      console.log('Handling OPTIONS preflight request')
      res.status(204).send('')
      return
    }

    try {
      // Only allow POST requests
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }

      console.log('S3 Upload request received:', {
        method: req.method,
        contentType: req.headers['content-type'],
        hasAuth: !!req.headers.authorization
      })

      // Verify authentication
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing token' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]

      // Verify the ID token and get user
      let decodedToken
      try {
        decodedToken = await getAuth().verifyIdToken(idToken)
      } catch (error) {
        console.error('Token verification failed:', error)
        res.status(401).json({ error: 'Unauthorized: Invalid token' })
        return
      }

      const userId = decodedToken.uid

      // Check if user is admin
      const db = getFirestore()
      const userDoc = await db.collection('users').doc(userId).get()

      if (!userDoc.exists || !userDoc.data().isAdmin) {
        res.status(403).json({ error: 'Forbidden: Admin access required' })
        return
      }

      // Log request details for debugging
      console.log('Request details:', {
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
        method: req.method,
        url: req.url
      })

      // Parse multipart form data using busboy with explicit stream piping
      // Cloud Run provides /tmp directory for temporary file storage
      let fileData = null
      let fileName = null
      let mimeType = null
      let folder = 'images/questions' // default
      let tempFilePath = null

      console.log('Starting to parse form data with busboy')

      try {
        // Get raw body buffer - Firebase Functions provides req.rawBody
        console.log('Checking for rawBody...')
        let rawBody = req.rawBody

        // If rawBody is not available, try reading from stream
        if (!rawBody) {
          console.log('rawBody not available, reading from stream...')
          rawBody = await new Promise((resolve, reject) => {
            const chunks = []
            req.on('data', (chunk) => {
              console.log('Received chunk:', chunk.length, 'bytes')
              chunks.push(chunk)
            })
            req.on('end', () => {
              console.log('Stream ended, total chunks:', chunks.length)
              resolve(Buffer.concat(chunks))
            })
            req.on('error', reject)

            // Timeout after 30 seconds
            setTimeout(() => {
              reject(new Error('Timeout reading request body'))
            }, 30000)
          })
        }

        console.log('Raw body received:', {
          size: rawBody ? rawBody.length : 0,
          hasRawBody: !!req.rawBody
        })

        // Parse the buffer with busboy
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Form parsing timeout after 2 minutes'))
          }, 120000)

          const busboy = Busboy({
            headers: req.headers,
            limits: {
              fileSize: 500 * 1024 * 1024, // 500MB
              files: 1
            }
          })

          let fileReceived = false

          busboy.on('file', (fieldname, file, info) => {
            fileReceived = true
            const { filename, encoding, mimeType: mime } = info

            console.log('📁 File event:', { fieldname, filename, encoding, mimeType: mime })

            mimeType = mime
            fileName = fileName || filename

            // Generate temp file path
            tempFilePath = join('/tmp', `upload_${Date.now()}_${Math.random().toString(36).substring(2)}`)

            const chunks = []
            let totalBytes = 0

            file.on('data', (data) => {
              chunks.push(data)
              totalBytes += data.length
              console.log('📊 Receiving data:', { bytes: data.length, total: totalBytes })
            })

            file.on('end', () => {
              console.log('✅ File stream ended:', { totalBytes })
              fileData = Buffer.concat(chunks)

              // Save to temp file for safety
              writeFileSync(tempFilePath, fileData)
            })

            file.on('error', (err) => {
              console.error('❌ File stream error:', err)
              reject(err)
            })
          })

          busboy.on('field', (fieldname, value) => {
            console.log('📝 Field event:', { fieldname, value })

            if (fieldname === 'folder') {
              folder = value
            } else if (fieldname === 'fileName') {
              fileName = value
            }
          })

          busboy.on('finish', () => {
            clearTimeout(timeoutId)
            console.log('🏁 Busboy finished')

            if (!fileReceived) {
              reject(new Error('No file received'))
            } else {
              resolve()
            }
          })

          busboy.on('error', (err) => {
            clearTimeout(timeoutId)
            console.error('❌ Busboy error:', err)
            reject(err)
          })

          // Write the raw body buffer to busboy and end it
          console.log('🔄 Writing raw body to busboy')
          busboy.write(rawBody)
          busboy.end()
        })

        if (!fileData) {
          res.status(400).json({ error: 'No file data received' })
          return
        }

        console.log('File processed:', {
          fileName,
          mimeType,
          size: fileData.length
        })

        // Generate filename if not provided
        if (!fileName) {
          const timestamp = Date.now()
          const extension = mimeType?.split('/')[1] || 'bin'
          fileName = `${timestamp}_${Math.random().toString(36).substring(2)}.${extension}`
        }

        // Upload to S3
        // Trim credentials to remove any whitespace/newlines that cause "Invalid character" errors
        const accessKey = awsAccessKeyId.value().trim()
        const secretKey = awsSecretAccessKey.value().trim()

        console.log('S3 credentials check:', {
          accessKeyLength: accessKey.length,
          secretKeyLength: secretKey.length,
          accessKeyHasNewline: accessKey.includes('\n'),
          secretKeyHasNewline: secretKey.includes('\n')
        })

        const s3Client = new S3Client({
          region: process.env.AWS_REGION || 'me-south-1',
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
          },
        })

        const key = `${folder}/${fileName}`
        const bucket = process.env.AWS_S3_BUCKET || 'trivia-game-media-cdn'

        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fileData,
          ContentType: mimeType,
          CacheControl: 'max-age=31536000', // 1 year
        }))

        // Return CloudFront URL
        const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN || 'drcqcbq3desis.cloudfront.net'
        const url = `https://${cloudFrontDomain}/${key}`

        // Clean up temp file if it exists
        if (tempFilePath) {
          try {
            unlinkSync(tempFilePath)
            console.log('🗑️ Temp file cleaned up')
          } catch (unlinkError) {
            console.warn('Failed to delete temp file:', unlinkError.message)
          }
        }

        console.log(`File uploaded successfully: ${url}`)
        res.status(200).json({ url, key })

      } catch (error) {
        console.error('S3 upload error:', error)

        // Clean up temp file on error
        if (tempFilePath) {
          try {
            unlinkSync(tempFilePath)
          } catch (unlinkError) {
            console.warn('Failed to delete temp file on error:', unlinkError.message)
          }
        }

        res.status(500).json({ error: `Upload failed: ${error.message}` })
      }
    } catch (error) {
      console.error('Request handling error:', error)
      res.status(500).json({ error: `Failed: ${error.message}` })
    }
  }
)

// S3 Delete Proxy - Secure server-side deletes
export const s3Delete = onRequest(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 60,
    secrets: [awsAccessKeyId, awsSecretAccessKey],
  },
  async (req, res) => {
    // Set CORS headers FIRST
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    res.set('Access-Control-Max-Age', '86400')
    res.set('Access-Control-Allow-Credentials', 'false')

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      console.log('Handling OPTIONS preflight request for s3Delete')
      res.status(204).send('')
      return
    }

    try {
      // Only allow POST requests
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }

      // Verify authentication
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing token' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]

      // Verify the ID token and get user
      let decodedToken
      try {
        decodedToken = await getAuth().verifyIdToken(idToken)
      } catch (error) {
        console.error('Token verification failed:', error)
        res.status(401).json({ error: 'Unauthorized: Invalid token' })
        return
      }

      const userId = decodedToken.uid

      // Check if user is admin
      const db = getFirestore()
      const userDoc = await db.collection('users').doc(userId).get()

      if (!userDoc.exists || !userDoc.data().isAdmin) {
        res.status(403).json({ error: 'Forbidden: Admin access required' })
        return
      }

      // Get the file key from request body
      const { key, url } = req.body

      if (!key && !url) {
        res.status(400).json({ error: 'Missing key or url parameter' })
        return
      }

      // Extract key from URL if provided
      let fileKey = key
      if (!fileKey && url) {
        const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN || 'drcqcbq3desis.cloudfront.net'
        fileKey = url.replace(`https://${cloudFrontDomain}/`, '')
      }

      // Delete from S3
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'me-south-1',
        credentials: {
          accessKeyId: awsAccessKeyId.value().trim(),
          secretAccessKey: awsSecretAccessKey.value().trim(),
        },
      })

      const bucket = process.env.AWS_S3_BUCKET || 'trivia-game-media-cdn'

      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: fileKey,
      }))

      console.log(`File deleted successfully: ${fileKey}`)
      res.status(200).json({ success: true, key: fileKey })

    } catch (error) {
      console.error('S3 delete error:', error)
      res.status(500).json({ error: `Delete failed: ${error.message}` })
    }
  }
)

// AI Service - Improve Question using OpenAI
export const aiImproveQuestion = onRequest(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 60,
    secrets: [openaiApiKey],
  },
  async (req, res) => {
    // Set CORS headers FIRST
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    res.set('Access-Control-Max-Age', '86400')
    res.set('Access-Control-Allow-Credentials', 'false')

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    try {
      // Only allow POST requests
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }

      // Verify authentication
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing token' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]

      // Verify the ID token
      let decodedToken
      try {
        decodedToken = await getAuth().verifyIdToken(idToken)
      } catch (error) {
        console.error('Token verification failed:', error)
        res.status(401).json({ error: 'Unauthorized: Invalid token' })
        return
      }

      const userId = decodedToken.uid

      // Check if user is admin
      const db = getFirestore()
      const userDoc = await db.collection('users').doc(userId).get()

      if (!userDoc.exists || !userDoc.data().isAdmin) {
        res.status(403).json({ error: 'Forbidden: Admin access required' })
        return
      }

      const { questionText, answerText, categoryName, difficulty } = req.body

      if (!questionText) {
        res.status(400).json({ error: 'Missing questionText' })
        return
      }

      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey.value()}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `أنت خبير صارم جداً في تحسين أسئلة الترفيه والمعلومات العامة بالعربية وتقييم صعوبتها بدقة عالية.

قواعد صارمة:
1. حسّن صياغة السؤال لتكون أوضح وأدق (لكن احتفظ بالمعنى الأساسي)
2. أضف الأسماء الإنجليزية بين قوسين () بعد الأسماء العربية
3. حسّن الإجابة لتكون مختصرة ومباشرة ودقيقة
4. قيّم صعوبة السؤال بواقعية شديدة
5. يجب أن يكون الرد JSON صحيح`
            },
            {
              role: 'user',
              content: `حسّن هذا السؤال والإجابة:

السؤال: ${questionText}
الإجابة: ${answerText || 'غير محدد'}
الفئة: ${categoryName || 'عام'}
الصعوبة الحالية: ${difficulty || 'medium'}

أرجع JSON فقط:
{
  "improvedQuestion": "السؤال المحسّن",
  "improvedAnswer": "الإجابة المحسّنة",
  "suggestedDifficulty": "easy أو medium أو hard",
  "explanation": "ملخص التحسينات"
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
        throw new Error(error.error?.message || 'OpenAI API failed')
      }

      const data = await response.json()
      const result = JSON.parse(data.choices[0].message.content)

      res.status(200).json(result)

    } catch (error) {
      console.error('AI improve question error:', error)
      res.status(500).json({ error: `Failed: ${error.message}` })
    }
  }
)

// AI Service - Search Images using Google Custom Search
export const aiSearchImages = onRequest(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 30,
    secrets: [googleSearchApiKey, googleSearchEngineId],
  },
  async (req, res) => {
    // Set CORS headers FIRST
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    res.set('Access-Control-Max-Age', '86400')
    res.set('Access-Control-Allow-Credentials', 'false')

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    try {
      // Only allow POST requests
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }

      // Verify authentication
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing token' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]

      // Verify the ID token
      let decodedToken
      try {
        decodedToken = await getAuth().verifyIdToken(idToken)
      } catch (error) {
        console.error('Token verification failed:', error)
        res.status(401).json({ error: 'Unauthorized: Invalid token' })
        return
      }

      const userId = decodedToken.uid

      // Check if user is admin
      const db = getFirestore()
      const userDoc = await db.collection('users').doc(userId).get()

      if (!userDoc.exists || !userDoc.data().isAdmin) {
        res.status(403).json({ error: 'Forbidden: Admin access required' })
        return
      }

      const { searchQuery, numResults = 8, startIndex = 1 } = req.body

      // Validate search query
      if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
        res.status(400).json({ error: 'Missing or invalid searchQuery' })
        return
      }

      const cleanQuery = searchQuery.trim()
      const validNum = Math.max(1, Math.min(numResults, 10)) // Google allows 1-10
      const validStart = Math.max(1, Math.min(startIndex, 91)) // Google allows 1-91 for image search

      // Validate Google API credentials
      const apiKey = googleSearchApiKey.value()
      const engineId = googleSearchEngineId.value()

      if (!apiKey || apiKey.trim().length === 0) {
        console.error('Google Search API key is not set or empty')
        res.status(500).json({ error: 'Google Search API key not configured' })
        return
      }

      if (!engineId || engineId.trim().length === 0) {
        console.error('Google Search Engine ID is not set or empty')
        res.status(500).json({ error: 'Google Search Engine ID not configured' })
        return
      }

      // Detect if query is Arabic and translate to English
      const isArabic = /[\u0600-\u06FF]/.test(cleanQuery)
      let finalQuery = cleanQuery

      if (isArabic) {
        console.log('Arabic query detected, translating to English...')
        try {
          // Use Google Translate API (free, no auth needed)
          const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(cleanQuery)}`
          const translateResponse = await fetch(translateUrl)
          const translateData = await translateResponse.json()
          finalQuery = translateData[0][0][0]
          console.log('Translated query:', finalQuery)
        } catch (translateError) {
          console.warn('Translation failed, using original query:', translateError.message)
          // Continue with Arabic query as fallback
        }
      }

      console.log('Image search params:', {
        originalQuery: cleanQuery,
        finalQuery: finalQuery,
        isArabic: isArabic,
        queryLength: finalQuery.length,
        num: validNum,
        start: validStart,
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey.length,
        hasEngineId: !!engineId,
        engineIdLength: engineId.length
      })

      // Call Google Custom Search API
      const url = new URL('https://www.googleapis.com/customsearch/v1')
      url.searchParams.append('key', apiKey.trim())
      url.searchParams.append('cx', engineId.trim())
      url.searchParams.append('q', finalQuery)
      url.searchParams.append('searchType', 'image')
      url.searchParams.append('num', validNum.toString())
      url.searchParams.append('start', validStart.toString())
      url.searchParams.append('safe', 'active')
      url.searchParams.append('imgSize', 'large')
      url.searchParams.append('imgType', 'photo')

      console.log('Calling Google Custom Search API:', url.toString())

      const response = await fetch(url)

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = 'Google Search API failed'

        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorData.error?.errors?.[0]?.message || errorText
          console.error('Google API error details:', errorData)
        } catch (e) {
          errorMessage = errorText
          console.error('Google API error (non-JSON):', errorText)
        }

        throw new Error(errorMessage)
      }

      const data = await response.json()

      if (!data.items || data.items.length === 0) {
        res.status(200).json({ images: [] })
        return
      }

      const images = data.items.map(item => ({
        url: item.link,
        thumbnail: item.image.thumbnailLink,
        title: item.title,
        source: item.displayLink,
        width: item.image.width,
        height: item.image.height,
        contextLink: item.image.contextLink
      }))

      res.status(200).json({ images })

    } catch (error) {
      console.error('AI search images error:', error)
      res.status(500).json({ error: `Failed: ${error.message}` })
    }
  }
)

// AI Service - Generate Smart Image Search Query using OpenAI
export const aiGenerateImageQuery = onRequest(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 30,
    secrets: [openaiApiKey],
  },
  async (req, res) => {
    // Set CORS headers FIRST
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    res.set('Access-Control-Max-Age', '86400')
    res.set('Access-Control-Allow-Credentials', 'false')

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    try {
      // Only allow POST requests
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' })
        return
      }

      // Verify authentication
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing token' })
        return
      }

      const idToken = authHeader.split('Bearer ')[1]

      // Verify the ID token
      let decodedToken
      try {
        decodedToken = await getAuth().verifyIdToken(idToken)
      } catch (error) {
        console.error('Token verification failed:', error)
        res.status(401).json({ error: 'Unauthorized: Invalid token' })
        return
      }

      const userId = decodedToken.uid

      // Check if user is admin
      const db = getFirestore()
      const userDoc = await db.collection('users').doc(userId).get()

      if (!userDoc.exists || !userDoc.data().isAdmin) {
        res.status(403).json({ error: 'Forbidden: Admin access required' })
        return
      }

      const { questionText, categoryName = '', correctAnswer = '', imageTarget = 'question' } = req.body

      if (!questionText) {
        res.status(400).json({ error: 'Missing questionText' })
        return
      }

      // Call OpenAI to generate smart English search query
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey.value()}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at creating effective English image search queries. Generate SHORT, specific search terms (2-5 words) that will find the most relevant and accurate images.'
            },
            {
              role: 'user',
              content: `Create an English image search query:

QUESTION: ${questionText}
ANSWER: ${correctAnswer || 'Not provided'}
CATEGORY: ${categoryName || 'general'}
SEARCHING FOR: ${imageTarget === 'answer' ? 'IMAGE OF THE ANSWER' : 'IMAGE FOR THE QUESTION'}

${imageTarget === 'answer'
  ? `Your task: Create a search query for an image of "${correctAnswer}"
- The image MUST show/represent: ${correctAnswer}
- Context: This is the answer to "${questionText}"
- Focus on "${correctAnswer}" as the main subject
- Examples:
  * Answer="باريس" → "Paris cityscape Eiffel Tower"
  * Answer="جون بيرد" → "John Logie Baird portrait"
  * Answer="القاهرة" → "Cairo Egypt skyline"`
  : `Your task: Create a search query for an image that illustrates the question
- The question asks: ${questionText}
- The answer is: ${correctAnswer}
- Create a query that shows what the question is asking about
- Examples:
  * Question="من اخترع التلفاز؟" → "television invention history"
  * Question="ما عاصمة فرنسا؟" → "France map capital"
  * Question="كم عدد كواكب المجموعة الشمسية؟" → "solar system planets"`}

Return ONLY 2-5 English search words. No quotes, no explanations, no punctuation.`
            }
          ],
          temperature: 0.3,
          max_tokens: 20
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'OpenAI API failed')
      }

      const data = await response.json()
      const searchQuery = data.choices[0].message.content.trim().replace(/['"]/g, '')

      console.log('Generated image search query:', searchQuery)
      res.status(200).json({ searchQuery })

    } catch (error) {
      console.error('AI generate image query error:', error)
      res.status(500).json({ error: `Failed: ${error.message}` })
    }
  }
)

// CORS proxy to bypass image CORS restrictions
export const imageProxy = onRequest(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 30,
  },
  async (req, res) => {
    // Set CORS headers FIRST
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    res.set('Access-Control-Max-Age', '86400')
    res.set('Access-Control-Allow-Credentials', 'false')

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    try {
      // Only allow GET requests
      if (req.method !== 'GET') {
        res.status(405).send('Method not allowed')
        return
      }

      const imageUrl = req.query.url

      if (!imageUrl) {
        res.status(400).send('Missing url parameter')
        return
      }

      // Fetch the image from the external URL
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      if (!response.ok) {
        res.status(response.status).send(`Failed to fetch image: ${response.statusText}`)
        return
      }

      // Get the image as array buffer
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Set appropriate headers
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      res.set('Content-Type', contentType)
      res.set('Cache-Control', 'public, max-age=86400') // Cache for 1 day
      res.set('Access-Control-Allow-Origin', '*')

      // Send the image
      res.send(buffer)
    } catch (error) {
      console.error('Image proxy error:', error)
      res.status(500).send(`Error fetching image: ${error.message}`)
    }
  }
)
