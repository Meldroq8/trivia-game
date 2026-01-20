import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useRef, useEffect, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import AuthModal from './AuthModal'

const HeaderAuth = memo(function HeaderAuth({ fontSize = 14, isAdmin = false, inMobileMenu = false }) {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const { user, signOut, isAuthenticated, isAdminOrModerator, loading } = useAuth()
  const navigate = useNavigate()
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMenuClick = (action) => {
    setShowDropdown(false)
    switch (action) {
      case 'profile':
        navigate('/profile')
        break
      case 'games':
        navigate('/my-games')
        break
      case 'admin':
        navigate('/admin')
        break
      case 'signout':
        signOut()
        break
    }
  }

  // Don't show anything while loading to prevent flash
  if (loading) {
    return null
  }

  if (isAuthenticated) {
    // In mobile menu: show username and signout button only (no dropdown, no duplicates)
    if (inMobileMenu) {
      return (
        <div className="flex items-center gap-3">
          <span className="text-gray-700 dark:text-gray-100 font-bold" style={{ fontSize: `${fontSize}px` }}>
            {user?.displayName || user?.email?.split('@')[0]}
          </span>
          <button
            onClick={() => signOut()}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors text-sm"
          >
            تسجيل الخروج
          </button>
        </div>
      )
    }

    // Desktop mode: show dropdown with all options
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="text-white hover:text-blue-200 underline transition-colors cursor-pointer flex items-center gap-1"
          style={{ fontSize: `${fontSize}px` }}
          title="انقر لفتح القائمة"
        >
          {user?.displayName || user?.email?.split('@')[0]}
          <svg
            className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDropdown && (
          <div
            className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-[9999] overflow-visible"
            style={{ fontSize: `${fontSize * 0.9}px`, minWidth: '150px', maxWidth: 'none', width: 'auto' }}
          >
            <button
              onClick={() => handleMenuClick('games')}
              className="w-full text-right px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              العابي
            </button>
            <button
              onClick={() => handleMenuClick('profile')}
              className="w-full text-right px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              الملف الشخصي
            </button>
            {(isAdmin || isAdminOrModerator) && (
              <button
                onClick={() => handleMenuClick('admin')}
                className="w-full text-right px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
              >
                إعدادات المدير
              </button>
            )}
            <hr className="my-1 border-gray-200 dark:border-gray-600" />
            <button
              onClick={() => handleMenuClick('signout')}
              className="w-full text-right px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors whitespace-nowrap"
            >
              تسجيل الخروج
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowAuthModal(true)}
        className="bg-gradient-to-l from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-lg px-4 py-1.5 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 flex items-center gap-1.5"
        style={{ fontSize: `${fontSize}px` }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
        </svg>
        دخول
      </button>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </>
  )
})

export default HeaderAuth