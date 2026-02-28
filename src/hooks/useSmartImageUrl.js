import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect } from 'react';
import { convertToLocalMediaUrl, getOptimizedMediaUrl } from '../utils/mediaUrlConverter';

// Module-level cache for resolved image URLs - avoids re-testing on every render
const _urlCache = new Map();

/**
 * Hook that provides a smart image URL with CloudFront/Firebase/local fallback chain
 * Priority order: CloudFront → Firebase → Local
 * Perfect for background images that can't use the SmartImage component
 */
export const useSmartImageUrl = (firebaseUrl, size = 'medium', context = 'default', categoryId = null) => {
  const cacheKey = `${firebaseUrl}|${size}|${context}|${categoryId}`;
  const cached = _urlCache.get(cacheKey);
  const [currentUrl, setCurrentUrl] = useState(cached || firebaseUrl);
  const [isLoading, setIsLoading] = useState(!cached);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // If we already have a cached result, use it immediately
    if (_urlCache.has(cacheKey)) {
      setCurrentUrl(_urlCache.get(cacheKey));
      setIsLoading(false);
      return;
    }

    // Helper: resolve URL and cache it
    const resolve = (url) => {
      _urlCache.set(cacheKey, url);
      setCurrentUrl(url);
      setIsLoading(false);
    };

    // Detect iOS devices
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Special handling for mystery category - try to find a mystery image
    if (categoryId === 'mystery' && (!firebaseUrl || firebaseUrl === '')) {
      const testMysteryImage = new Image();
      testMysteryImage.crossOrigin = 'anonymous';
      const mysteryUrl = '/images/categories/category_mystery_1758939021986.webp';

      if (isIOS) {
        resolve(mysteryUrl);
        return;
      }

      testMysteryImage.onload = () => resolve(mysteryUrl);
      testMysteryImage.onerror = () => resolve(null);
      testMysteryImage.src = mysteryUrl;
      return;
    }

    if (!firebaseUrl) {
      resolve(null);
      return;
    }

    // If it's already a local path, use it directly
    if (!firebaseUrl.includes('firebasestorage.googleapis.com')) {
      resolve(firebaseUrl);
      return;
    }

    // Reset state when URL changes
    setIsLoading(true);
    setHasError(false);

    // Use the optimized media URL function with CloudFront priority
    const optimizedUrl = getOptimizedMediaUrl(firebaseUrl, size, context);

    // On iOS, skip image testing and trust the URL (iOS Safari has issues with Image() constructor testing)
    if (isIOS) {
      resolve(optimizedUrl);
      return;
    }

    // Test the optimized URL (CloudFront first, Firebase as fallback)
    const testImage = new Image();
    testImage.crossOrigin = 'anonymous';

    testImage.onload = () => resolve(optimizedUrl);

    testImage.onerror = () => {
      // Fallback to local URL testing if CloudFront/Firebase fails
      const localUrl = convertToLocalMediaUrl(firebaseUrl, size, context);

      const localTestImage = new Image();
      localTestImage.crossOrigin = 'anonymous';
      localTestImage.onload = () => resolve(localUrl);

      localTestImage.onerror = () => {
        // Try additional fallback options for Arabic filenames
        const url = new URL(firebaseUrl);
        const pathPart = url.pathname.split('/o/')[1];
        const decodedPath = decodeURIComponent(pathPart.split('?')[0]);
        const originalFilename = decodedPath.split('/').pop();
        const fallbackLocalUrl = `/images/${decodedPath}`;
        const encodedFilename = encodeURIComponent(originalFilename).replace(/%/g, '_');
        const encodedLocalUrl = `/images/categories/${encodedFilename}`;

        const fallbackImage = new Image();
        fallbackImage.crossOrigin = 'anonymous';
        fallbackImage.onload = () => resolve(fallbackLocalUrl);

        fallbackImage.onerror = () => {
          const encodedImage = new Image();
          encodedImage.crossOrigin = 'anonymous';
          encodedImage.onload = () => resolve(encodedLocalUrl);
          encodedImage.onerror = () => resolve(firebaseUrl); // Ultimate fallback
          encodedImage.src = encodedLocalUrl;
        };

        fallbackImage.src = fallbackLocalUrl;
      };

      localTestImage.src = localUrl;
    };

    testImage.src = optimizedUrl;

    // Cleanup function
    return () => {
      testImage.onload = null;
      testImage.onerror = null;
    };
  }, [firebaseUrl, size, context, categoryId, cacheKey]);

  return {
    url: currentUrl,
    isLoading,
    hasError,
    isLocal: currentUrl && !currentUrl.includes('firebasestorage.googleapis.com')
  };
};

export default useSmartImageUrl;
