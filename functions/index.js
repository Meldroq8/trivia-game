import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'
import Busboy from 'busboy'

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

      // Verify content-type is multipart/form-data
      const contentType = req.headers['content-type'] || ''
      if (!contentType.includes('multipart/form-data')) {
        res.status(400).json({ error: 'Content-Type must be multipart/form-data' })
        return
      }

      // Parse multipart form data with proper configuration
      const busboy = Busboy({
        headers: req.headers,
        limits: {
          fileSize: 500 * 1024 * 1024, // 500MB max file size
          files: 1, // Only allow 1 file at a time
          fields: 10 // Allow up to 10 fields
        }
      })

      let fileData = null
      let fileName = null
      let mimeType = null
      let folder = 'images/questions' // default
      let hasError = false

      busboy.on('file', (fieldname, file, info) => {
        const { filename, encoding, mimeType: mime } = info
        fileName = filename
        mimeType = mime

        const chunks = []
        file.on('data', (chunk) => {
          chunks.push(chunk)
        })
        file.on('end', () => {
          if (!hasError) {
            fileData = Buffer.concat(chunks)
          }
        })
        file.on('error', (err) => {
          console.error('File stream error:', err)
          hasError = true
        })
      })

      busboy.on('field', (fieldname, value) => {
        if (fieldname === 'folder') {
          folder = value
        }
        if (fieldname === 'fileName') {
          fileName = value
        }
      })

      await new Promise((resolve, reject) => {
        busboy.on('finish', () => {
          if (hasError) {
            reject(new Error('Error processing file upload'))
          } else {
            resolve()
          }
        })
        busboy.on('error', (err) => {
          console.error('Busboy error:', err)
          hasError = true
          reject(err)
        })

        // Pipe the request to busboy
        req.pipe(busboy)
      })

      if (!fileData) {
        res.status(400).json({ error: 'No file uploaded' })
        return
      }

      // Generate filename if not provided
      if (!fileName) {
        const timestamp = Date.now()
        const extension = mimeType?.split('/')[1] || 'bin'
        fileName = `${timestamp}_${Math.random().toString(36).substring(2)}.${extension}`
      }

      // Upload to S3
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'me-south-1',
        credentials: {
          accessKeyId: awsAccessKeyId.value(),
          secretAccessKey: awsSecretAccessKey.value(),
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

      console.log(`File uploaded successfully: ${url}`)
      res.status(200).json({ url, key })

    } catch (error) {
      console.error('S3 upload error:', error)
      res.status(500).json({ error: `Upload failed: ${error.message}` })
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
          accessKeyId: awsAccessKeyId.value(),
          secretAccessKey: awsSecretAccessKey.value(),
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

      if (!searchQuery) {
        res.status(400).json({ error: 'Missing searchQuery' })
        return
      }

      // Call Google Custom Search API
      const url = new URL('https://www.googleapis.com/customsearch/v1')
      url.searchParams.append('key', googleSearchApiKey.value())
      url.searchParams.append('cx', googleSearchEngineId.value())
      url.searchParams.append('q', searchQuery)
      url.searchParams.append('searchType', 'image')
      url.searchParams.append('num', Math.min(numResults, 10).toString())
      url.searchParams.append('start', startIndex.toString())
      url.searchParams.append('safe', 'active')
      url.searchParams.append('imgSize', 'large')
      url.searchParams.append('imgType', 'photo')

      const response = await fetch(url)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'Google Search API failed')
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

// CORS proxy to bypass image CORS restrictions
export const imageProxy = onRequest(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 30,
  },
  async (req, res) => {
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
