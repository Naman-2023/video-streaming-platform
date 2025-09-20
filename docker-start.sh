#!/bin/bash

# Docker startup script for Video Streaming Platform with Kafka

echo "🐳 Starting Event-Driven Video Streaming Platform in Docker"
echo "=========================================================="

# Wait for external infrastructure (Kafka, Redis, Zookeeper)
echo "Waiting for infrastructure to be ready..."

# Wait for Redis
echo -n "Waiting for Redis... "
while ! nc -z redis 6379; do
    sleep 1
    echo -n "."
done
echo " ✅ Redis ready"

# Wait for Kafka
echo -n "Waiting for Kafka... "
while ! nc -z kafka 9092; do
    sleep 1
    echo -n "."
done
echo " ✅ Kafka ready"

# Additional wait for Kafka to be fully ready
sleep 10

echo "🚀 Infrastructure ready, starting platform services..."

# Start the platform
exec node start-platform.js