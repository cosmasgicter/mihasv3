# The rendered design gate's browser (platform-simplification task 22.5).
#
# One pinned image for the gate's Playwright step on every machine, so a pass on a
# developer's machine is a pass on the CI runner. `bash harness/bin/harness rendered-gate`
# builds it and runs the step in it, here and in CI.
#
# - Playwright 1.58.2's own Chromium build (headless shell 1208), pinned by digest.
#   It must match `@playwright/test` in apps/admissions/package.json
#   (backend/tests/unit/test_journey_gate_configuration_sjr.py checks both).
# - DejaVu as the fallback font. The ubuntu-24.04 runner has it, and it is what the app's
#   font chain resolves to on a machine without Inter. Inter is not installed on purpose:
#   production does not ship it (index.css declares only local() sources), so a wider
#   fallback font is what many students see, and the gate measures that.
# - impeccable 2.1.9 at `npm root -g`, where tests/harness-e2e/rendered-gate/impeccable.ts
#   reads its browser detector. The detector's checksum is verified so the rule set is
#   byte-for-byte the one the baseline was recorded with.
FROM mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d

RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core=2.37-8 fonts-dejavu-mono=2.37-8 \
 && rm -rf /var/lib/apt/lists/*

RUN PUPPETEER_SKIP_DOWNLOAD=1 npm install -g impeccable@2.1.9 \
 && npm cache clean --force \
 && echo "14e7ec97d3aa484ad5f7bea8c303c6dd83a18ebbb6332483f0fc0fe4e3ce575c  /usr/lib/node_modules/impeccable/cli/engine/detect-antipatterns-browser.js" \
    | sha256sum -c -
