#!/bin/bash

echo "🚀 Running comprehensive test suite with optimized parallelization"
echo "📊 Total tests: 1110 across 40 files"
echo "🔧 Using 4 workers to prevent system overload"
echo ""

# Run tests in batches to prevent system overload
echo "📋 Batch 1: Basic & Health Tests"
npx playwright test --config=playwright.fast.config.ts tests/basic.spec.ts tests/api/health.spec.ts --workers=2

echo ""
echo "📋 Batch 2: API Tests"
npx playwright test --config=playwright.fast.config.ts tests/api/ --workers=3

echo ""
echo "📋 Batch 3: Navigation Tests"
npx playwright test --config=playwright.fast.config.ts tests/navigation/ --workers=4

echo ""
echo "📋 Batch 4: Component Tests"
npx playwright test --config=playwright.fast.config.ts tests/components/ --workers=4

echo ""
echo "📋 Batch 5: Dashboard Tests"
npx playwright test --config=playwright.fast.config.ts tests/dashboards/ --workers=4

echo ""
echo "📋 Batch 6: Mobile Tests"
npx playwright test --config=playwright.fast.config.ts tests/mobile/ --workers=4

echo ""
echo "📋 Batch 7: Integration Tests"
npx playwright test --config=playwright.fast.config.ts tests/integration/ --workers=3

echo ""
echo "📋 Batch 8: E2E Tests"
npx playwright test --config=playwright.fast.config.ts tests/e2e/ --workers=3

echo ""
echo "📋 Batch 9: Student & Admin Tests"
npx playwright test --config=playwright.fast.config.ts tests/student/ tests/admin/ --workers=4

echo ""
echo "📋 Batch 10: Pages & Production Tests"
npx playwright test --config=playwright.fast.config.ts tests/pages/ tests/production-auth.spec.ts tests/master-test-suite.spec.ts --workers=4

echo ""
echo "✅ All test batches completed!"
echo "📊 Check test-results/fast/ for detailed results"