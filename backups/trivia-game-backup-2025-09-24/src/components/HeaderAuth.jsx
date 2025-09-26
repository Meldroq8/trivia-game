import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import AuthModal from './AuthModal'

function HeaderAuth({ fontSize = 14 }) {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const { user, signOut, isAuthenticated } = useAuth()
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
      case 'admin':
        navigate('/admin')
        break
      case 'signout':
        signOut()
        break
    }
  }

  if (isAuthenticated) {
    // Check if user has admin rights (you can customize this logic)
    const isAdmin = user?.email === 'admin@example.com' || user?.uid === 'admin-uid' // Customize admin check

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="text-white hover:text-blue-200 underline transition-colors cursor-pointer flex items-center gap-1"
          style={{ fontSize: `${fontSize * 0.8}px` }}
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
            className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 whitespace-nowrap"
            style={{ fontSize: `${fontSize * 0.75}px`, minWidth: '140px' }}
          >
            <button
              onClick={() => handleMenuClick('profile')}
              className="w-full text-right px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              الملف الشخصي
            </button>
            {isAdmin && (
              <button
                onClick={() => handleMenuClick('admin')}
                className="w-full text-right px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors whitespace-nowrap"
              >
                إدارة النظام
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
        style={{ fontSize: `${fontSize * 0.8}px` }}
      >
        دخول
      </button>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </>
  )
}

export default HeaderAuth