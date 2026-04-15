#!/bin/bash

# Configuration
URL="http://localhost:3000/api/chat"
BYPASS_HEADER="x-test-bypass: true"
QUERY="cach cham soc nguoi benh alzheimer"

echo "=== DEBUGGING QUERY: $QUERY ==="

# TEST RAG MODE
CHAT_ID_RAG="debug-rag-$(date +%s)"
curl -s -v -X POST "$URL" \
  -H "$BYPASS_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$CHAT_ID_RAG\",
    \"messages\": [
      {
        \"id\": \"msg-$CHAT_ID_RAG\",
        \"role\": \"user\",
        \"parts\": [{ \"type\": \"text\", \"text\": \"$QUERY\" }]
      }
    ],
    \"mode\": \"rag\"
  }" 2> curl_debug.txt | head -n 500

echo ""
echo "=== DEBUGGING FINISHED ==="
