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
    console.log('🔍 useSmartImageUrl called with:', { categoryId, firebaseUrl, size, context });

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

    // Use the optimized media URL function with CloudFront priority
    const optimizedUrl = getOptimizedMediaUrl(firebaseUrl, size, context);
    console.log(`🚀 Testing optimized URL: ${optimizedUrl}`);

    // Test the optimized URL (CloudFront first, Firebase as fallback)
    const testImage = new Image();

    testImage.onload = () => {
      console.log(`✅ Optimized URL loaded successfully: ${optimizedUrl}`);
      setCurrentUrl(optimizedUrl);
      setIsLoading(false);
    };

    testImage.onerror = () => {
      console.log(`⚠️ Optimized URL failed: ${optimizedUrl}`);

      // Fallback to local URL testing if CloudFront/Firebase fails
      const localUrl = convertToLocalMediaUrl(firebaseUrl, size, context);
      console.log(`🔄 Trying local fallback: ${localUrl}`);

      const localTestImage = new Image();
      localTestImage.onload = () => {
        console.log(`✅ Local fallback loaded: ${localUrl}`);
        setCurrentUrl(localUrl);
        setIsLoading(false);
      };

      localTestImage.onerror = () => {
        console.log(`⚠️ Local fallback also failed: ${localUrl}`);

        // Try additional fallback options for Arabic filenames
        const url = new URL(firebaseUrl);
        const pathPart = url.pathname.split('/o/')[1];
        const decodedPath = decodeURIComponent(pathPart.split('?')[0]);
        const originalFilename = decodedPath.split('/').pop();
        const fallbackLocalUrl = `/images/${decodedPath}`;
        const encodedFilename = encodeURIComponent(originalFilename).replace(/%/g, '_');
        const encodedLocalUrl = `/images/categories/${encodedFilename}`;

        console.log(`🔄 Trying original filename fallback: ${fallbackLocalUrl}`);

        const fallbackImage = new Image();
        fallbackImage.onload = () => {
          console.log(`✅ Original filename found: ${fallbackLocalUrl}`);
          setCurrentUrl(fallbackLocalUrl);
          setIsLoading(false);
        };

        fallbackImage.onerror = () => {
          console.log(`⚠️ Original filename not found, trying encoded: ${encodedLocalUrl}`);

          const encodedImage = new Image();
          encodedImage.onload = () => {
            console.log(`✅ URL-encoded filename found: ${encodedLocalUrl}`);
            setCurrentUrl(encodedLocalUrl);
            setIsLoading(false);
          };

          encodedImage.onerror = () => {
            console.log(`❌ All fallbacks failed, using Firebase URL: ${firebaseUrl}`);
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