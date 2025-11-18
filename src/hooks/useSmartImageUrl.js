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
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Special handling for mystery category
    if (categoryId === 'mystery' && (!firebaseUrl || firebaseUrl === '')) {
      const mysteryUrl = '/images/categories/category_mystery_1758939021986.webp';
      setCurrentUrl(mysteryUrl);
      return;
    }

    if (!firebaseUrl) {
      setCurrentUrl(null);
      return;
    }

    // If it's already a local path, use it directly
    if (!firebaseUrl.includes('firebasestorage.googleapis.com')) {
      setCurrentUrl(firebaseUrl);
      return;
    }

    // Reset error state when URL changes
    setHasError(false);

    // Use the optimized media URL function with CloudFront priority - load instantly without testing
    const optimizedUrl = getOptimizedMediaUrl(firebaseUrl, size, context);
    setCurrentUrl(optimizedUrl);
  }, [firebaseUrl, size, context, categoryId]);

  return {
    url: currentUrl,
    hasError,
    isLocal: currentUrl && !currentUrl.includes('firebasestorage.googleapis.com')
  };
};

export default useSmartImageUrl;