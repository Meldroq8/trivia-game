import { onRequest } from 'firebase-functions/v2/https'

// CORS proxy to bypass image CORS restrictions
export const imageProxy = onRequest(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 30,
  },
  async (req, res) => {
    try {
      // Only allow GET requests
      if (req.method !== 'GET') {
        res.status(405).send('Method not allowed')
        return
      }

      const imageUrl = req.query.url
      
      if (!imageUrl) {
        res.status(400).send('Missing url parameter')
        return
      }

      // Fetch the image from the external URL
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      if (!response.ok) {
        res.status(response.status).send(`Failed to fetch image: ${response.statusText}`)
        return
      }

      // Get the image as array buffer
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Set appropriate headers
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      res.set('Content-Type', contentType)
      res.set('Cache-Control', 'public, max-age=86400') // Cache for 1 day
      res.set('Access-Control-Allow-Origin', '*')
      
      // Send the image
      res.send(buffer)
    } catch (error) {
      console.error('Image proxy error:', error)
      res.status(500).send(`Error fetching image: ${error.message}`)
    }
  }
)
