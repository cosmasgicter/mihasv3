#!/bin/bash

# MIHAS Comprehensive Testing Suite
# Runs all testing scripts in sequence with live credentials

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESULTS_DIR="$PROJECT_ROOT/archive/test-results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Ensure results directory exists
mkdir -p "$RESULTS_DIR"

echo -e "${BLUE}🚀 MIHAS Comprehensive Testing Suite${NC}"
echo -e "${BLUE}====================================${NC}"
echo "📅 Started at: $(date)"
echo "📁 Project Root: $PROJECT_ROOT"
echo "📊 Results Directory: $RESULTS_DIR"
echo ""

# Function to run a test and capture results
run_test() {
    local test_name="$1"
    local test_script="$2"
    local log_file="$RESULTS_DIR/${test_name}_${TIMESTAMP}.log"
    
    echo -e "${YELLOW}🧪 Running $test_name...${NC}"
    echo "📝 Log file: $log_file"
    
    if node "$test_script" 2>&1 | tee "$log_file"; then
        echo -e "${GREEN}✅ $test_name completed successfully${NC}"
        return 0
    else
        echo -e "${RED}❌ $test_name failed${NC}"
        return 1
    fi
}

# Initialize test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Test 1: Basic Function Testing
echo -e "\n${BLUE}📋 Phase 1: Basic Function Testing${NC}"
echo "Testing all function endpoints with live credentials"
TOTAL_TESTS=$((TOTAL_TESTS + 1))
if run_test "basic_function_test" "$SCRIPT_DIR/comprehensive-live-function-test.js"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi

# Test 2: Implementation Analysis
echo -e "\n${BLUE}📋 Phase 2: Implementation Analysis${NC}"
echo "Analyzing function implementations and code quality"
TOTAL_TESTS=$((TOTAL_TESTS + 1))
if run_test "implementation_test" "$SCRIPT_DIR/comprehensive-implementation-test.js"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi

# Test 3: MCP-Integrated Testing
echo -e "\n${BLUE}📋 Phase 3: MCP-Integrated Testing${NC}"
echo "Testing with Supabase MCP integration for issue resolution"
TOTAL_TESTS=$((TOTAL_TESTS + 1))
if run_test "mcp_integrated_test" "$SCRIPT_DIR/mcp-integrated-test.js"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi

# Generate consolidated report
echo -e "\n${BLUE}📊 Generating Consolidated Report${NC}"

CONSOLIDATED_REPORT="$RESULTS_DIR/consolidated_test_report_${TIMESTAMP}.md"

cat > "$CONSOLIDATED_REPORT" << EOF
# MIHAS Comprehensive Test Report

**Test Date**: $(date)  
**Duration**: Started at $(date)  
**Test Suite Version**: 1.0  

## Test Summary

- **Total Test Phases**: $TOTAL_TESTS
- **Passed Phases**: $PASSED_TESTS
- **Failed Phases**: $FAILED_TESTS
- **Success Rate**: $(( (PASSED_TESTS * 100) / TOTAL_TESTS ))%

## Test Phases

### Phase 1: Basic Function Testing
- **Purpose**: Test all function endpoints with live credentials
- **Status**: $([ -f "$RESULTS_DIR/basic_function_test_${TIMESTAMP}.log" ] && echo "Completed" || echo "Failed")
- **Log**: \`basic_function_test_${TIMESTAMP}.log\`

### Phase 2: Implementation Analysis  
- **Purpose**: Analyze function implementations and code quality
- **Status**: $([ -f "$RESULTS_DIR/implementation_test_${TIMESTAMP}.log" ] && echo "Completed" || echo "Failed")
- **Log**: \`implementation_test_${TIMESTAMP}.log\`

### Phase 3: MCP-Integrated Testing
- **Purpose**: Test with Supabase MCP integration for issue resolution  
- **Status**: $([ -f "$RESULTS_DIR/mcp_integrated_test_${TIMESTAMP}.log" ] && echo "Completed" || echo "Failed")
- **Log**: \`mcp_integrated_test_${TIMESTAMP}.log\`

## Detailed Results

### Function Test Results
$([ -f "$RESULTS_DIR/comprehensive-live-test-results.json" ] && echo "✅ Available in \`comprehensive-live-test-results.json\`" || echo "❌ Not generated")

### Implementation Analysis Results  
$([ -f "$RESULTS_DIR/comprehensive-implementation-test-results.json" ] && echo "✅ Available in \`comprehensive-implementation-test-results.json\`" || echo "❌ Not generated")

### MCP Integration Results
$([ -f "$RESULTS_DIR/mcp-integrated-test-results.json" ] && echo "✅ Available in \`mcp-integrated-test-results.json\`" || echo "❌ Not generated")

## Recommendations

EOF

# Add recommendations based on test results
if [ $FAILED_TESTS -gt 0 ]; then
    cat >> "$CONSOLIDATED_REPORT" << EOF
⚠️ **Action Required**: $FAILED_TESTS test phase(s) failed

1. Review individual test logs for specific failures
2. Fix identified issues in the codebase
3. Commit and push changes to trigger Cloudflare deployment
4. Re-run tests to verify fixes

EOF
else
    cat >> "$CONSOLIDATED_REPORT" << EOF
✅ **All Tests Passed**: System is ready for production

1. All function endpoints are working correctly
2. Implementation quality is acceptable
3. MCP integration is functional
4. System is ready for deployment

EOF
fi

cat >> "$CONSOLIDATED_REPORT" << EOF
## Next Steps

1. **If tests failed**: Fix issues and re-run tests
2. **If tests passed**: Deploy to production
3. **Monitor**: Set up continuous monitoring
4. **Document**: Update system documentation

## Files Generated

- Consolidated Report: \`$(basename "$CONSOLIDATED_REPORT")\`
- Test Logs: \`*_${TIMESTAMP}.log\`
- JSON Results: \`*-test-results.json\`

---
*Generated by MIHAS Comprehensive Testing Suite*
EOF

echo -e "${GREEN}📄 Consolidated report generated: $CONSOLIDATED_REPORT${NC}"

# Final summary
echo -e "\n${BLUE}🏁 FINAL SUMMARY${NC}"
echo -e "${BLUE}===============${NC}"
echo "📊 Total Test Phases: $TOTAL_TESTS"
echo -e "✅ Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "❌ Failed: ${RED}$FAILED_TESTS${NC}"
echo -e "📈 Success Rate: $(( (PASSED_TESTS * 100) / TOTAL_TESTS ))%"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}✅ System is ready for production deployment${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review the detailed reports"
    echo "2. Deploy to production via git commit"
    echo "3. Monitor system performance"
    exit 0
else
    echo -e "\n${RED}⚠️ SOME TESTS FAILED${NC}"
    echo -e "${RED}❌ System needs attention before deployment${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review failed test logs"
    echo "2. Fix identified issues"
    echo "3. Commit and push changes"
    echo "4. Re-run tests"
    exit 1
fi