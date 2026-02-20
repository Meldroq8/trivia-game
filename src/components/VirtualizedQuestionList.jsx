import { useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

/**
 * VirtualizedQuestionList - Renders a virtualized list of question cards
 * Only ~15 items are in the DOM at any time regardless of list size
 *
 * @param {Array} items - Array of question objects to render
 * @param {Function} renderItem - (item, index) => JSX for each question card
 * @param {string} editingQuestion - Currently editing question key (e.g. "categoryId-index")
 * @param {number} maxHeight - Max height of scrollable container in vh units (default 70)
 * @param {number|null} scrollToIndex - Index to scroll to (set to null after scrolling)
 * @param {Function} onScrollComplete - Called after scrollToIndex completes
 */
export default function VirtualizedQuestionList({ items, renderItem, editingQuestion, maxHeight = 70, scrollToIndex = null, onScrollComplete }) {
  const parentRef = useRef(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 3,
    gap: 16,
    measureElement: (el) => {
      if (!el) return 200
      return el.getBoundingClientRect().height
    }
  })

  // Re-measure when editing state changes (card height changes dramatically)
  useEffect(() => {
    virtualizer.measure()
  }, [editingQuestion])

  // Scroll to specific index when requested
  useEffect(() => {
    if (scrollToIndex != null && scrollToIndex >= 0 && scrollToIndex < items.length) {
      // Small delay to ensure virtualizer is ready
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(scrollToIndex, { align: 'center', behavior: 'smooth' })

        // Highlight the scrolled-to item after scrolling completes
        setTimeout(() => {
          if (parentRef.current) {
            const el = parentRef.current.querySelector(`[data-index="${scrollToIndex}"]`)
            if (el) {
              const card = el.firstElementChild
              if (card) {
                card.classList.add('ring-4', 'ring-orange-400', 'ring-opacity-75')
                setTimeout(() => {
                  card.classList.remove('ring-4', 'ring-orange-400', 'ring-opacity-75')
                }, 2500)
              }
            }
          }
          onScrollComplete?.()
        }, 400)
      })
    }
  }, [scrollToIndex])

  const virtualItems = virtualizer.getVirtualItems()

  if (items.length === 0) return null

  return (
    <div
      ref={parentRef}
      style={{ maxHeight: `${maxHeight}vh`, overflowY: 'auto' }}
      className="rounded-lg"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index]
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
