#!/bin/bash
set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

CLUSTER=${1:-devnet}
echo "Deploying to $CLUSTER..."

cd programs/l2conceptv1

# Deploy
anchor deploy --provider.cluster $CLUSTER

# Get program ID
PROGRAM_ID=$(solana address -k target/deploy/l2conceptv1-keypair.json)
echo "Program ID: $PROGRAM_ID"

# Initialize if needed
if [ "$INIT" = "true" ]; then
    echo "Initializing program..."
    anchor run initialize --provider.cluster $CLUSTER
fi

cd ../..

echo "Deployment complete!"
