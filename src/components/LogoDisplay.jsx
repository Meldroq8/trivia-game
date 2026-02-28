import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect, memo } from 'react'
import { useAuth } from '../hooks/useAuth'

const LogoDisplay = memo(function LogoDisplay({ className, style, fallbackEmoji = '🧠', size }) {
  // Initialize with cached values for immediate loading
  const [logoSrc, setLogoSrc] = useState(() => {
    try {
      return localStorage.getItem('app_logo_url') || null
    } catch {
      return null
    }
  })
  const [logoSize, setLogoSize] = useState(() => {
    try {
      return localStorage.getItem('app_logo_size') || 'medium'
    } catch {
      return 'medium'
    }
  })
  const { getAppSettings, subscribeToAppSettings } = useAuth()

  useEffect(() => {
    let unsubscribe = null

    // Preload image into browser cache
    const preloadImage = (url) => {
      if (url) {
        const img = new Image()
        img.src = url
      }
    }

    const loadLogo = async () => {
      try {
        // Load initial settings in background
        const settings = await getAppSettings()
        if (settings?.logo && settings.logo !== logoSrc) {
          setLogoSrc(settings.logo)
          // Cache URL for instant loading next time
          localStorage.setItem('app_logo_url', settings.logo)
          // Preload actual image into browser cache
          preloadImage(settings.logo)
        }
        if (settings?.logoSize && settings.logoSize !== logoSize) {
          setLogoSize(settings.logoSize)
          // Cache for instant loading next time
          localStorage.setItem('app_logo_size', settings.logoSize)
        }
        // Subscribe to real-time changes
        unsubscribe = subscribeToAppSettings((newSettings) => {
          if (newSettings?.logo !== logoSrc) {
            const newLogo = newSettings.logo || null
            setLogoSrc(newLogo)
            if (newLogo) {
              localStorage.setItem('app_logo_url', newLogo)
              preloadImage(newLogo)
            } else {
              localStorage.removeItem('app_logo_url')
            }
          }
          if (newSettings?.logoSize !== logoSize) {
            const newSize = newSettings.logoSize || 'medium'
            setLogoSize(newSize)
            localStorage.setItem('app_logo_size', newSize)
          }
        })
      } catch (error) {
        prodError('Error loading logo:', error)
        // Don't change UI on error - keep showing cached/current logo
      }
    }

    // Preload cached image immediately on mount
    if (logoSrc) {
      preloadImage(logoSrc)
    }

    loadLogo()

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [getAppSettings, subscribeToAppSettings])

  // Get size classes based on logoSize from settings (fallback to prop if provided)
  const getSizeClasses = () => {
    const effectiveSize = size || logoSize
    switch (effectiveSize) {
      case 'small': return 'w-8 h-8'
      case 'medium': return 'w-12 h-12'
      case 'large': return 'w-16 h-16'
      case 'xlarge': return 'w-20 h-20'
      case 'huge': return 'w-40 h-40'
      default: return 'w-12 h-12'
    }
  }

  // Get font size for emoji fallback
  const getFontSize = () => {
    const effectiveSize = size || logoSize
    switch (effectiveSize) {
      case 'small': return '20px'
      case 'medium': return '24px'
      case 'large': return '32px'
      case 'xlarge': return '40px'
      case 'huge': return '80px'
      default: return '24px'
    }
  }


  return (
    <div className={`flex items-center justify-center ${getSizeClasses()}`}>
      {logoSrc && (
        <img
          src={logoSrc}
          alt="شعار اللعبة"
          className="w-full h-full object-contain"
          fetchPriority="high"
        />
      )}
    </div>
  )
})

export default LogoDisplay