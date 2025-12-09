import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../hooks/useAuth'
import { useState, useEffect, useRef } from 'react'

// Cache logo URL to avoid repeated Firebase calls
let cachedLogoUrl = null
let logoLoadPromise = null

function QRCodeWithLogo({ questionId, size = 250, mode = 'answer' }) {
  const [logoUrl, setLogoUrl] = useState(cachedLogoUrl)
  const [logoLoading, setLogoLoading] = useState(!cachedLogoUrl)
  const { getAppSettings } = useAuth()

  // Load logo from settings (with caching)
  useEffect(() => {
    // If already cached, use it immediately
    if (cachedLogoUrl) {
      setLogoUrl(cachedLogoUrl)
      setLogoLoading(false)
      return
    }

    const loadLogo = async () => {
      try {
        // If another instance is already loading, wait for it
        if (logoLoadPromise) {
          const url = await logoLoadPromise
          setLogoUrl(url)
          setLogoLoading(false)
          return
        }

        // Start loading and create promise for other instances to share
        logoLoadPromise = (async () => {
          const settings = await getAppSettings()
          const url = settings?.logo || null
          cachedLogoUrl = url
          return url
        })()

        const url = await logoLoadPromise
        setLogoUrl(url)
        setLogoLoading(false)
      } catch (error) {
        console.error('Error loading logo:', error)
        setLogoLoading(false)
      }
    }
    loadLogo()
  }, [getAppSettings])

  // Generate URL based on mode
  const getQrUrl = () => {
    switch (mode) {
      case 'drawing':
        return `${window.location.origin}/draw/${questionId}`
      case 'headband':
        return `${window.location.origin}/headband/${questionId}`
      default: // 'answer' mode (charades)
        return `${window.location.origin}/answer-view/${questionId}`
    }
  }

  const qrUrl = getQrUrl()

  const answerViewUrl = qrUrl

  return (
    <div className="flex flex-col items-center">
      {/* QR Code */}
      <div className="relative inline-block">
        <div className="relative">
          <QRCodeSVG
            value={answerViewUrl}
            size={size}
            level="H" // High error correction (allows logo overlay)
            includeMargin={true}
            bgColor="#ffffff"
            fgColor="#000000"
          />

          {/* Red circle background for logo */}
          {logoUrl && (
            <div
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                         bg-red-600 rounded-full flex items-center justify-center"
              style={{
                width: size * 0.28,
                height: size * 0.28,
                zIndex: 10
              }}
            >
              {/* Logo */}
              <img
                src={logoUrl}
                alt="Logo"
                className="w-full h-full object-contain p-1"
              />
            </div>
          )}

          {/* Loading spinner while logo is loading */}
          {!logoUrl && logoLoading && (
            <div
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                         bg-red-600 rounded-full flex items-center justify-center"
              style={{
                width: size * 0.28,
                height: size * 0.28,
                zIndex: 10
              }}
            >
              <div
                className="animate-spin rounded-full border-2 border-white border-t-transparent"
                style={{
                  width: size * 0.12,
                  height: size * 0.12
                }}
              />
            </div>
          )}

          {/* Fallback icon if no logo (after loading completes) */}
          {!logoUrl && !logoLoading && (
            <div
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                         bg-red-600 rounded-full flex items-center justify-center"
              style={{
                width: size * 0.28,
                height: size * 0.28,
                zIndex: 10
              }}
            >
              <span className="text-white text-3xl">🧠</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QRCodeWithLogo
