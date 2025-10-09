import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState } from 'react'
import { convertToLocalMediaUrl, getOptimizedMediaUrl } from '../utils/mediaUrlConverter'

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
    // Use optimized URL with CloudFront priority
    return getOptimizedMediaUrl(src, size, context)
  })
  const [hasError, setHasError] = useState(false)

  const handleError = (e) => {
    devWarn(`🖼️ OptimizedImage failed to load: ${currentSrc}`)

    if (!hasError && currentSrc !== src) {
      // First fallback: try original Firebase URL
      devLog(`🔄 OptimizedImage falling back to original Firebase URL: ${src}`)
      setCurrentSrc(src)
      setHasError(true)
    } else if (!hasError && src) {
      // Second fallback: try local converted URL
      const localUrl = convertToLocalMediaUrl(src, size, context)
      if (localUrl && localUrl !== currentSrc) {
        devLog(`🔄 OptimizedImage trying local fallback: ${localUrl}`)
        setCurrentSrc(localUrl)
        setHasError(true)
        return
      }
    }

    if (fallbackSrc && currentSrc !== fallbackSrc) {
      // Final fallback: use provided fallback
      devLog(`🔄 OptimizedImage using provided fallback: ${fallbackSrc}`)
      setCurrentSrc(fallbackSrc)
    } else {
      // Ultimate fallback: hide image or use broken image placeholder
      devLog(`❌ All OptimizedImage sources failed for: ${src}`)
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