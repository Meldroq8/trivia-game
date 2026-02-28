import { devLog, devWarn, prodError } from "./devLog.js"
import { S3UploadServiceSecure as S3UploadService } from './s3UploadSecure'

export class ImageUploadService {
  /**
   * Upload a media file (image, audio, video) to S3 and return CloudFront URL
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
      maxSize = 200 * 1024 * 1024 // 200MB for video
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

      // Upload to S3 and get CloudFront URL
      devLog(`Uploading media to S3: ${folder}/${fileName}`)
      const cloudFrontUrl = await S3UploadService.uploadMedia(file, folder, fileName)
      devLog('Upload completed successfully, CloudFront URL:', cloudFrontUrl)

      return cloudFrontUrl
    } catch (error) {
      prodError('Error uploading media:', error)
      throw new Error(`Failed to upload media: ${error.message}`)
    }
  }

  /**
   * Upload an image file to S3 and return CloudFront URL
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

      // Upload to S3 and get CloudFront URL
      devLog(`Uploading image to S3: ${folder}/${fileName}`)
      const cloudFrontUrl = await S3UploadService.uploadImage(file, folder, fileName)
      devLog('Image upload completed successfully, CloudFront URL:', cloudFrontUrl)

      return cloudFrontUrl
    } catch (error) {
      prodError('Error uploading image:', error)
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
    return S3UploadService.uploadCategoryImage(file, categoryId)
  }

  /**
   * Upload a question image
   * @param {File} file - The image file
   * @param {string} questionId - Optional question ID for naming
   * @returns {Promise<string>} - The CloudFront URL
   */
  static async uploadQuestionImage(file, questionId = null) {
    return S3UploadService.uploadQuestionImage(file, questionId)
  }

  /**
   * Upload question media (image, audio, video)
   * @param {File} file - The media file
   * @param {string} questionId - Optional question ID for naming
   * @returns {Promise<string>} - The CloudFront URL
   */
  static async uploadQuestionMedia(file, questionId = null) {
    return S3UploadService.uploadQuestionMedia(file, questionId)
  }

  /**
   * Delete an image from S3 (via CloudFront URL)
   * @param {string} imageUrl - The CloudFront URL of the image
   * @returns {Promise<void>}
   */
  static async deleteImage(imageUrl) {
    if (!imageUrl || !imageUrl.includes('cloudfront')) {
      devLog('Not a CloudFront URL, skipping deletion')
      return
    }

    try {
      // Extract S3 path from CloudFront URL
      const path = this.extractS3PathFromCloudFrontUrl(imageUrl)
      if (!path) {
        throw new Error('Could not extract S3 path from CloudFront URL')
      }

      await S3UploadService.deleteFile(path)
      devLog('Image deleted successfully from S3:', path)
    } catch (error) {
      prodError('Error deleting image:', error)
      // Don't throw error for deletion failures - just log them
    }
  }

  /**
   * Extract the S3 path from a CloudFront URL
   * @param {string} url - The CloudFront URL
   * @returns {string|null} - The S3 path
   */
  static extractS3PathFromCloudFrontUrl(url) {
    try {
      // CloudFront URLs have the format:
      // https://drcqcbq3desis.cloudfront.net/images/categories/filename.webp
      const urlObj = new URL(url)
      const path = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname
      return path
    } catch (error) {
      prodError('Error extracting S3 path from CloudFront URL:', error)
      return null
    }
  }


  /**
   * Compress image before upload (optional)
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

        // Always convert to WebP - best compression with transparency support
        canvas.toBlob(
          (blob) => {
            const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
              type: 'image/webp',
              lastModified: Date.now()
            })
            resolve(compressedFile)
          },
          'image/webp',
          quality
        )
      }

      img.src = URL.createObjectURL(file)
    })
  }
}