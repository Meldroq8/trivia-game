import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { FirebaseQuestionsService } from '../utils/firebaseQuestions'

/**
 * Notification bell component for header
 * Shows unread count and dropdown with recent notifications
 */
function NotificationBell({ fontSize = 16 }) {
  const { user, isAuthenticated } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  // Load notifications on mount and periodically
  useEffect(() => {
    if (!isAuthenticated || !user?.uid) return

    const loadNotifications = async () => {
      try {
        const [notifs, count] = await Promise.all([
          FirebaseQuestionsService.getUserNotifications(user.uid, 10),
          FirebaseQuestionsService.getUnreadNotificationCount(user.uid)
        ])
        setNotifications(notifs)
        setUnreadCount(count)
      } catch (error) {
        console.error('Error loading notifications:', error)
      }
    }

    loadNotifications()

    // Refresh every 30 seconds
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, user?.uid])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Mark notification as read
  const handleMarkAsRead = async (notificationId) => {
    try {
      await FirebaseQuestionsService.markNotificationAsRead(notificationId)
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    if (!user?.uid || unreadCount === 0) return

    setLoading(true)
    try {
      await FirebaseQuestionsService.markAllNotificationsAsRead(user.uid)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all as read:', error)
    } finally {
      setLoading(false)
    }
  }

  // Format relative time
  const formatTime = (date) => {
    if (!date) return ''
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'الآن'
    if (minutes < 60) return `منذ ${minutes} دقيقة`
    if (hours < 24) return `منذ ${hours} ساعة`
    if (days < 7) return `منذ ${days} يوم`
    return date.toLocaleDateString('ar-EG')
  }

  // Get icon based on notification type
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'report_resolved':
        return '✅'
      case 'report_deleted':
        return '🗑️'
      default:
        return '🔔'
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative text-white hover:text-blue-200 transition-colors p-2 rounded-lg hover:bg-white/10"
        title="الإشعارات"
        style={{ fontSize: `${fontSize}px` }}
      >
        🔔
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-yellow-400 text-red-800 text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute left-0 top-full mt-2 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-600 z-50 overflow-hidden"
          style={{
            width: '320px',
            maxHeight: '400px'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
            <h3 className="font-bold text-gray-800 dark:text-white text-sm">الإشعارات</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={loading}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-50"
              >
                {loading ? 'جاري...' : 'قراءة الكل'}
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                لا توجد إشعارات
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                  className={`px-4 py-3 border-b border-gray-100 dark:border-slate-700 cursor-pointer transition-colors ${
                    notification.read
                      ? 'bg-white dark:bg-slate-800'
                      : 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${notification.read ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-white'}`}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2" dir="rtl">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {formatTime(notification.createdAt)}
                      </p>
                    </div>
                    {!notification.read && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
