import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import LogoDisplay from './LogoDisplay'
import HeaderAuth from './HeaderAuth'
import NotificationBell from './NotificationBell'
import { getHeaderStyles, getDeviceFlags } from '../utils/responsiveStyles'

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
    width: typeof window !== 'undefined' ? window.innerWidth : 375,
    height: typeof window !== 'undefined' ? window.innerHeight : 667
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

  // Close mobile menu when clicking outside - only register when menu is open
  useEffect(() => {
    if (!showMobileMenu) return

    const handleClickOutside = (event) => {
      if (!event.target.closest('.mobile-menu-container')) {
        setShowMobileMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMobileMenu])

  // Calculate responsive styles - using shared utility for consistency
  const getResponsiveStyles = () => {
    const { width, height } = dimensions

    // Use shared utility for consistent header sizing across all pages
    const sharedHeaderStyles = getHeaderStyles(width, height)
    const deviceFlags = getDeviceFlags(width, height)

    const { headerFontSize, buttonPadding, headerPadding, baseGap, headerHeight } = sharedHeaderStyles
    const { isPortrait, isMobileLayout, isPC } = deviceFlags

    const isMobile = width < 768
    const isTablet = width >= 768 && width < 1024

    return {
      headerFontSize,
      baseFontSize: sharedHeaderStyles.headerBaseFontSize,
      basePadding: headerPadding,
      baseGap,
      buttonPadding,
      headerHeight,
      isPortrait,
      isMobile,
      isTablet,
      isPC,
      showHamburger: isPortrait || isMobileLayout
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

  // Menu items for hamburger - only items NOT visible in header
  // Header shows: Logo (home), one quick link, second link only on desktop
  // Portrait mode only shows first quick link, so hamburger needs the second one
  const getHamburgerMenuItems = () => {
    const items = []

    // On profile page: header shows "الرئيسية", so add "ألعابي" to hamburger
    if (location.pathname === '/profile') {
      items.push({ label: 'ألعابي', path: '/my-games', icon: '🎮' })
    }
    // On other pages: header shows "ألعابي" or "الرئيسية", so add "الملف الشخصي" to hamburger
    else {
      items.push({ label: 'الملف الشخصي', path: '/profile', icon: '👤' })
    }

    // Admin settings - always in hamburger for cleaner header
    if (isAdminOrModerator) {
      items.push({ label: 'إعدادات المدير', path: '/admin', icon: '⚙️' })
    }

    return items
  }

  const menuItems = getHamburgerMenuItems()

  return (
    <div
      ref={headerRef}
      className="bg-gradient-to-r from-red-600 via-red-700 to-red-600 text-white flex-shrink-0 shadow-lg"
      style={{
        padding: `${styles.basePadding}px`,
        height: `${styles.headerHeight}px`
      }}
    >
      <div className="flex justify-between items-center h-full">
        {/* Left Section: Logo + Quick Links */}
        <div className="flex items-center" style={{ gap: `${styles.baseGap}px`, maxWidth: styles.showHamburger ? '70%' : 'auto' }}>
          {/* Clickable logo - navigates to home */}
          <button
            onClick={() => navigate('/')}
            className="hover:opacity-80 transition-opacity cursor-pointer"
            title="الصفحة الرئيسية"
          >
            <LogoDisplay />
          </button>

          {/* Quick navigation links - only show when authenticated */}
          {isAuthenticated && (
            <div className="flex items-center" style={{ gap: `${styles.baseGap * 0.8}px` }}>
              {/* First link: Home if on my-games or profile, otherwise My Games */}
              {location.pathname === '/my-games' || location.pathname === '/profile' ? (
                <button
                  onClick={() => navigate('/')}
                  className="text-white hover:text-blue-200 transition-colors font-bold whitespace-nowrap"
                  style={{
                    fontSize: `${styles.headerFontSize * 0.7}px`,
                    opacity: 0.95
                  }}
                  title="الصفحة الرئيسية"
                >
                  الرئيسية
                </button>
              ) : (
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
              )}

              {/* Second link: Show the other page (not current, not home) */}
              {!styles.showHamburger && (
                location.pathname === '/profile' ? (
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
                ) : location.pathname === '/my-games' ? (
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
                ) : (
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
                )
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
                  className="absolute left-0 top-full mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 min-w-[200px] overflow-hidden"
                  style={{ fontSize: `${styles.headerFontSize * 0.8}px` }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header with user info and close button */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <HeaderAuth fontSize={styles.headerFontSize * 0.85} isAdmin={isAdminOrModerator} inMobileMenu={true} />
                    <button
                      onClick={() => setShowMobileMenu(false)}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
                      title="إغلاق"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    {showBackButton && (
                      <button
                        onClick={() => {
                          handleBackClick()
                          setShowMobileMenu(false)
                        }}
                        className="w-full text-right px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                      >
                        <span>←</span>
                        <span>الرجوع</span>
                      </button>
                    )}

                    {menuItems.map((item) => (
                      <button
                        key={item.path}
                        onClick={() => {
                          navigate(item.path)
                          setShowMobileMenu(false)
                        }}
                        className="w-full text-right px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                      >
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
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

