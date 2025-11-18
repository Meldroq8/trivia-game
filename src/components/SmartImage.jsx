import { devLog, devWarn, prodError } from "../utils/devLog"
import React, { useState, useMemo } from 'react';
import { convertToLocalMediaUrl, getOptimizedMediaUrl } from '../utils/mediaUrlConverter';

/**
 * Smart Image component with CloudFront/Firebase/local fallback chain
 * Priority order: CloudFront → Firebase → Local
 * Provides optimal performance by serving CDN images when available
 */
const SmartImage = ({
  src,
  alt,
  size = 'medium',
  context = 'default',
  className = '',
  style = {},
  fetchPriority = 'auto',
  onLoad = () => {},
  onError = () => {},
  ...props
}) => {
  // Early return for null/undefined/empty src
  if (!src || src === null || src === undefined || src === '') {
    return null;
  }

  const [isLocalFailed, setIsLocalFailed] = useState(false);

  // Use useMemo instead of useState + useEffect for currentSrc
  const currentSrc = useMemo(() => {
    if (!src || src === null || src === undefined || src === '') {
      return null;
    }

    // Always use optimized media URL function for CloudFront priority
    // This will handle local paths, Firebase URLs, and CloudFront URLs properly
    const optimizedUrl = getOptimizedMediaUrl(src, size, context);

    // Set image source immediately without testing - instant loading
    return optimizedUrl;
  }, [src, size, context]);

  const handleImageLoad = (e) => {
    onLoad(e);
  };

  const handleImageError = (e) => {
    if (!isLocalFailed && currentSrc && currentSrc.includes('/images/')) {
      // If local image failed, try Firebase fallback
      setIsLocalFailed(true);
    } else {
      // Both local and Firebase failed - only log errors
      if (src) {
        prodError('Image failed to load:', src);
      }
      onError(e);
    }
  };

  if (!currentSrc) {
    return null;
  }

  // When local failed, use original src as fallback
  const imgSrc = isLocalFailed ? src : currentSrc;

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      style={style}
      onLoad={handleImageLoad}
      onError={handleImageError}
      decoding="async"
      fetchPriority={fetchPriority}
      loading={fetchPriority === 'high' ? 'eager' : 'lazy'}
      {...props}
    />
  );
};

export default SmartImage;
