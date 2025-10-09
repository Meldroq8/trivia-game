# AI Enhancement Features Setup Guide

This document explains how to set up and use the AI-powered question enhancement features.

## Features

### 1. **Question Text Improvement** ✨
- Uses ChatGPT to rewrite and improve question text
- Suggests better phrasing and clarity
- Recommends appropriate difficulty level
- Works in Arabic

### 2. **Image Search** 🖼️
- Searches Google Images based on question content
- Shows 8 relevant image results
- Click to select an image
- **Automatically downloads and uploads to your S3/CloudFront**
- No manual image handling needed!

## Setup Instructions

### Step 1: Get OpenAI API Key (for ChatGPT)

1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to https://platform.openai.com/api-keys
4. Click "Create new secret key"
5. Copy the key (starts with `sk-...`)
6. Add to your `.env` file:
   ```
   VITE_OPENAI_API_KEY=sk-your-key-here
   ```

**Cost**: Very cheap! ~$0.0001 per question improvement (GPT-4o-mini)

### Step 2: Get Google Custom Search API Key

1. Go to https://console.cloud.google.com/
2. Create a new project (or select existing)
3. Enable "Custom Search API":
   - Go to "APIs & Services" > "Library"
   - Search for "Custom Search API"
   - Click "Enable"
4. Create credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the key
5. Add to your `.env` file:
   ```
   VITE_GOOGLE_SEARCH_API_KEY=your-google-api-key-here
   ```

**Cost**: Free tier includes 100 searches/day

### Step 3: Create Google Custom Search Engine

1. Go to https://programmablesearchengine.google.com/
2. Click "Add" or "Create new search engine"
3. Settings:
   - **Sites to search**: "Search the entire web"
   - **Name**: "Trivia Game Image Search"
   - **Language**: Arabic (or any)
4. After creation, click "Control Panel"
5. Turn ON "Image Search"
6. Turn ON "Search the entire web"
7. Copy the "Search engine ID" (looks like: `a12b3c4d5e6f7g8h9`)
8. Add to your `.env` file:
   ```
   VITE_GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id-here
   ```

### Step 4: Update Your .env File

Your `.env` file should now have:

```env
# AI Features
VITE_OPENAI_API_KEY=sk-...
VITE_GOOGLE_SEARCH_API_KEY=...
VITE_GOOGLE_SEARCH_ENGINE_ID=...

# AWS (your existing config)
VITE_AWS_REGION=...
VITE_AWS_ACCESS_KEY_ID=...
VITE_AWS_SECRET_ACCESS_KEY=...
VITE_S3_BUCKET_NAME=...
VITE_CLOUDFRONT_URL=...
```

### Step 5: Restart Dev Server

```bash
npm run dev
```

## How to Use

### In Admin Panel (Question Editor)

1. **Write your question** in the question text field
2. **Click the "✨ AI" button** next to the question text
3. **Modal opens with 2 tabs**:

#### Tab 1: تحسين النص (Improve Text)
- Shows your original question
- Click "تحسين السؤال" (Improve Question)
- AI suggests improved version
- Shows explanation of why it was improved
- May suggest different difficulty level
- Click "تطبيق التحسينات" (Apply Improvements) to accept

#### Tab 2: البحث عن صور (Search Images)
- **Choose where to apply the image**: Select "السؤال نفسه" (Question) or a specific answer from dropdown
- Enter custom search query (or leave empty to use question text)
- Click "🔍 بحث" (Search)
- AI generates optimized English search query (includes correct answer for better relevance)
- Shows 8 relevant images from Google
- **Click any image to select it**
- **Image is automatically downloaded via CORS proxy and uploaded to CloudFront**
- Image URL is applied to selected target (question or answer)
- Modal closes after successful upload

### Important Notes

1. **All existing features remain unchanged**:
   - Manual image upload still works
   - Inline editing still works
   - All media upload functions remain

2. **AI features are optional**:
   - You can skip AI and add questions normally
   - No requirement to use AI

3. **Images are safe**:
   - Selected images are downloaded from Google
   - Re-uploaded to YOUR S3/CloudFront
   - Stored permanently in your infrastructure
   - No external dependencies after upload

4. **Error handling**:
   - If API keys are missing, you'll see clear error messages
   - If search finds no results, you'll be notified
   - If upload fails, you can retry

## Cost Breakdown

### OpenAI (ChatGPT)
- **Model**: GPT-4o-mini
- **Cost**: ~$0.15 per 1M input tokens
- **Per question**: ~$0.0001 (practically free)
- **100 questions**: ~$0.01

### Google Custom Search
- **Free tier**: 100 searches/day
- **Paid tier**: $5 per 1,000 queries after free tier
- **Recommendation**: Free tier is usually enough

### Total Cost
- **Very minimal** - likely under $1/month for typical usage

## Troubleshooting

### "OpenAI API key not configured"
- Make sure you added `VITE_OPENAI_API_KEY` to `.env`
- Make sure the key starts with `sk-`
- Restart dev server after adding

### "Google Search API not configured"
- Make sure you added both `VITE_GOOGLE_SEARCH_API_KEY` and `VITE_GOOGLE_SEARCH_ENGINE_ID`
- Verify Custom Search API is enabled in Google Cloud Console
- Restart dev server

### "لم يتم العثور على صور" (No images found)
- Try different search keywords
- Check if your search engine has "Search the entire web" enabled
- Verify "Image Search" is enabled in search engine settings

### Image upload fails
- Check S3 credentials are correct
- Verify CORS is configured on S3 bucket
- Check browser console for detailed error
- If CORS errors persist, the system uses a proxy service (allorigins.win)

### CORS errors when downloading images
- The system automatically uses a CORS proxy service to download external images
- If proxy fails, try selecting a different image
- Some websites may block automated downloads

## Security Notes

1. **Never commit `.env` file** - it contains your API keys
2. **Use `.env.example`** as a template
3. **API keys are only in frontend** - consider moving to backend/Firebase Functions for production
4. **Rate limiting** - Google has daily limits on free tier

## Alternative: Backend Implementation

For better security in production, consider:
1. Creating Firebase Cloud Functions
2. Calling OpenAI/Google APIs from the backend
3. Exposing secure endpoints to your frontend
4. This keeps API keys server-side only

Contact developer for backend implementation if needed.
