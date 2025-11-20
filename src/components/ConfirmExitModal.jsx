import { useEffect } from 'react'

function ConfirmExitModal({ isOpen, onConfirm, onCancel, title, message }) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/75 z-[99999] flex items-center justify-center p-4 transition-opacity duration-200 animate-fadeIn"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-w-md w-full transform transition-all duration-200 scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-4 sm:p-5">
          <h2 className="font-bold text-lg sm:text-xl text-center">
            {title || 'تأكيد الخروج'}
          </h2>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="text-5xl sm:text-6xl mb-4">⚠️</div>
            <p className="text-gray-700 dark:text-gray-200 text-base sm:text-lg leading-relaxed font-bold">
              {message}
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <button
              onClick={onCancel}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-bold py-3 sm:py-3.5 px-6 transition-colors text-base sm:text-lg shadow-lg order-2 sm:order-1"
            >
              إلغاء
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold py-3 sm:py-3.5 px-6 transition-colors text-base sm:text-lg shadow-lg order-1 sm:order-2"
            >
              تأكيد الخروج
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfirmExitModal
