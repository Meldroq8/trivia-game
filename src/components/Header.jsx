import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import LogoDisplay from './LogoDisplay'
import HeaderAuth from './HeaderAuth'
import NotificationBell from './NotificationBell'

/**
 * Unified responsive header component for all pages
 * @param {Object} props
 * @param {string} props.title - Optional page title to display
 * @param {boolean} props.showBackButton - Whether to show back button
 * @param {string} props.backPath - Where back button should navigate (default: '/')
 * @param {Function} props.onBackClick - Optional custom back handler
 * @param {React.ReactNode} props.children - Optional additional content
 */
function Header({
  title = '',
  showBackButton = false,
  backPath = '/',
  onBackClick,
  children
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdminOrModerator, isAuthenticated } = useAuth()
  const { isDarkMode, toggleDarkMode } = useDarkMode()
  const headerRef = useRef(null)
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  })
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  // Track dimensions for responsive sizing
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showMobileMenu && !event.target.closest('.mobile-menu-container')) {
        setShowMobileMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMobileMenu])

  // Calculate responsive styles - matching QuestionView's sizing
  const getResponsiveStyles = () => {
    const { width, height } = dimensions
    const isPortrait = height > width
    const isMobile = width < 768
    const isTablet = width >= 768 && width < 1024
    const isPC = width >= 1024

    // Base font size calculation matching QuestionView
    let baseFontSize = 16
    const actualVH = height

    if (actualVH <= 390) {
      baseFontSize = 14
    } else if (actualVH <= 430) {
      baseFontSize = 15
    } else if (actualVH <= 568) {
      baseFontSize = 16
    } else if (actualVH <= 667) {
      baseFontSize = 17
    } else if (actualVH <= 812) {
      baseFontSize = 18
    } else if (actualVH <= 896) {
      baseFontSize = 19
    } else if (actualVH <= 1024) {
      baseFontSize = 20
    } else {
      baseFontSize = isPC ? 24 : 20
    }

    // Match QuestionView's globalScaleFactor
    const globalScaleFactor = 1.0

    const headerFontSize = baseFontSize * globalScaleFactor
    const buttonPadding = Math.max(8, globalScaleFactor * 12)

    // Compact padding matching QuestionView
    const basePadding = Math.max(8, buttonPadding * 0.25)
    const baseGap = isMobile ? 8 : 12

    return {
      headerFontSize,
      baseFontSize,
      basePadding,
      baseGap,
      buttonPadding,
      isPortrait,
      isMobile,
      isTablet,
      isPC,
      showHamburger: isPortrait || isMobile
    }
  }

  const styles = getResponsiveStyles()

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick()
    } else {
      navigate(backPath)
    }
  }

  // Filter out current page from menu items
  const allMenuItems = [
    { label: 'الصفحة الرئيسية', path: '/', icon: '🏠' },
    // Only show these if authenticated
    ...(isAuthenticated ? [
      { label: 'العابي', path: '/my-games', icon: '🎮' },
      { label: 'الملف الشخصي', path: '/profile', icon: '👤' }
    ] : []),
    ...(isAdminOrModerator ? [{ label: 'إعدادات المدير', path: '/admin', icon: '⚙️' }] : [])
  ]

  const menuItems = allMenuItems.filter(item => item.path !== location.pathname)

  return (
    <div
      ref={headerRef}
      className="bg-gradient-to-r from-red-600 via-red-700 to-red-600 text-white flex-shrink-0 shadow-lg"
      style={{
        padding: `${styles.basePadding}px`,
        height: `${Math.max(56, styles.headerFontSize * 3)}px`
      }}
    >
      <div className="flex justify-between items-center h-full">
        {/* Left Section: Logo + Quick Links */}
        <div className="flex items-center" style={{ gap: `${styles.baseGap}px`, maxWidth: styles.showHamburger ? '70%' : 'auto' }}>
          <LogoDisplay />

          {/* Quick navigation links - only show when authenticated */}
          {isAuthenticated && (
            <div className="flex items-center" style={{ gap: `${styles.baseGap * 0.8}px` }}>
              <button
                onClick={() => navigate('/my-games')}
                className="text-white hover:text-blue-200 transition-colors font-bold whitespace-nowrap"
                style={{
                  fontSize: `${styles.headerFontSize * 0.7}px`,
                  opacity: 0.95
                }}
                title="ألعابي"
              >
                ألعابي
              </button>

              {!styles.showHamburger && (
                <button
                  onClick={() => navigate('/profile')}
                  className="text-white hover:text-blue-200 transition-colors font-bold whitespace-nowrap"
                  style={{
                    fontSize: `${styles.headerFontSize * 0.7}px`,
                    opacity: 0.95
                  }}
                  title="الملف الشخصي"
                >
                  الملف الشخصي
                </button>
              )}
            </div>
          )}
        </div>

        {/* Center Section: Title */}
        <div className="flex-1 text-center">
          {title && (
            <h1
              className="font-bold"
              style={{ fontSize: `${styles.headerFontSize * 0.9}px` }}
            >
              {title}
            </h1>
          )}
        </div>

        {/* Right Section: Auth & Menu/Back Button */}
        <div className="flex items-center mobile-menu-container" style={{ gap: `${styles.baseGap}px` }}>
          {/* Dark Mode Toggle - always visible */}
          <button
            onClick={toggleDarkMode}
            className="text-white hover:text-blue-200 transition-colors p-2 rounded-lg hover:bg-white/10"
            title={isDarkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
            style={{ fontSize: `${styles.headerFontSize}px` }}
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>

          {/* Notification Bell - always visible for authenticated users */}
          {isAuthenticated && (
            <NotificationBell fontSize={styles.headerFontSize} />
          )}

          {/* Show hamburger menu in portrait/mobile mode ONLY if authenticated */}
          {styles.showHamburger && isAuthenticated && (
            <div className="relative">
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors flex items-center justify-center"
                style={{
                  fontSize: `${styles.headerFontSize * 1}px`,
                  width: '32px',
                  height: '32px'
                }}
                aria-label="القائمة"
              >
                ☰
              </button>

              {/* Dropdown Menu */}
              {showMobileMenu && (
                <div
                  className="absolute left-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 min-w-[200px]"
                  style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Username at top */}
                  <div className="px-4 py-2">
                    <HeaderAuth fontSize={styles.headerFontSize * 0.9} isAdmin={isAdminOrModerator} inMobileMenu={true} />
                  </div>

                  {showBackButton && (
                    <div>
                      <button
                        onClick={() => {
                          handleBackClick()
                          setShowMobileMenu(false)
                        }}
                        className="w-full text-right px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
                      >
                        <span>←</span>
                        <span>الرجوع</span>
                      </button>
                      <hr className="my-2 border-gray-200" />
                    </div>
                  )}

                  {menuItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => {
                        navigate(item.path)
                        setShowMobileMenu(false)
                      }}
                      className="w-full text-right px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}

                  <hr className="my-2 border-gray-200" />

                  {/* Dark Mode Toggle in Mobile Menu */}
                  <button
                    onClick={() => {
                      toggleDarkMode()
                      setShowMobileMenu(false)
                    }}
                    className="w-full text-right px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
                  >
                    <span>{isDarkMode ? '☀️' : '🌙'}</span>
                    <span>{isDarkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Desktop mode OR not authenticated: Show auth and back button separately */}
          {(!styles.showHamburger || !isAuthenticated) && (
            <div className="flex items-center" style={{ gap: `${styles.baseGap}px` }}>
              <HeaderAuth fontSize={styles.headerFontSize * 0.9} isAdmin={isAdminOrModerator} />
              {showBackButton && (
                <button
                  onClick={handleBackClick}
                  className="bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors font-bold px-3 py-1"
                  style={{
                    fontSize: `${styles.headerFontSize * 0.8}px`
                  }}
                >
                  الرجوع ←
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Additional content slot */}
      {children}
    </div>
  )
}

export default Header
