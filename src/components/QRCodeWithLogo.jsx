import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../hooks/useAuth'
import { useState, useEffect } from 'react'

function QRCodeWithLogo({ questionId, size = 250 }) {
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

  const answerViewUrl = `${window.location.origin}/answer-view/${questionId}`

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
                style={{
                  filter: 'brightness(0) invert(1)' // Make logo white
                }}
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
