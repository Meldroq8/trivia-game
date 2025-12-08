# Media URL Issues - Quick Reference

**Analysis Date:** 2025-11-19
**Database:** Firebase lamah-357f3
**S3 Bucket:** trivia-game-media-cdn

---

## The Numbers

| Metric | Value | Status |
|--------|-------|--------|
| Total Questions | 4,194 | ✅ |
| Questions with Media | 413 | ℹ️ |
| Non-Unique Filenames | 412 | ❌ |
| Corruption Rate | 99.8% | 🚨 |
| Confirmed Duplicates | 14 files | ⚠️ |
| Questions Sharing Files | 28 questions | ⚠️ |

---

## S3 Bucket Status

### Audio Folder
- **Total Files:** 151
- **With Timestamp:** 4 (2.6%)
- **Without Timestamp:** 147 (97.4%)

### Video Folder
- **Total Files:** 263
- **With Timestamp:** 6 (2.3%)
- **Without Timestamp:** 257 (97.7%)

---

## The 14 Confirmed Duplicate Files

Files currently shared across multiple questions (ACTIVE CORRUPTION):

1. `q32.mp3` - 2 questions
2. `q7.mp3` - 2 questions
3. `q74.mp3` - 2 questions
4. `q51.mp3` - 2 questions
5. `q39.mp3` - 2 questions
6. `q46.mp3` - 2 questions
7. `q17.mp3` - 2 questions
8. `q4.mp3` - 2 questions
9. `q11.mp3` - 2 questions
10. `q61.mp3` - 2 questions
11. `q83.mp3` - 2 questions
12. `q35.mp3` - 2 questions
13. `q12.mp3` - 2 questions
14. `q64.mp3` - 2 questions

**URL Pattern:** `https://drcqcbq3desis.cloudfront.net/audio/{filename}`

---

## Good News

✅ **Upload code is already fixed** - adds timestamps to all new uploads
✅ **No new corruption** will occur from future imports
✅ **Comprehensive data** - we know exactly which questions are affected
✅ **Multiple fix options** available

---

## Bad News

❌ **99.8% of media questions** have non-unique filenames
❌ **14 files actively corrupted** (wrong media playing)
❌ **Legacy data needs cleanup** - manual or automated intervention required
❌ **User experience degraded** - players hearing wrong audio/video

---

## File Naming Patterns

### ❌ BAD (Non-Unique)
```
q7.mp3
v31.mp4
q42.webm
ani_qv13.mp4
```

### ✅ GOOD (Unique with Timestamp)
```
question_1763532560254.mp3
question_1762156473722.mp3
1759414621367_lc2mw7en7j.mp4
category_xyz_1762155624447.jpg
```

**Timestamp Format:** 13-digit Unix milliseconds (Date.now())

---

## Fix Options Summary

| Option | Effort | Risk | Recommendation |
|--------|--------|------|----------------|
| 1. Automated Batch Fix | 9-14 hrs | Medium | ⭐ **Recommended** |
| 2. Manual Duplicates Only | 6-10 hrs | Low | 🔧 Quick Win |
| 3. S3 Copy & Rename | 5-7 hrs | Medium | ⚡ Fastest |
| 4. Leave As-Is + Monitor | 0 hrs | High | ❌ Not Advised |

---

## Quick Action Items

### This Week (CRITICAL)
- [x] Analyze database and identify all affected questions
- [x] Generate reports and CSV exports
- [ ] Review findings with team
- [ ] Decide on remediation approach
- [ ] Allocate resources

### Next Week (HIGH)
- [ ] Start fixing the 14 critical duplicates (quick win)
- [ ] Develop automated batch fix script
- [ ] Test on sample data
- [ ] Prepare rollout plan

### Week 3 (MEDIUM)
- [ ] Execute batch fix for all 412 questions
- [ ] Validate results
- [ ] User testing on sample questions
- [ ] Document lessons learned

---

## Available Files

### Reports (Markdown)
- `MEDIA_CORRUPTION_EXECUTIVE_SUMMARY.md` - Full analysis with recommendations
- `MEDIA_URL_ANALYSIS_REPORT.md` - Technical deep dive
- `MEDIA_ISSUE_QUICK_REFERENCE.md` - This file

### Data (CSV)
- `media-analysis-all.csv` - All 413 questions with media
- `media-analysis-non-unique.csv` - 412 affected questions
- `media-analysis-duplicates.csv` - 14 duplicate files with details
- `s3-bucket-analysis.csv` - Complete S3 inventory

### Scripts (JavaScript)
- `scripts/analyze-media-urls.js` - Database analysis
- `scripts/generate-csv-report.js` - CSV generation
- `scripts/analyze-s3-bucket.js` - S3 scanning

---

## Key Insights

### Root Cause
Questions imported before the timestamp fix used generic names (`q7.mp3`). Each new import with the same name overwrote the previous file, causing multiple questions to point to the same (wrong) media.

### Current Status
- ✅ Upload code fixed (adds timestamps)
- ❌ Legacy data still corrupted
- ⚠️ 14 files actively shared

### Impact
- Players experience wrong audio/video
- Question accuracy compromised
- Cannot safely import more questions with simple names
- Professional reputation at risk

---

## Contact & Next Steps

**Technical Owner:** Review findings and choose fix approach
**Timeline:** Aim to complete remediation within 2-3 weeks
**Priority:** CRITICAL - impacts core product quality

**First Step:** Schedule team meeting to review `MEDIA_CORRUPTION_EXECUTIVE_SUMMARY.md` and decide on approach.

---

**Last Updated:** 2025-11-19
**Analysis Version:** 1.0
**Questions Analyzed:** 4,194
**Files Scanned:** 828 (414 Firebase + 414 S3)
