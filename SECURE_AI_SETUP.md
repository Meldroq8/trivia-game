# Secure AI Services Setup - Complete Guide

## ✅ What Was Implemented

You now have a **secure server-side AI services system** that keeps your OpenAI and Google API keys safe!

### Architecture

```
Before (INSECURE):
Client (Browser) → OpenAI/Google APIs (with exposed API keys)
❌ API keys visible in JavaScript
❌ Anyone can steal your keys
❌ Anyone can use up your quota

After (SECURE):
Client → Firebase Functions → OpenAI/Google APIs
✅ API keys on server only
✅ Admin-only access control
✅ No credentials exposed to users
```

---

## 🚀 What's Been Done

### 1. Firebase Functions Created

Two new secure AI functions have been deployed:

- **`aiImproveQuestion`** - Uses OpenAI to improve questions (admin-only)
- **`aiSearchImages`** - Uses Google Custom Search for images (admin-only)

**Function URLs:**
- Improve Question: `https://us-central1-lamah-357f3.cloudfunctions.net/aiImproveQuestion`
- Search Images: `https://us-central1-lamah-357f3.cloudfunctions.net/aiSearchImages`

### 2. API Keys Secured

Your AI API keys are now stored as Firebase Secrets:
```
✅ OPENAI_API_KEY (secret)
✅ GOOGLE_SEARCH_API_KEY (secret)
✅ GOOGLE_SEARCH_ENGINE_ID (secret)
```

These are **never exposed** to clients, only accessible by Firebase Functions.

### 3. New Secure Client Service

Created `src/services/aiServiceSecure.js` - a new client-side service that:
- ✅ Uses Firebase Functions for AI calls (no exposed credentials)
- ✅ Requires authentication (admin-only)
- ✅ Supports question improvement and image search
- ✅ Identical API to old service

### 4. Deprecated Old Service

Updated `src/services/aiService.js` with:
- ⚠️ Deprecation warnings
- ⚠️ Only works locally with .env
- ⚠️ Won't work in production deployments

---

## 📝 How to Use

### Option 1: Use Secure Service (Recommended for Production)

Import the secure service in your components:

```javascript
import AIServiceSecure from '../services/aiServiceSecure.js'

// Improve a question
const result = await AIServiceSecure.improveQuestion(
  questionText,
  answerText,
  categoryName,
  difficulty
)

console.log('Improved:', result.improvedQuestion)
console.log('Suggested difficulty:', result.suggestedDifficulty)

// Search for images
const images = await AIServiceSecure.searchImages('cats playing', 8, 1)
console.log('Found images:', images.length)

// Generate smart search query
const query = await AIServiceSecure.generateImageSearchQuery(
  questionText,
  categoryName,
  correctAnswer,
  'question'
)
```

**Advantages:**
- ✅ Works in production deployments
- ✅ API keys never exposed
- ✅ Admin-only access control
- ✅ Secure by design

### Option 2: Use Old Service (Local Development Only)

The old service (`aiService.js`) still works but **only locally** with credentials in `.env`:

```javascript
import AIService from '../services/aiService.js'

// This ONLY works if you have VITE_OPENAI_* and VITE_GOOGLE_* in .env
const result = await AIService.improveQuestion(questionText, answerText)
```

**Note:** This service will show a deprecation warning and won't work in production.

---

## 🔄 Migration Guide

If you have existing code using the old `AIService`, here's how to migrate:

### Before (Insecure):
```javascript
import AIService from '../services/aiService.js'

const result = await AIService.improveQuestion(questionText, answerText, categoryName, difficulty)
const images = await AIService.searchImages(searchQuery)
```

### After (Secure):
```javascript
import AIServiceSecure from '../services/aiServiceSecure.js'

const result = await AIServiceSecure.improveQuestion(questionText, answerText, categoryName, difficulty)
const images = await AIServiceSecure.searchImages(searchQuery)
```

**That's it!** The API is identical, just change the import.

---

## 🧪 Testing

To test the secure AI services:

1. **Make sure you're logged in as admin**
2. **Try improving a question in the admin panel**
3. **Check browser console** - you should see:
   ```
   Calling secure AI service to improve question...
   Question improvement completed successfully
   ```

4. **Try searching for images**
5. **Check Firebase Functions logs** (optional):
   ```bash
   firebase functions:log
   ```

---

## 🔐 Security Benefits

### What's Protected Now:

1. **OpenAI API Key** - Stored as Firebase Secret, never in code
2. **Google Search API Key** - Stored as Firebase Secret, never in code
3. **Search Engine ID** - Stored as Firebase Secret, never in code
4. **Admin-Only Access** - Functions verify user is admin before processing
5. **Authentication Required** - Must be logged in with valid Firebase token

### What You Can Do Now:

✅ Deploy to GitHub without exposing API keys
✅ Share your repository publicly
✅ Let users access deployed site safely
✅ AI features work in production
✅ No API key abuse by users

---

## 📋 Environment Variables

### For Production (GitHub Secrets):

You **no longer need** to add OpenAI/Google keys to GitHub Secrets!

They're stored in Firebase Secrets instead. You only need:

```yaml
# GitHub Secrets (.github/workflows/simple-deploy.yml)
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

### For Local Development (Optional):

If you want to use the old insecure service locally, keep these in `.env`:

```bash
# .env (local development only)
VITE_OPENAI_API_KEY=your_key_here
VITE_GOOGLE_SEARCH_API_KEY=your_key_here
VITE_GOOGLE_SEARCH_ENGINE_ID=your_id_here
```

**But you don't need them!** The secure service works without any VITE_* variables.

---

## 🛠️ Troubleshooting

### "Unauthorized: Missing token"
- **Solution:** Make sure you're logged in before using AI features

### "Forbidden: Admin access required"
- **Solution:** Ensure your user has `isAdmin: true` in Firestore

### "OpenAI API key not configured"
- **Solution:** You're using the old service. Switch to `AIServiceSecure`

### AI call fails with 500 error
- **Solution:** Check Firebase Functions logs:
  ```bash
  firebase functions:log
  ```

### OpenAI rate limit exceeded
- **Solution:** You've hit your OpenAI usage limits. Check:
  - https://platform.openai.com/usage

---

## 📚 API Reference

### AIServiceSecure

#### `improveQuestion(questionText, answerText?, categoryName?, difficulty?)`
Improve question and answer using OpenAI.

**Parameters:**
- `questionText` (string) - The question to improve
- `answerText` (string, optional) - The answer text
- `categoryName` (string, optional) - Category for context
- `difficulty` (string, optional) - Current difficulty level

**Returns:** Promise<{improvedQuestion, improvedAnswer, suggestedDifficulty, explanation}>

**Example:**
```javascript
const result = await AIServiceSecure.improveQuestion(
  'ما عاصمة فرنسا؟',
  'باريس',
  'جغرافيا',
  'easy'
)
```

#### `searchImages(searchQuery, numResults?, startIndex?)`
Search for images using Google Custom Search.

**Parameters:**
- `searchQuery` (string) - Search query (English works best)
- `numResults` (number, optional) - Number of results (default: 8, max: 10)
- `startIndex` (number, optional) - Pagination start (default: 1)

**Returns:** Promise<Array<{url, thumbnail, title, source, width, height}>>

**Example:**
```javascript
const images = await AIServiceSecure.searchImages('Eiffel Tower', 8, 1)
```

#### `generateImageSearchQuery(questionText, categoryName?, correctAnswer?, imageTarget?)`
Generate optimized search query from question text.

**Parameters:**
- `questionText` (string) - The question text
- `categoryName` (string, optional) - Category for context
- `correctAnswer` (string, optional) - Answer for context
- `imageTarget` (string, optional) - 'question' or 'answer'

**Returns:** Promise<string> - Translated/optimized search query

**Example:**
```javascript
const query = await AIServiceSecure.generateImageSearchQuery(
  'ما عاصمة فرنسا؟',
  'جغرافيا',
  'باريس',
  'answer'
)
// Returns: "Paris cityscape"
```

#### `downloadImage(imageUrl)`
Download an image from URL through CORS proxy.

**Parameters:**
- `imageUrl` (string) - URL of the image

**Returns:** Promise<Blob> - Image blob

---

## 🔄 Updating API Keys

If you need to rotate your API keys:

```bash
# Set new OpenAI key
echo "NEW_OPENAI_KEY" | firebase functions:secrets:set OPENAI_API_KEY

# Set new Google keys
echo "NEW_GOOGLE_KEY" | firebase functions:secrets:set GOOGLE_SEARCH_API_KEY
echo "NEW_ENGINE_ID" | firebase functions:secrets:set GOOGLE_SEARCH_ENGINE_ID

# Redeploy functions
firebase deploy --only functions
```

---

## 💰 API Usage & Costs

### OpenAI Costs (gpt-4o-mini):
- ~$0.15 per 1M input tokens
- ~$0.60 per 1M output tokens
- Each question improvement: ~$0.0001 (very cheap!)

**Recommended:** Set spending limit at https://platform.openai.com/account/billing/limits

### Google Custom Search:
- **Free tier:** 100 queries per day
- **Paid:** $5 per 1,000 additional queries

**Monitor usage:** https://console.cloud.google.com/apis/dashboard

---

## 📞 Support

If you have issues:
1. Check Firebase Functions logs: `firebase functions:log`
2. Verify secrets are set:
   ```bash
   firebase functions:secrets:access OPENAI_API_KEY
   firebase functions:secrets:access GOOGLE_SEARCH_API_KEY
   ```
3. Check user is admin in Firestore
4. Ensure functions are deployed: `firebase deploy --only functions`

---

## 🎯 Complete Security Summary

### ✅ What's Now Secure:

1. **AWS S3 Credentials** → Firebase Secrets (secure)
2. **OpenAI API Key** → Firebase Secrets (secure)
3. **Google Search API Key** → Firebase Secrets (secure)
4. **Google Search Engine ID** → Firebase Secrets (secure)

### ✅ What's Safe to be Public:

- Firebase Configuration (API key, project ID, etc.)
- CloudFront Domain
- Your GitHub repository

### ✅ What Works in Production:

- Firebase Authentication
- Firestore Database
- Firebase Storage (with admin-only write rules)
- **S3 Uploads (via secure proxy)** ✅
- **AI Question Improvement (via secure proxy)** ✅
- **AI Image Search (via secure proxy)** ✅

---

**Congratulations! Your entire application is now secure! 🎉🔒**

Both S3 and AI services use server-side proxies. No credentials are exposed to clients.
