import { useState, useEffect, useRef } from 'react';

/**
 * Global window dimensions hook with debounced resize listener
 * Prevents excessive re-renders during window resizing
 * @param {number} debounceMs - Debounce delay in milliseconds (default: 150)
 * @returns {{ width: number, height: number }}
 */
export function useWindowDimensions(debounceMs = 150) {
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  const timeoutRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight
        });
      }, debounceMs);
    };

    // Set initial dimensions
    handleResize();

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [debounceMs]);

  return dimensions;
}
