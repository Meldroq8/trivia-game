import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const S3_CONFIG = {
  region: import.meta.env.VITE_AWS_REGION || 'me-south-1',
  bucket: import.meta.env.VITE_AWS_S3_BUCKET || 'trivia-game-media-cdn'
}

let s3Client = null

const getS3Client = () => {
  if (!s3Client) {
    s3Client = new S3Client({
      region: S3_CONFIG.region,
      credentials: {
        accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY
      }
    })
  }
  return s3Client
}

export class S3UploadService {
  /**
   * Upload a media file (image, audio, video) to S3
   * @param {File} file - The media file to upload
   * @param {string} folder - The folder path (e.g., 'categories', 'questions', 'media')
   * @param {string} fileName - Optional custom filename
   * @returns {Promise<string>} - The CloudFront URL of the uploaded file
   */
  static async uploadMedia(file, folder, fileName = null) {
    if (!file) {
      throw new Error('No file provided')
    }

    // Validate file type for media files (images, audio, video)
    const allowedTypes = [
      // Images
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Audio
      'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a',
      // Video
      'video/mp4', 'video/webm', 'video/mov', 'video/avi', 'video/quicktime'
    ]

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`File type not supported: ${file.type}. Supported types: images (JPG, PNG, WebP), audio (MP3, WAV, OGG), video (MP4, WebM, MOV)`)
    }

    // Check file size based on type
    let maxSize = 5 * 1024 * 1024 // 5MB for images
    if (file.type.startsWith('audio/')) {
      maxSize = 50 * 1024 * 1024 // 50MB for audio
    } else if (file.type.startsWith('video/')) {
      maxSize = 100 * 1024 * 1024 // 100MB for video
    }

    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024))
      throw new Error(`File size must be less than ${maxSizeMB}MB`)
    }

    try {
      // Generate filename if not provided
      if (!fileName) {
        const timestamp = Date.now()
        const extension = file.name.split('.').pop()
        fileName = `${timestamp}_${Math.random().toString(36).substring(2)}.${extension}`
      }

      // Create S3 key
      const key = `${folder}/${fileName}`

      // Determine content type
      const contentType = file.type || 'application/octet-stream'

      // Convert File to ArrayBuffer for AWS SDK compatibility
      console.log(`Converting file to ArrayBuffer for S3 upload: ${key}`)
      const fileBuffer = await file.arrayBuffer()

      // Upload to S3
      console.log(`Uploading media to S3: ${key}`)
      const client = getS3Client()
      const command = new PutObjectCommand({
        Bucket: S3_CONFIG.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        CacheControl: 'max-age=31536000' // 1 year cache
        // Removed ACL: public-read - bucket policy should handle public access
      })

      await client.send(command)
      console.log('Upload completed successfully')

      // Return CloudFront URL instead of S3 URL
      const cloudFrontDomain = import.meta.env.VITE_CLOUDFRONT_DOMAIN
      const cloudFrontUrl = `https://${cloudFrontDomain}/${key}`
      console.log('CloudFront URL:', cloudFrontUrl)

      return cloudFrontUrl
    } catch (error) {
      console.error('Error uploading media to S3:', error)
      console.error('Error details:', {
        message: error.message,
        code: error.Code || error.code,
        statusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId
      })
      throw new Error(`Failed to upload media: ${error.message}`)
    }
  }

  /**
   * Upload an image file to S3
   * @param {File} file - The image file to upload
   * @param {string} folder - The folder path (e.g., 'categories', 'questions')
   * @param {string} fileName - Optional custom filename
   * @returns {Promise<string>} - The CloudFront URL of the uploaded image
   */
  static async uploadImage(file, folder, fileName = null) {
    if (!file) {
      throw new Error('No file provided')
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image')
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      throw new Error('Image size must be less than 5MB')
    }

    try {
      // Generate filename if not provided
      if (!fileName) {
        const timestamp = Date.now()
        const extension = file.name.split('.').pop()
        fileName = `${timestamp}_${Math.random().toString(36).substring(2)}.${extension}`
      }

      // Create S3 key
      const key = `${folder}/${fileName}`

      // Convert File to ArrayBuffer for AWS SDK compatibility
      console.log(`Converting file to ArrayBuffer for S3 upload: ${key}`)
      const fileBuffer = await file.arrayBuffer()

      // Upload to S3
      console.log(`Uploading image to S3: ${key}`)
      const client = getS3Client()
      const command = new PutObjectCommand({
        Bucket: S3_CONFIG.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: file.type,
        CacheControl: 'max-age=31536000' // 1 year cache
        // Removed ACL: public-read - bucket policy should handle public access
      })

      await client.send(command)
      console.log('Upload completed successfully')

      // Return CloudFront URL instead of S3 URL
      const cloudFrontDomain = import.meta.env.VITE_CLOUDFRONT_DOMAIN
      const cloudFrontUrl = `https://${cloudFrontDomain}/${key}`
      console.log('CloudFront URL:', cloudFrontUrl)

      return cloudFrontUrl
    } catch (error) {
      console.error('Error uploading image to S3:', error)
      console.error('Error details:', {
        message: error.message,
        code: error.Code || error.code,
        statusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId
      })
      throw new Error(`Failed to upload image: ${error.message}`)
    }
  }

  /**
   * Upload a category image
   * @param {File} file - The image file
   * @param {string} categoryId - The category ID
   * @returns {Promise<string>} - The CloudFront URL
   */
  static async uploadCategoryImage(file, categoryId) {
    const fileName = `category_${categoryId}_${Date.now()}.${file.name.split('.').pop()}`
    return this.uploadImage(file, 'images/categories', fileName)
  }

  /**
   * Upload a question image
   * @param {File} file - The image file
   * @param {string} questionId - Optional question ID for naming
   * @returns {Promise<string>} - The CloudFront URL
   */
  static async uploadQuestionImage(file, questionId = null) {
    const prefix = questionId ? `question_${questionId}` : 'question'
    const fileName = `${prefix}_${Date.now()}.${file.name.split('.').pop()}`
    return this.uploadImage(file, 'images/questions', fileName)
  }

  /**
   * Upload question media (image, audio, video)
   * @param {File} file - The media file
   * @param {string} questionId - Optional question ID for naming
   * @returns {Promise<string>} - The CloudFront URL
   */
  static async uploadQuestionMedia(file, questionId = null) {
    const prefix = questionId ? `question_${questionId}` : 'question'
    const fileName = `${prefix}_${Date.now()}.${file.name.split('.').pop()}`

    // Determine the appropriate S3 folder based on file type
    let folder = 'images/questions' // default for images
    if (file.type.startsWith('audio/')) {
      folder = 'audio'
    } else if (file.type.startsWith('video/')) {
      folder = 'video'
    }

    return this.uploadMedia(file, folder, fileName)
  }

  /**
   * Delete a file from S3 (optional - for cleanup)
   * Note: This would require additional AWS SDK imports and DELETE permissions
   * For now, we'll just log and skip deletion
   */
  static async deleteFile(fileUrl) {
    console.log('S3 file deletion not implemented yet:', fileUrl)
    // TODO: Implement S3 deleteObject if needed
    return
  }

  /**
   * Compress image before upload (reusing from original service)
   * @param {File} file - The image file
   * @param {number} maxWidth - Maximum width in pixels
   * @param {number} quality - JPEG quality (0-1)
   * @returns {Promise<File>} - Compressed file
   */
  static async compressImage(file, maxWidth = 800, quality = 0.8) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()

      img.onload = () => {
        // Calculate new dimensions
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height)
        const newWidth = img.width * ratio
        const newHeight = img.height * ratio

        // Set canvas size
        canvas.width = newWidth
        canvas.height = newHeight

        // Draw and compress
        ctx.drawImage(img, 0, 0, newWidth, newHeight)

        canvas.toBlob(
          (blob) => {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            })
            resolve(compressedFile)
          },
          'image/jpeg',
          quality
        )
      }

      img.src = URL.createObjectURL(file)
    })
  }
}

export default S3UploadService