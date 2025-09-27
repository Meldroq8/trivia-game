import { useState, useEffect } from 'react';
import { convertToLocalMediaUrl } from '../utils/mediaUrlConverter';

/**
 * Hook that provides a smart image URL with local/Firebase fallback
 * Perfect for background images that can't use the SmartImage component
 */
export const useSmartImageUrl = (firebaseUrl, size = 'medium', context = 'default') => {
  const [currentUrl, setCurrentUrl] = useState(firebaseUrl);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
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

    // Try local version first
    const localUrl = convertToLocalMediaUrl(firebaseUrl, size, context);

    // Test if local image exists
    const testImage = new Image();

    testImage.onload = () => {
      console.log(`✅ Local image available for background: ${localUrl}`);
      setCurrentUrl(localUrl);
      setIsLoading(false);
    };

    testImage.onerror = () => {
      console.log(`⚠️ Local image not found, using Firebase URL: ${localUrl} -> ${firebaseUrl}`);
      setCurrentUrl(firebaseUrl); // Fallback to original Firebase URL
      setIsLoading(false);
    };

    testImage.src = localUrl;

    // Cleanup function
    return () => {
      testImage.onload = null;
      testImage.onerror = null;
    };
  }, [firebaseUrl, size, context]);

  return {
    url: currentUrl,
    isLoading,
    hasError,
    isLocal: currentUrl && !currentUrl.includes('firebasestorage.googleapis.com')
  };
};

export default useSmartImageUrl;