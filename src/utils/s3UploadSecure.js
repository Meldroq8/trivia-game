import { devLog, devWarn, prodError } from "./devLog.js"
import { auth } from '../firebase/config'
import { simpleSmartCompress, supportsMediaCompression } from './simpleMediaProcessor'

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
  s3Delete: `${EMULATOR_BASE_URL}/s3Delete`,
  getUploadUrl: `${EMULATOR_BASE_URL}/getUploadUrl`
} : {
  s3Upload: 'https://s3upload-swxv7kjpya-uc.a.run.app',
  s3Delete: 'https://s3delete-swxv7kjpya-uc.a.run.app',
  getUploadUrl: 'https://us-central1-lamah-357f3.cloudfunctions.net/getUploadUrl'
}

export class S3UploadServiceSecure {
  /**
   * Get the current user's ID token for authentication
   * @param {boolean} required - Whether authentication is required
   */
  static async getIdToken(required = true) {
    const user = auth.currentUser
    if (!user) {
      if (required) {
        throw new Error('User not authenticated')
      }
      return null
    }
    return await user.getIdToken()
  }

  /**
   * Upload a media file (image, audio, video) to S3 via Firebase Function
   * @param {File} file - The media file to upload
   * @param {string} folder - The folder path (e.g., 'categories', 'questions', 'audio', 'video')
   * @param {string} fileName - Optional custom filename
   * @param {string} inviteCode - Optional invite code for loader authentication
   * @returns {Promise<string>} - The CloudFront URL of the uploaded file
   */
  static async uploadMedia(file, folder, fileName = null, inviteCode = null) {
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
      maxSize = 2 * 1024 * 1024 * 1024 // 2GB for video
    }

    if (file.size > maxSize) {
      // Format size display (MB or GB)
      const formatSize = (bytes) => {
        const sizeInMB = bytes / (1024 * 1024)
        if (sizeInMB >= 1024) {
          return `${(sizeInMB / 1024).toFixed(2)}GB`
        }
        return `${sizeInMB.toFixed(1)}MB`
      }

      const maxSizeFormatted = formatSize(maxSize)
      const fileSizeFormatted = formatSize(file.size)

      devWarn(`File ${file.name} exceeds ${maxSizeFormatted} limit (${fileSizeFormatted})`)
      throw new Error(`حجم الملف كبير جداً: ${fileSizeFormatted}. الحد الأقصى: ${maxSizeFormatted}`)
    }

    try {
      // Smart compression for audio/video files
      let uploadFile = file

      if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        const fileSizeMB = file.size / 1024 / 1024

        if (fileSizeMB > 20) {
          devLog(`📹 File is large (${fileSizeMB.toFixed(2)}MB), attempting compression...`)

          try {
            uploadFile = await simpleSmartCompress(file, 20)

            if (uploadFile !== file) {
              const compressedMB = uploadFile.size / 1024 / 1024
              const savings = ((1 - uploadFile.size / file.size) * 100).toFixed(1)
              devLog(`✨ Compressed: ${fileSizeMB.toFixed(2)}MB → ${compressedMB.toFixed(2)}MB (${savings}% reduction)`)
            }
          } catch (compressionError) {
            devWarn(`Compression failed, uploading original file:`, compressionError.message)
            uploadFile = file
          }
        } else {
          devLog(`File is small (${fileSizeMB.toFixed(2)}MB), skipping compression`)
        }
      }

      // For large files (>30MB), use direct S3 upload with pre-signed URL
      const LARGE_FILE_THRESHOLD = 30 * 1024 * 1024 // 30MB
      if (uploadFile.size > LARGE_FILE_THRESHOLD) {
        devLog(`📤 Large file detected (${(uploadFile.size / (1024 * 1024)).toFixed(2)}MB), using direct S3 upload`)
        return await this.uploadLargeFile(uploadFile, folder, fileName, inviteCode)
      }

      // Get authentication token or use invite code
      const idToken = await this.getIdToken(!inviteCode) // Only require token if no invite code

      // Prepare form data
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('folder', folder)
      if (fileName) {
        formData.append('fileName', fileName)
      }

      devLog(`Uploading file to S3 via Firebase Function: ${folder}/${fileName || uploadFile.name}`)

      // Prepare headers
      const headers = {}
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`
      } else if (inviteCode) {
        headers['X-Invite-Code'] = inviteCode
        devLog('Using invite code for authentication')
      }

      // Upload via direct Firebase Function URL (Cloud Run v2)
      const response = await fetch(FUNCTION_URLS.s3Upload, {
        method: 'POST',
        headers: headers,
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
   * Upload large files directly to S3 using pre-signed URLs
   * @param {File} file - The file to upload
   * @param {string} folder - The S3 folder
   * @param {string} fileName - Custom filename
   * @param {string} inviteCode - Optional invite code
   * @returns {Promise<string>} - CloudFront URL
   */
  static async uploadLargeFile(file, folder, fileName = null, inviteCode = null) {
    try {
      const uploadFileName = fileName || `${file.name.split('.')[0]}_${Date.now()}.${file.name.split('.').pop()}`

      // Get authentication token
      const idToken = await this.getIdToken(!inviteCode)

      // Request pre-signed URL from Cloud Function
      const headers = { 'Content-Type': 'application/json' }
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`
      } else if (inviteCode) {
        headers['X-Invite-Code'] = inviteCode
      }

      const urlResponse = await fetch(FUNCTION_URLS.getUploadUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileName: uploadFileName,
          folder,
          mimeType: file.type
        })
      })

      if (!urlResponse.ok) {
        throw new Error(`Failed to get upload URL: ${urlResponse.status}`)
      }

      const { uploadUrl, finalUrl } = await urlResponse.json()

      devLog(`📤 Uploading directly to S3... (${(file.size / (1024 * 1024)).toFixed(2)}MB)`)

      // Upload directly to S3 using pre-signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        }
      })

      if (!uploadResponse.ok) {
        throw new Error(`S3 upload failed: ${uploadResponse.status}`)
      }

      devLog('✅ Large file uploaded successfully:', finalUrl)
      return finalUrl
    } catch (error) {
      prodError('Error uploading large file:', error)
      throw new Error(`Failed to upload large file: ${error.message}`)
    }
  }

  /**
   * Upload an image file to S3
   * @param {File} file - The image file to upload
   * @param {string} folder - The folder path (e.g., 'categories', 'questions')
   * @param {string} fileName - Optional custom filename
   * @param {string} inviteCode - Optional invite code for loader authentication
   * @returns {Promise<string>} - The CloudFront URL of the uploaded image
   */
  static async uploadImage(file, folder, fileName = null, inviteCode = null) {
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

    return this.uploadMedia(file, folder, fileName, inviteCode)
  }

  /**
   * Upload a category image
   * @param {File} file - The image file
   * @param {string} categoryId - The category ID
   * @param {string} inviteCode - Optional invite code for loader authentication
   * @returns {Promise<string>} - The CloudFront URL
   */
  static async uploadCategoryImage(file, categoryId, inviteCode = null) {
    const fileName = `category_${categoryId}_${Date.now()}.${file.name.split('.').pop()}`
    return this.uploadImage(file, 'images/categories', fileName, inviteCode)
  }

  /**
   * Upload a question image
   * @param {File} file - The image file
   * @param {string} questionId - Optional question ID for naming
   * @param {string} inviteCode - Optional invite code for loader authentication
   * @returns {Promise<string>} - The CloudFront URL
   */
  static async uploadQuestionImage(file, questionId = null, inviteCode = null) {
    const prefix = questionId ? `question_${questionId}` : 'question'
    const fileName = `${prefix}_${Date.now()}.${file.name.split('.').pop()}`
    return this.uploadImage(file, 'images/questions', fileName, inviteCode)
  }

  /**
   * Upload question media (image, audio, video)
   * @param {File} file - The media file
   * @param {string} questionId - Optional question ID for naming
   * @param {string} inviteCode - Optional invite code for loader authentication
   * @returns {Promise<string>} - The CloudFront URL
   */
  static async uploadQuestionMedia(file, questionId = null, inviteCode = null) {
    const prefix = questionId ? `question_${questionId}` : 'question'
    const fileName = `${prefix}_${Date.now()}.${file.name.split('.').pop()}`

    // Determine the appropriate S3 folder based on file type
    let folder = 'images/questions' // default for images
    if (file.type.startsWith('audio/')) {
      folder = 'audio'
    } else if (file.type.startsWith('video/')) {
      folder = 'video'
    }

    return this.uploadMedia(file, folder, fileName, inviteCode)
  }

  /**
   * Delete a file from S3
   * @param {string} fileUrl - The CloudFront URL of the file to delete
   * @param {string} inviteCode - Optional invite code for loader authentication
   * @returns {Promise<boolean>} - True if deleted successfully
   */
  static async deleteFile(fileUrl, inviteCode = null) {
    if (!fileUrl) {
      throw new Error('No file URL provided')
    }

    try {
      // Get authentication token or use invite code
      const idToken = await this.getIdToken(!inviteCode) // Only require token if no invite code

      devLog(`Deleting file from S3: ${fileUrl}`)

      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
      }
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`
      } else if (inviteCode) {
        headers['X-Invite-Code'] = inviteCode
        devLog('Using invite code for delete authentication')
      }

      // Delete via direct Firebase Function URL (Cloud Run v2)
      const response = await fetch(FUNCTION_URLS.s3Delete, {
        method: 'POST',
        headers: headers,
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

        // Determine if we should preserve transparency (PNG, WebP, GIF)
        const supportsTransparency = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif'

        // If JPEG or no transparency support, fill with white background
        if (!supportsTransparency) {
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, newWidth, newHeight)
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, newWidth, newHeight)

        // Choose output format: preserve transparency if original supports it
        const outputType = supportsTransparency ? file.type : 'image/jpeg'
        const outputQuality = supportsTransparency && file.type === 'image/png' ? 1.0 : quality

        canvas.toBlob(
          (blob) => {
            const extension = outputType.split('/')[1]
            const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, `.${extension}`), {
              type: outputType,
              lastModified: Date.now()
            })
            resolve(compressedFile)
          },
          outputType,
          outputQuality
        )
      }

      img.src = URL.createObjectURL(file)
    })
  }
}

export default S3UploadServiceSecure
