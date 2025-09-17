# Video Streaming Platform

A modern event-driven microservices video streaming platform with Kafka integration, automatic transcoding, and HLS streaming.

## Features

- 🎬 **Video Upload**: Upload multiple video formats (MP4, AVI, MOV, MKV, WebM, FLV)
- 🔄 **Auto Transcoding**: Automatic conversion to multiple qualities (360p, 720p, 1080p)
- 📺 **HLS Streaming**: HTTP Live Streaming with adaptive bitrate
- ⚡ **Real-time Status**: Track upload and transcoding progress via Redis
- 🚀 **Event-Driven**: Kafka-powered job queue for reliable processing
- 🎯 **Scalable Architecture**: Horizontally scalable worker processes
- 🔒 **Security**: Helmet.js security headers and CORS protection
- 📊 **Health Monitoring**: Built-in health checks for all services
- 💪 **Fault Tolerant**: Durable job processing with automatic retries
- 🔧 **TypeScript**: Full TypeScript implementation with strict typing

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- FFmpeg installed

### 1. Start Infrastructure (Kafka + Redis)

```bash
docker-compose up -d
```

This starts:

- **Kafka**: Event streaming platform (Port 9092)
- **Zookeeper**: Kafka coordination service (Port 2181)
- **Redis**: Status cache and rate limiting (Port 6379)

### 2. Install Dependencies

```bash
npm install
cd services/upload-service && npm install
cd ../streaming-service && npm install
cd ../transcoding-service && npm install
cd ../..
```

### 3. Start Platform

```bash
node start-platform.js
```

The platform will start on:

- **API Gateway: http://localhost:3000** (Main Entry Point)
- Upload Service: http://localhost:3001
- Streaming Service: http://localhost:3004
- Transcoding Service: http://localhost:3005

## Usage

### Upload a Video

**Via API Gateway (Recommended):**

```bash
curl -X POST -F "video=@your-video.mp4;type=video/mp4" -F "title=My Video" \
     http://localhost:3000/api/upload/file
```

**Direct to Upload Service:**

```bash
curl -X POST -F "video=@your-video.mp4;type=video/mp4" -F "title=My Video" \
     http://localhost:3001/api/v1/upload/file
```

Response:

```json
{
  "success": true,
  "data": {
    "jobId": "job_1758010126855_6lecfzv3a",
    "status": "QUEUED",
    "message": "File uploaded successfully and queued for processing"
  },
  "timestamp": "2025-09-16T08:08:46.869Z"
}
```

> **Note**: Transcoding starts automatically! No manual API call needed.

### Check Status

**Via API Gateway (Recommended):**

```bash
curl http://localhost:3000/api/upload/status/job_1758010126855_6lecfzv3a
```

**Direct to Upload Service:**

```bash
curl http://localhost:3001/api/v1/upload/status/job_1758010126855_6lecfzv3a
```

Response:

```json
{
  "success": true,
  "data": {
    "jobId": "job_1758010126855_6lecfzv3a",
    "status": "COMPLETED",
    "progress": 100,
    "currentStep": "Transcoding completed successfully",
    "estimatedTimeRemaining": 0
  },
  "timestamp": "2025-09-16T08:08:59.641Z"
}
```

### Stream Video

Once transcoding is complete, stream using:

**Via API Gateway (Recommended):**

```
http://localhost:3000/api/stream/job_1758010126855_6lecfzv3a/master.m3u8
http://localhost:3000/api/stream/job_1758010126855_6lecfzv3a/360p/playlist.m3u8
http://localhost:3000/api/stream/job_1758010126855_6lecfzv3a/720p/playlist.m3u8
http://localhost:3000/api/stream/job_1758010126855_6lecfzv3a/1080p/playlist.m3u8
```

**Direct to Streaming Service:**

```
http://localhost:3004/api/v1/stream/job_1758010126855_6lecfzv3a/master.m3u8
http://localhost:3004/api/v1/stream/job_1758010126855_6lecfzv3a/360p/playlist.m3u8
http://localhost:3004/api/v1/stream/job_1758010126855_6lecfzv3a/720p/playlist.m3u8
http://localhost:3004/api/v1/stream/job_1758010126855_6lecfzv3a/1080p/playlist.m3u8
```

### Play in VLC

1. Open VLC Media Player
2. Go to Media → Open Network Stream
3. Paste the master playlist URL
4. Click Play

## Architecture - Event-Driven Microservices

```
                    ┌─────────────────┐
                    │   API Gateway   │
                    │   Port: 3000    │ ← Single Entry Point
                    └─────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Upload Service │    │ Transcoding      │    │ Streaming       │
│  Port: 3001     │    │ Workers          │    │ Service         │
│                 │    │ Port: 3005       │    │ Port: 3004      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Kafka       │    │     Redis       │    │   File System   │
│   Port: 9092    │    │   Port: 6379    │    │   (transcoded)  │
│ Event Streaming │    │ Status & Cache  │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐
│   Zookeeper     │
│   Port: 2181    │
│  Coordination   │
└─────────────────┘

Event Flow: Upload → Kafka Topic → Worker Consumes → Processing → Ready Event
```

### 🔄 Event-Driven Workflow

1. **Upload**: User uploads video → Upload Service saves file
2. **Queue**: Upload Service publishes job to `video.transcoding.jobs` topic
3. **Process**: Transcoding Worker consumes job from Kafka
4. **Status**: Worker updates progress in Redis during processing
5. **Complete**: Worker publishes completion to `video.streaming.ready` topic
6. **Stream**: Video ready for HLS streaming

### Services

- **API Gateway**: Single entry point with routing, rate limiting, and health checks
- **Upload Service**: Handles file uploads and publishes jobs to Kafka
- **Transcoding Workers**: Consumer group that processes videos from Kafka queue
- **Streaming Service**: Serves HLS playlists and video segments

### Infrastructure

- **Kafka**: Event streaming platform for reliable job processing
  - `video.transcoding.jobs` - Main job queue (durable, fault-tolerant)
  - `video.streaming.ready` - Completion notifications
  - `transcoding-workers` - Consumer group for load balancing
- **Redis**: Real-time status updates and API rate limiting
- **Zookeeper**: Kafka coordination and metadata management

### 🚀 Scalability Benefits

- **Horizontal Scaling**: Run multiple transcoding workers
- **Fault Tolerance**: Jobs survive worker crashes
- **Load Balancing**: Kafka distributes jobs across workers
- **Durability**: Messages persisted until processed

## File Structure

```
video-streaming-platform/
├── api-gateway/                 # API Gateway (Port 3000)
│   └── src/
│       └── index.ts            # Main gateway with routing
├── services/
│   ├── shared/                  # Shared utilities and types
│   │   ├── types.ts            # Common TypeScript interfaces
│   │   └── utils.ts            # Shared utility functions
│   ├── upload-service/          # File upload and Kafka publisher
│   │   └── src/
│   │       ├── routes/          # Upload API routes
│   │       ├── kafka.ts         # Kafka producer configuration
│   │       ├── index.ts         # Main entry point
│   │       └── routes.ts        # Route exports
│   ├── streaming-service/       # HLS streaming
│   │   └── src/
│   │       └── index.ts         # Main entry point with streaming routes
│   └── transcoding-service/     # Video processing workers
│       └── src/
│           ├── kafka.ts         # Kafka consumer configuration
│           ├── index.ts         # Main API entry point
│           └── worker.ts        # Kafka consumer worker process
├── transcoded/                  # Processed video files
├── docker-compose.yml          # Kafka, Zookeeper, Redis infrastructure
├── start-platform.js           # Platform launcher
├── test-platform.sh           # Comprehensive test suite
└── README.md                   # This file
```

## Technology Stack

- **Backend**: Node.js, TypeScript, Express.js
- **Event Streaming**: Apache Kafka + Zookeeper
- **Caching**: Redis
- **Video Processing**: FFmpeg
- **Streaming**: HLS (HTTP Live Streaming)
- **Infrastructure**: Docker, Docker Compose
- **Architecture**: Event-Driven Microservices

## Development

### Test Platform

Run comprehensive tests:

```bash
./test-platform.sh
```

### Stop Platform

```bash
# Stop services
Press Ctrl+C in the terminal running start-platform.js

# Stop infrastructure
docker-compose down
```

### Clean Environment

```bash
# Clean transcoded files
rm -rf transcoded/*
rm -rf services/upload-service/uploads/*

# Reset Redis
docker exec redis-server redis-cli flushall

# Reset Kafka topics (optional)
docker-compose down -v
docker-compose up -d
```

### Build Services

```bash
# Build all services
npm run build

# Build individual service
cd services/upload-service && npm run build
```

### Scale Workers

```bash
# Run multiple transcoding workers for load testing
npm run worker &
npm run worker &
npm run worker &
```

### Monitor Kafka

```bash
# List topics
docker exec kafka kafka-topics --bootstrap-server localhost:9092 --list

# Monitor job queue
docker exec kafka kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic video.transcoding.jobs --from-beginning

# Monitor completion events
docker exec kafka kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic video.streaming.ready --from-beginning
```

## Troubleshooting

### Infrastructure Issues

**Kafka Connection Failed:**

```bash
# Check if Kafka is running
docker ps | grep kafka

# Restart infrastructure
docker-compose down && docker-compose up -d

# Check Kafka logs
docker logs kafka
```

**Redis Connection Failed:**

```bash
# Check if Redis is running
docker ps | grep redis

# Test Redis connection
docker exec redis-server redis-cli ping
```

### Service Issues

**FFmpeg Not Found:**

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

**Port Already in Use:**

```bash
# Kill existing processes
pkill -f "npm run dev"
pkill -f "tsx"

# Check what's using ports
lsof -i :3000,3001,3004,3005,9092,6379
```

**Worker Not Processing Jobs:**

```bash
# Check if worker is connected to Kafka
docker logs kafka | grep transcoding-workers

# Manually start worker
cd services/transcoding-service && npm run worker

# Check Kafka consumer groups
docker exec kafka kafka-consumer-groups --bootstrap-server localhost:9092 --list
```

### Performance Issues

**Slow Transcoding:**

```bash
# Run multiple workers
npm run worker &
npm run worker &

# Check system resources
htop
```

**High Memory Usage:**

```bash
# Restart services
docker-compose restart

# Check Docker stats
docker stats
```

## License

MIT License
