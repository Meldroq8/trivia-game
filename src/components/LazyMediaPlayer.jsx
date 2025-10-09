import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState } from 'react'
import MediaPlayer from './MediaPlayer'

function LazyMediaPlayer({ src, type = 'audio', className = '', ...props }) {
  const [isLoaded, setIsLoaded] = useState(false)

  if (!src) {
    return null
  }

  if (!isLoaded) {
    return (
      <div
        className={`bg-gray-100 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-200 transition-colors ${className}`}
        onClick={() => setIsLoaded(true)}
      >
        <div className="flex items-center justify-center space-x-2">
          <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-gray-600">
            انقر لتحميل {type === 'video' ? 'الفيديو' : 'الصوت'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <MediaPlayer
      src={src}
      type={type}
      className={className}
      {...props}
    />
  )
}

export default LazyMediaPlayer