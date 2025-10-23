#!/bin/bash

# Fix legibility framework across entire codebase
echo "Fixing legibility issues across website..."

# Find all TSX/TS files
find src -type f \( -name "*.tsx" -o -name "*.ts" \) | while read file; do
  # Skip if file doesn't contain problematic patterns
  if ! grep -q "text-foreground\|text-muted-foreground\|text-primary\|text-accent\|text-secondary" "$file"; then
    continue
  fi
  
  # Create backup
  cp "$file" "$file.bak"
  
  # Apply replacements
  sed -i \
    -e 's/text-foreground">/text-body">/g' \
    -e 's/text-foreground /text-body /g' \
    -e 's/text-muted-foreground">/text-caption">/g' \
    -e 's/text-muted-foreground /text-caption /g' \
    -e 's/className="text-sm text-foreground/className="text-sm text-body-secondary/g' \
    -e 's/className="text-xs text-foreground/className="text-xs text-caption/g' \
    -e 's/text-primary">/text-info-strong">/g' \
    -e 's/text-accent">/text-warning-strong">/g' \
    -e 's/text-secondary">/text-body-secondary">/g' \
    "$file"
  
  # Check if file changed
  if diff -q "$file" "$file.bak" > /dev/null; then
    rm "$file.bak"
  else
    echo "Fixed: $file"
  fi
done

echo "Legibility fixes complete!"
