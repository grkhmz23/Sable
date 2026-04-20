#!/bin/bash
set -e

# x402 E2E Test Runner
# Starts all three components locally and runs the end-to-end test.
#
# Prerequisites:
#   - Local validator running with Sable program deployed
#   - All workspace packages built
#
# Usage:
#   ./scripts/test-x402.sh

echo "=== Sable x402 E2E Test ==="
echo ""

# Build all packages first
echo "Building workspace packages..."
pnpm -r build

echo ""
echo "Running x402 E2E test..."
cd services/x402-facilitator
node -r tsx/cjs ../../node_modules/.pnpm/mocha@11.7.5/node_modules/mocha/bin/mocha.js tests/x402-e2e.test.ts

echo ""
echo "=== x402 E2E test complete ==="
