#!/bin/bash

# Test email queue processor
echo "Testing email queue processor..."

curl -X POST https://apply.mihas.edu.zm/cron/process-email-queue \
  -H "Content-Type: application/json" \
  | jq '.'

echo ""
echo "Done! Check the response above for results."
