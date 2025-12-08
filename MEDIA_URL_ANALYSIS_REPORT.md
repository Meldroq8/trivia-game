# Firebase Media URL Corruption Analysis Report

**Generated:** 2025-11-19
**Database:** lamah-357f3 (Firebase)
**CDN:** drcqcbq3desis.cloudfront.net
**S3 Bucket:** trivia-game-media-cdn

---

## Executive Summary

This report identifies critical issues with media file management in the Firebase database where non-unique filenames are causing media files to be overwritten and shared incorrectly across multiple questions.

### Critical Findings

- **Total Questions:** 4,194
- **Questions with Media URLs:** 413 (9.8%)
- **Questions with Non-Unique Filenames:** 412 (99.8% of media questions)
- **Shared/Duplicate Media URLs:** 14 files shared across multiple questions

### Severity Assessment

**CRITICAL** - 99.8% of questions with media have non-timestamped filenames, making them vulnerable to overwrites. 14 media files are already confirmed to be shared across multiple questions with different content expectations.

---

## Problem Description

### Root Cause
Media files are being uploaded with generic, non-unique filenames like:
- `q7.mp3`
- `q32.mp3`
- `v31.mp4`

When a new question is imported with the same filename, it overwrites the existing file in S3/CloudFront, causing all questions pointing to that URL to suddenly play the wrong media.

### Timestamp Pattern
Proper filenames should include a 13-digit Unix timestamp to ensure uniqueness:
- **Correct:** `q7_1763532560254.mp3`
- **Incorrect:** `q7.mp3`

---

## Category Breakdown

### Unknown Category
- Total Questions: 4,192
- Questions with Media: 411
- Non-Unique Filenames: 410
- **Corruption Rate: 99.8%**

### Foreign Songs Category (اغاني اجنبية)
- Total Questions: 2
- Questions with Media: 2
- Non-Unique Filenames: 2
- **Corruption Rate: 100.0%**

---

## Shared Media Files (Confirmed Duplicates)

The following 14 media files are currently shared across multiple questions, meaning different questions expect different audio/video but point to the same URL:

### 1. q32.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q32.mp3`
**Shared by 2 questions:**
- `4n89vEaNCbvMPpJNjnLQ` - من أي مسلسل هذا الصوت؟
- `pS1VXyfEIAodiUsRBWxB` - من غنى هذه الأغنية؟

### 2. q7.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q7.mp3`
**Shared by 2 questions:**
- `8Oajr7Bj5CXbWStWaXqx` - من أي مسلسل هذا الصوت؟
- `94AN0R2PYT01VRBBsg5H` - من غنى هذه الأغنية؟

### 3. q74.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q74.mp3`
**Shared by 2 questions:**
- `A3zz3e96P1VrKG37LbLO` - ما أسم هذه الأغنية من موسيقاها؟
- `HoNeudsNlyJ3gHEtHiDN` - من أي مسلسل هذا الصوت؟

### 4. q51.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q51.mp3`
**Shared by 2 questions:**
- `CDYWRyY9mFs106DOkA11` - ما اسم هذه الأغنية؟
- `JBOwjd4msRygFifKkUuL` - من أي سلسلة افلام هذا الصوت؟

### 5. q39.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q39.mp3`
**Shared by 2 questions:**
- `KxE8ZCwoVr0E6mFWAHzB` - من غنى هذه الأغنية؟
- `sbAO4c1YiA1wgzJvhA58` - من أي مسلسل هذا الصوت؟

### 6. q46.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q46.mp3`
**Shared by 2 questions:**
- `Mm3MWRLAG5WCgcngEXgf` - من أي سلسلة افلام هذا الصوت؟
- `hY5VU635kBT3dKwNMx5m` - ما اسم هذه الأغنية؟

### 7. q17.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q17.mp3`
**Shared by 2 questions:**
- `MxYQ1hLu9iopCgYbHljY` - ما اسم هذه الأغنية؟
- `RAUkCddcZRo4qfB8LTp4` - ما اسم هذا المسلسل؟

### 8. q4.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q4.mp3`
**Shared by 2 questions:**
- `Nak8jK3gySxexU6E07yH` - من غنى هذه الأغنية؟
- `lQlhIMKW4Bkt72unbBMD` - من أي مسلسل هذا الصوت؟

### 9. q11.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q11.mp3`
**Shared by 2 questions:**
- `ObGedfdBGFCUk7Nnqc6I` - من أي مسلسل هذا الصوت؟
- `j65yk7BbOT7amcCdjDKP` - ما اسم هذه الأغنية؟

### 10. q61.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q61.mp3`
**Shared by 2 questions:**
- `OgiJBHqww0JDSSiysmMn` - من غنى هذه الأغنية من لحنها؟
- `nTeYvQ39j51MKn0M7ovN` - من أي مسلسل هذا الصوت؟

### 11. q83.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q83.mp3`
**Shared by 2 questions:**
- `YIFwsoTqU4v9EtSpKFYm` - من أي مسلسل هذه الصوت؟
- `lniCwJdQfTkQHf6lxmdU` - من غنى هذه الأغنية من موسيقاها؟

### 12. q35.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q35.mp3`
**Shared by 2 questions:**
- `eEk5Yx03ojMIEZLBc0cs` - من أي مسلسل هذا الصوت؟
- `k0yjP4DedxqoFHnqq4KJ` - من غنى هذه الأغنية؟

### 13. q12.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q12.mp3`
**Shared by 2 questions:**
- `hN3SuSDYozLmttpbubLo` - ما اسم هذه الأغنية من موسيقاها؟
- `yezDsGoI9CdyUfN4s1bT` - من أي مسلسل هذا الصوت؟

### 14. q64.mp3
**URL:** `https://drcqcbq3desis.cloudfront.net/audio/q64.mp3`
**Shared by 2 questions:**
- `sVt2knmVKv31p659rDhJ` - من غنى هذه الأغنية من موسيقاها؟
- `tC4CjRNEFKm1DX28Atgs` - من أي مسلسل هذا الصوت؟

---

## Affected Question IDs Summary

**Total Affected Questions:** 412

All 412 question IDs with non-unique media filenames are at risk of corruption. See the full analysis output for the complete list.

Sample of affected question IDs:
```
02d3Midv3R9mfos8aFQG, 0EUX8oSCXmmWqpFg7tSa, 0Iy2fiD90J0Z3tDI78Dx,
0JohDuF4GF3dxn52F3To, 0LkrOoBl28z2UIjLDl8U, 0QQuVS3imvnBvCoH5oK4,
0QsSoHbY18i0a1n7P2Zi, 0TAyPFXzWSZYcDoYeEnH, 0YAZfmdM1tXXWl9o8au6,
0YAqTcg3WA8007X5phsl, 0nYFWjqzZKpZA5G9ZSOn, 0yDfPSfruYtvIiJugVR0,
...
```

---

## Additional Issues Found

### Invalid URL Patterns
Some questions have malformed URLs that don't follow the CloudFront CDN pattern:

1. **Local file paths** (Foreign Songs category):
   - `images/songseng/In_the_End_Linkin_Park.mp3`
   - `images/songseng/Creep_Radiohead.mp3`
   - Multiple other songs in this pattern

2. **Relative paths** (Resident Evil questions):
   - `/images/questions/residentevil/audio/re_oq6.mp3.mp3`
   - `/images/questions/residentevil/audio/re_oq2.mp3.mp3`

3. **Wrong folder placement**:
   - Video files in audio folder: `audio/v31.mp4`, `audio/v4.mp4`, etc.
   - Multiple instances where video files are stored in the `/audio/` directory

---

## Impact Analysis

### User Experience Impact
- Players hear wrong audio when playing questions
- Wrong video plays for video-based questions
- Inconsistent quiz experience
- Loss of trust in application quality

### Data Integrity
- 99.8% of media questions are vulnerable
- Each new import could corrupt existing questions
- No way to track which version of a file should belong to which question
- Historical data may already be corrupted beyond recovery

### Business Risk
- Cannot reliably add new questions without risk
- Existing question bank integrity is compromised
- Manual review of 412 questions would be extremely time-consuming

---

## Recommended Fix Strategy

### Phase 1: Immediate Prevention (Priority: CRITICAL)

1. **Update Upload Functions**
   - Modify all media upload code to REQUIRE timestamp-based filenames
   - Format: `<basename>_<timestamp>.<extension>`
   - Reject any uploads without proper timestamp

2. **Add Validation**
   - Add pre-upload validation to check for existing filenames
   - Warn administrators if attempting to upload a non-unique filename

### Phase 2: Data Remediation (Priority: HIGH)

#### Option A: Batch Re-upload (Recommended)
For each affected question:
1. Download the current media file from CDN
2. Re-upload with timestamp-based filename
3. Update Firebase document with new URL
4. Verify media plays correctly

**Pros:** Clean solution, ensures all media is unique
**Cons:** Requires original media files, time-consuming

#### Option B: S3 Copy and Rename
For existing S3 files:
1. Use AWS S3 copy operation to duplicate files with timestamps
2. Update Firebase documents in batch
3. Keep old files for 30 days as backup

**Pros:** Faster, uses existing files
**Cons:** May perpetuate wrong file associations

#### Option C: Manual Review and Fix
For the 14 confirmed duplicates:
1. Manually review each question
2. Determine which media is correct for each
3. Upload correct files with unique names
4. Update Firebase references

**Pros:** Most accurate for confirmed duplicates
**Cons:** Doesn't fix the 398 other vulnerable questions

### Phase 3: Verification (Priority: MEDIUM)

1. Re-run this analysis script after fixes
2. Verify zero duplicate URLs remain
3. Spot-check questions to ensure correct media plays
4. Monitor error logs for playback failures

### Phase 4: Prevention Systems (Priority: MEDIUM)

1. **Automated Monitoring**
   - Schedule weekly scans for non-unique filenames
   - Alert when new non-timestamped files are detected

2. **Import Process Updates**
   - Update question import tools to enforce timestamp requirement
   - Add validation step before committing to database

3. **Documentation**
   - Document the timestamp filename requirement
   - Create guidelines for future developers

---

## Technical Implementation Details

### Timestamp Format
```javascript
const timestamp = Date.now(); // Returns 13-digit Unix timestamp
const filename = `${basename}_${timestamp}.${extension}`;
// Example: q7_1763532560254.mp3
```

### Validation Regex
```javascript
const hasTimestamp = /_\d{13}/.test(filename);
```

### Files to Update
Based on codebase analysis, these files likely handle media uploads:
- Upload functions in Cloud Functions
- Admin question creation forms
- Bulk import scripts
- Direct S3 upload implementations

---

## Next Steps

1. **Review this report** with development team
2. **Prioritize remediation** approach (Option A, B, or C)
3. **Implement prevention** in upload functions immediately
4. **Schedule remediation** work for affected questions
5. **Set up monitoring** to prevent future occurrences

---

## Contact & Resources

- **Analysis Script:** `scripts/analyze-media-urls.js`
- **Firebase Project:** lamah-357f3
- **S3 Bucket:** trivia-game-media-cdn (me-south-1)
- **CloudFront:** drcqcbq3desis.cloudfront.net

---

**Report End**
