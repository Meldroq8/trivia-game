import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

/**
 * This page handles Firebase auth action links (password reset, email verification, etc.)
 * It intercepts Firebase's default URLs and redirects to our custom pages
 */
function AuthAction() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const mode = searchParams.get('mode')
    const oobCode = searchParams.get('oobCode')
    const continueUrl = searchParams.get('continueUrl')
    const lang = searchParams.get('lang')

    // Build query string for our custom page
    const params = new URLSearchParams()
    if (oobCode) params.append('oobCode', oobCode)
    if (continueUrl) params.append('continueUrl', continueUrl)
    if (lang) params.append('lang', lang)

    // Route based on action mode
    switch (mode) {
      case 'resetPassword':
        // Redirect to our custom password reset page
        navigate(`/reset-password?${params.toString()}`, { replace: true })
        break
      case 'verifyEmail':
        // Could add email verification page later
        navigate(`/?${params.toString()}`, { replace: true })
        break
      case 'recoverEmail':
        // Could add email recovery page later
        navigate(`/?${params.toString()}`, { replace: true })
        break
      default:
        // Unknown mode, go to homepage
        navigate('/', { replace: true })
    }
  }, [searchParams, navigate])

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex items-center justify-center">
      <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-red-600 mx-auto mb-4"></div>
        <h1 className="text-xl font-bold text-red-800 dark:text-red-400">جاري التحميل...</h1>
      </div>
    </div>
  )
}

export default AuthAction
