#!/bin/bash
set -e

# Copy src directory into server for Docker build context
echo "Copying src directory..."
cp -r ../src ./src-parent

# Deploy to Fly.io
echo "Deploying to Fly.io..."
fly deploy --app onlytactics-server

# Clean up
echo "Cleaning up..."
rm -rf ./src-parent

