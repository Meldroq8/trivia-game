import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import loaderService from '../firebase/loaderService'
import { GameDataLoader } from '../utils/gameDataLoader'
import SingleQuestionAdder from '../components/SingleQuestionAdder'

function Loader() {
  const { inviteCode } = useParams()
  const navigate = useNavigate()

  const [isValidating, setIsValidating] = useState(true)
  const [error, setError] = useState(null)
  const [myQuestions, setMyQuestions] = useState([])
  const [categories, setCategories] = useState([])
  const [pendingCategories, setPendingCategories] = useState([])
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 })
  const [editingQuestion, setEditingQuestion] = useState(null)
  const [inviteCodeValid, setInviteCodeValid] = useState(false)

  // Validate invite code on mount (NO AUTH REQUIRED)
  useEffect(() => {
    validateAccess()
  }, [inviteCode])

  const validateAccess = async () => {
    try {
      setIsValidating(true)
      // Validate invite code without user authentication
      await loaderService.validateInviteCodeNoAuth(inviteCode)
      setInviteCodeValid(true)
      await loadData()
    } catch (err) {
      setError(err.message)
      setInviteCodeValid(false)
    } finally {
      setIsValidating(false)
    }
  }

  const loadData = async () => {
    try {
      // Load approved categories
      const gameData = await GameDataLoader.loadGameData()
      setCategories(gameData.categories || [])

      // Load pending categories for this invite code
      const pendingCats = await loaderService.getPendingCategoriesByCode(inviteCode)
      setPendingCategories(pendingCats)

      // Load questions for this invite code
      const questions = await loaderService.getQuestionsByInviteCode(inviteCode)
      setMyQuestions(questions)

      // Calculate stats
      const pending = questions.filter(q => q.status === 'pending').length
      const approved = questions.filter(q => q.status === 'approved').length
      const rejected = questions.filter(q => q.status === 'rejected').length
      setStats({ pending, approved, rejected })
    } catch (err) {
      console.error('Error loading loader data:', err)
      // Don't throw - just log the error and continue with empty data
      setCategories([])
      setPendingCategories([])
      setMyQuestions([])
    }
  }

  const handleQuestionAdded = async (questionData) => {
    try {
      // Add question with invite code instead of user ID
      await loaderService.addPendingQuestionByCode(questionData, inviteCode)
      await loadData() // Reload questions
      return true
    } catch (err) {
      console.error('Error adding question:', err)
      throw err
    }
  }

  const handleEdit = (question) => {
    setEditingQuestion(question)
  }

  const handleSaveEdit = async (questionId, updates) => {
    try {
      await loaderService.updatePendingQuestionByCode(questionId, updates, inviteCode)
      setEditingQuestion(null)
      await loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleDelete = async (questionId) => {
    if (!confirm('هل أنت متأكد من حذف هذا السؤال؟')) return

    try {
      await loaderService.deletePendingQuestionByCode(questionId, inviteCode)
      await loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  if (isValidating) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="text-gray-600">جاري التحقق من رمز الدعوة...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">خطأ</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f2e6]">
      {/* Header */}
      <div className="bg-red-600 text-white p-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">إضافة الأسئلة</h1>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-red-700 hover:bg-red-800 rounded-lg transition-colors"
          >
            الخروج
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-yellow-100 border-2 border-yellow-300 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
            <div className="text-sm text-yellow-600">قيد المراجعة</div>
          </div>
          <div className="bg-green-100 border-2 border-green-300 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{stats.approved}</div>
            <div className="text-sm text-green-600">مقبولة</div>
          </div>
          <div className="bg-red-100 border-2 border-red-300 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-700">{stats.rejected}</div>
            <div className="text-sm text-red-600">مرفوضة</div>
          </div>
        </div>

        {/* Add Question Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">➕ إضافة سؤال جديد</h2>
          {categories.length > 0 || pendingCategories.length > 0 ? (
            <SingleQuestionAdder
              categories={categories}
              pendingCategories={pendingCategories}
              onQuestionAdded={handleQuestionAdded}
              inviteCode={inviteCode}
            />
          ) : (
            <p className="text-gray-500 text-center py-8">جاري تحميل الفئات...</p>
          )}
        </div>

        {/* My Questions */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">📝 أسئلتي</h2>

          {myQuestions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">لا توجد أسئلة بعد</p>
          ) : (
            <div className="space-y-4">
              {myQuestions.map((question) => (
                <div
                  key={question.id}
                  className={`border-2 rounded-lg p-4 ${
                    question.status === 'pending' ? 'border-yellow-300 bg-yellow-50' :
                    question.status === 'approved' ? 'border-green-300 bg-green-50' :
                    'border-red-300 bg-red-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-bold mb-2 ${
                        question.status === 'pending' ? 'bg-yellow-500 text-white' :
                        question.status === 'approved' ? 'bg-green-500 text-white' :
                        'bg-red-500 text-white'
                      }`}>
                        {question.status === 'pending' ? 'قيد المراجعة' :
                         question.status === 'approved' ? 'مقبول' : 'مرفوض'}
                      </span>
                      <p className="font-bold text-gray-800">{question.question}</p>
                      <p className="text-sm text-gray-600">النوع: {question.type}</p>
                    </div>
                    {question.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(question)}
                          className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDelete(question.id)}
                          className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm"
                        >
                          حذف
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">تعديل السؤال</h3>
            <SingleQuestionAdder
              categories={categories}
              pendingCategories={pendingCategories}
              initialQuestion={editingQuestion}
              onQuestionAdded={async (updates) => {
                await handleSaveEdit(editingQuestion.id, updates)
                return true
              }}
              inviteCode={inviteCode}
            />
            <button
              onClick={() => setEditingQuestion(null)}
              className="mt-4 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Loader
