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

    // Extract original filename as fallback
    const url = new URL(firebaseUrl);
    const pathPart = url.pathname.split('/o/')[1];
    const decodedPath = decodeURIComponent(pathPart.split('?')[0]);
    const originalFilename = decodedPath.split('/').pop();
    const fallbackLocalUrl = `/images/${decodedPath.replace('categories/', 'categories/').replace('questions/', 'questions/')}`;

    // Test if local image exists (try processed path first)
    const testImage = new Image();

    testImage.onload = () => {
      console.log(`✅ Local image available: ${localUrl}`);
      setCurrentUrl(localUrl);
      setIsLoading(false);
    };

    testImage.onerror = () => {
      console.log(`⚠️ Processed local image not found: ${localUrl}`);

      // Try original filename as fallback
      const fallbackImage = new Image();
      fallbackImage.onload = () => {
        console.log(`✅ Original filename found: ${fallbackLocalUrl}`);
        setCurrentUrl(fallbackLocalUrl);
        setIsLoading(false);
      };

      fallbackImage.onerror = () => {
        console.log(`⚠️ No local images found, using Firebase URL: ${firebaseUrl}`);
        setCurrentUrl(firebaseUrl); // Final fallback to Firebase URL
        setIsLoading(false);
      };

      fallbackImage.src = fallbackLocalUrl;
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