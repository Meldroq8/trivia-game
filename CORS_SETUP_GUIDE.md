# Firebase Storage CORS Setup Guide

## Quick Setup (5 minutes)

### Method 1: Using Firebase CLI (Recommended)
```bash
# 1. Install Firebase CLI if not installed
npm install -g firebase-tools

# 2. Login to Firebase
firebase login

# 3. Set your project
firebase use lamah-357f3

# 4. Use Firebase Storage Rules to allow CORS
firebase firestore:rules:get
```

### Method 2: Using Google Cloud Console (Web Interface)
1. Go to: https://console.cloud.google.com/storage/browser
2. Find bucket: `lamah-357f3.appspot.com`
3. Click "Permissions" tab
4. Add CORS configuration

### Method 3: Using gsutil (Command Line)
```bash
# 1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
# 2. Authenticate: gcloud auth login
# 3. Apply CORS: gsutil cors set cors.json gs://lamah-357f3.appspot.com
```

## Alternative: Use CDN Service
- Upload images to Cloudinary, Imgur, or ImageKit
- These services handle CORS automatically
- Better performance with CDN

## Current CORS Config (cors.json)
```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type"]
  }
]
```