/**
 * Utility to convert Firebase Storage URLs to local static file paths
 * This enables loading images from the bundled app instead of Firebase Storage
 */

export const convertToLocalMediaUrl = (firebaseUrl) => {
  if (!firebaseUrl) return null

  // If it's already a local path, return as-is
  if (!firebaseUrl.includes('firebasestorage.googleapis.com')) {
    return firebaseUrl
  }

  try {
    // Extract filename from Firebase Storage URL
    // Format: https://firebasestorage.googleapis.com/v0/b/bucket/o/path%2Ffilename?params
    const url = new URL(firebaseUrl)
    const pathPart = url.pathname.split('/o/')[1]
    if (!pathPart) return firebaseUrl

    // Decode the URL-encoded path
    const decodedPath = decodeURIComponent(pathPart.split('?')[0])

    // Map Firebase Storage paths to local paths
    if (decodedPath.startsWith('categories/')) {
      const filename = decodedPath.replace('categories/', '')
      return `/images/categories/${filename}`
    }

    if (decodedPath.startsWith('questions/')) {
      const filename = decodedPath.replace('questions/', '')
      return `/images/questions/${filename}`
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
    return `/images/${filename}`

  } catch (error) {
    console.warn('Failed to convert Firebase URL to local path:', firebaseUrl, error)
    return firebaseUrl // Fallback to original URL
  }
}

export const isFirebaseStorageUrl = (url) => {
  return url && url.includes('firebasestorage.googleapis.com')
}

export default convertToLocalMediaUrl