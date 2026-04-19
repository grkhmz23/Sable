#!/bin/bash
set -e

echo "Building Sable..."

# Build Anchor program
echo "Building Anchor program..."
cd programs/sable
anchor build
cd ../..

# Sync IDL
echo "Syncing IDL..."
node scripts/idl-sync.js

# Build SDK
echo "Building SDK..."
cd packages/sdk
pnpm build
cd ../..

# Build Common
echo "Building Common..."
cd packages/common
pnpm build
cd ../..

echo "Build complete!"
