# Security Configuration Guide

## 🔒 Environment Variables Setup

### Local Development
1. Copy `.env.example` to `.env`
2. Fill in your Firebase configuration values
3. Never commit `.env` to Git (it's in .gitignore)

### GitHub Actions Deployment
Set up the following secrets in your GitHub repository:

1. Go to: https://github.com/Meldroq8/trivia-game/settings/secrets/actions
2. Add these Repository Secrets:

```
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

## 🛡️ Security Best Practices

### ✅ What's Now Secure:
- Firebase config uses environment variables
- Sensitive data not in Git repository
- GitHub Secrets used for deployment
- Service account files in .gitignore

### ⚠️ Important Notes:
- Firebase API keys are public by design for frontend apps
- Security is enforced by Firestore rules, not API key secrecy
- Only expose minimum required permissions in rules

### 🔥 Firebase Security Rules:
Current rules allow public read access to:
- Questions (for trivia game)
- Categories (for trivia game)

Write access restricted to:
- Admins (questions, categories, settings)
- Moderators (questions, categories)
- Users (their own data only)

## 🚨 If Compromised:
1. Regenerate Firebase API keys in Firebase Console
2. Update GitHub Secrets
3. Review Firestore security rules
4. Check Firebase Authentication settings