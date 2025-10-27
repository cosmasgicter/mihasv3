#!/bin/bash

# Remove Framer Motion from multiple files
FILES=(
  "src/pages/student/ApplicationStatus.tsx"
  "src/pages/student/ApplicationDetail.tsx"
  "src/pages/admin/Dashboard.tsx"
  "src/pages/admin/Applications.tsx"
  "src/components/admin/EnhancedApplicationsManager.tsx"
  "src/components/admin/PredictiveDashboard.tsx"
  "src/pages/public/tracker/index.tsx"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    # Backup
    cp "$file" "$file.bak"
    
    # Replace motion.div with div
    sed -i 's/motion\.div/div/g' "$file"
    sed -i 's/motion\.section/section/g' "$file"
    sed -i 's/motion\.button/button/g' "$file"
    sed -i 's/motion\.a/a/g' "$file"
    
    # Remove animation props
    sed -i 's/initial={{[^}]*}}//g' "$file"
    sed -i 's/animate={{[^}]*}}//g' "$file"
    sed -i 's/transition={{[^}]*}}//g' "$file"
    sed -i 's/exit={{[^}]*}}//g' "$file"
    sed -i 's/whileHover={{[^}]*}}//g' "$file"
    sed -i 's/whileTap={{[^}]*}}//g' "$file"
    sed -i 's/variants={{[^}]*}}//g' "$file"
    
    # Remove AnimatePresence
    sed -i 's/<AnimatePresence[^>]*>//g' "$file"
    sed -i 's/<\/AnimatePresence>//g' "$file"
    
    # Remove import
    sed -i '/from .framer-motion./d' "$file"
    
    echo "✅ $file processed"
  fi
done

echo "✅ All files processed"
