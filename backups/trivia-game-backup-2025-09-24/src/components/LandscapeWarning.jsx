import { useState, useEffect } from 'react'

function LandscapeWarning() {
  const [isPortrait, setIsPortrait] = useState(false)

  useEffect(() => {
    const checkOrientation = () => {
      const isMobile = window.innerWidth <= 768
      const isPortraitMode = window.innerHeight > window.innerWidth
      setIsPortrait(isMobile && isPortraitMode)
    }

    checkOrientation()
    window.addEventListener('resize', checkOrientation)
    window.addEventListener('orientationchange', checkOrientation)

    return () => {
      window.removeEventListener('resize', checkOrientation)
      window.removeEventListener('orientationchange', checkOrientation)
    }
  }, [])

  if (!isPortrait) return null

  return (
    <div className="landscape-warning">
      <div className="text-center" style={{ padding: 'clamp(1rem, 5vw, 2rem)' }}>
        <div className="text-6xl mb-4" style={{
          fontSize: 'clamp(3rem, 12vw, 5rem)',
          animation: 'pulse 2s infinite'
        }}>📱</div>
        <h2 className="font-bold mb-4" style={{
          fontSize: 'clamp(1.25rem, 4vw, 2rem)',
          marginBottom: 'clamp(1rem, 3vw, 1.5rem)'
        }}>يرجى تدوير الجهاز</h2>
        <p style={{
          fontSize: 'clamp(1rem, 3vw, 1.25rem)',
          marginBottom: 'clamp(0.5rem, 2vw, 1rem)'
        }}>هذه اللعبة مصممة للعرض الأفقي</p>
        <p style={{
          fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
          opacity: '0.75',
          marginTop: 'clamp(0.5rem, 2vw, 1rem)'
        }}>Please rotate your device to landscape mode</p>
      </div>
    </div>
  )
}

export default LandscapeWarning