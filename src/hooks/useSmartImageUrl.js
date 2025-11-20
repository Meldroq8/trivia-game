import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect } from 'react';
import { convertToLocalMediaUrl, getOptimizedMediaUrl } from '../utils/mediaUrlConverter';

/**
 * Hook that provides a smart image URL with CloudFront/Firebase/local fallback chain
 * Priority order: CloudFront → Firebase → Local
 * Perfect for background images that can't use the SmartImage component
 */
export const useSmartImageUrl = (firebaseUrl, size = 'medium', context = 'default', categoryId = null) => {
  const [currentUrl, setCurrentUrl] = useState(firebaseUrl);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Detect iOS devices
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Special handling for mystery category - try to find a mystery image
    if (categoryId === 'mystery' && (!firebaseUrl || firebaseUrl === '')) {
      // Try to find the latest mystery category image
      const testMysteryImage = new Image();
      testMysteryImage.crossOrigin = 'anonymous';

      const mysteryUrl = '/images/categories/category_mystery_1758939021986.webp';

      // On iOS, skip testing and trust the URL
      if (isIOS) {
        setCurrentUrl(mysteryUrl);
        setIsLoading(false);
        return;
      }

      testMysteryImage.onload = () => {
        setCurrentUrl(mysteryUrl);
        setIsLoading(false);
      };
      testMysteryImage.onerror = () => {
        setCurrentUrl(null);
        setIsLoading(false);
      };
      testMysteryImage.src = mysteryUrl;
      return;
    }

    if (!firebaseUrl) {
      setCurrentUrl(null);
      setIsLoading(false);
      return;
    }

    // If it's already a local path, use it directly
    if (!firebaseUrl.includes('firebasestorage.googleapis.com')) {
      setCurrentUrl(firebaseUrl);
      setIsLoading(false);
      return;
    }

    // Reset state when URL changes
    setIsLoading(true);
    setHasError(false);

    // Use the optimized media URL function with CloudFront priority
    const optimizedUrl = getOptimizedMediaUrl(firebaseUrl, size, context);

    // On iOS, skip image testing and trust the URL (iOS Safari has issues with Image() constructor testing)
    if (isIOS) {
      setCurrentUrl(optimizedUrl);
      setIsLoading(false);
      return;
    }

    // Test the optimized URL (CloudFront first, Firebase as fallback)
    const testImage = new Image();
    testImage.crossOrigin = 'anonymous';

    testImage.onload = () => {
      setCurrentUrl(optimizedUrl);
      setIsLoading(false);
    };

    testImage.onerror = () => {
      // Fallback to local URL testing if CloudFront/Firebase fails
      const localUrl = convertToLocalMediaUrl(firebaseUrl, size, context);

      const localTestImage = new Image();
      localTestImage.crossOrigin = 'anonymous';
      localTestImage.onload = () => {
        setCurrentUrl(localUrl);
        setIsLoading(false);
      };

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
        fallbackImage.onload = () => {
          setCurrentUrl(fallbackLocalUrl);
          setIsLoading(false);
        };

        fallbackImage.onerror = () => {
          const encodedImage = new Image();
          encodedImage.crossOrigin = 'anonymous';
          encodedImage.onload = () => {
            setCurrentUrl(encodedLocalUrl);
            setIsLoading(false);
          };

          encodedImage.onerror = () => {
            setCurrentUrl(firebaseUrl); // Ultimate fallback to Firebase URL
            setIsLoading(false);
          };

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
  }, [firebaseUrl, size, context, categoryId]);

  return {
    url: currentUrl,
    isLoading,
    hasError,
    isLocal: currentUrl && !currentUrl.includes('firebasestorage.googleapis.com')
  };
};

export default useSmartImageUrl;