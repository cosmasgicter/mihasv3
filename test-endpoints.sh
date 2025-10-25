#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsImtpZCI6IjE1ZTkxenVweDltUlBkU00iLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL215bGdlZ2txb2RkY3J4dHdjY2xiLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI2ZTE0N2VhZC1lMzRkLTQxZTItYmMwNS0zNThhNjUzZmY2MzMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzYxMzcxMTI4LCJpYXQiOjE3NjEzNjc1MjgsImVtYWlsIjoiY29zbWFza2FuY2hlcGE4QGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJjb3NtYXNrYW5jaGVwYThAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZ1bGxfbmFtZSI6IkNvc21hcyBLYW5jaGVwYSIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic2lnbnVwX2RhdGEiOiJ7XCJlbWFpbFwiOlwiY29zbWFza2FuY2hlcGE4QGdtYWlsLmNvbVwiLFwicGFzc3dvcmRcIjpcIkJlYW5vbGEyMDI1XCIsXCJmdWxsX25hbWVcIjpcIlNvbG9tb24gTmdvbWFcIixcInBob25lXCI6XCIrMjYwOTY2MjIyOTk5XCIsXCJkYXRlX29mX2JpcnRoXCI6XCIyMDA2LTAxLTAyXCIsXCJnZW5kZXJcIjpcIk1hbGVcIixcIm5hdGlvbmFsaXR5XCI6XCJaYW1iaWFuXCIsXCJhZGRyZXNzXCI6XCIxODIvNDlcXG5PRkYgTUFJTiBST0FEXFxuVkFMTEVZIFZJRVdcIixcImNpdHlcIjpcIkxVU0FLQVwiLFwiY291bnRyeVwiOlwiWmFtYmlhXCIsXCJlbWVyZ2VuY3lfY29udGFjdF9uYW1lXCI6XCJXSUxMSUFNIFpVTFVcIixcImVtZXJnZW5jeV9jb250YWN0X3Bob25lXCI6XCIwOTc3NTYyMDQ3XCJ9Iiwic3ViIjoiNmUxNDdlYWQtZTM0ZC00MWUyLWJjMDUtMzU4YTY1M2ZmNjMzIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NjEzNjc1Mjh9XSwic2Vzc2lvbl9pZCI6IjlhMzczYjYzLTIxNzUtNGUwNi1hNmU4LTZlNjZjNzUwY2UzOSIsImlzX2Fub255bW91cyI6ZmFsc2V9.S2MeiZpEsshOV5025a4QuXiCj4IKJq7VKEAsm0yTVpY"

echo "=== /api/auth-roles ==="
curl -s -w "\nStatus: %{http_code}\n" "https://apply.mihas.edu.zm/api/auth-roles" -H "Authorization: Bearer $TOKEN"

echo -e "\n=== /api/notifications ==="
curl -s -w "\nStatus: %{http_code}\n" "https://apply.mihas.edu.zm/api/notifications" -H "Authorization: Bearer $TOKEN" | head -10

echo -e "\n=== /applications (draft) ==="
curl -s -w "\nStatus: %{http_code}\n" "https://apply.mihas.edu.zm/applications?page=0&pageSize=1&status=draft&mine=true" -H "Authorization: Bearer $TOKEN"

echo -e "\n=== /applications/[id] ==="
curl -s -w "\nStatus: %{http_code}\n" "https://apply.mihas.edu.zm/applications/3eb2a6b8-8e93-4e0c-a8b7-73537615b87e" -H "Authorization: Bearer $TOKEN" | head -5
