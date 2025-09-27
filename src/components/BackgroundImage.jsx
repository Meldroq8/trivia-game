import React from 'react';
import { useSmartImageUrl } from '../hooks/useSmartImageUrl';

/**
 * Component that handles background images with local/Firebase fallback
 * Perfect for category cards and other elements that need background images
 */
const BackgroundImage = ({
  src,
  size = 'medium',
  context = 'category',
  className = '',
  style = {},
  children,
  fallbackGradient = 'from-gray-200 to-gray-400',
  categoryId = null,
  ...props
}) => {
  const { url: smartUrl, isLoading } = useSmartImageUrl(src, size, context, categoryId);

  const backgroundStyle = {
    backgroundImage: smartUrl ? `url(${smartUrl})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    ...style
  };

  // Add fallback gradient class if no image URL
  const classNames = [
    className,
    !smartUrl ? `bg-gradient-to-br ${fallbackGradient}` : ''
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classNames}
      style={backgroundStyle}
      {...props}
    >
      {children}

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-300 bg-opacity-75">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600"></div>
        </div>
      )}
    </div>
  );
};

export default BackgroundImage;