// Component preloading utility
class ComponentPreloader {
  constructor() {
    this.preloadedComponents = new Set()
    this.preloadPromises = new Map()
  }

  // Preload a component in the background
  async preloadComponent(importFunction, componentName) {
    if (this.preloadedComponents.has(componentName)) {
      return this.preloadPromises.get(componentName)
    }

    const promise = importFunction().then(module => {
      this.preloadedComponents.add(componentName)
      return module
    }).catch(error => {
      console.warn(`Failed to preload ${componentName}:`, error)
      throw error
    })

    this.preloadPromises.set(componentName, promise)
    return promise
  }

  // Preload multiple components with priority
  async preloadWithPriority(components) {
    const highPriority = []
    const lowPriority = []

    components.forEach(({ importFn, name, priority }) => {
      const preloadPromise = this.preloadComponent(importFn, name)

      if (priority === 'high') {
        highPriority.push(preloadPromise)
      } else {
        lowPriority.push(preloadPromise)
      }
    })

    // Load high priority components first
    try {
      await Promise.all(highPriority)
    } catch (error) {
      console.warn('Some high priority components failed to preload:', error)
    }

    // Then load low priority components (don't wait for them)
    Promise.all(lowPriority).catch(error => {
      console.warn('Some low priority components failed to preload:', error)
    })
  }

  // Start background preloading after a delay
  startBackgroundPreloading(components, delay = 2000) {
    setTimeout(() => {
      this.preloadWithPriority(components)
    }, delay)
  }
}

// Create singleton instance
const componentPreloader = new ComponentPreloader()

export default componentPreloader