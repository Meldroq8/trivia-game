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
REACT_APP_FIREBASE_API_KEY=AIzaSyCt9vd2uOISntPQ4EM6o1K9_iiaDeiFtJs
REACT_APP_FIREBASE_AUTH_DOMAIN=lamah-357f3.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=lamah-357f3
REACT_APP_FIREBASE_STORAGE_BUCKET=lamah-357f3.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=482087427045
REACT_APP_FIREBASE_APP_ID=1:482087427045:web:9120b8ed276c8b84ed6d0c
REACT_APP_FIREBASE_MEASUREMENT_ID=G-V3MBTTVH14
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