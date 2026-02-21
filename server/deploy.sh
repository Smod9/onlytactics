#!/bin/bash
set -euo pipefail

# Copy src directory into server for Docker build context
echo "Copying src directory..."
cp -r ../src ./src-parent

# Copy client root (package files, vite config, source, etc.) for Docker build
echo "Copying client root..."
mkdir -p ./client-root
cp ../package.json ../package-lock.json ../tsconfig*.json ../vite.config.ts ../index.html ./client-root/
cp -r ../src ./client-root/src
[ -d ../public ] && cp -r ../public ./client-root/public || true
[ -f ../CHANGELOG.md ] && cp ../CHANGELOG.md ./client-root/ || true

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
rm -rf ./src-parent ./client-root
