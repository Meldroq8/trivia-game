import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import BackgroundImage from '../components/BackgroundImage'
import AuthModal from '../components/AuthModal'
import { useAuth } from '../hooks/useAuth'
import { GameDataLoader } from '../utils/gameDataLoader'
import { devLog, devWarn, prodError } from '../utils/devLog'

function CategoryPreview() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [categories, setCategories] = useState(() => {
    try {
      const cached = localStorage.getItem('preview_categories')
      return cached ? JSON.parse(cached) : []
    } catch { return [] }
  })
  const [masterCategories, setMasterCategories] = useState(() => {
    try {
      const cached = localStorage.getItem('preview_masterCategories')
      return cached ? JSON.parse(cached) : []
    } catch { return [] }
  })
  const [selectedMaster, setSelectedMaster] = useState('all')
  const [loading, setLoading] = useState(() => {
    try { return !localStorage.getItem('preview_categories') } catch { return true }
  })
  const [showAuthModal, setShowAuthModal] = useState(false)
  const filterScrollRef = useRef(null)

  // Set page title and canonical URL for SEO
  useEffect(() => {
    document.title = 'راس براس - فئات اللعبة'

    // Set canonical URL
    let canonical = document.querySelector('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.appendChild(canonical)
    }
    canonical.href = 'https://www.rasbras.com/category-preview'

    return () => {
      // Reset to homepage canonical when leaving
      if (canonical) canonical.href = 'https://www.rasbras.com/'
    }
  }, [])

  // Load categories and master categories
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const gameData = await GameDataLoader.loadCategoriesOnly()
        if (gameData) {
          // Filter out mystery category and hidden categories
          const visibleCategories = (gameData.categories || [])
            .filter(cat => cat.id !== 'mystery' && !cat.hidden)
          setCategories(visibleCategories)
          try { localStorage.setItem('preview_categories', JSON.stringify(visibleCategories)) } catch {}

          // Set master categories with "all" option
          const masters = gameData.masterCategories || []
          setMasterCategories(masters)
          try { localStorage.setItem('preview_masterCategories', JSON.stringify(masters)) } catch {}

          devLog('📚 CategoryPreview: Loaded', visibleCategories.length, 'categories and', gameData.masterCategories?.length || 0, 'master categories')
        }
      } catch (error) {
        prodError('Error loading categories for preview:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // Filter categories by selected master category
  const filteredCategories = selectedMaster === 'all'
    ? categories
    : categories.filter(cat => cat.masterCategoryId === selectedMaster)

  // Handle category click - show auth modal if not logged in
  const handleCategoryClick = (category) => {
    if (!isAuthenticated) {
      setShowAuthModal(true)
      return
    }
    // If authenticated, go to categories selection
    navigate('/categories')
  }

  // Handle start game button
  const handleStartGame = () => {
    if (!isAuthenticated) {
      setShowAuthModal(true)
      return
    }
    navigate('/categories')
  }

  // Scroll filter bar
  const scrollFilters = (direction) => {
    if (filterScrollRef.current) {
      const scrollAmount = 200
      filterScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f2e6] dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="relative z-20">
        <Header title="" />
      </div>

      {/* Main Content */}
      <div className="flex-1 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          {/* Page Title */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">
              فئات راس براس
            </h1>
            <button
              onClick={handleStartGame}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-xl shadow-lg transition-all duration-200 hover:scale-105 text-sm sm:text-base"
            >
              ابدأ اللعب
            </button>
          </div>

          {/* Master Categories Filter Bar */}
          <div className="relative mb-6">
            {/* Scroll buttons for desktop */}
            <button
              onClick={() => scrollFilters('right')}
              className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center bg-white dark:bg-slate-700 rounded-full shadow-md hover:shadow-lg transition-shadow text-gray-600 dark:text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => scrollFilters('left')}
              className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center bg-white dark:bg-slate-700 rounded-full shadow-md hover:shadow-lg transition-shadow text-gray-600 dark:text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Filter pills */}
            <div
              ref={filterScrollRef}
              className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-hide"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {/* "All" filter */}
              <button
                onClick={() => setSelectedMaster('all')}
                className={`flex-shrink-0 px-4 py-2 rounded-full font-bold text-sm transition-all duration-200 ${
                  selectedMaster === 'all'
                    ? 'bg-red-600 text-white shadow-lg'
                    : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600'
                }`}
              >
                الكل ({categories.length})
              </button>

              {/* Master category filters */}
              {masterCategories.map((master) => {
                const count = categories.filter(c => c.masterCategoryId === master.id).length
                if (count === 0) return null
                return (
                  <button
                    key={master.id}
                    onClick={() => setSelectedMaster(master.id)}
                    className={`flex-shrink-0 px-4 py-2 rounded-full font-bold text-sm transition-all duration-200 whitespace-nowrap ${
                      selectedMaster === master.id
                        ? 'bg-red-600 text-white shadow-lg'
                        : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600'
                    }`}
                  >
                    {master.name} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          {/* Categories Count */}
          <div className="mb-4 text-gray-600 dark:text-gray-400 text-sm">
            عدد الفئات: {filteredCategories.length}
          </div>

          {/* Categories Grid */}
          <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-3 sm:gap-4">
            {loading && filteredCategories.length === 0 ? (
              Array.from({ length: 16 }).map((_, i) => (
                <div key={`skel-${i}`}>
                  <div className="relative aspect-[3/4] rounded-xl sm:rounded-2xl overflow-hidden bg-gray-200 dark:bg-slate-700 animate-pulse" />
                </div>
              ))
            ) : null}
            {filteredCategories.map((category) => (
              <div
                key={category.id}
                onClick={() => handleCategoryClick(category)}
                className="cursor-pointer group"
              >
                <div className="relative aspect-[3/4] rounded-xl sm:rounded-2xl overflow-hidden shadow-md sm:shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105 border-2 border-transparent group-hover:border-red-400">
                  {/* Background Image */}
                  <BackgroundImage
                    src={category.imageUrl}
                    size="medium"
                    context="category"
                    categoryId={category.id}
                    className="absolute inset-0 w-full h-full"
                    fallbackGradient="from-amber-400 to-amber-600"
                  />

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Category info */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3">
                    <h3 className="text-white font-bold text-[10px] sm:text-xs md:text-sm text-center leading-tight drop-shadow-lg mb-0.5 sm:mb-1">
                      {category.name}
                    </h3>
                    {category.questionCount > 0 && (
                      <p className="text-white/80 text-[8px] sm:text-[10px] md:text-xs text-center">
                        {Math.floor(category.questionCount / 6)} جولة
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {filteredCategories.length === 0 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">
                لا توجد فئات
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                لا توجد فئات في هذا التصنيف حالياً
              </p>
            </div>
          )}

          {/* Call to action */}
          <div className="mt-12 text-center">
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 sm:p-8 max-w-2xl mx-auto border border-gray-200 dark:border-slate-700">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">
                جاهز للتحدي؟
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                سجل دخولك واختر الفئات التي تريدها وابدأ اللعب مع أصدقائك!
              </p>
              <button
                onClick={handleStartGame}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-lg font-bold py-3 px-8 rounded-2xl shadow-lg transform transition-all duration-200 hover:scale-105 hover:shadow-xl"
              >
                ابدأ اللعب الآن
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  )
}

export default CategoryPreview
