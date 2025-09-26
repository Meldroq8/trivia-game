# 🔧 Clean Up Duplicate Questions

## **Problem:**
You have duplicate questions because the auto-import ran multiple times.

## **Solution:**
Run this script in your browser console to remove duplicates:

### **Step 1: Open Browser Console**
1. Go to https://lamah-357f3.web.app
2. Press F12 to open Developer Tools
3. Go to Console tab

### **Step 2: Run Cleanup Script**
Copy and paste this code:

```javascript
// Clean up duplicate questions
function cleanupDuplicates() {
  const data = JSON.parse(localStorage.getItem('triviaData'))

  if (!data || !data.questions) {
    console.log('No data found')
    return
  }

  let totalRemoved = 0

  Object.keys(data.questions).forEach(categoryId => {
    const questions = data.questions[categoryId]
    const originalCount = questions.length

    // Remove duplicates based on text and answer
    const uniqueQuestions = questions.filter((question, index, array) => {
      return array.findIndex(q =>
        q.text === question.text &&
        q.answer === question.answer
      ) === index
    })

    const removedCount = originalCount - uniqueQuestions.length
    totalRemoved += removedCount

    if (removedCount > 0) {
      console.log(`${categoryId}: Removed ${removedCount} duplicates (${originalCount} → ${uniqueQuestions.length})`)
      data.questions[categoryId] = uniqueQuestions
    }
  })

  if (totalRemoved > 0) {
    localStorage.setItem('triviaData', JSON.stringify(data))
    console.log(`✅ Cleanup complete! Removed ${totalRemoved} duplicate questions total`)
    console.log('Refresh the page to see changes')
  } else {
    console.log('✅ No duplicates found!')
  }

  return totalRemoved
}

// Run the cleanup
cleanupDuplicates()
```

### **Step 3: Refresh Page**
After running the script, refresh the page to see the cleaned data.

## **Alternative: Admin Panel Method**
1. Go to Admin → Questions tab
2. Use the "🗑️ مسح البيانات" button to clear all data
3. Use "📥 تحميل البيانات النموذجية" to reload clean sample data
4. Then use "📥 استيراد جميع الأسئلة" to import CSV data (only once)

## **Prevention:**
The fix I applied will prevent future duplicates by:
- ✅ Checking for existing questions before adding new ones
- ✅ Only auto-importing when you have minimal data (≤4 categories)
- ✅ Better duplicate detection logic

Your data should now be clean and duplicates won't happen again!