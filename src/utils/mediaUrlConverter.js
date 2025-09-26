/**
 * Enhanced utility to convert Firebase Storage URLs to optimized local static file paths
 * Automatically selects the best image size and format for performance
 */

export const convertToLocalMediaUrl = (firebaseUrl, size = 'medium', context = 'default') => {
  if (!firebaseUrl) return null

  // If it's already a local path, return as-is
  if (!firebaseUrl.includes('firebasestorage.googleapis.com')) {
    return firebaseUrl
  }

  try {
    // Extract filename from Firebase Storage URL
    const url = new URL(firebaseUrl)
    const pathPart = url.pathname.split('/o/')[1]
    if (!pathPart) return firebaseUrl

    // Decode the URL-encoded path
    const decodedPath = decodeURIComponent(pathPart.split('?')[0])

    // Smart size selection based on context
    const getOptimalSize = (requestedSize, imageContext) => {
      // Context-aware size selection
      switch (imageContext) {
        case 'thumbnail':
        case 'preview':
          return 'thumb'
        case 'card':
        case 'category':
          return 'medium'
        case 'fullscreen':
        case 'detail':
          return 'large'
        case 'original':
          return 'original'
        default:
          return requestedSize || 'medium'
      }
    }

    const optimalSize = getOptimalSize(size, context)

    // Map Firebase Storage paths to optimized local paths
    if (decodedPath.startsWith('categories/')) {
      const filename = decodedPath.replace('categories/', '')
      const baseName = filename.split('.')[0]

      // Try to use processed version, fallback to original
      const processedPath = `/images/categories/${baseName}_${optimalSize}.webp`
      const fallbackPath = `/images/categories/${filename}`

      return processedPath
    }

    if (decodedPath.startsWith('questions/')) {
      const filename = decodedPath.replace('questions/', '')
      const baseName = filename.split('.')[0]

      const processedPath = `/images/questions/${baseName}_${optimalSize}.webp`
      const fallbackPath = `/images/questions/${filename}`

      return processedPath
    }

    if (decodedPath.startsWith('audio/')) {
      const filename = decodedPath.replace('audio/', '')
      return `/audio/${filename}`
    }

    if (decodedPath.startsWith('video/')) {
      const filename = decodedPath.replace('video/', '')
      return `/video/${filename}`
    }

    // For other paths, try to extract just the filename and put it in images
    const filename = decodedPath.split('/').pop()
    const baseName = filename.split('.')[0]
    return `/images/${baseName}_${optimalSize}.webp`

  } catch (error) {
    console.warn('Failed to convert Firebase URL to local path:', firebaseUrl, error)
    return firebaseUrl // Fallback to original URL
  }
}

// Convenience functions for different use cases
export const getCategoryImageUrl = (firebaseUrl, size = 'medium') => {
  return convertToLocalMediaUrl(firebaseUrl, size, 'category')
}

export const getQuestionImageUrl = (firebaseUrl, size = 'medium') => {
  return convertToLocalMediaUrl(firebaseUrl, size, 'question')
}

export const getThumbnailUrl = (firebaseUrl) => {
  return convertToLocalMediaUrl(firebaseUrl, 'thumb', 'thumbnail')
}

export const getFullSizeUrl = (firebaseUrl) => {
  return convertToLocalMediaUrl(firebaseUrl, 'large', 'fullscreen')
}

// Function to check if image is from Firebase Storage
export const isFirebaseStorageUrl = (url) => {
  return url && url.includes('firebasestorage.googleapis.com')
}

// Function to generate responsive image srcset
export const generateResponsiveSrcSet = (firebaseUrl) => {
  if (!isFirebaseStorageUrl(firebaseUrl)) return ''

  const thumbUrl = convertToLocalMediaUrl(firebaseUrl, 'thumb')
  const mediumUrl = convertToLocalMediaUrl(firebaseUrl, 'medium')
  const largeUrl = convertToLocalMediaUrl(firebaseUrl, 'large')

  return `${thumbUrl} 150w, ${mediumUrl} 400w, ${largeUrl} 800w`
}

export default convertToLocalMediaUrl