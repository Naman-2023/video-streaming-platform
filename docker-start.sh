#!/bin/bash

# Docker startup script for Video Streaming Platform

echo "🐳 Starting Video Streaming Platform in Docker"
echo "=============================================="

# Start Redis in background
echo "Starting Redis server..."
redis-server --daemonize yes --port 6379

# Wait for Redis to be ready
sleep 3

# Verify Redis is running
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis server started successfully"
else
    echo "❌ Failed to start Redis server"
    exit 1
fi

# Start the platform
echo "Starting video streaming platform..."
exec node start-platform.js