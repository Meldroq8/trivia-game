import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

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

// Plugin to generate version.json for automatic update detection
const generateVersionJson = () => {
  let gitCommit = null

  return {
    name: 'generate-version-json',
    buildStart() {
      // Get git commit hash - only changes when code actually changes
      try {
        gitCommit = execSync('git rev-parse --short HEAD').toString().trim()
      } catch (e) {
        // Fallback if git not available
        gitCommit = Date.now().toString()
      }
    },
    writeBundle(options) {
      const versionData = {
        version: gitCommit,
        buildTime: new Date().toISOString()
      }

      const outDir = options.dir || 'dist'
      const versionPath = path.resolve(outDir, 'version.json')

      fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2))
      console.log(`✅ Generated version.json: ${versionData.version}`)
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), injectBuildTimestamp(), generateVersionJson()],
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
    sourcemap: false,
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
        // Content-hash based filenames for proper browser caching
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Generate manifest for better cache invalidation
    manifest: true,
    // Ensure clean build each time
    emptyOutDir: true
  }
})
