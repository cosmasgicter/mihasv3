// Minimal diff tracking for history
export function calculateDiff(oldData: Record<string, any>, newData: Record<string, any>): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {}
  
  const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})])
  
  for (const key of allKeys) {
    if (oldData[key] !== newData[key]) {
      changes[key] = {
        old: oldData[key],
        new: newData[key]
      }
    }
  }
  
  return changes
}

export function formatChanges(changes: Record<string, { old: any; new: any }>): string {
  return Object.entries(changes)
    .map(([key, { old, new: newVal }]) => {
      const fieldName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      return `${fieldName}: "${old || 'N/A'}" → "${newVal || 'N/A'}"`
    })
    .join(', ')
}
