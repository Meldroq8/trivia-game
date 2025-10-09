import { devLog, devWarn, prodError } from "./devLog.js"
/**
 * Enhanced utility to convert Firebase Storage URLs to optimized media paths
 * Supports CloudFront CDN with fallback to local static files
 * Automatically selects the best image size and format for performance
 */

// CloudFront configuration with hardcoded fallback
// CloudFront CORS issue fixed with Origin Request Policy
const CLOUDFRONT_CONFIG = {
  enabled: import.meta.env.VITE_CLOUDFRONT_ENABLED === 'true' || true, // Force enable
  domain: import.meta.env.VITE_CLOUDFRONT_DOMAIN || 'drcqcbq3desis.cloudfront.net',
  baseUrl: import.meta.env.VITE_CDN_BASE_URL || 'https://drcqcbq3desis.cloudfront.net'
}

devLog('🌐 CloudFront config:', CLOUDFRONT_CONFIG)
devLog('🌐 Raw env vars:', {
  enabled: import.meta.env.VITE_CLOUDFRONT_ENABLED,
  domain: import.meta.env.VITE_CLOUDFRONT_DOMAIN,
  baseUrl: import.meta.env.VITE_CDN_BASE_URL
})

export const convertToLocalMediaUrl = (mediaUrl, size = 'medium', context = 'default', preferOriginal = false) => {
  if (!mediaUrl) return null

  // If it's already a local path, return as-is (this will be converted to CloudFront later)
  if (!mediaUrl.includes('firebasestorage.googleapis.com') && !mediaUrl.includes('cloudfront')) {
    // Ensure path starts with / for consistency
    return mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`
  }

  // For CloudFront URLs, extract the path
  if (mediaUrl.includes('cloudfront')) {
    try {
      const url = new URL(mediaUrl)
      return url.pathname
    } catch (error) {
      devWarn('⚠️ Invalid CloudFront URL format:', mediaUrl)
      return null
    }
  }

  try {
    // Extract filename from Firebase Storage URL (legacy support)
    const url = new URL(mediaUrl)
    const pathPart = url.pathname.split('/o/')[1]
    if (!pathPart) {
      devWarn('⚠️ Invalid Firebase Storage URL format:', mediaUrl)
      return mediaUrl
    }

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

    // Map Firebase Storage paths to optimized CloudFront/S3 paths
    if (decodedPath.startsWith('categories/')) {
      const filename = decodedPath.replace('categories/', '')

      // Special handling for mystery category (الفئة الغامضة)
      // Mystery category files are stored as "category_mystery_*" but displayed as "الفئة الغامضة"
      if (filename.includes('mystery')) {
        devLog(`🔍 Mystery category detected: ${filename}`)
        const localPath = `/images/categories/${filename}`
        devLog(`✅ Using mystery category file: ${localPath}`)
        return localPath
      }

      // Check if filename already has size suffix (like category_name_1234_medium.webp)
      const hasExistingSuffix = filename.includes('_medium.webp') || filename.includes('_large.webp') || filename.includes('_thumb.webp')

      if (hasExistingSuffix) {
        // Use the downloaded filename as-is, since it already has the size
        const localPath = `/images/categories/${filename}`
        devLog(`✅ Using downloaded file: ${localPath}`)
        return localPath
      } else {
        // For files uploaded to S3, they don't have size suffixes
        // Try the exact filename first (what's actually in S3)
        const exactPath = `/images/categories/${filename}`
        devLog(`🎯 Using exact S3 filename: ${exactPath}`)
        return exactPath
      }
    }

    if (decodedPath.startsWith('questions/')) {
      const filename = decodedPath.replace('questions/', '')

      // Check if filename already has size suffix
      const hasExistingSuffix = filename.includes('_medium.webp') || filename.includes('_large.webp') || filename.includes('_thumb.webp')

      if (hasExistingSuffix) {
        // Use the downloaded filename as-is
        const localPath = `/images/questions/${filename}`
        devLog(`✅ Using downloaded file: ${localPath}`)
        return localPath
      } else {
        // For files uploaded to S3, try the exact filename first
        const exactPath = `/images/questions/${filename}`
        devLog(`🎯 Using exact S3 filename: ${exactPath}`)
        return exactPath
      }
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
    const processedPath = `/images/${baseName}_${optimalSize}.webp`

    devWarn('⚠️ Unknown path format, using generic conversion:', {
      original: firebaseUrl,
      decodedPath,
      processedPath
    })

    return processedPath

  } catch (error) {
    devWarn('❌ Failed to convert media URL to local path:', mediaUrl, error)
    return mediaUrl // Fallback to original URL
  }
}

// Convenience functions for different use cases
export const getCategoryImageUrl = (mediaUrl, size = 'medium') => {
  return convertToLocalMediaUrl(mediaUrl, size, 'category')
}

export const getQuestionImageUrl = (mediaUrl, size = 'medium') => {
  return convertToLocalMediaUrl(mediaUrl, size, 'question')
}

export const getThumbnailUrl = (mediaUrl) => {
  return convertToLocalMediaUrl(mediaUrl, 'thumb', 'thumbnail')
}

export const getFullSizeUrl = (mediaUrl) => {
  return convertToLocalMediaUrl(mediaUrl, 'large', 'fullscreen')
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

// CloudFront URL generation functions
export const convertToCloudFrontUrl = (filepath, size = 'medium') => {
  if (!CLOUDFRONT_CONFIG.enabled) return null

  // Clean up the filepath to ensure proper format
  const cleanPath = filepath.startsWith('/') ? filepath.substring(1) : filepath

  // URL encode the path to handle Arabic characters properly
  const encodedPath = encodeURI(cleanPath)
  const cloudFrontUrl = `${CLOUDFRONT_CONFIG.baseUrl}/${encodedPath}`

  devLog(`☁️ CloudFront URL: ${cloudFrontUrl}`)
  return cloudFrontUrl
}

// Generate alternative CloudFront URLs for files with Arabic characters
export const generateCloudFrontUrlAlternatives = (filepath) => {
  if (!CLOUDFRONT_CONFIG.enabled) return []

  const cleanPath = filepath.startsWith('/') ? filepath.substring(1) : filepath
  const alternatives = []

  // Standard URL encoding (what we're currently using)
  const standardEncoded = encodeURI(cleanPath)
  alternatives.push(`${CLOUDFRONT_CONFIG.baseUrl}/${standardEncoded}`)

  // Convert Arabic characters to underscore-encoded format (what S3 actually has)
  // This handles the AWS CLI sync behavior that converts Arabic words to UTF-8 hex with underscores
  const utf8Encoded = cleanPath.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g, (match) => {
    // Convert entire Arabic word/phrase to UTF-8 bytes and then to hex
    const utf8Bytes = new TextEncoder().encode(match)
    const hexBytes = Array.from(utf8Bytes).map(b => b.toString(16).toUpperCase())
    return '_' + hexBytes.join('_')
  })

  if (utf8Encoded !== cleanPath) {
    alternatives.push(`${CLOUDFRONT_CONFIG.baseUrl}/${utf8Encoded}`)
  }

  devLog(`☁️ CloudFront URL alternatives:`, alternatives)
  return alternatives
}

export const getCategoryImageCloudFrontUrl = (categoryId, size = 'medium') => {
  return convertToCloudFrontUrl(`images/categories/category_${categoryId}_${size}.webp`)
}

export const getImageCloudFrontUrl = (imagePath) => {
  // Ensure the path starts with 'images/'
  const fullPath = imagePath.startsWith('images/') ? imagePath : `images/${imagePath}`
  return convertToCloudFrontUrl(fullPath)
}

// Enhanced URL generation with CloudFront priority (Firebase fallback removed)
export const getOptimizedMediaUrl = (mediaUrl, size = 'medium', context = 'default') => {
  // Priority order: CloudFront → Local (no Firebase fallback)

  if (CLOUDFRONT_CONFIG.enabled && mediaUrl) {
    // For local paths (like images/songsimg/Dancing_Queen_ABBA.jpg), convert directly to CloudFront
    if (!mediaUrl.includes('firebasestorage.googleapis.com') && !mediaUrl.includes('cloudfront')) {
      const normalizedPath = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`
      const cloudFrontUrl = convertToCloudFrontUrl(normalizedPath)
      if (cloudFrontUrl) {
        devLog(`🚀 Local path to CloudFront: ${cloudFrontUrl}`)
        return cloudFrontUrl
      }
    }

    // Try to convert Firebase/CloudFront URLs to local path then CloudFront
    const localPath = convertToLocalMediaUrl(mediaUrl, size, context)
    if (localPath) {
      const cloudFrontUrl = convertToCloudFrontUrl(localPath)
      if (cloudFrontUrl) {
        devLog(`🚀 Using CloudFront: ${cloudFrontUrl}`)
        return cloudFrontUrl
      }
    }
  }

  // Fallback to local path only
  const localUrl = convertToLocalMediaUrl(mediaUrl, size, context)
  devLog(`💾 Using local: ${localUrl}`)
  return localUrl
}

// URL Testing and Fallback Logic
export const testImageUrl = (url) => {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('No URL provided'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      devLog(`✅ URL test passed: ${url}`);
      resolve(url);
    };
    img.onerror = () => {
      devLog(`❌ URL test failed: ${url}`);
      reject(new Error(`Failed to load: ${url}`));
    };
    img.src = url;
  });
};

// Comprehensive URL testing with multiple fallbacks
export const testUrlWithFallbacks = async (primaryUrl, fallbackUrls = []) => {
  devLog(`🔍 Testing primary URL: ${primaryUrl}`);

  try {
    await testImageUrl(primaryUrl);
    return primaryUrl;
  } catch (error) {
    devLog(`⚠️ Primary URL failed: ${primaryUrl}`);

    for (let i = 0; i < fallbackUrls.length; i++) {
      const fallbackUrl = fallbackUrls[i];
      devLog(`🔄 Testing fallback ${i + 1}/${fallbackUrls.length}: ${fallbackUrl}`);

      try {
        await testImageUrl(fallbackUrl);
        return fallbackUrl;
      } catch (fallbackError) {
        devLog(`❌ Fallback ${i + 1} failed: ${fallbackUrl}`);
      }
    }

    devLog(`💥 All URLs failed. Primary: ${primaryUrl}, Fallbacks: ${fallbackUrls.length}`);
    throw new Error('All URL options failed');
  }
};

// CloudFront health check
export const checkCloudFrontHealth = async () => {
  if (!CLOUDFRONT_CONFIG.enabled) {
    devLog('☁️ CloudFront is disabled');
    return false;
  }

  try {
    const testUrl = `${CLOUDFRONT_CONFIG.baseUrl}/images/categories/category_mystery_1758939021986.webp`;
    await testImageUrl(testUrl);
    devLog('✅ CloudFront health check passed');
    return true;
  } catch (error) {
    devLog('❌ CloudFront health check failed:', error.message);
    return false;
  }
};

// Smart URL generation with real-time testing
export const getVerifiedMediaUrl = async (mediaUrl, size = 'medium', context = 'default') => {
  if (!mediaUrl) return null;

  // If it's already a local path, test it and return
  if (!mediaUrl.includes('firebasestorage.googleapis.com') && !mediaUrl.includes('cloudfront')) {
    try {
      await testImageUrl(mediaUrl);
      return mediaUrl;
    } catch (error) {
      devLog(`❌ Local path failed: ${mediaUrl}`);
      return null;
    }
  }

  // Generate all possible CloudFront URL alternatives
  const localPath = convertToLocalMediaUrl(mediaUrl, size, context);
  const cloudFrontAlternatives = CLOUDFRONT_CONFIG.enabled ?
    generateCloudFrontUrlAlternatives(localPath) : [];

  // Create CloudFront-only fallback chain (no Firebase fallback)
  const urlsToTest = [
    ...cloudFrontAlternatives,
    localPath
  ].filter(Boolean);

  try {
    return await testUrlWithFallbacks(urlsToTest[0], urlsToTest.slice(1));
  } catch (error) {
    devLog(`💥 All URLs failed for: ${mediaUrl}`);
    return mediaUrl; // Return original as last resort
  }
};

export default convertToLocalMediaUrl