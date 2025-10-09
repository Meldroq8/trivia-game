# Secure S3 Upload Setup - Complete Guide

## ✅ What Was Implemented

You now have a **secure server-side S3 upload system** that keeps your AWS credentials safe!

### Architecture

```
Before (INSECURE):
Client (Browser) → S3 (with exposed AWS credentials)
❌ AWS credentials visible in JavaScript
❌ Anyone can steal your keys

After (SECURE):
Client → Firebase Function → S3
✅ AWS credentials on server only
✅ Admin-only access control
✅ No credentials exposed to users
```

---

## 🚀 What's Been Done

### 1. Firebase Functions Created

Three new secure functions have been deployed:

- **`s3Upload`** - Uploads files to S3 (admin-only)
- **`s3Delete`** - Deletes files from S3 (admin-only)
- **`imageProxy`** - Proxies images to bypass CORS (existing)

**Function URLs:**
- Upload: `https://us-central1-lamah-357f3.cloudfunctions.net/s3Upload`
- Delete: `https://us-central1-lamah-357f3.cloudfunctions.net/s3Delete`

### 2. AWS Credentials Secured

Your AWS credentials are now stored as Firebase Secrets:
```
✅ AWS_ACCESS_KEY_ID (secret)
✅ AWS_SECRET_ACCESS_KEY (secret)
```

These are **never exposed** to clients, only accessible by Firebase Functions.

### 3. New Secure Client Service

Created `src/utils/s3UploadSecure.js` - a new client-side service that:
- ✅ Uses Firebase Functions for uploads (no exposed credentials)
- ✅ Requires authentication (admin-only)
- ✅ Supports images, audio, and video
- ✅ Returns CloudFront URLs

---

## 📝 How to Use

### Option 1: Use Secure Service (Recommended for Production)

Import the secure service in your components:

```javascript
import S3UploadServiceSecure from '../utils/s3UploadSecure.js'

// Upload an image
const file = event.target.files[0]
const url = await S3UploadServiceSecure.uploadQuestionImage(file, questionId)
console.log('Uploaded:', url)

// Upload media (audio/video)
const url = await S3UploadServiceSecure.uploadQuestionMedia(file, questionId)

// Delete a file
await S3UploadServiceSecure.deleteFile(url)
```

**Advantages:**
- ✅ Works in production deployments
- ✅ AWS credentials never exposed
- ✅ Admin-only access control
- ✅ Secure by design

### Option 2: Use Old Service (Local Development Only)

The old service (`s3Upload.js`) still works but **only locally** with credentials in `.env`:

```javascript
import S3UploadService from '../utils/s3Upload.js'

// This ONLY works if you have VITE_AWS_* in your .env file
const url = await S3UploadService.uploadQuestionImage(file, questionId)
```

**Note:** This service will show a deprecation warning and won't work in production.

---

## 🔄 Migration Guide

If you have existing code using the old `S3UploadService`, here's how to migrate:

### Before (Insecure):
```javascript
import S3UploadService from '../utils/s3Upload.js'

const url = await S3UploadService.uploadImage(file, 'images/questions', 'image.jpg')
```

### After (Secure):
```javascript
import S3UploadServiceSecure from '../utils/s3UploadSecure.js'

const url = await S3UploadServiceSecure.uploadImage(file, 'images/questions', 'image.jpg')
```

**That's it!** The API is identical, just change the import.

---

## 🧪 Testing

To test the secure upload system:

1. **Make sure you're logged in as admin**
2. **Try uploading an image in the admin panel**
3. **Check browser console** - you should see:
   ```
   Uploading file to S3 via Firebase Function: images/questions/question_xxx.jpg
   Upload completed successfully: https://drcqcbq3desis.cloudfront.net/...
   ```

4. **Verify in S3** - Check your S3 bucket to confirm the file was uploaded

---

## 🔐 Security Benefits

### What's Protected Now:

1. **AWS Credentials** - Stored as Firebase Secrets, never in code
2. **Admin-Only Access** - Functions verify user is admin before uploading
3. **Authentication Required** - Must be logged in with valid Firebase token
4. **No Client-Side Exposure** - Credentials never sent to browser

### What You Can Do Now:

✅ Deploy to GitHub without exposing AWS keys
✅ Add AWS/OpenAI to GitHub Secrets (if needed)
✅ Share your repository publicly
✅ Let users access deployed site safely

---

## 📋 Environment Variables

### For Production (GitHub Secrets):

You **no longer need** to add AWS credentials to GitHub Secrets!

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
VITE_AWS_REGION=me-south-1
VITE_AWS_S3_BUCKET=trivia-game-media-cdn
VITE_AWS_ACCESS_KEY_ID=your_key_here
VITE_AWS_SECRET_ACCESS_KEY=your_secret_here
```

**But you don't need them!** The secure service works without any VITE_AWS_* variables.

---

## 🛠️ Troubleshooting

### "Unauthorized: Missing token"
- **Solution:** Make sure you're logged in before uploading

### "Forbidden: Admin access required"
- **Solution:** Ensure your user has `isAdmin: true` in Firestore

### "AWS credentials not available"
- **Solution:** You're using the old service. Switch to `S3UploadServiceSecure`

### Upload fails with 500 error
- **Solution:** Check Firebase Functions logs:
  ```bash
  firebase functions:log
  ```

---

## 📚 API Reference

### S3UploadServiceSecure

#### `uploadImage(file, folder, fileName?)`
Upload an image file to S3.

**Parameters:**
- `file` (File) - The image file to upload
- `folder` (string) - S3 folder path (e.g., 'images/categories')
- `fileName` (string, optional) - Custom filename

**Returns:** Promise<string> - CloudFront URL

**Example:**
```javascript
const url = await S3UploadServiceSecure.uploadImage(file, 'images/questions')
```

#### `uploadMedia(file, folder, fileName?)`
Upload any media file (image, audio, video).

**Parameters:**
- `file` (File) - The media file
- `folder` (string) - S3 folder path
- `fileName` (string, optional) - Custom filename

**Returns:** Promise<string> - CloudFront URL

#### `uploadCategoryImage(file, categoryId)`
Upload a category image with automatic naming.

**Parameters:**
- `file` (File) - The image file
- `categoryId` (string) - Category ID for naming

**Returns:** Promise<string> - CloudFront URL

#### `uploadQuestionImage(file, questionId?)`
Upload a question image with automatic naming.

**Parameters:**
- `file` (File) - The image file
- `questionId` (string, optional) - Question ID for naming

**Returns:** Promise<string> - CloudFront URL

#### `uploadQuestionMedia(file, questionId?)`
Upload question media (image/audio/video) with automatic naming.

**Parameters:**
- `file` (File) - The media file
- `questionId` (string, optional) - Question ID for naming

**Returns:** Promise<string> - CloudFront URL

#### `deleteFile(fileUrl)`
Delete a file from S3.

**Parameters:**
- `fileUrl` (string) - CloudFront URL of the file

**Returns:** Promise<boolean> - True if deleted

#### `compressImage(file, maxWidth?, quality?)`
Compress an image before uploading.

**Parameters:**
- `file` (File) - The image file
- `maxWidth` (number, optional) - Max width in pixels (default: 800)
- `quality` (number, optional) - JPEG quality 0-1 (default: 0.8)

**Returns:** Promise<File> - Compressed file

---

## 🎯 Next Steps

1. ✅ **Test the secure upload** in your admin panel
2. ✅ **Remove VITE_AWS_* from .env.example** (optional)
3. ✅ **Update components** to use `S3UploadServiceSecure`
4. ✅ **Deploy to production** with `firebase deploy --only functions,hosting`

---

## 🔄 Updating AWS Credentials

If you need to rotate your AWS credentials:

```bash
# Set new credentials as Firebase Secrets
echo "NEW_ACCESS_KEY" | firebase functions:secrets:set AWS_ACCESS_KEY_ID
echo "NEW_SECRET_KEY" | firebase functions:secrets:set AWS_SECRET_ACCESS_KEY

# Redeploy functions
firebase deploy --only functions
```

---

## 📞 Support

If you have issues:
1. Check Firebase Functions logs: `firebase functions:log`
2. Verify secrets are set: `firebase functions:secrets:access AWS_ACCESS_KEY_ID`
3. Check user is admin in Firestore
4. Ensure functions are deployed: `firebase deploy --only functions`

---

**Congratulations! Your S3 uploads are now secure! 🎉**
