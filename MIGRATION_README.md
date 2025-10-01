# Database URL Migration Guide

This guide explains how to migrate local image paths in your Firestore database to use CloudFront URLs.

## Overview

The migration script will:
- ✅ Convert local paths (e.g., `images/logo.jpg`) to CloudFront URLs (e.g., `https://drcqcbq3desis.cloudfront.net/images/logo.jpg`)
- ✅ Update the `questions` collection image URLs
- ✅ Update the `categories` collection image URLs
- ✅ Preserve existing CloudFront and Firebase Storage URLs (no changes)

## Prerequisites

1. **Service Account File**: You need a Firebase service account JSON file with admin privileges
2. **Firebase Admin SDK**: Already installed in this project
3. **Node.js**: Compatible with ES modules (already configured)

## Steps to Run Migration

### 1. Place Service Account File

Save your Firebase service account JSON file as `service-account.json` in the project root directory:

```
trivia-game/
├── src/
├── public/
├── service-account.json  ← Place your file here
├── migrate-database-urls.js
└── package.json
```

### 2. Run the Migration

```bash
# Navigate to project directory
cd C:\Users\f17\Downloads\Jm3a\trivia-game

# Run the migration script
node migrate-database-urls.js
```

## Expected Output

```
✅ Firebase Admin SDK initialized successfully
🚀 Starting database URL migration...
🌐 CloudFront domain: drcqcbq3desis.cloudfront.net

🔄 Migrating questions collection...
📝 Updating question: q1_12345
  Converting: images/questions/question1.jpg → https://drcqcbq3desis.cloudfront.net/images/questions/question1.jpg
📝 Updating question: q2_67890
  Converting: images/questions/question2.jpg → https://drcqcbq3desis.cloudfront.net/images/questions/question2.jpg
✅ Questions migration complete. Updated 25 documents.

🔄 Migrating categories collection...
📝 Updating category: cat_sports
  Converting: images/categories/sports.jpg → https://drcqcbq3desis.cloudfront.net/images/categories/sports.jpg
✅ Categories migration complete. Updated 8 documents.

🎉 Migration completed successfully!
✨ All done!
```

## What Gets Updated

The script looks for and converts these image URL fields:

**Questions Collection:**
- `imageUrl`
- `image`
- `imagePath`
- `answerImageUrl`
- `answerImage`
- `answerImagePath`
- `question.imageUrl`
- `question.image`
- `question.imagePath`
- `answer.imageUrl`
- `answer.image`
- `answer.imagePath`

**Categories Collection:**
- `imageUrl`
- `image`
- `imagePath`

## Safety Features

- ✅ **Read-only preview**: The script shows what will be changed before making updates
- ✅ **Selective updates**: Only converts local paths, preserves existing URLs
- ✅ **Error handling**: Continues processing if individual documents fail
- ✅ **Admin privileges**: Uses service account to bypass security rules

## Troubleshooting

### Error: "service-account.json not found"
- Ensure the service account file is named exactly `service-account.json`
- Place it in the root directory (same level as `package.json`)

### Error: "Permission denied"
- Verify your service account has Firestore admin permissions
- Check that the service account is for the correct Firebase project

### Error: "Firebase Admin SDK initialization failed"
- Verify the service account JSON file is valid
- Ensure the project ID in the service account matches your Firebase project

## Rollback (if needed)

If you need to rollback changes:
1. Keep a backup of your Firestore data before running the migration
2. Use Firebase console to restore from backup if necessary
3. The original local paths are preserved in CloudFront URLs, so manual rollback is possible

## After Migration

Once the migration is complete:
- All images will load from CloudFront for better performance
- Database URLs will be consistent with frontend URL handling
- No changes needed to your application code
- Delete the `service-account.json` file for security

## Security Note

⚠️ **Important**: Remove the `service-account.json` file after migration to prevent unauthorized access to your Firebase project.

```bash
# After successful migration
del service-account.json
```