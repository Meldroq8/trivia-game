/**
 * Development-only logging utility
 * All logs are removed in production builds
 */

const isDev = import.meta.env.DEV

export const devLog = (...args) => {
  if (isDev) {
    console.log(...args)
  }
}

export const devWarn = (...args) => {
  if (isDev) {
    console.warn(...args)
  }
}

export const devError = (...args) => {
  if (isDev) {
    console.error(...args)
  }
}

// Always log errors in production too
export const prodError = (...args) => {
  console.error(...args)
}
