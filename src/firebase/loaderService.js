import { devLog, devWarn, prodError } from "../utils/devLog"
import { db } from './config'
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore'

class LoaderService {
  // Generate unique invite code
  generateInviteCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase()
  }

  // Admin: Create invite code
  async createInviteCode(adminId) {
    const code = this.generateInviteCode()
    const inviteRef = doc(db, 'invite_codes', code)

    await setDoc(inviteRef, {
      code,
      usedBy: null,
      createdBy: adminId,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) // 30 days
    })

    return code
  }

  // Loader: Validate invite code WITHOUT authentication (for link-based access)
  async validateInviteCodeNoAuth(code) {
    const inviteRef = doc(db, 'invite_codes', code)
    const inviteDoc = await getDoc(inviteRef)

    if (!inviteDoc.exists()) {
      throw new Error('رمز الدعوة غير صالح')
    }

    const data = inviteDoc.data()

    if (data.revoked) {
      throw new Error('رمز الدعوة تم إلغاؤه من قبل المدير')
    }

    if (data.expiresAt.toDate() < new Date()) {
      throw new Error('رمز الدعوة منتهي الصلاحية')
    }

    return true
  }

  // Loader: Validate and use invite code (AUTH-BASED - kept for backward compatibility)
  async validateInviteCode(code, userId) {
    const inviteRef = doc(db, 'invite_codes', code)
    const inviteDoc = await getDoc(inviteRef)

    if (!inviteDoc.exists()) {
      throw new Error('Invalid invite code')
    }

    const data = inviteDoc.data()

    if (data.usedBy) {
      // Check if already used by this user
      if (data.usedBy === userId) {
        return true // Already registered with this code
      }
      throw new Error('Invite code already used')
    }

    if (data.expiresAt.toDate() < new Date()) {
      throw new Error('Invite code expired')
    }

    // Mark code as used and create user role
    await updateDoc(inviteRef, { usedBy: userId })
    await this.setUserRole(userId, 'loader', code)

    return true
  }

  // Set user role
  async setUserRole(userId, role, inviteCode = null) {
    const roleRef = doc(db, 'user_roles', userId)
    await setDoc(roleRef, {
      role,
      inviteCode,
      createdAt: serverTimestamp()
    })
  }

  // Get user role
  async getUserRole(userId) {
    const roleRef = doc(db, 'user_roles', userId)
    const roleDoc = await getDoc(roleRef)

    if (!roleDoc.exists()) {
      return null
    }

    return roleDoc.data().role
  }

  // Loader: Add pending question BY INVITE CODE (no auth required)
  async addPendingQuestionByCode(questionData, inviteCode) {
    const pendingRef = doc(collection(db, 'pending_questions'))

    await setDoc(pendingRef, {
      ...questionData,
      status: 'pending',
      createdBy: inviteCode, // Use invite code instead of user ID
      inviteCode: inviteCode, // Store invite code for querying
      createdAt: serverTimestamp(),
      reviewedBy: null,
      reviewedAt: null
    })

    return pendingRef.id
  }

  // Loader: Add pending question BY USER ID (auth-based - kept for backward compatibility)
  async addPendingQuestion(questionData, userId) {
    const pendingRef = doc(collection(db, 'pending_questions'))

    await setDoc(pendingRef, {
      ...questionData,
      status: 'pending',
      createdBy: userId,
      createdAt: serverTimestamp(),
      reviewedBy: null,
      reviewedAt: null
    })

    return pendingRef.id
  }

  // Loader: Get questions BY INVITE CODE (no auth required)
  async getQuestionsByInviteCode(inviteCode) {
    try {
      const q = query(
        collection(db, 'pending_questions'),
        where('inviteCode', '==', inviteCode),
        orderBy('createdAt', 'desc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    } catch (error) {
      // If index doesn't exist yet, fall back to query without orderBy
      devWarn('Firestore index may be required. Using fallback query without sorting.')
      const q = query(
        collection(db, 'pending_questions'),
        where('inviteCode', '==', inviteCode)
      )

      const snapshot = await getDocs(q)
      const questions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Sort in memory
      return questions.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0
        const bTime = b.createdAt?.toMillis?.() || 0
        return bTime - aTime
      })
    }
  }

  // Loader: Get own pending questions BY USER ID (auth-based - kept for backward compatibility)
  async getLoaderQuestions(userId) {
    const q = query(
      collection(db, 'pending_questions'),
      where('createdBy', '==', userId),
      orderBy('createdAt', 'desc')
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
  }

  // Loader: Update pending question BY INVITE CODE (no auth required)
  async updatePendingQuestionByCode(questionId, updates, inviteCode) {
    const questionRef = doc(db, 'pending_questions', questionId)
    const questionDoc = await getDoc(questionRef)

    if (!questionDoc.exists()) {
      throw new Error('السؤال غير موجود')
    }

    const data = questionDoc.data()

    if (data.inviteCode !== inviteCode) {
      throw new Error('غير مصرح لك بتعديل هذا السؤال')
    }

    if (data.status !== 'pending') {
      throw new Error('لا يمكن تعديل الأسئلة المقبولة أو المرفوضة')
    }

    await updateDoc(questionRef, updates)
  }

  // Loader: Delete pending question BY INVITE CODE (no auth required)
  async deletePendingQuestionByCode(questionId, inviteCode) {
    const questionRef = doc(db, 'pending_questions', questionId)
    const questionDoc = await getDoc(questionRef)

    if (!questionDoc.exists()) {
      throw new Error('السؤال غير موجود')
    }

    const data = questionDoc.data()

    if (data.inviteCode !== inviteCode) {
      throw new Error('غير مصرح لك بحذف هذا السؤال')
    }

    if (data.status !== 'pending') {
      throw new Error('لا يمكن حذف الأسئلة المقبولة أو المرفوضة')
    }

    await deleteDoc(questionRef)
  }

  // Loader: Update pending question BY USER ID (auth-based - kept for backward compatibility)
  async updatePendingQuestion(questionId, updates, userId) {
    const questionRef = doc(db, 'pending_questions', questionId)
    const questionDoc = await getDoc(questionRef)

    if (!questionDoc.exists()) {
      throw new Error('Question not found')
    }

    const data = questionDoc.data()

    if (data.createdBy !== userId) {
      throw new Error('Not authorized')
    }

    if (data.status !== 'pending') {
      throw new Error('Cannot edit approved/rejected questions')
    }

    await updateDoc(questionRef, updates)
  }

  // Loader: Delete pending question BY USER ID (auth-based - kept for backward compatibility)
  async deletePendingQuestion(questionId, userId) {
    const questionRef = doc(db, 'pending_questions', questionId)
    const questionDoc = await getDoc(questionRef)

    if (!questionDoc.exists()) {
      throw new Error('Question not found')
    }

    const data = questionDoc.data()

    if (data.createdBy !== userId) {
      throw new Error('Not authorized')
    }

    if (data.status !== 'pending') {
      throw new Error('Cannot delete approved/rejected questions')
    }

    await deleteDoc(questionRef)
  }

  // Admin: Get all pending questions
  async getAllPendingQuestions() {
    const q = query(
      collection(db, 'pending_questions'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
  }

  // Admin: Get pending questions count
  async getPendingCount() {
    const q = query(
      collection(db, 'pending_questions'),
      where('status', '==', 'pending')
    )

    const snapshot = await getDocs(q)
    return snapshot.size
  }

  // Admin: Approve question (move to main questions collection)
  async approveQuestion(questionId, adminId, categoryId) {
    const pendingRef = doc(db, 'pending_questions', questionId)
    const pendingDoc = await getDoc(pendingRef)

    if (!pendingDoc.exists()) {
      throw new Error('Question not found')
    }

    const questionData = pendingDoc.data()

    // Add to main questions collection (flat structure with categoryId field)
    const questionRef = doc(collection(db, 'questions'))

    // Build the question document with proper field mapping
    const newQuestion = {
      categoryId: categoryId, // Store category ID as a field
      type: questionData.type || 'text',
      question: questionData.question || questionData.text,
      answer: questionData.answer,
      difficulty: questionData.difficulty || 'easy',
      createdAt: serverTimestamp()
    }

    // Add options if they exist
    if (questionData.options && questionData.options.length > 0) {
      newQuestion.options = questionData.options
    }

    // Add media URLs if they exist
    if (questionData.imageUrl) newQuestion.imageUrl = questionData.imageUrl
    if (questionData.audioUrl) newQuestion.audioUrl = questionData.audioUrl
    if (questionData.videoUrl) newQuestion.videoUrl = questionData.videoUrl
    if (questionData.answerImageUrl) newQuestion.answerImageUrl = questionData.answerImageUrl
    if (questionData.answerAudioUrl) newQuestion.answerAudioUrl = questionData.answerAudioUrl
    if (questionData.answerVideoUrl) newQuestion.answerVideoUrl = questionData.answerVideoUrl

    await setDoc(questionRef, newQuestion)

    // Update pending question status
    await updateDoc(pendingRef, {
      status: 'approved',
      reviewedBy: adminId,
      reviewedAt: serverTimestamp()
    })

    return questionRef.id
  }

  // Admin: Reject question
  async rejectQuestion(questionId, adminId) {
    const pendingRef = doc(db, 'pending_questions', questionId)

    await updateDoc(pendingRef, {
      status: 'rejected',
      reviewedBy: adminId,
      reviewedAt: serverTimestamp()
    })
  }

  // Admin: Get all invite codes
  async getAllInviteCodes() {
    const snapshot = await getDocs(collection(db, 'invite_codes'))
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
  }

  // Admin: Revoke/disable an invite code
  async revokeInviteCode(codeId) {
    const inviteRef = doc(db, 'invite_codes', codeId)
    await updateDoc(inviteRef, {
      revoked: true,
      revokedAt: serverTimestamp()
    })
  }
}

export default new LoaderService()
