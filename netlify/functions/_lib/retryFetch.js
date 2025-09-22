async function retryFetch(url, options = {}, maxRetries = 3) {
  const { timeout = 30000, ...fetchOptions } = options
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      return response
      
    } catch (error) {
      console.warn(`Fetch attempt ${attempt}/${maxRetries} failed:`, error.message)
      
      if (attempt === maxRetries) {
        throw error
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

module.exports = { retryFetch }