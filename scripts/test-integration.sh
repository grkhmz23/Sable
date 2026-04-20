#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "=== Sable Integration Test Runner ==="

# Configuration
VALIDATOR_RPC="${SOLANA_RPC_URL:-http://127.0.0.1:8899}"
PER_MOCK_URL="${SABLE_PER_MOCK_URL:-http://localhost:3333}"
PAYMENTS_MOCK_URL="${SABLE_PRIVATE_PAYMENTS_API_URL:-http://localhost:4444}"
X402_FACILITATOR_URL="${SABLE_X402_FACILITATOR_URL:-http://localhost:5555}"

# Check if local validator is running
if ! curl -s "$VALIDATOR_RPC" > /dev/null 2>&1; then
  echo "WARNING: Local validator not detected at $VALIDATOR_RPC"
  echo "Start it with: solana-test-validator"
  echo "Or with cloned programs:"
  echo "  solana-test-validator --clone-upgradeable-program DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh devnet --clone-upgradeable-program ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1 devnet"
  exit 1
fi

echo "✓ Local validator at $VALIDATOR_RPC"

# Check services (warn but don't fail — tests may skip)
check_service() {
  local url=$1
  local name=$2
  if curl -s "$url" > /dev/null 2>&1 || curl -s "$url/health" > /dev/null 2>&1; then
    echo "✓ $name at $url"
  else
    echo "⚠ $name not detected at $url (some tests may fail)"
  fi
}

check_service "$PER_MOCK_URL" "PER Mock Middleware"
check_service "$PAYMENTS_MOCK_URL" "Payments API Mock"
check_service "$X402_FACILITATOR_URL" "x402 Facilitator"

# Ensure IDL is synced
echo ""
echo "=== Syncing IDL ==="
node scripts/idl-sync.js || true

# Build SDK if needed
echo ""
echo "=== Building workspace ==="
pnpm -r build

# Run local integration tests
echo ""
echo "=== Running local integration tests ==="
if [ "$1" = "--live" ]; then
  export SABLE_RUN_LIVE_TESTS=1
  echo "Live tests ENABLED"
fi

npx mocha --require tsx 'tests/integration/**/*.spec.ts' --timeout 120000 "$@"

echo ""
echo "=== Integration tests complete ==="
