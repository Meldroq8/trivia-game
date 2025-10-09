import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useRef, useEffect, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import AuthModal from './AuthModal'

const HeaderAuth = memo(function HeaderAuth({ fontSize = 14, isAdmin = false }) {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const { user, signOut, isAuthenticated, isAdminOrModerator } = useAuth()
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

  if (isAuthenticated) {
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
            className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[9999] overflow-visible"
            style={{ fontSize: `${fontSize * 0.9}px`, minWidth: '150px', maxWidth: 'none', width: 'auto' }}
          >
            <button
              onClick={() => handleMenuClick('games')}
              className="w-full text-right px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              العابي
            </button>
            <button
              onClick={() => handleMenuClick('profile')}
              className="w-full text-right px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              الملف الشخصي
            </button>
            {(isAdmin || isAdminOrModerator) && (
              <button
                onClick={() => handleMenuClick('admin')}
                className="w-full text-right px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
              >
                إعدادات المدير
              </button>
            )}
            <hr className="my-1 border-gray-200" />
            <button
              onClick={() => handleMenuClick('signout')}
              className="w-full text-right px-4 py-2 text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
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
        className="bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1 transition-colors"
        style={{ fontSize: `${fontSize}px` }}
      >
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