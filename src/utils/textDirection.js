/**
 * Detects if text should be displayed in LTR direction
 * Returns true if text starts with English letters or numbers
 */
export function shouldUseLTR(text) {
  // Handle non-string values
  if (!text || typeof text !== 'string') return false

  // Remove leading whitespace
  const trimmed = text.trim()
  if (!trimmed) return false

  // Check if first character is English letter, number, or common Latin punctuation
  const firstChar = trimmed.charAt(0)

  // English letters (A-Z, a-z), numbers (0-9), or common symbols
  const latinPattern = /[A-Za-z0-9]/

  return latinPattern.test(firstChar)
}

/**
 * Get the appropriate direction for text display
 * @param {string} text - The text to check
 * @returns {string} 'ltr' or 'rtl'
 */
export function getTextDirection(text) {
  // Handle non-string values
  if (!text || typeof text !== 'string') return 'rtl'

  return shouldUseLTR(text) ? 'ltr' : 'rtl'
}

/**
 * Capitalizes English words in text while preserving Arabic text
 * @param {string} text - The text to capitalize
 * @returns {string} Text with capitalized English words
 */
export function capitalizeEnglishWords(text) {
  // Handle non-string values
  if (!text || typeof text !== 'string') return text

  // Replace each English word with capitalized version
  // This regex matches English words (sequences of English letters)
  return text.replace(/\b([a-z])/g, (match) => match.toUpperCase())
}

/**
 * Detects if text is primarily in English
 * @param {string} text - The text to check
 * @returns {boolean} True if text is primarily English
 */
function isPrimaryEnglish(text) {
  if (!text || typeof text !== 'string') return false

  // First check: Does it contain ANY Arabic characters?
  // If yes, treat as Arabic (even if it has English words mixed in)
  const hasArabic = /[\u0600-\u06FF]/.test(text)
  if (hasArabic) {
    return false // Contains Arabic, use Arabic punctuation
  }

  // If no Arabic at all, check if it's English
  const hasEnglish = /[A-Za-z]/.test(text)
  return hasEnglish
}

/**
 * Formats text by:
 * - Removing spaces before punctuation (?, !, ., etc.)
 * - Using correct question mark based on language (? for English, ؟ for Arabic)
 * - Capitalizing English words
 * @param {string} text - The text to format
 * @returns {string} Formatted text
 */
export function formatText(text) {
  // Handle non-string values
  if (!text || typeof text !== 'string') return text

  let formatted = text

  // Step 1: Capitalize English words
  formatted = capitalizeEnglishWords(formatted)

  // Step 2: Remove spaces before punctuation marks
  formatted = formatted.replace(/\s+([؟?!.,;:])/g, '$1')

  // Step 3: Use correct question mark based on language
  const isEnglish = isPrimaryEnglish(formatted)

  if (isEnglish) {
    // Convert Arabic question marks to English
    formatted = formatted.replace(/؟/g, '?')
  } else {
    // Convert English question marks to Arabic
    formatted = formatted.replace(/\?/g, '؟')
  }

  return formatted
}
