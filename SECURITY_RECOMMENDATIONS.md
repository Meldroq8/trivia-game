# Security Recommendations for Trivia Game

## ⚠️ URGENT ACTIONS REQUIRED

### 1. Rotate AWS Credentials (CRITICAL - Do This Now!)

Your AWS credentials may have been exposed. Follow these steps immediately:

**Step 1: Create New IAM User with Limited Permissions**
```bash
# Create a new IAM user with ONLY S3 permissions for your specific bucket
# DO NOT give it full S3 access!
```

**Recommended IAM Policy (Least Privilege):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::trivia-game-media-cdn",
        "arn:aws:s3:::trivia-game-media-cdn/*"
      ]
    }
  ]
}
```

**Step 2: Update .env with New Credentials**
```bash
# Update these in your .env file:
VITE_AWS_ACCESS_KEY_ID=NEW_KEY_HERE
VITE_AWS_SECRET_ACCESS_KEY=NEW_SECRET_HERE
```

**Step 3: Delete Old IAM User/Keys**
1. Go to AWS IAM Console
2. Find the user with key `AKIA4P24OA5F3XXESN4Q`
3. Delete the access key
4. Optionally delete the entire IAM user if you created a new one

---

### 2. Rotate OpenAI API Key (IMPORTANT)

Your OpenAI API key is also in the .env file:
```
VITE_OPENAI_API_KEY=sk-proj-IvT2hjxzcBug...
```

**Action:**
1. Go to https://platform.openai.com/api-keys
2. Revoke the old key (starting with `sk-proj-IvT2hjxzcBug`)
3. Create a new key
4. Update `.env` with the new key
5. **Set spending limits** on your OpenAI account to prevent abuse

---

### 3. Tighten Firebase Storage Rules (MODERATE PRIORITY)

**Current Issue:**
Your `storage.rules` allows ANY authenticated user to upload/delete files:

```javascript
match /categories/{imageId} {
  allow write, delete: if request.auth != null;  // ❌ Too permissive!
}
```

**Recommended Fix:**

Update `storage.rules`:
```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Allow everyone to read/view images
    match /{allPaths=**} {
      allow read: if true;
    }

    // Only admins can upload/delete category images
    match /categories/{imageId} {
      allow write, delete: if request.auth != null &&
        firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }

    // Only admins can upload/delete question images
    match /questions/{imageId} {
      allow write, delete: if request.auth != null &&
        firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }

    // Audio and video files - admin only
    match /audio/{fileId} {
      allow write, delete: if request.auth != null &&
        firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }

    match /video/{fileId} {
      allow write, delete: if request.auth != null &&
        firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
  }
}
```

**Deploy the fix:**
```bash
firebase deploy --only storage
```

---

### 4. Add Rate Limiting for API Keys (RECOMMENDED)

**For OpenAI:**
- Set monthly spending limit: https://platform.openai.com/account/billing/limits
- Recommended: $10-20/month for your use case

**For Google Custom Search:**
- Already limited to 100 queries/day on free tier
- Monitor usage: https://console.cloud.google.com/apis/dashboard

**For AWS S3:**
- Enable CloudWatch alarms for unexpected S3 API calls
- Set up billing alerts

---

### 5. Additional Security Measures

#### A. Add .env.example Validation
Create a script to ensure no real secrets in .env.example:

```bash
# .env.example should ONLY have placeholders like:
VITE_AWS_ACCESS_KEY_ID=your_access_key_here
VITE_AWS_SECRET_ACCESS_KEY=your_secret_key_here
```

#### B. Git Hooks for Secret Detection
Install git-secrets to prevent accidental commits:

```bash
# Install git-secrets
npm install -g git-secrets

# Set up hooks
git secrets --install
git secrets --register-aws
```

#### C. Enable GitHub Secret Scanning
1. Go to: https://github.com/Meldroq8/trivia-game/settings/security_analysis
2. Enable "Secret scanning"
3. Enable "Push protection" to block commits with secrets

#### D. Review GitHub Secrets
Ensure these are set in your GitHub repository:
- https://github.com/Meldroq8/trivia-game/settings/secrets/actions

Required secrets:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `FIREBASE_SERVICE_ACCOUNT_LAMAH_357F3`

---

## ✅ What's Already Secure

1. ✅ Firebase API Key - Safe to be public (protected by Security Rules)
2. ✅ .env file properly ignored by Git
3. ✅ No secrets in committed code
4. ✅ GitHub Actions use secrets correctly
5. ✅ Firestore Security Rules are well-configured
6. ✅ Console logs stripped in production builds
7. ✅ No API keys in deployed JavaScript bundles

---

## 📋 Security Checklist

- [ ] Rotate AWS IAM credentials
- [ ] Rotate OpenAI API key
- [ ] Update Firebase Storage rules to restrict admin-only writes
- [ ] Deploy new storage rules: `firebase deploy --only storage`
- [ ] Set spending limits on OpenAI account
- [ ] Enable GitHub Secret Scanning
- [ ] Review and verify all GitHub repository secrets
- [ ] Set up AWS CloudWatch billing alarms
- [ ] Install git-secrets for local protection
- [ ] Review .env.example to ensure no real secrets

---

## 🔍 Regular Security Maintenance

### Monthly:
- [ ] Review AWS CloudWatch for unusual S3 activity
- [ ] Check OpenAI API usage and costs
- [ ] Review Firebase Authentication logs

### Quarterly:
- [ ] Rotate all API keys
- [ ] Audit user permissions in Firestore
- [ ] Review GitHub Actions logs for failed deployments

### Yearly:
- [ ] Full security audit of Firestore rules
- [ ] Review all third-party dependencies for vulnerabilities
- [ ] Update all credentials

---

## 📞 In Case of Security Breach

If you suspect credentials have been compromised:

1. **Immediately revoke all API keys** (AWS, OpenAI, Google)
2. **Check AWS CloudWatch** for unauthorized usage
3. **Check Firebase Console** for unauthorized database changes
4. **Review Git history** to see if .env was ever committed
5. **Create new credentials** with least-privilege permissions
6. **Enable 2FA** on all accounts (AWS, OpenAI, Firebase, GitHub)

---

## 🛡️ Best Practices Going Forward

1. **Never share your screen** when .env file is visible
2. **Use separate API keys** for development and production
3. **Regularly rotate credentials** (at least quarterly)
4. **Monitor API usage** to detect anomalies
5. **Keep dependencies updated** to patch vulnerabilities
6. **Use environment-specific configs** (.env.development, .env.production)

---

**Last Updated:** October 9, 2025
**Next Security Review Due:** January 2026
