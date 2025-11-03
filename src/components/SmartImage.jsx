import { devLog, devWarn, prodError } from "../utils/devLog"
import React, { useState, useEffect } from 'react';
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
  onLoad = () => {},
  onError = () => {},
  ...props
}) => {
  // Early return for null/undefined/empty src
  if (!src || src === null || src === undefined || src === '') {
    return null;
  }

  const [currentSrc, setCurrentSrc] = useState(null);
  const [isLocalFailed, setIsLocalFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!src || src === null || src === undefined || src === '') {
      setCurrentSrc(null);
      setIsLoading(false);
      return;
    }

    // Reset state when src changes
    setIsLocalFailed(false);
    setIsLoading(true);

    // Always use optimized media URL function for CloudFront priority
    // This will handle local paths, Firebase URLs, and CloudFront URLs properly
    const optimizedUrl = getOptimizedMediaUrl(src, size, context);

    // For thumbnails, we can still try local compressed versions
    const shouldTryLocalCompressed = context === 'thumbnail' || size === 'thumb';
    const localUrl = shouldTryLocalCompressed ? convertToLocalMediaUrl(src, size, context) : null;

    // Extract original filename as fallback (only for Firebase URLs)
    let fallbackLocalUrl = null;
    if (src.includes('firebasestorage.googleapis.com')) {
      try {
        const url = new URL(src);
        const pathPart = url.pathname.split('/o/')[1];
        if (pathPart) {
          const decodedPath = decodeURIComponent(pathPart.split('?')[0]);
          fallbackLocalUrl = `/images/${decodedPath}`;
        }
      } catch (error) {
        devWarn('Failed to parse Firebase Storage URL:', src);
      }
    }

    // Test optimized URL first (CloudFront → Firebase → Local priority)
    const testImage = new Image();
    testImage.onload = () => {
      setCurrentSrc(optimizedUrl);
      setIsLoading(false);
    };

    testImage.onerror = () => {
      // Fallback to local compressed version if applicable
      if (localUrl) {
        const localImage = new Image();
        localImage.onload = () => {
          setCurrentSrc(localUrl);
          setIsLoading(false);
        };

        localImage.onerror = () => {
          // Try original filename as fallback (only if available)
          if (fallbackLocalUrl) {
            const fallbackImage = new Image();
            fallbackImage.onload = () => {
              setCurrentSrc(fallbackLocalUrl);
              setIsLoading(false);
            };

            fallbackImage.onerror = () => {
              setIsLocalFailed(true);
              setCurrentSrc(src); // Ultimate fallback to original URL
              setIsLoading(false);
            };

            fallbackImage.src = fallbackLocalUrl;
          } else {
            setIsLocalFailed(true);
            setCurrentSrc(src); // Ultimate fallback to original URL
            setIsLoading(false);
          }
        };

        localImage.src = localUrl;
      } else {
        // No local compressed version to try, go straight to original filename (if available)
        if (fallbackLocalUrl) {
          const fallbackImage = new Image();
          fallbackImage.onload = () => {
            setCurrentSrc(fallbackLocalUrl);
            setIsLoading(false);
          };

          fallbackImage.onerror = () => {
            setIsLocalFailed(true);
            setCurrentSrc(src); // Ultimate fallback to original URL
            setIsLoading(false);
          };

          fallbackImage.src = fallbackLocalUrl;
        } else {
          setIsLocalFailed(true);
          setCurrentSrc(src); // Ultimate fallback to original URL
          setIsLoading(false);
        }
      }
    };

    testImage.src = optimizedUrl;
  }, [src, size, context]);

  const handleImageLoad = (e) => {
    setIsLoading(false);
    onLoad(e);
  };

  const handleImageError = (e) => {
    if (!isLocalFailed && currentSrc && currentSrc.includes('/images/')) {
      // If local image failed, try Firebase fallback
      setIsLocalFailed(true);
      setCurrentSrc(src);
    } else {
      // Both local and Firebase failed - only log errors
      if (src) {
        prodError('Image failed to load:', src);
      }
      setIsLoading(false);
      onError(e);
    }
  };

  if (!currentSrc) {
    return (
      <div
        className={`image-placeholder ${className}`}
        style={{
          backgroundColor: '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100px',
          ...style
        }}
      >
        <span style={{ color: '#999' }}>No image</span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      style={{
        ...style,
        transition: 'opacity 0.3s ease-in-out',
        opacity: isLoading ? 0.7 : 1
      }}
      onLoad={handleImageLoad}
      onError={handleImageError}
      loading="lazy"
      decoding="async"
      {...props}
    />
  );
};

export default SmartImage;