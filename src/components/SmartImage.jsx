import React, { useState, useEffect } from 'react';
import { convertToLocalMediaUrl } from '../utils/mediaUrlConverter';

/**
 * Smart Image component that tries local images first, falls back to Firebase
 * Provides optimal performance by serving local images when available
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
  const [currentSrc, setCurrentSrc] = useState(null);
  const [isLocalFailed, setIsLocalFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!src) {
      setCurrentSrc(null);
      setIsLoading(false);
      return;
    }

    // Reset state when src changes
    setIsLocalFailed(false);
    setIsLoading(true);

    // If it's already a local path, use it directly
    if (!src.includes('firebasestorage.googleapis.com')) {
      setCurrentSrc(src);
      return;
    }

    // Try local version first
    const localUrl = convertToLocalMediaUrl(src, size, context);

    // Extract original filename as fallback
    const url = new URL(src);
    const pathPart = url.pathname.split('/o/')[1];
    const decodedPath = decodeURIComponent(pathPart.split('?')[0]);
    const fallbackLocalUrl = `/images/${decodedPath}`;

    // Test if local image exists (try processed path first)
    const testImage = new Image();
    testImage.onload = () => {
      console.log(`✅ Local image loaded successfully: ${localUrl}`);
      setCurrentSrc(localUrl);
      setIsLoading(false);
    };

    testImage.onerror = () => {
      console.log(`⚠️ Processed local image not found: ${localUrl}`);

      // Try original filename as fallback
      const fallbackImage = new Image();
      fallbackImage.onload = () => {
        console.log(`✅ Original filename found: ${fallbackLocalUrl}`);
        setCurrentSrc(fallbackLocalUrl);
        setIsLoading(false);
      };

      fallbackImage.onerror = () => {
        console.log(`⚠️ No local images found, falling back to Firebase: ${src}`);
        setIsLocalFailed(true);
        setCurrentSrc(src); // Final fallback to Firebase URL
        setIsLoading(false);
      };

      fallbackImage.src = fallbackLocalUrl;
    };

    testImage.src = localUrl;
  }, [src, size, context]);

  const handleImageLoad = (e) => {
    setIsLoading(false);
    onLoad(e);
  };

  const handleImageError = (e) => {
    if (!isLocalFailed && currentSrc && currentSrc.includes('/images/')) {
      // If local image failed, try Firebase fallback
      console.log(`❌ Local image failed to load, falling back to Firebase: ${currentSrc} -> ${src}`);
      setIsLocalFailed(true);
      setCurrentSrc(src);
    } else {
      // Both local and Firebase failed
      console.error(`❌ All image sources failed: ${src}`);
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
      style={style}
      onLoad={handleImageLoad}
      onError={handleImageError}
      {...props}
    />
  );
};

export default SmartImage;