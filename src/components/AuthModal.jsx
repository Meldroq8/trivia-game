import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

function AuthModal({ isOpen, onClose, mode: initialMode = 'signin' }) {
  const [mode, setMode] = useState(initialMode) // 'signin', 'signup', or 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [localError, setLocalError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [signUpEnabled, setSignUpEnabled] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const { signIn, signUp, resetPassword, loading, getAppSettings } = useAuth()

  // Load sign-up setting when modal opens
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getAppSettings()
        // Default to true if not set (backwards compatibility)
        setSignUpEnabled(settings?.signUpEnabled !== false)
      } catch (error) {
        prodError('Error loading sign-up settings:', error)
        // Default to enabled on error
        setSignUpEnabled(true)
      }
    }

    if (isOpen) {
      loadSettings()
    }
  }, [isOpen, getAppSettings])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError('')
    setSuccessMessage('')

    // Handle password reset
    if (mode === 'reset') {
      if (!email) {
        setLocalError('يرجى إدخال البريد الإلكتروني')
        return
      }

      try {
        await resetPassword(email)
        setSuccessMessage('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني')
        // Switch back to signin after 3 seconds
        setTimeout(() => {
          setMode('signin')
          setSuccessMessage('')
        }, 3000)
      } catch (error) {
        setLocalError(getErrorMessage(error.message))
      }
      return
    }

    // Check if sign-up is disabled
    if (mode === 'signup' && !signUpEnabled) {
      setLocalError('التسجيل مغلق حالياً. يمكن للمستخدمين الحاليين تسجيل الدخول فقط.')
      return
    }

    if (!email || !password) {
      setLocalError('يرجى إدخال البريد الإلكتروني وكلمة المرور')
      return
    }

    if (mode === 'signup' && !displayName) {
      setLocalError('يرجى إدخال الاسم')
      return
    }

    try {
      if (mode === 'signup') {
        await signUp(email, password, displayName)
      } else {
        await signIn(email, password)
      }
      onClose()
      // Reset form
      setEmail('')
      setPassword('')
      setDisplayName('')
      setLocalError('')
    } catch (error) {
      setLocalError(getErrorMessage(error.message))
    }
  }

  const getErrorMessage = (error) => {
    if (error.includes('email-already-in-use')) {
      return 'هذا البريد الإلكتروني مستخدم بالفعل'
    }
    if (error.includes('weak-password')) {
      return 'كلمة المرور ضعيفة - يجب أن تحتوي على 6 أحرف على الأقل'
    }
    if (error.includes('invalid-email')) {
      return 'البريد الإلكتروني غير صحيح'
    }
    if (error.includes('invalid-credential')) {
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
    }
    if (error.includes('user-not-found')) {
      return mode === 'reset' ? 'هذا البريد الإلكتروني غير مسجل' : 'المستخدم غير موجود'
    }
    if (error.includes('wrong-password')) {
      return 'كلمة المرور غير صحيحة'
    }
    if (error.includes('too-many-requests')) {
      return 'تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة لاحقاً'
    }
    return 'حدث خطأ. يرجى المحاولة مرة أخرى'
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-slate-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 p-4 md:p-5 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              {mode === 'signup' ? (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  إنشاء حساب جديد
                </>
              ) : mode === 'reset' ? (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  إعادة تعيين كلمة المرور
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  تسجيل الدخول
                </>
              )}
            </h2>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6">
          {localError && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl mb-4 flex items-center gap-2 text-sm md:text-base">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {localError}
            </div>
          )}

          {successMessage && (
            <div className="bg-green-500/20 border border-green-500/50 text-green-200 px-4 py-3 rounded-xl mb-4 flex items-center gap-2 text-sm md:text-base">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2" dir="rtl">
                  الاسم
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-3 pr-10 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-white placeholder-gray-500 transition-all"
                    placeholder="أدخل اسمك"
                    dir="rtl"
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2" dir="rtl">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 pr-10 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-white placeholder-gray-500 transition-all"
                  placeholder="example@email.com"
                  dir="ltr"
                  disabled={loading}
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2" dir="rtl">
                  كلمة المرور
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-10 pl-10 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-white placeholder-gray-500 transition-all"
                    placeholder="أدخل كلمة المرور"
                    dir="ltr"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {mode === 'signin' && (
              <div className="text-left">
                <button
                  type="button"
                  onClick={() => {
                    setMode('reset')
                    setLocalError('')
                    setSuccessMessage('')
                  }}
                  className="text-red-400 hover:text-red-300 text-sm transition-colors"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-red-800 disabled:to-red-900 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  جاري التحميل...
                </>
              ) : mode === 'signup' ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  إنشاء حساب
                </>
              ) : mode === 'reset' ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  إرسال رابط إعادة التعيين
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  تسجيل الدخول
                </>
              )}
            </button>
          </form>

          {/* Sign-up disabled notice */}
          {!signUpEnabled && mode === 'signin' && (
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-center">
              <div className="flex items-center justify-center gap-2 text-amber-400 font-medium">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                التسجيل مغلق حالياً
              </div>
              <p className="text-xs text-amber-300/80 mt-1">
                يمكن للمستخدمين الحاليين تسجيل الدخول فقط
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            {mode === 'reset' ? (
              <button
                onClick={() => {
                  setMode('signin')
                  setLocalError('')
                  setSuccessMessage('')
                }}
                disabled={loading}
                className="text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-1 mx-auto"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                الرجوع لتسجيل الدخول
              </button>
            ) : (
              /* Only show toggle if sign-up is enabled OR we're on sign-up mode */
              (signUpEnabled || mode === 'signup') && (
                <button
                  onClick={() => {
                    setMode(mode === 'signup' ? 'signin' : 'signup')
                    setLocalError('')
                    setSuccessMessage('')
                  }}
                  disabled={loading}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  {mode === 'signup' ? (
                    <span>لديك حساب بالفعل؟ <span className="text-red-400 hover:text-red-300">تسجيل الدخول</span></span>
                  ) : (
                    <span>ليس لديك حساب؟ <span className="text-red-400 hover:text-red-300">إنشاء حساب جديد</span></span>
                  )}
                </button>
              )
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

export default AuthModal
