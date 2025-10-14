#!/bin/bash

# Install Playwright browser dependencies
echo "Installing Playwright browser dependencies..."

# Try to install using playwright first
if command -v npx &> /dev/null; then
    echo "Installing via Playwright..."
    npx playwright install-deps
else
    echo "Installing via apt..."
    sudo apt-get update
    sudo apt-get install -y \
        libicu74 \
        libgstreamer-plugins-bad1.0-0 \
        libavif16
fi

echo "Browser dependencies installation complete!"