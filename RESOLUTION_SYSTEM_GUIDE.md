# GameBoard Resolution System Guide

## Overview

The GameBoard now uses a **customizable resolution profile system** that automatically adapts to different device types while maximizing the use of available screen space. This system makes it easy to fine-tune the layout for any device without modifying the core code.

## What's New?

### ✅ Profile-Based Configuration
- All layout settings are now in a single config file: `src/config/resolutionProfiles.js`
- Separate profiles for: Ultra-narrow phones, Phone portrait, Phone landscape, Tablets, and Desktop/PC
- Easy to customize without touching component code

### ✅ Maximized Space Usage
- **Reduced padding**: Minimal margins (3-6px) to maximize grid space
- **Optimized gaps**: Tighter spacing between elements (3-14px depending on device)
- **Increased utilization**: Uses 94-98% of available space (up from 88-92%)
- **Reduced safety margins**: Smaller footer margins (5px vs 10px)

### ✅ Responsive to All Devices
- **Ultra-narrow phones** (< 400px): Z Fold, small phones
- **Phone portrait** (400-768px, H > W): Standard phones in portrait mode
- **Phone landscape** (400-768px, W > H): Standard phones in landscape mode
- **Tablets** (768-1024px): iPads, Android tablets
- **Desktop/PC** (>= 1024px): Computers with 1.8x scaling for visibility

## How It Works

### Device Detection
The system automatically detects your device based on window dimensions:

```javascript
import { getDeviceProfile } from '../config/resolutionProfiles'

const W = window.innerWidth
const H = window.innerHeight
const profile = getDeviceProfile(W, H)  // Returns appropriate profile
```

### Profile Structure
Each profile contains:

```javascript
{
  padding: {
    horizontal: 3,    // Left/right padding (px)
    vertical: 4       // Top/bottom padding (px)
  },
  gaps: {
    row: { min: 3, max: 6, percentage: 0.004 },      // Vertical gaps between categories
    col: { min: 2, max: 3, percentage: 0.004 },      // Horizontal gaps
    innerRow: { min: 2, max: 4, percentage: 0.008 }, // Gaps between buttons
    innerCol: { min: 2, max: 6, percentage: 0.015 }  // Gap between card and buttons
  },
  spaceUtilization: {
    categoryGroup: 0.98,  // % of grid cell used (98%)
    buttonSpace: 0.94,    // % of height for buttons (94%)
    cardHeight: 0.96,     // % max height for card (96%)
    cardWidth: 0.98       // % of available width for card (98%)
  },
  cardAspectRatio: {
    portrait: 0.7,        // Width/height ratio in portrait
    landscape: 0.85       // Width/height ratio in landscape
  },
  button: {
    minWidth: 40,              // Minimum button width (px)
    maxHeightPercent: 0.26,    // Max button height as % of category
    aspectRatio: 2.0,          // Button width/height ratio
    widthMultiplier: 1.2       // Max width scaling
  },
  font: {
    minSize: 5,           // Minimum font size (px)
    maxSize: 14,          // Maximum font size (px)
    buttonScale: 0.6,     // Font size relative to button height
    widthScale: 0.25      // Font size relative to button width
  },
  safety: {
    footerMargin: 5,      // Extra space before footer (px)
    gapMaxPercent: 0.12   // Max % of space for gaps
  }
}
```

## Customization Guide

### Method 1: Edit the Config File (Recommended)

Edit `src/config/resolutionProfiles.js` directly:

```javascript
// Example: Make ultra-narrow phones even more compact
ultraNarrowPhone: {
  padding: {
    horizontal: 2,    // Even less padding
    vertical: 3
  },
  spaceUtilization: {
    categoryGroup: 0.99,  // Use 99% of space
    buttonSpace: 0.95,
    cardHeight: 0.97,
    cardWidth: 0.99
  }
}
```

### Method 2: Runtime Override (Advanced)

You can override settings at runtime using localStorage:

```javascript
import { setProfileOverride } from './config/resolutionProfiles'

// Override specific settings for ultra-narrow phones
setProfileOverride('ultraNarrowPhone', {
  padding: { horizontal: 2, vertical: 3 },
  spaceUtilization: { categoryGroup: 0.99 }
})
```

To clear all overrides:

```javascript
import { clearProfileOverrides } from './config/resolutionProfiles'
clearProfileOverrides()
```

## Customization Examples

### Example 1: Increase Spacing on Desktop

```javascript
// In resolutionProfiles.js
desktop: {
  padding: {
    horizontal: 10,  // More padding
    vertical: 8
  },
  gaps: {
    row: { min: 6, max: 18, percentage: 0.008 }  // Larger gaps
  }
}
```

### Example 2: Make Tablets More Compact

```javascript
tablet: {
  padding: {
    horizontal: 3,
    vertical: 3
  },
  spaceUtilization: {
    categoryGroup: 0.99,  // Use 99% of space
    buttonSpace: 0.96,
    cardHeight: 0.97,
    cardWidth: 0.99
  }
}
```

### Example 3: Adjust Font Sizes

```javascript
phonePortrait: {
  font: {
    minSize: 8,      // Larger minimum
    maxSize: 20,     // Larger maximum
    buttonScale: 0.65,  // Slightly larger buttons
    widthScale: 0.28
  }
}
```

## Key Settings Explained

### Padding
- **What**: Empty space around the grid
- **Lower values**: More space for grid, less margin
- **Higher values**: More margin, smaller grid
- **Recommended**: 3-6px for maximum space usage

### Gaps
- **row.min/max**: Minimum and maximum vertical spacing between categories
- **col.min/max**: Minimum and maximum horizontal spacing
- **percentage**: Calculates gap as % of viewport dimension
- **Recommended**: Use min values of 2-4px to prevent overlap

### Space Utilization
- **categoryGroup**: % of each grid cell used (higher = larger categories)
- **buttonSpace**: % of category height used for buttons (higher = taller buttons)
- **cardHeight**: Maximum card height as % of category (higher = taller cards)
- **cardWidth**: Card width as % of available space (higher = wider cards)
- **Recommended**: 94-98% for maximum space usage

### Safety Margins
- **footerMargin**: Extra space before footer to prevent overlap
- **gapMaxPercent**: Maximum % of viewport that gaps can consume
- **Recommended**: 5px margin, 12% max gaps

## Current Optimizations

The current configuration maximizes space usage across all devices:

| Device Type | Padding | Space Usage | Gaps |
|-------------|---------|-------------|------|
| Ultra-narrow | 3-4px | 98% | 2-6px |
| Phone Portrait | 4px | 98% | 2-10px |
| Phone Landscape | 4px | 98% | 2-8px |
| Tablet | 5-4px | 98% | 3-12px |
| Desktop/PC | 6-4px | 98% | 3-14px |

## Testing Your Changes

1. **Edit the profile** in `src/config/resolutionProfiles.js`
2. **Save the file** - Vite HMR will auto-reload
3. **Test on different devices**:
   - Chrome DevTools responsive mode
   - Real devices
   - Different orientations

## Troubleshooting

### Issue: Elements overlapping
**Solution**: Increase `safety.footerMargin` or reduce `spaceUtilization` percentages

### Issue: Too much empty space
**Solution**: Decrease `padding` values and increase `spaceUtilization` percentages

### Issue: Text too small/large
**Solution**: Adjust `font.minSize` and `font.maxSize` in the profile

### Issue: Buttons too small
**Solution**: Increase `button.minWidth` and adjust `button.maxHeightPercent`

### Issue: Changes not applying
**Solution**:
1. Check for syntax errors in `resolutionProfiles.js`
2. Hard refresh (Ctrl+F5)
3. Restart dev server

## Advanced: Creating a New Profile

You can add custom profiles for specific device types:

```javascript
// In resolutionProfiles.js
export const RESOLUTION_PROFILES = {
  // ... existing profiles ...

  // Custom profile for very wide screens
  ultraWide: {
    name: 'Ultra Wide Monitor',
    thresholds: {
      minWidth: 2560,
      minHeight: 1080
    },
    padding: { horizontal: 20, vertical: 10 },
    // ... rest of configuration
  }
}

// Update getDeviceProfile() function to use your new profile
export function getDeviceProfile(width, height) {
  // Check ultra-wide first
  if (width >= RESOLUTION_PROFILES.ultraWide.thresholds.minWidth) {
    return RESOLUTION_PROFILES.ultraWide
  }

  // ... existing checks ...
}
```

## Best Practices

1. **Start Conservative**: Begin with slightly lower utilization (95%) and increase if no overlap occurs
2. **Test on Real Devices**: DevTools is helpful, but real devices behave differently
3. **Maintain Minimum Gaps**: Never go below 2px for gaps to prevent touch/click issues
4. **Consider Accessibility**: Ensure buttons and text remain readable
5. **Document Changes**: Add comments explaining why you changed specific values

## Support

For issues or questions about the resolution system:
1. Check this guide first
2. Review `src/config/resolutionProfiles.js` for current settings
3. Test in Chrome DevTools with various viewport sizes
4. Check browser console for errors

## Summary

The new resolution system provides:
- ✅ **Easy customization** - All settings in one config file
- ✅ **Maximum space usage** - 94-98% utilization with minimal padding
- ✅ **Responsive design** - Automatic adaptation to all device types
- ✅ **No code changes needed** - Just edit the config file
- ✅ **Runtime overrides** - Advanced customization with localStorage

Test your changes at: **http://localhost:5180/**
