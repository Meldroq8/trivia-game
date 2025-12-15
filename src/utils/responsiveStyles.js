/**
 * Shared responsive styles utility for consistent sizing across GameBoard and QuestionView
 * This ensures both pages have identical header heights, font sizes, and spacing
 */

/**
 * Calculate header-related styles based on viewport dimensions
 * @param {number} W - viewport width
 * @param {number} H - viewport height (or actualVH for mobile)
 * @returns {object} Header style values
 */
export function getHeaderStyles(W, H) {
  const actualVH = H

  // Device detection
  const isPC = W >= 1024 && H >= 768

  // Global scale factor based on width - ensures consistent scaling
  const globalScaleFactor = Math.max(0.8, Math.min(1.2, W / 400))

  // Base font size based on viewport height
  let headerBaseFontSize = 16
  if (actualVH <= 390) {
    headerBaseFontSize = 14
  } else if (actualVH <= 430) {
    headerBaseFontSize = 15
  } else if (actualVH <= 568) {
    headerBaseFontSize = 16
  } else if (actualVH <= 667) {
    headerBaseFontSize = 17
  } else if (actualVH <= 812) {
    headerBaseFontSize = 18
  } else if (actualVH <= 896) {
    headerBaseFontSize = 19
  } else if (actualVH <= 1024) {
    headerBaseFontSize = 20
  } else {
    headerBaseFontSize = isPC ? 24 : 20
  }

  const headerFontSize = headerBaseFontSize * globalScaleFactor
  const buttonPadding = Math.max(8, globalScaleFactor * 12)
  const headerPadding = Math.max(8, buttonPadding * 0.25)
  const headerHeight = Math.max(56, headerFontSize * 3)

  // Smaller gaps for slimmer appearance on mobile
  const isMobileLayout = W < 768
  const baseGap = isMobileLayout ? 6 : 8

  return {
    globalScaleFactor,
    headerBaseFontSize,
    headerFontSize,
    buttonPadding,
    headerPadding,
    headerHeight,
    baseGap,
    isPC,
    isMobileLayout
  }
}

/**
 * Calculate device detection flags
 * @param {number} W - viewport width
 * @param {number} H - viewport height (or actualVH for mobile)
 * @returns {object} Device detection flags
 */
export function getDeviceFlags(W, H) {
  const actualVH = H

  // Device and orientation detection
  const isPC = W >= 1024 && H >= 768
  const isUltraNarrow = W < 950
  const isMobileLayout = W < 768
  const isLandscape = W > actualVH
  const isPortrait = actualVH > W
  const isPhone = W <= 768
  const isTablet = (W >= 768 && W <= 1024) || (actualVH >= 768 && actualVH <= 1024)
  const isTabletPortrait = isTablet && isPortrait
  const isPhonePortrait = (isPhone && isPortrait) || isTabletPortrait
  const isPhoneLandscape = !isPortrait && actualVH <= 500
  const isShortScreen = actualVH < 500
  const isTallScreen = actualVH > 900
  const isUltraCompactLandscape = actualVH <= 450 && W > actualVH && !isPC

  return {
    isPC,
    isUltraNarrow,
    isMobileLayout,
    isLandscape,
    isPortrait,
    isPhone,
    isTablet,
    isTabletPortrait,
    isPhonePortrait,
    isPhoneLandscape,
    isShortScreen,
    isTallScreen,
    isUltraCompactLandscape
  }
}

/**
 * Get PC scale factor for larger screens
 * @param {number} W - viewport width
 * @param {number} H - viewport height
 * @returns {number} Scale factor (2.0 for PC, 1.0 otherwise)
 */
export function getPCScaleFactor(W, H) {
  const isPC = W >= 1024 && H >= 768
  return isPC ? 2.0 : 1.0
}

/**
 * Get all responsive styles for a page
 * @param {number} W - viewport width
 * @param {number} H - viewport height (or actualVH for mobile)
 * @returns {object} Combined style values
 */
export function getResponsivePageStyles(W, H) {
  const headerStyles = getHeaderStyles(W, H)
  const deviceFlags = getDeviceFlags(W, H)
  const pcScaleFactor = getPCScaleFactor(W, H)

  return {
    ...headerStyles,
    ...deviceFlags,
    pcScaleFactor
  }
}
