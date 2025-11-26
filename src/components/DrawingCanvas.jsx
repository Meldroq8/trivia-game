import { useEffect, useRef } from 'react'

/**
 * Canvas component for displaying real-time drawings
 * Used on main screen to show what the phone drawer is creating
 */
function DrawingCanvas({ strokes = [], width = 1920, height = 1080, className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')

    // Clear canvas and set white background
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)

    // Sort strokes by timestamp to ensure correct order (failsafe for out-of-order delivery)
    const sortedStrokes = [...strokes].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    // Redraw all strokes with smoothing
    sortedStrokes.forEach((stroke, index) => {
      if (!stroke.points || stroke.points.length === 0) return

      ctx.beginPath()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (stroke.tool === 'eraser') {
        // Eraser mode - removes ink
        ctx.globalCompositeOperation = 'destination-out'
        ctx.lineWidth = 20
      } else {
        // Pen mode - draws with color (default black for backwards compatibility)
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = stroke.color || '#000000'
        ctx.lineWidth = 3
      }

      // Draw the stroke (simple lines for reliability)
      if (stroke.points.length === 1) {
        // Single point - draw a dot
        const point = stroke.points[0]
        ctx.beginPath()
        ctx.arc(point.x * width, point.y * height, 1.5, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Multiple points - draw connected lines
        const firstPoint = stroke.points[0]
        ctx.moveTo(firstPoint.x * width, firstPoint.y * height)

        // Draw straight lines to each point (simple and reliable)
        for (let i = 1; i < stroke.points.length; i++) {
          const point = stroke.points[i]
          ctx.lineTo(point.x * width, point.y * height)
        }

        ctx.stroke()
      }
    })

    // Reset to normal drawing mode
    ctx.globalCompositeOperation = 'source-over'
  }, [strokes, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{
        maxWidth: '100%',
        maxHeight: '100%',
        width: 'auto',
        height: 'auto',
        display: 'block',
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        objectFit: 'contain'
      }}
    />
  )
}

export default DrawingCanvas
