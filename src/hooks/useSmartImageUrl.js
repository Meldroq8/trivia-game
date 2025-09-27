import { useState, useEffect } from 'react';
import { convertToLocalMediaUrl } from '../utils/mediaUrlConverter';

/**
 * Hook that provides a smart image URL with local/Firebase fallback
 * Perfect for background images that can't use the SmartImage component
 */
export const useSmartImageUrl = (firebaseUrl, size = 'medium', context = 'default', categoryId = null) => {
  const [currentUrl, setCurrentUrl] = useState(firebaseUrl);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Special handling for mystery category - try to find a mystery image
    if (categoryId === 'mystery' && (!firebaseUrl || firebaseUrl === '')) {
      console.log('🔍 Mystery category detected without Firebase URL, searching for local mystery images...');

      // Try to find the latest mystery category image
      const testMysteryImage = new Image();
      testMysteryImage.onload = () => {
        console.log('✅ Found mystery category image');
        setCurrentUrl('/images/categories/category_mystery_1758939021986.webp'); // Use the latest one
        setIsLoading(false);
      };
      testMysteryImage.onerror = () => {
        console.log('⚠️ No mystery category image found, using fallback');
        setCurrentUrl(null);
        setIsLoading(false);
      };
      testMysteryImage.src = '/images/categories/category_mystery_1758939021986.webp';
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

    // Try local version first
    const localUrl = convertToLocalMediaUrl(firebaseUrl, size, context);

    // Extract original filename as fallback
    const url = new URL(firebaseUrl);
    const pathPart = url.pathname.split('/o/')[1];
    const decodedPath = decodeURIComponent(pathPart.split('?')[0]);
    const originalFilename = decodedPath.split('/').pop();
    const fallbackLocalUrl = `/images/${decodedPath}`;

    // Create URL-encoded filename for Arabic character compatibility
    const encodedFilename = encodeURIComponent(originalFilename).replace(/%/g, '_');
    const encodedLocalUrl = `/images/categories/${encodedFilename}`;

    // Test if local image exists (try processed path first)
    const testImage = new Image();

    testImage.onload = () => {
      console.log(`✅ Local image available: ${localUrl}`);
      setCurrentUrl(localUrl);
      setIsLoading(false);
    };

    testImage.onerror = () => {
      console.log(`⚠️ Processed local image not found: ${localUrl}`);
      console.log(`🔄 Trying original filename fallback: ${fallbackLocalUrl}`);

      // Try original filename as fallback
      const fallbackImage = new Image();
      fallbackImage.onload = () => {
        console.log(`✅ Original filename found: ${fallbackLocalUrl}`);
        setCurrentUrl(fallbackLocalUrl);
        setIsLoading(false);
      };

      fallbackImage.onerror = () => {
        console.log(`⚠️ Original filename not found: ${fallbackLocalUrl}`);
        console.log(`🔄 Trying URL-encoded filename: ${encodedLocalUrl}`);

        // Try URL-encoded filename for Arabic compatibility
        const encodedImage = new Image();
        encodedImage.onload = () => {
          console.log(`✅ URL-encoded filename found: ${encodedLocalUrl}`);
          setCurrentUrl(encodedLocalUrl);
          setIsLoading(false);
        };

        encodedImage.onerror = () => {
          console.log(`⚠️ URL-encoded filename also not found: ${encodedLocalUrl}`);
          console.log(`🔄 Final fallback to Firebase URL: ${firebaseUrl}`);
          setCurrentUrl(firebaseUrl); // Final fallback to Firebase URL
          setIsLoading(false);
        };

        encodedImage.src = encodedLocalUrl;
      };

      fallbackImage.src = fallbackLocalUrl;
    };

    testImage.src = localUrl;

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