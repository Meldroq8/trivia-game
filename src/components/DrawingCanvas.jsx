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

    // Redraw all strokes
    strokes.forEach(stroke => {
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

      // Draw the stroke
      const firstPoint = stroke.points[0]
      ctx.moveTo(firstPoint.x * width, firstPoint.y * height)

      for (let i = 1; i < stroke.points.length; i++) {
        const point = stroke.points[i]
        ctx.lineTo(point.x * width, point.y * height)
      }

      ctx.stroke()
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
        width: '100%',
        height: 'auto',
        display: 'block',
        backgroundColor: '#FFFFFF',
        borderRadius: '8px'
      }}
    />
  )
}

export default DrawingCanvas
