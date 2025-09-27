import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../firebase/config'

export class ImageUploadService {
  /**
   * Upload a media file (image, audio, video) to Firebase Storage
   * @param {File} file - The media file to upload
   * @param {string} folder - The folder path (e.g., 'categories', 'questions', 'media')
   * @param {string} fileName - Optional custom filename
   * @returns {Promise<string>} - The download URL of the uploaded file
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

      // Create storage reference
      const storageRef = ref(storage, `${folder}/${fileName}`)

      // Upload file
      console.log(`Uploading media to: ${folder}/${fileName}`)
      const snapshot = await uploadBytes(storageRef, file)
      console.log('Upload completed successfully')

      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref)
      console.log('Download URL obtained:', downloadURL)

      return downloadURL
    } catch (error) {
      console.error('Error uploading media:', error)
      throw new Error(`Failed to upload media: ${error.message}`)
    }
  }

  /**
   * Upload an image file to Firebase Storage
   * @param {File} file - The image file to upload
   * @param {string} folder - The folder path (e.g., 'categories', 'questions')
   * @param {string} fileName - Optional custom filename
   * @returns {Promise<string>} - The download URL of the uploaded image
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

      // Create storage reference
      const storageRef = ref(storage, `${folder}/${fileName}`)

      // Upload file
      console.log(`Uploading image to: ${folder}/${fileName}`)
      const snapshot = await uploadBytes(storageRef, file)
      console.log('Upload completed successfully')

      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref)
      console.log('Download URL obtained:', downloadURL)

      return downloadURL
    } catch (error) {
      console.error('Error uploading image:', error)
      throw new Error(`Failed to upload image: ${error.message}`)
    }
  }

  /**
   * Upload a category image
   * @param {File} file - The image file
   * @param {string} categoryId - The category ID
   * @returns {Promise<string>} - The download URL
   */
  static async uploadCategoryImage(file, categoryId) {
    const fileName = `category_${categoryId}_${Date.now()}.${file.name.split('.').pop()}`
    return this.uploadImage(file, 'categories', fileName)
  }

  /**
   * Upload a question image
   * @param {File} file - The image file
   * @param {string} questionId - Optional question ID for naming
   * @returns {Promise<string>} - The download URL
   */
  static async uploadQuestionImage(file, questionId = null) {
    const prefix = questionId ? `question_${questionId}` : 'question'
    const fileName = `${prefix}_${Date.now()}.${file.name.split('.').pop()}`
    return this.uploadImage(file, 'questions', fileName)
  }

  /**
   * Upload question media (image, audio, video)
   * @param {File} file - The media file
   * @param {string} questionId - Optional question ID for naming
   * @returns {Promise<string>} - The download URL
   */
  static async uploadQuestionMedia(file, questionId = null) {
    const prefix = questionId ? `question_${questionId}` : 'question'
    const fileName = `${prefix}_${Date.now()}.${file.name.split('.').pop()}`
    return this.uploadMedia(file, 'questions', fileName)
  }

  /**
   * Delete an image from Firebase Storage
   * @param {string} imageUrl - The full download URL of the image
   * @returns {Promise<void>}
   */
  static async deleteImage(imageUrl) {
    if (!imageUrl || !imageUrl.includes('firebase')) {
      console.log('Not a Firebase Storage URL, skipping deletion')
      return
    }

    try {
      // Extract path from URL
      const path = this.extractPathFromUrl(imageUrl)
      if (!path) {
        throw new Error('Could not extract path from URL')
      }

      const storageRef = ref(storage, path)
      await deleteObject(storageRef)
      console.log('Image deleted successfully:', path)
    } catch (error) {
      console.error('Error deleting image:', error)
      // Don't throw error for deletion failures - just log them
    }
  }

  /**
   * Extract the storage path from a Firebase Storage download URL
   * @param {string} url - The download URL
   * @returns {string|null} - The storage path
   */
  static extractPathFromUrl(url) {
    try {
      // Firebase Storage URLs have the format:
      // https://firebasestorage.googleapis.com/v0/b/bucket/o/path%2Fto%2Ffile?alt=media&token=...
      const urlObj = new URL(url)
      const pathMatch = urlObj.pathname.match(/\/o\/(.+)$/)
      if (pathMatch && pathMatch[1]) {
        return decodeURIComponent(pathMatch[1])
      }
      return null
    } catch (error) {
      console.error('Error extracting path from URL:', error)
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