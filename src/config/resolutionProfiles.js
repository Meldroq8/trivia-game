/**
 * Resolution Profiles Configuration
 *
 * Customizable settings for GameBoard layout across different device types.
 * Each profile defines spacing, sizing, and layout parameters for optimal display.
 *
 * HOW TO CUSTOMIZE:
 * 1. Adjust values in the profiles below to change layout behavior
 * 2. padding: Controls space around the grid (lower = more space for grid)
 * 3. gaps: Controls spacing between categories and rows
 * 4. spaceUtilization: Controls how much of available space is used (higher = larger elements)
 * 5. safety: Extra margins to prevent overlap (increase if seeing overlap issues)
 */

export const RESOLUTION_PROFILES = {
  // Ultra-narrow phones (< 400px width) - Z Fold, small phones
  ultraNarrowPhone: {
    name: 'Ultra Narrow Phone',
    // Device detection thresholds
    thresholds: {
      maxWidth: 400,
      minWidth: 0
    },
    // Padding around grid (px) - minimized for max space
    padding: {
      horizontal: 3,      // Minimal left/right padding
      vertical: 4         // Minimal top/bottom padding
    },
    // Gaps between grid items - use minimums more aggressively
    gaps: {
      row: { min: 3, max: 6, percentage: 0.004 },        // Tighter vertical spacing
      col: { min: 2, max: 3, percentage: 0.004 },        // Tighter horizontal spacing
      innerRow: { min: 2, max: 4, percentage: 0.008 },   // Spacing between buttons vertically
      innerCol: { min: 2, max: 6, percentage: 0.015 }    // Spacing between card and buttons
    },
    // Space utilization percentages - maximized
    spaceUtilization: {
      categoryGroup: 0.98,    // Use 98% of grid cell
      buttonSpace: 0.94,      // Use 94% of height for buttons
      cardHeight: 0.96,       // Use 96% max height for card
      cardWidth: 0.98         // Use 98% of available width for card
    },
    // Card aspect ratios (width/height) per orientation
    cardAspectRatio: {
      portrait: 0.7,          // Taller cards for portrait
      landscape: 0.85         // Slightly taller for landscape
    },
    // Button constraints
    button: {
      minWidth: 40,           // Minimum button width (reduced from 45)
      maxHeightPercent: 0.26, // Max button height as % of category height (increased from 0.24)
      aspectRatio: 2.0,       // Width to height ratio
      widthMultiplier: 1.2    // Max width scaling factor
    },
    // Font sizing
    font: {
      minSize: 5,             // Minimum font size
      maxSize: 14,            // Maximum font size for card text
      buttonScale: 0.6,       // Button font size relative to height
      widthScale: 0.25        // Font size relative to button width
    },
    // Container margins and grid gaps (hybrid CSS Grid approach)
    container: {
      marginTop: 12,        // Space below header (replaces top spacer)
      marginBottom: 12,     // Space above footer (replaces bottom spacer)
      paddingX: 16          // Horizontal padding (fixed like reference: px-4)
    },
    // Grid gaps (replaces middle spacer divs)
    gridGaps: {
      row: 8,               // Vertical gap between rows (gap-2 equivalent)
      col: 8                // Horizontal gap between columns (gap-2 equivalent)
    },
    // Safety margins - comprehensive protection for header and footer
    safety: {
      headerMargin: 16,       // Safe space after header to prevent overlap (increased for narrow phones)
      footerMargin: 16,       // Safe space before footer to prevent overlap (increased for narrow phones)
      gapMaxPercent: 0.12,    // Max % of space that gaps can consume
      minTopPadding: 8,       // Minimum padding above grid
      minBottomPadding: 8     // Minimum padding below grid
    },
    // Header font sizing
    header: {
      baseFontSize: 14,       // Base header font size
      pcScale: 1.8            // PC scaling for header (reduced from 2.0)
    }
  },

  // Normal phones in portrait (400-768px, H > W)
  phonePortrait: {
    name: 'Phone Portrait',
    thresholds: {
      maxWidth: 768,
      minWidth: 400,
      aspectRatio: 'portrait'  // H > W
    },
    padding: {
      horizontal: 4,
      vertical: 4
    },
    gaps: {
      row: { min: 3, max: 10, percentage: 0.006 },
      col: { min: 2, max: 5, percentage: 0.006 },
      innerRow: { min: 2, max: 7, percentage: 0.015 },
      innerCol: { min: 3, max: 10, percentage: 0.022 }
    },
    spaceUtilization: {
      categoryGroup: 0.98,
      buttonSpace: 0.94,
      cardHeight: 0.96,
      cardWidth: 0.98
    },
    cardAspectRatio: {
      portrait: 0.85,
      landscape: 1.1
    },
    button: {
      minWidth: 45,
      maxHeightPercent: 0.26,
      aspectRatio: 2.0,
      widthMultiplier: 1.2
    },
    font: {
      minSize: 7,
      maxSize: 18,
      buttonScale: 0.6,
      widthScale: 0.25
    },
    container: {
      marginTop: 12,
      marginBottom: 12,
      paddingX: 16
    },
    gridGaps: {
      row: 8,               // Mobile: gap-2
      col: 8
    },
    safety: {
      headerMargin: 12,
      footerMargin: 12,
      gapMaxPercent: 0.12,
      minTopPadding: 8,
      minBottomPadding: 8
    },
    header: {
      baseFontSize: 16,
      pcScale: 1.8
    }
  },

  // Phones in landscape (400-768px, W > H)
  phoneLandscape: {
    name: 'Phone Landscape',
    thresholds: {
      maxWidth: 768,
      minWidth: 400,
      aspectRatio: 'landscape'  // W > H
    },
    padding: {
      horizontal: 4,
      vertical: 4
    },
    gaps: {
      row: { min: 3, max: 8, percentage: 0.004 },
      col: { min: 2, max: 4, percentage: 0.003 },
      innerRow: { min: 2, max: 5, percentage: 0.015 },
      innerCol: { min: 2, max: 8, percentage: 0.022 }
    },
    spaceUtilization: {
      categoryGroup: 0.98,
      buttonSpace: 0.94,
      cardHeight: 0.96,
      cardWidth: 0.98
    },
    cardAspectRatio: {
      portrait: 0.85,
      landscape: 1.1
    },
    button: {
      minWidth: 45,
      maxHeightPercent: 0.26,
      aspectRatio: 2.0,
      widthMultiplier: 1.2
    },
    font: {
      minSize: 7,
      maxSize: 18,
      buttonScale: 0.6,
      widthScale: 0.25
    },
    container: {
      marginTop: 8,         // Reduced for landscape
      marginBottom: 8,
      paddingX: 16
    },
    gridGaps: {
      row: 8,
      col: 8
    },
    safety: {
      headerMargin: 12,
      footerMargin: 12,
      gapMaxPercent: 0.12,
      minTopPadding: 8,
      minBottomPadding: 8
    },
    header: {
      baseFontSize: 16,
      pcScale: 1.8
    }
  },

  // Tablets (768-1024px)
  tablet: {
    name: 'Tablet',
    thresholds: {
      maxWidth: 1024,
      minWidth: 768
    },
    padding: {
      horizontal: 5,
      vertical: 4
    },
    gaps: {
      row: { min: 4, max: 12, percentage: 0.006 },
      col: { min: 3, max: 6, percentage: 0.004 },
      innerRow: { min: 3, max: 9, percentage: 0.015 },
      innerCol: { min: 4, max: 12, percentage: 0.022 }
    },
    spaceUtilization: {
      categoryGroup: 0.98,
      buttonSpace: 0.94,
      cardHeight: 0.96,
      cardWidth: 0.98
    },
    cardAspectRatio: {
      portrait: 1.1,
      landscape: 1.25
    },
    button: {
      minWidth: 50,
      maxHeightPercent: 0.26,
      aspectRatio: 2.0,
      widthMultiplier: 1.2
    },
    font: {
      minSize: 8,
      maxSize: 22,
      buttonScale: 0.6,
      widthScale: 0.25
    },
    container: {
      marginTop: 14,
      marginBottom: 14,
      paddingX: 16
    },
    gridGaps: {
      row: 20,              // md: gap-y-5 (larger gap for tablets)
      col: 20
    },
    safety: {
      headerMargin: 12,
      footerMargin: 12,
      gapMaxPercent: 0.12,
      minTopPadding: 8,
      minBottomPadding: 8
    },
    header: {
      baseFontSize: 18,
      pcScale: 1.8
    }
  },

  // Desktop/PC (>= 1024px width AND >= 768px height)
  desktop: {
    name: 'Desktop/PC',
    thresholds: {
      minWidth: 1024,
      minHeight: 768
    },
    padding: {
      horizontal: 6,
      vertical: 4
    },
    gaps: {
      row: { min: 4, max: 14, percentage: 0.006 },
      col: { min: 3, max: 8, percentage: 0.004 },
      innerRow: { min: 3, max: 10, percentage: 0.015 },
      innerCol: { min: 4, max: 14, percentage: 0.022 }
    },
    spaceUtilization: {
      categoryGroup: 0.98,
      buttonSpace: 0.94,
      cardHeight: 0.96,
      cardWidth: 0.98
    },
    cardAspectRatio: {
      portrait: 1.1,
      landscape: 1.25
    },
    button: {
      minWidth: 50,
      maxHeightPercent: 0.26,
      aspectRatio: 2.0,
      widthMultiplier: 1.2
    },
    font: {
      minSize: 10,
      maxSize: 24,
      buttonScale: 0.6,
      widthScale: 0.25
    },
    container: {
      marginTop: 20,        // xl: larger margins (xl:my-5)
      marginBottom: 20,
      paddingX: 16
    },
    gridGaps: {
      row: 20,              // Same as tablet
      col: 32               // xl: gap-x-8 (larger horizontal gap)
    },
    safety: {
      headerMargin: 15,
      footerMargin: 15,
      gapMaxPercent: 0.12,
      minTopPadding: 10,      // Extra padding for PC
      minBottomPadding: 10    // Extra padding for PC
    },
    header: {
      baseFontSize: 24,
      pcScale: 1.8           // PC gets 1.8x scaling (was 2.0)
    },
    // PC-specific scaling
    globalScale: 1.8          // Overall scaling factor for PC (reduced from 2.0)
  }
}

/**
 * Get the appropriate profile for current device
 * @param {number} width - Window width
 * @param {number} height - Window height
 * @returns {object} The matching resolution profile
 */
export function getDeviceProfile(width, height) {
  const isPortrait = height > width

  // Check desktop first (requires both width and height)
  if (width >= RESOLUTION_PROFILES.desktop.thresholds.minWidth &&
      height >= RESOLUTION_PROFILES.desktop.thresholds.minHeight) {
    return RESOLUTION_PROFILES.desktop
  }

  // Check tablet
  if (width >= RESOLUTION_PROFILES.tablet.thresholds.minWidth &&
      width < RESOLUTION_PROFILES.tablet.thresholds.maxWidth) {
    return RESOLUTION_PROFILES.tablet
  }

  // Check ultra-narrow phone
  if (width < RESOLUTION_PROFILES.ultraNarrowPhone.thresholds.maxWidth) {
    return RESOLUTION_PROFILES.ultraNarrowPhone
  }

  // Check phone portrait vs landscape
  if (width >= RESOLUTION_PROFILES.phonePortrait.thresholds.minWidth &&
      width < RESOLUTION_PROFILES.phonePortrait.thresholds.maxWidth) {
    if (isPortrait) {
      return RESOLUTION_PROFILES.phonePortrait
    } else {
      return RESOLUTION_PROFILES.phoneLandscape
    }
  }

  // Default fallback to phone landscape
  return RESOLUTION_PROFILES.phoneLandscape
}

/**
 * Override profile settings (for customization/testing)
 * Stores in localStorage
 */
export function setProfileOverride(deviceType, overrides) {
  const key = `resolutionProfile_${deviceType}`
  localStorage.setItem(key, JSON.stringify(overrides))
}

/**
 * Get profile with any user overrides applied
 */
export function getProfileWithOverrides(profile, deviceType) {
  const key = `resolutionProfile_${deviceType}`
  const overrides = localStorage.getItem(key)

  if (overrides) {
    try {
      const parsed = JSON.parse(overrides)
      return deepMerge(profile, parsed)
    } catch (e) {
      console.warn('Failed to parse profile overrides:', e)
    }
  }

  return profile
}

/**
 * Deep merge utility for combining profile objects
 */
function deepMerge(target, source) {
  const result = { ...target }

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key])
    } else {
      result[key] = source[key]
    }
  }

  return result
}

/**
 * Reset all profile overrides
 */
export function clearProfileOverrides() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('resolutionProfile_'))
  keys.forEach(key => localStorage.removeItem(key))
}

export default RESOLUTION_PROFILES
