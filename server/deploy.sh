#!/bin/bash
set -e

set -euo pipefail

# Copy src directory into server for Docker build context
echo "Copying src directory..."
cp -r ../src ./src-parent

# Authenticate with Fly (token must be provided)
if [ -z "${FLY_API_TOKEN:-}" ]; then
  echo "FLY_API_TOKEN is required" >&2
  exit 1
fi
flyctl auth token "$FLY_API_TOKEN"

# Deploy to Fly.io
echo "Deploying to Fly.io..."
flyctl deploy --app onlytactics-server

# Clean up
echo "Cleaning up..."
rm -rf ./src-parent

