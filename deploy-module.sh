#!/bin/bash
# Build the Foundry module from this checkout and deploy it over the installed copy.
# Run after rebasing the custom branch onto a new upstream tag; then reload Foundry (F5).
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
MOD="${FOUNDRY_MODULE_DIR:-/home/marc/foundryuserdata/Data/modules/foundry-mcp-bridge}"

cd "$REPO"
npm run build:foundry
rsync -a --delete --exclude node_modules "$REPO/packages/foundry-module/" "$MOD/"
echo "Deployed foundry-mcp-bridge $(node -p "require('$MOD/module.json').version") to $MOD"
