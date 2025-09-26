/**
 * Simple progress tracker for long-running operations
 */
export class ProgressTracker {
  constructor(total, description = 'Operation') {
    this.total = total
    this.current = 0
    this.description = description
    this.startTime = Date.now()
    this.lastReportTime = this.startTime
    this.reportInterval = 1000 // Report every 1 second
  }

  /**
   * Update progress and optionally report
   * @param {number} increment - How much to increment by (default 1)
   * @param {string} detail - Optional detail message
   */
  update(increment = 1, detail = '') {
    this.current += increment
    const now = Date.now()

    // Report progress every second or at specific milestones
    if (
      now - this.lastReportTime >= this.reportInterval ||
      this.current % 100 === 0 ||
      this.current === this.total
    ) {
      this.report(detail)
      this.lastReportTime = now
    }
  }

  /**
   * Report current progress
   * @param {string} detail - Optional detail message
   */
  report(detail = '') {
    const percentage = Math.round((this.current / this.total) * 100)
    const elapsed = Math.round((Date.now() - this.startTime) / 1000)
    const rate = this.current / elapsed
    const eta = this.current > 0 ? Math.round((this.total - this.current) / rate) : 0

    let message = `📊 ${this.description}: ${this.current}/${this.total} (${percentage}%) - ${elapsed}s elapsed`

    if (eta > 0 && this.current < this.total) {
      message += `, ETA: ${eta}s`
    }

    if (detail) {
      message += ` - ${detail}`
    }

    console.log(message)
  }

  /**
   * Mark operation as completed
   * @param {string} summary - Optional summary message
   */
  complete(summary = '') {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000)
    const rate = Math.round(this.total / elapsed)

    let message = `✅ ${this.description} completed: ${this.total} items in ${elapsed}s (${rate}/s)`

    if (summary) {
      message += ` - ${summary}`
    }

    console.log(message)
  }

  /**
   * Get current progress as percentage
   * @returns {number} Progress percentage (0-100)
   */
  getPercentage() {
    return Math.round((this.current / this.total) * 100)
  }

  /**
   * Check if operation is complete
   * @returns {boolean} True if complete
   */
  isComplete() {
    return this.current >= this.total
  }
}

/**
 * Utility function to create and manage a progress tracker for async operations
 * @param {number} total - Total number of items to process
 * @param {string} description - Description of the operation
 * @returns {ProgressTracker} Progress tracker instance
 */
export function createProgressTracker(total, description = 'Processing') {
  return new ProgressTracker(total, description)
}