/**
 * Debounce utility to limit how often a function can fire
 * @param {Function} func - The function to debounce
 * @param {number} wait - Milliseconds to wait before executing
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait = 150) {
  let timeout

  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }

    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * Throttle utility to ensure function executes at most once per interval
 * @param {Function} func - The function to throttle
 * @param {number} limit - Milliseconds between executions
 * @returns {Function} - Throttled function
 */
export function throttle(func, limit = 150) {
  let inThrottle

  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}
