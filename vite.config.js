import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plugin to inject build timestamp into HTML
const injectBuildTimestamp = () => {
  return {
    name: 'inject-build-timestamp',
    transformIndexHtml(html) {
      const buildTimestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0]
      return html.replace('BUILD_TIMESTAMP_PLACEHOLDER', `BUILD_${buildTimestamp}`)
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), injectBuildTimestamp()],
  server: {
    host: true, // Allow network access
    https: process.env.HTTPS === 'true', // Enable HTTPS when HTTPS=true
    watch: {
      ignored: ['**/node_modules/**', '**/backups/**']
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'firebase/app', 'firebase/auth', 'firebase/firestore']
  },
  build: {
    // Remove console logs and debugger statements in production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        // Manual code splitting for better caching and smaller initial bundle
        manualChunks: {
          // React core libraries
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Firebase libraries (large dependency)
          'firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/storage'
          ],
          // Admin page (large, rarely accessed by regular users)
          'admin': ['./src/pages/Admin.jsx'],
          // AI services (only used in admin)
          'ai-services': ['./src/services/aiServiceSecure.js']
        },
        // More aggressive cache busting with build timestamp
        entryFileNames: (chunkInfo) => {
          const buildId = Date.now()
          return `assets/[name]-${buildId}.[hash].js`
        },
        chunkFileNames: (chunkInfo) => {
          const buildId = Date.now()
          return `assets/[name]-${buildId}.[hash].js`
        },
        assetFileNames: (assetInfo) => {
          const buildId = Date.now()
          return `assets/[name]-${buildId}.[hash].[ext]`
        }
      }
    },
    // Generate manifest for better cache invalidation
    manifest: true,
    // Ensure clean build each time
    emptyOutDir: true
  }
})
