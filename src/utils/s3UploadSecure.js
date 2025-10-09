import { devLog, devWarn, prodError } from "./devLog.js"
import { auth } from '../firebase/config'

/**
 * Secure S3 Upload Service using Firebase Functions
 * AWS credentials are stored securely on the server, never exposed to clients
 */

// Use direct Cloud Run function URLs to avoid hosting rewrite issues with multipart uploads
// Firebase Functions v2 uses Cloud Run URLs
// For local development with emulator, set VITE_USE_FIREBASE_EMULATOR=true in .env
const isDevelopment = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'
const EMULATOR_BASE_URL = 'http://127.0.0.1:5001/lamah-357f3/us-central1'

const FUNCTION_URLS = isDevelopment ? {
  s3Upload: `${EMULATOR_BASE_URL}/s3Upload`,
  s3Delete: `${EMULATOR_BASE_URL}/s3Delete`
} : {
  s3Upload: 'https://s3upload-swxv7kjpya-uc.a.run.app',
  s3Delete: 'https://s3delete-swxv7kjpya-uc.a.run.app'
}

export class S3UploadServiceSecure {
  /**
   * Get the current user's ID token for authentication
   */
  static async getIdToken() {
    const user = auth.currentUser
    if (!user) {
      throw new Error('User not authenticated')
    }
    return await user.getIdToken()
  }

  /**
   * Upload a media file (image, audio, video) to S3 via Firebase Function
   * @param {File} file - The media file to upload
   * @param {string} folder - The folder path (e.g., 'categories', 'questions', 'audio', 'video')
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
    let maxSize = 10 * 1024 * 1024 // 10MB for images
    if (file.type.startsWith('audio/')) {
      maxSize = 100 * 1024 * 1024 // 100MB for audio
    } else if (file.type.startsWith('video/')) {
      maxSize = 500 * 1024 * 1024 // 500MB for video
    }

    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024))
      devWarn(`File ${file.name} exceeds ${maxSizeMB}MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)`)
      throw new Error(`حجم الملف كبير جداً: ${(file.size / (1024 * 1024)).toFixed(1)}MB. الحد الأقصى: ${maxSizeMB}MB`)
    }

    try {
      // Get authentication token
      const idToken = await this.getIdToken()

      // Prepare form data
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)
      if (fileName) {
        formData.append('fileName', fileName)
      }

      devLog(`Uploading file to S3 via Firebase Function: ${folder}/${fileName || file.name}`)

      // Upload via direct Firebase Function URL (Cloud Run v2)
      const response = await fetch(FUNCTION_URLS.s3Upload, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Upload failed with status ${response.status}`)
      }

      const result = await response.json()
      devLog('Upload completed successfully:', result.url)

      return result.url
    } catch (error) {
      prodError('Error uploading file via Firebase Function:', error)
      throw new Error(`Failed to upload file: ${error.message}`)
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

    return this.uploadMedia(file, folder, fileName)
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
   * Delete a file from S3
   * @param {string} fileUrl - The CloudFront URL of the file to delete
   * @returns {Promise<boolean>} - True if deleted successfully
   */
  static async deleteFile(fileUrl) {
    if (!fileUrl) {
      throw new Error('No file URL provided')
    }

    try {
      // Get authentication token
      const idToken = await this.getIdToken()

      devLog(`Deleting file from S3: ${fileUrl}`)

      // Delete via direct Firebase Function URL (Cloud Run v2)
      const response = await fetch(FUNCTION_URLS.s3Delete, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: fileUrl }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Delete failed with status ${response.status}`)
      }

      const result = await response.json()
      devLog('File deleted successfully:', result.key)

      return true
    } catch (error) {
      prodError('Error deleting file via Firebase Function:', error)
      throw new Error(`Failed to delete file: ${error.message}`)
    }
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

export default S3UploadServiceSecure
