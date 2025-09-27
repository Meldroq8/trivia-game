import { useState } from 'react'
import { convertToLocalMediaUrl } from '../utils/mediaUrlConverter'

const OptimizedImage = ({
  src,
  alt,
  className = '',
  size = 'medium',
  context = 'default',
  fallbackSrc = null,
  onError = null,
  ...props
}) => {
  const [currentSrc, setCurrentSrc] = useState(() => {
    if (!src) return fallbackSrc
    return convertToLocalMediaUrl(src, size, context)
  })
  const [hasError, setHasError] = useState(false)

  const handleError = (e) => {
    console.warn(`🖼️ Image failed to load: ${currentSrc}`)

    if (!hasError && currentSrc !== src) {
      // First fallback: try original Firebase URL
      console.log(`🔄 Falling back to original Firebase URL: ${src}`)
      setCurrentSrc(src)
      setHasError(true)
    } else if (fallbackSrc && currentSrc !== fallbackSrc) {
      // Second fallback: use provided fallback
      console.log(`🔄 Using fallback image: ${fallbackSrc}`)
      setCurrentSrc(fallbackSrc)
    } else {
      // Final fallback: hide image or use broken image placeholder
      console.log(`❌ All image sources failed for: ${src}`)
      if (onError) onError(e)
    }
  }

  if (!currentSrc) {
    return fallbackSrc ? (
      <img
        src={fallbackSrc}
        alt={alt}
        className={className}
        onError={onError}
        {...props}
      />
    ) : null
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={handleError}
      {...props}
    />
  )
}

export default OptimizedImage