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
        // Pen mode - draws black
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 3
      }

      // Draw the stroke with interpolation for smooth lines
      if (stroke.points.length === 1) {
        // Single point - draw a dot
        const point = stroke.points[0]
        ctx.arc(point.x * width, point.y * height, 1.5, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Multiple points - draw smooth curve
        const firstPoint = stroke.points[0]
        ctx.moveTo(firstPoint.x * width, firstPoint.y * height)

        // Use quadratic curves for smoother lines
        for (let i = 1; i < stroke.points.length; i++) {
          const point = stroke.points[i]
          const prevPoint = stroke.points[i - 1]

          // Calculate control point for smooth curve
          const cpX = (prevPoint.x + point.x) / 2 * width
          const cpY = (prevPoint.y + point.y) / 2 * height

          ctx.quadraticCurveTo(
            prevPoint.x * width,
            prevPoint.y * height,
            cpX,
            cpY
          )
        }

        // Draw to final point
        const lastPoint = stroke.points[stroke.points.length - 1]
        ctx.lineTo(lastPoint.x * width, lastPoint.y * height)

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
