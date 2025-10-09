import { devLog, devWarn, prodError } from "../utils/devLog"
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

function AuthModal({ isOpen, onClose, mode: initialMode = 'signin' }) {
  const [mode, setMode] = useState(initialMode) // 'signin' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [localError, setLocalError] = useState('')
  const { signIn, signUp, loading } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError('')

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
    if (error.includes('user-not-found')) {
      return 'المستخدم غير موجود'
    }
    if (error.includes('wrong-password')) {
      return 'كلمة المرور غير صحيحة'
    }
    return 'حدث خطأ. يرجى المحاولة مرة أخرى'
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-4 md:p-6">
          <div className="flex justify-between items-center mb-4 md:mb-6">
            <h2 className="text-xl md:text-2xl font-bold text-gray-800">
              {mode === 'signup' ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl w-8 h-8 flex items-center justify-center"
            >
              ×
            </button>
          </div>

          {localError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-3 md:px-4 py-2 md:py-3 rounded mb-3 md:mb-4 text-sm md:text-base">
              {localError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-gray-700 text-sm md:text-base font-bold mb-1 md:mb-2" dir="rtl">
                  الاسم
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
                  placeholder="أدخل اسمك"
                  dir="rtl"
                  disabled={loading}
                />
              </div>
            )}

            <div>
              <label className="block text-gray-700 text-sm md:text-base font-bold mb-1 md:mb-2" dir="rtl">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
                placeholder="example@email.com"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-gray-700 text-sm md:text-base font-bold mb-1 md:mb-2" dir="rtl">
                كلمة المرور
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
                placeholder="أدخل كلمة المرور"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-2 md:py-3 px-4 rounded-lg transition-colors text-sm md:text-base"
            >
              {loading ? 'جاري التحميل...' : (mode === 'signup' ? 'إنشاء حساب' : 'تسجيل الدخول')}
            </button>
          </form>

          <div className="mt-4 md:mt-6 text-center">
            <button
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup')
                setLocalError('')
              }}
              disabled={loading}
              className="text-blue-600 hover:text-blue-800 underline text-sm md:text-base"
            >
              {mode === 'signup' ? 'لديك حساب بالفعل؟ تسجيل الدخول' : 'ليس لديك حساب؟ إنشاء حساب جديد'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

export default AuthModal