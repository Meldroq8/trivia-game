import { useState, useEffect } from 'react'

export function usePresentationMode() {
  const [isPresentationMode, setIsPresentationMode] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    // Check if already in fullscreen
    const checkFullscreen = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', checkFullscreen)

    // Check initial state
    checkFullscreen()

    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen)
    }
  }, [])

  const enterPresentationMode = async () => {
    try {
      // Enter fullscreen
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }

      // Hide cursor after 3 seconds of inactivity
      let cursorTimer
      const hideCursor = () => {
        document.body.style.cursor = 'none'
      }

      const showCursor = () => {
        document.body.style.cursor = 'default'
        clearTimeout(cursorTimer)
        cursorTimer = setTimeout(hideCursor, 3000)
      }

      document.addEventListener('mousemove', showCursor)
      document.addEventListener('click', showCursor)

      // Initial cursor hide timer
      cursorTimer = setTimeout(hideCursor, 3000)

      setIsPresentationMode(true)

      // Store event listeners for cleanup
      window._presentationModeCleanup = () => {
        document.removeEventListener('mousemove', showCursor)
        document.removeEventListener('click', showCursor)
        clearTimeout(cursorTimer)
        document.body.style.cursor = 'default'
      }

    } catch (error) {
      console.error('Failed to enter presentation mode:', error)
    }
  }

  const exitPresentationMode = async () => {
    try {
      // Exit fullscreen
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      }

      // Cleanup cursor hiding
      if (window._presentationModeCleanup) {
        window._presentationModeCleanup()
        delete window._presentationModeCleanup
      }

      setIsPresentationMode(false)

    } catch (error) {
      console.error('Failed to exit presentation mode:', error)
    }
  }

  const togglePresentationMode = () => {
    if (isPresentationMode) {
      exitPresentationMode()
    } else {
      enterPresentationMode()
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      // F11 or F key for fullscreen
      if (e.key === 'F11' || (e.key === 'f' && e.ctrlKey)) {
        e.preventDefault()
        togglePresentationMode()
      }
      // Escape to exit presentation mode
      if (e.key === 'Escape' && isPresentationMode) {
        exitPresentationMode()
      }
    }

    document.addEventListener('keydown', handleKeyPress)

    return () => {
      document.removeEventListener('keydown', handleKeyPress)
    }
  }, [isPresentationMode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (window._presentationModeCleanup) {
        window._presentationModeCleanup()
        delete window._presentationModeCleanup
      }
    }
  }, [])

  return {
    isPresentationMode,
    isFullscreen,
    enterPresentationMode,
    exitPresentationMode,
    togglePresentationMode
  }
}