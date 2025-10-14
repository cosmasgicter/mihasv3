// Script to clear role cache for user alexisstar8@gmail.com
console.log('🔧 Clearing role cache for user alexisstar8@gmail.com')

// Clear localStorage and sessionStorage
if (typeof window !== 'undefined') {
  // Clear all query cache keys related to user roles
  const keysToRemove = []
  
  // Check localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (key.includes('user-role') || key.includes('auth') || key.includes('profile'))) {
      keysToRemove.push({ storage: 'localStorage', key })
    }
  }
  
  // Check sessionStorage
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key && (key.includes('user-role') || key.includes('auth') || key.includes('profile'))) {
      keysToRemove.push({ storage: 'sessionStorage', key })
    }
  }
  
  // Remove the keys
  keysToRemove.forEach(({ storage, key }) => {
    if (storage === 'localStorage') {
      localStorage.removeItem(key)
    } else {
      sessionStorage.removeItem(key)
    }
    console.log(`✅ Removed ${key} from ${storage}`)
  })
  
  console.log('🎉 Role cache cleared! Please refresh the page.')
} else {
  console.log('❌ This script must be run in a browser environment')
}