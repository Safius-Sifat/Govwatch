#!/usr/bin/env bash
# End-to-end integration test for the ShottoPrakash Worker.
#
# Prereqs:
#   1. wrangler dev is running on http://localhost:8787
#      (cd backend/workers && npx wrangler dev --config=wrangler.local.toml --port 8787)
#   2. D1 has the schema and seed applied
#      (cd backend/workers && npx wrangler d1 execute shotto-db --config=wrangler.local.toml --file=./schema/schema.sql)
#
# Usage:
#   ./scripts/integration_test.sh

set -e

GATEWAY="${GATEWAY:-http://localhost:8787}"

echo ""
echo "=== ShottoPrakash Integration Test ==="
echo "Gateway: $GATEWAY"
echo ""

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

# --- 1. Health ---
echo "[1] Health check"
RESP=$(curl -s "$GATEWAY/")
echo "  $RESP"
echo "$RESP" | grep -q '"status":"ok"' && pass "Health endpoint OK" || fail "Health endpoint failed"

# --- 2. Stats ---
echo ""
echo "[2] Stats"
RESP=$(curl -s "$GATEWAY/api/stats")
echo "  $RESP"
echo "$RESP" | grep -q '"contracts"' && pass "Stats endpoint OK" || fail "Stats endpoint failed"

# --- 3. Anomalies ---
echo ""
echo "[3] Anomalies (should return at least 1 outlier from seed data)"
RESP=$(curl -s "$GATEWAY/api/anomalies")
echo "  $RESP"
echo "$RESP" | grep -q '"count":' && pass "Anomalies endpoint OK" || fail "Anomalies endpoint failed"

# --- 4. Top vendors ---
echo ""
echo "[4] Top vendors"
RESP=$(curl -s "$GATEWAY/api/vendors/top")
echo "  $RESP"
echo "$RESP" | grep -q '"vendors"' && pass "Top vendors OK" || fail "Top vendors failed"

# --- 5. Vendor collusion ---
echo ""
echo "[5] Vendor collusion graph (M/S RAHMAN ENTERPRISE)"
RESP=$(curl -s "$GATEWAY/api/vendors/M%2FS%20RAHMAN%20ENTERPRISE/collusion")
echo "  $RESP" | head -10
echo "$RESP" | grep -q '"directors"' && pass "Vendor graph OK" || fail "Vendor graph failed"

# --- 6. Single ingest ---
echo ""
echo "[6] Single contract ingest"
RESP=$(curl -s -X POST "$GATEWAY/api/ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "contract": {
      "tender_id": "INT_TEST_001",
      "package_name": "Integration test contract",
      "winner_name": "M/S INTEGRATION TEST",
      "contract_price_bdt": 1500000,
      "procuring_entity_district": "Rajshahi",
      "procurement_method": "OTM",
      "ministry": "Test Ministry",
      "search_text": "Integration test contract in Rajshahi awarded to M/S INTEGRATION TEST"
    }
  }')
echo "  $RESP"
echo "$RESP" | grep -q '"tender_id":"INT_TEST_001"' && pass "Ingest OK" || fail "Ingest failed"

# --- 7. Search (English) ---
echo ""
echo "[7] Search — English keyword 'tube well'"
RESP=$(curl -sN -X POST "$GATEWAY/api/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "tube well"}')
echo "$RESP" | head -15
echo "$RESP" | grep -q "event: citations" && pass "Search SSE stream OK" || fail "Search failed"
echo "$RESP" | grep -q "event: text-delta" && pass "Search returns text-delta events" || fail "No text-delta"
echo "$RESP" | grep -q "event: done" && pass "Search completes with done event" || fail "No done event"

# --- 8. Search (Bangla) ---
echo ""
echo "[8] Search — Bangla (language detection)"
RESP=$(curl -sN -X POST "$GATEWAY/api/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "নলকূপ"}')
echo "$RESP" | head -10
echo "$RESP" | grep -q "event: text-delta" && pass "Bangla query streams OK" || fail "Bangla query failed"

# --- 9. Search returns anomaly card ---
echo ""
echo "[9] Search triggers anomaly card (query that matches outlier)"
RESP=$(curl -sN -X POST "$GATEWAY/api/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "DPHE Habiganj tube well"}')
echo "$RESP" | grep -q "event: anomaly" && pass "Anomaly card emitted" || fail "No anomaly card"

# --- 10. Ministries ---
echo ""
echo "[10] Ministries list"
RESP=$(curl -s "$GATEWAY/api/ministries")
echo "  $RESP"
echo "$RESP" | grep -q '"ministries"' && pass "Ministries OK" || fail "Ministries failed"

# --- 11. Districts ---
echo ""
echo "[11] Districts list"
RESP=$(curl -s "$GATEWAY/api/districts")
echo "  $RESP"
echo "$RESP" | grep -q '"districts"' && pass "Districts OK" || fail "Districts failed"

# --- 12. Batch ingest ---
echo ""
echo "[12] Batch ingest (NDJSON)"
UNIQUE_ID="INT_BATCH_$(date +%s)"
echo "  Using ID: $UNIQUE_ID"
# /api/ingest-batch expects flat NDJSON records (one contract per line).
# Format: {"tender_id": "...", "package_name": "...", ...}
printf '{"tender_id":"%s","package_name":"Khulna construction","winner_name":"M/S BATCH Y","contract_price_bdt":2000000,"procuring_entity_district":"Khulna","search_text":"Khulna road construction contract awarded to M/S BATCH Y"}\n' "$UNIQUE_ID" > /tmp/batch_ndjson.txt
cat /tmp/batch_ndjson.txt
curl -s -X POST "$GATEWAY/api/ingest-batch" \
    -H "Content-Type: application/x-ndjson" \
    --data-binary @/tmp/batch_ndjson.txt > /tmp/batch_resp.json
cat /tmp/batch_resp.json
echo ""
grep -q '"ok":' /tmp/batch_resp.json && pass "Batch ingest OK" || fail "Batch ingest failed"

# --- 13. Search for newly batch-ingested ---
echo ""
echo "[13] Search finds batch-ingested contract"
sleep 1  # give FTS trigger a moment to flush
RESP=$(curl -sN -X POST "$GATEWAY/api/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "Khulna construction"}')
echo "$RESP" | head -10
echo "$RESP" | grep -q "$UNIQUE_ID" && pass "Batch-ingested contract searchable" || fail "Batch-ingested contract not found"

echo ""
echo "=== All tests passed ==="