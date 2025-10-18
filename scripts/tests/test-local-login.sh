#!/bin/bash
echo "Testing local login..."
curl -X POST http://localhost:8888/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cosmas@beanola.com","password":"your-password-here"}' \
  | jq .
