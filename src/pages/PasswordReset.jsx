import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth'
import { auth } from '../firebase/config'
import { devLog, prodError } from '../utils/devLog'
import Header from '../components/Header'

function PasswordReset() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [email, setEmail] = useState('')

  const oobCode = searchParams.get('oobCode')

  useEffect(() => {
    document.title = 'لمّه - إعادة تعيين كلمة المرور'
  }, [])

  // Verify the reset code when component mounts
  useEffect(() => {
    const verifyCode = async () => {
      if (!oobCode) {
        setError('رابط غير صالح. يرجى طلب رابط جديد.')
        setLoading(false)
        return
      }

      try {
        // Verify the code and get the email
        const userEmail = await verifyPasswordResetCode(auth, oobCode)
        setEmail(userEmail)
        setLoading(false)
        devLog('Password reset code verified for:', userEmail)
      } catch (error) {
        prodError('Error verifying reset code:', error)
        if (error.code === 'auth/expired-action-code') {
          setError('انتهت صلاحية الرابط. يرجى طلب رابط جديد.')
        } else if (error.code === 'auth/invalid-action-code') {
          setError('رابط غير صالح أو مستخدم بالفعل. يرجى طلب رابط جديد.')
        } else {
          setError('حدث خطأ في التحقق من الرابط. يرجى المحاولة مرة أخرى.')
        }
        setLoading(false)
      }
    }

    verifyCode()
  }, [oobCode])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!newPassword) {
      setError('يرجى إدخال كلمة المرور الجديدة')
      return
    }

    if (newPassword.length < 6) {
      setError('كلمة المرور يجب أن تحتوي على 6 أحرف على الأقل')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين')
      return
    }

    setSubmitting(true)

    try {
      // Confirm the password reset
      await confirmPasswordReset(auth, oobCode, newPassword)
      devLog('Password reset successful')
      setSuccess(true)

      // Redirect to home after 3 seconds
      setTimeout(() => {
        navigate('/')
      }, 3000)
    } catch (error) {
      prodError('Error resetting password:', error)
      if (error.code === 'auth/weak-password') {
        setError('كلمة المرور ضعيفة. يرجى استخدام كلمة مرور أقوى')
      } else {
        setError('حدث خطأ في إعادة تعيين كلمة المرور. يرجى المحاولة مرة أخرى.')
      }
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex flex-col">
        <Header title="" />
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 text-center max-w-md w-full mx-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-red-600 mx-auto mb-4"></div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">جاري التحقق...</h1>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex flex-col">
        <Header title="" />
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 text-center max-w-md w-full mx-4">
            <div className="text-green-600 text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">تم بنجاح!</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              تم تغيير كلمة المرور بنجاح. جاري تحويلك للصفحة الرئيسية...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex flex-col hive-pattern">
      <Header title="" />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">🔐</div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
              إعادة تعيين كلمة المرور
            </h1>
            {email && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {email}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {!error || email ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" dir="rtl">
                  كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-800 dark:text-gray-100 bg-white dark:bg-slate-700"
                  placeholder="أدخل كلمة المرور الجديدة"
                  disabled={submitting}
                  dir="rtl"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" dir="rtl">
                  تأكيد كلمة المرور
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-800 dark:text-gray-100 bg-white dark:bg-slate-700"
                  placeholder="أعد إدخال كلمة المرور"
                  disabled={submitting}
                  dir="rtl"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                {submitting ? 'جاري الحفظ...' : 'حفظ كلمة المرور الجديدة'}
              </button>
            </form>
          ) : (
            <div className="text-center">
              <button
                onClick={() => navigate('/')}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                العودة للصفحة الرئيسية
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PasswordReset
