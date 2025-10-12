// Fix missing withNetlifyHandler imports
import { readFileSync, writeFileSync } from 'fs'
import { glob } from 'glob'

const filesToFix = [
  'api/documents-upload.js',
  'api/admin-users-id.js',
  'api/admin-users-role.js', 
  'api/admin-users-permissions.js',
  'api/admin-queue-status.js',
  'api/admin-audit-log-export.js',
  'api/notifications-dispatch-channel.js',
  'api/mcp-query.js'
]

function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8')
    
    // Check if withNetlifyHandler is used but not imported
    if (content.includes('withNetlifyHandler') && !content.includes('import.*withNetlifyHandler')) {
      console.log(`Fixing: ${filePath}`)
      
      // Add the import at the top
      const lines = content.split('\n')
      const importLine = "import { withNetlifyHandler } from './_lib/netlifyHandler.js'"
      
      // Find where to insert the import
      let insertIndex = 0
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ') || lines[i].startsWith('const ') || lines[i].startsWith('async function')) {
          insertIndex = i
          break
        }
      }
      
      lines.splice(insertIndex, 0, importLine)
      
      const fixedContent = lines.join('\n')
      writeFileSync(filePath, fixedContent)
      console.log(`✅ Fixed: ${filePath}`)
    } else {
      console.log(`⏭️  Skipped: ${filePath} (already has import or doesn't use withNetlifyHandler)`)
    }
  } catch (error) {
    console.log(`❌ Error fixing ${filePath}: ${error.message}`)
  }
}

console.log('🔧 Fixing missing withNetlifyHandler imports...\n')

filesToFix.forEach(fixFile)

console.log('\n✅ Import fixes complete!')