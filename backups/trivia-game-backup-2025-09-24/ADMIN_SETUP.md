# 🔐 Admin Access Setup

## 🎯 How Admin Access Works:

### **Who Can See "إعدادات المدير":**
- **Only users with admin role** in their Firebase profile
- **Regular users** won't see the admin button at all

## 👑 **How to Create an Admin User:**

### **Method 1: Pre-defined Admin Email (Current Setup)**
The admin email is currently set to: **`admin@lamah.com`**

1. **Sign up** with email: `admin@lamah.com`
2. **Automatically becomes admin** when account is created
3. **"إعدادات المدير" button** will appear in header

### **Method 2: Change Admin Email (Customize)**
To use a different email as admin:

1. **Edit** `src/firebase/authService.js`
2. **Change line 22** from:
   ```javascript
   const isFirstUser = email === 'admin@lamah.com'
   ```
   To your preferred email:
   ```javascript
   const isFirstUser = email === 'your-email@example.com'
   ```

### **Method 3: Manual Admin Assignment (Advanced)**
To manually make any user an admin:

1. **Go to** [Firebase Console](https://console.firebase.google.com/project/lamah-357f3)
2. **Click** "Firestore Database"
3. **Find** the user's document in the `users` collection
4. **Add field**: `isAdmin: true`
5. **Save** the document

## 🔒 **Security Features:**

### **Admin Button Visibility:**
- **Hidden** from regular users (not just disabled)
- **No way** for non-admins to access admin panel
- **Clean UI** - button only appears for admins

### **Current Admin Protections:**
- ✅ **Button hidden** from non-admins
- ✅ **Admin status** stored securely in Firebase
- ✅ **Role-based access** control

## 🚀 **Quick Admin Setup:**

1. **Create account** with `admin@lamah.com`
2. **Login** to the game
3. **See "إعدادات المدير"** button in header
4. **Access admin panel** to manage questions

That's it! Only admins will see and access the admin features. 🎉