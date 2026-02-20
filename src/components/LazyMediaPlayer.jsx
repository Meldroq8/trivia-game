import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState } from 'react'
import MediaPlayer from './MediaPlayer'
import { getOptimizedMediaUrl } from '../utils/mediaUrlConverter'

function LazyMediaPlayer({ src, type = 'audio', className = '', ...props }) {
  const [isLoaded, setIsLoaded] = useState(false)

  // Resolve relative paths to CDN/S3 URLs
  const resolvedSrc = src ? getOptimizedMediaUrl(src, 'medium', type === 'video' ? 'video' : 'audio') : null

  if (!resolvedSrc) {
    return null
  }

  // Click-to-load functionality - only load media when user clicks
  if (!isLoaded) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors ${className}`}
        onClick={() => setIsLoaded(true)}
        style={{ minHeight: type === 'video' ? '200px' : '60px' }}
      >
        <div className="text-center p-4">
          <div className="text-4xl mb-2">{type === 'video' ? '▶️' : '🎵'}</div>
          <p className="text-gray-300 text-sm">انقر لتحميل {type === 'video' ? 'الفيديو' : 'الصوت'}</p>
        </div>
      </div>
    )
  }

  // Once clicked, load the MediaPlayer which handles both audio and video
  return (
    <MediaPlayer
      src={resolvedSrc}
      type={type}
      className={className}
      {...props}
    />
  )
}

export default LazyMediaPlayer