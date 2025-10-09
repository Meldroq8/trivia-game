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

      // Parse multipart form data
      const busboy = Busboy({ headers: req.headers })

      let fileData = null
      let fileName = null
      let mimeType = null
      let folder = 'images/questions' // default

      busboy.on('file', (fieldname, file, info) => {
        const { filename, encoding, mimeType: mime } = info
        fileName = filename
        mimeType = mime

        const chunks = []
        file.on('data', (chunk) => {
          chunks.push(chunk)
        })
        file.on('end', () => {
          fileData = Buffer.concat(chunks)
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
        busboy.on('finish', resolve)
        busboy.on('error', reject)
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
