import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../hooks/useAuth'
import { useState, useEffect } from 'react'

function QRCodeWithLogo({ questionId, size = 250, mode = 'answer' }) {
  const [logoUrl, setLogoUrl] = useState(null)
  const { getAppSettings } = useAuth()

  // Load logo from settings
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const settings = await getAppSettings()
        if (settings?.logo) {
          setLogoUrl(settings.logo)
        }
      } catch (error) {
        console.error('Error loading logo:', error)
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

          {/* Fallback icon if no logo */}
          {!logoUrl && (
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
