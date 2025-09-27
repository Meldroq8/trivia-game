/**
 * Image Processing Utility
 * Handles client-side image resizing and optimization for admin uploads
 */

/**
 * Resize an image file to specified dimensions and format
 * @param {File} file - The original image file
 * @param {number} width - Target width (default: 400px)
 * @param {number} height - Target height (default: 300px)
 * @param {string} format - Output format (default: 'webp')
 * @param {number} quality - Compression quality 0-1 (default: 0.8)
 * @returns {Promise<Blob>} - Processed image as blob
 */
export const resizeImage = (file, width = 400, height = 300, format = 'webp', quality = 0.8) => {
  return new Promise((resolve, reject) => {
    // Validate input
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Invalid file: not an image'))
      return
    }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      try {
        // Set canvas dimensions to target size
        canvas.width = width
        canvas.height = height

        // Calculate scaling to maintain aspect ratio with cover behavior
        const imgAspect = img.width / img.height
        const targetAspect = width / height

        let drawWidth, drawHeight, drawX, drawY

        if (imgAspect > targetAspect) {
          // Image is wider - fit height and crop width
          drawHeight = height
          drawWidth = height * imgAspect
          drawX = (width - drawWidth) / 2
          drawY = 0
        } else {
          // Image is taller - fit width and crop height
          drawWidth = width
          drawHeight = width / imgAspect
          drawX = 0
          drawY = (height - drawHeight) / 2
        }

        // Clear canvas
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)

        // Draw resized image
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

        // Convert to blob with specified format and quality
        const mimeType = format === 'webp' ? 'image/webp' :
                        format === 'png' ? 'image/png' : 'image/jpeg'

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to create blob'))
          }
        }, mimeType, quality)

      } catch (error) {
        reject(error)
      }
    }

    img.onerror = () => {
      reject(new Error('Failed to load image'))
    }

    // Load the image
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Process image for category cards (400x300 WebP)
 * @param {File} file - Original image file
 * @returns {Promise<{blob: Blob, info: Object}>} - Processed image and info
 */
export const processCategoryImage = async (file) => {
  try {
    const originalSize = (file.size / 1024).toFixed(1) // KB
    const blob = await resizeImage(file, 400, 300, 'webp', 0.92) // Increased quality from 0.8 to 0.92
    const newSize = (blob.size / 1024).toFixed(1) // KB

    return {
      blob,
      info: {
        originalSize: `${originalSize} KB`,
        newSize: `${newSize} KB`,
        compression: `${Math.round((1 - blob.size / file.size) * 100)}%`,
        dimensions: '400×300px',
        format: 'WebP'
      }
    }
  } catch (error) {
    throw new Error(`Image processing failed: ${error.message}`)
  }
}

/**
 * Create preview URL for processed image
 * @param {Blob} blob - Processed image blob
 * @returns {string} - Object URL for preview
 */
export const createPreviewUrl = (blob) => {
  return URL.createObjectURL(blob)
}

/**
 * Clean up object URLs to prevent memory leaks
 * @param {string} url - Object URL to revoke
 */
export const cleanupPreviewUrl = (url) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

/**
 * Validate image file
 * @param {File} file - File to validate
 * @returns {boolean} - Is valid image
 */
export const isValidImage = (file) => {
  if (!file) return false

  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  if (!validTypes.includes(file.type)) return false

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) return false

  return true
}

/**
 * Get image file info
 * @param {File} file - Image file
 * @returns {Object} - File information
 */
export const getImageInfo = (file) => {
  return {
    name: file.name,
    size: `${(file.size / 1024).toFixed(1)} KB`,
    type: file.type,
    lastModified: new Date(file.lastModified).toLocaleDateString()
  }
}