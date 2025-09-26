// Temporary script to make a user admin
// Run this once, then delete the file

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDxQ7Js4P_dGKu3r-s_9tZW5WcP8vk5n4I",
  authDomain: "lamah-357f3.firebaseapp.com",
  projectId: "lamah-357f3",
  storageBucket: "lamah-357f3.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function makeUserAdmin(email) {
  try {
    console.log(`Looking for user with email: ${email}`)

    // Query for user by email
    const usersRef = collection(db, 'users')
    const q = query(usersRef, where('email', '==', email))
    const querySnapshot = await getDocs(q)

    if (querySnapshot.empty) {
      console.log(`❌ No user found with email: ${email}`)
      return
    }

    // Update the first matching user
    querySnapshot.forEach(async (userDoc) => {
      const userRef = doc(db, 'users', userDoc.id)
      await updateDoc(userRef, {
        isAdmin: true
      })
      console.log(`✅ User ${email} is now an admin!`)
      console.log(`User ID: ${userDoc.id}`)
    })

  } catch (error) {
    console.error('❌ Error making user admin:', error)
  }
}

// Make f17@live.at an admin
makeUserAdmin('f17@live.at')