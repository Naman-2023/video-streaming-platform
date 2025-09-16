# Video Streaming Platform

A production-ready microservices-based video streaming platform with automatic transcoding and HLS streaming.

## Features

- 🎬 **Video Upload**: Upload multiple video formats (MP4, AVI, MOV, MKV, WebM, FLV)
- 🔄 **Auto Transcoding**: Automatic conversion to multiple qualities (360p, 720p, 1080p)
- 📺 **HLS Streaming**: HTTP Live Streaming with adaptive bitrate
- ⚡ **Real-time Status**: Track upload and transcoding progress
- 🎯 **Clean Architecture**: Three optimized microservices
- 🔒 **Security**: Helmet.js security headers and CORS protection
- 📊 **Health Monitoring**: Built-in health checks for all services
- 🚀 **TypeScript**: Full TypeScript implementation with strict typing

## Quick Start

### Prerequisites

- Node.js 18+
- FFmpeg installed
- Redis server running

### 1. Start Redis

```bash
docker run -d --name redis-server -p 6379:6379 redis:7-alpine
```

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

## Architecture

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
│  Port: 3001     │───▶│ Service          │───▶│ Service         │
│                 │    │ Port: 3005       │    │ Port: 3004      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         └─────────────▶│     Redis       │◀─────────────┘
                        │   Port: 6379    │
                        └─────────────────┘
```

### Services

- **API Gateway**: Single entry point with routing, rate limiting, and health checks
- **Upload Service**: Handles file uploads and triggers transcoding
- **Transcoding Service**: Converts videos to multiple qualities using FFmpeg
- **Streaming Service**: Serves HLS playlists and video segments

## File Structure

```
video-streaming-platform/
├── api-gateway/                 # API Gateway (Port 3000)
│   └── src/
│       └── index.ts            # Main gateway with routing
├── services/
│   ├── upload-service/          # File upload and management
│   │   └── src/
│   │       ├── routes/          # Upload API routes
│   │       ├── index.ts         # Main entry point
│   │       └── routes.ts        # Route exports
│   ├── streaming-service/       # HLS streaming
│   │   └── src/
│   │       └── index.ts         # Main entry point with streaming routes
│   └── transcoding-service/     # Video processing
│       └── src/
│           ├── index.ts         # Main API entry point
│           └── worker.ts        # Worker process entry point
├── transcoded/                  # Processed video files
├── start-platform.js           # Platform launcher
├── test-platform.sh           # Comprehensive test suite
└── README.md                   # This file
```

## Development

### Test Platform

Run comprehensive tests:
```bash
./test-platform.sh
```

### Stop Platform

Press `Ctrl+C` in the terminal running `start-platform.js`

### Clean Transcoded Files

```bash
rm -rf transcoded/*
rm -rf services/upload-service/uploads/*
```

### Reset Redis

```bash
docker exec redis-server redis-cli flushall
```

### Build Services

```bash
# Build all services
npm run build

# Build individual service
cd services/upload-service && npm run build
```

## Troubleshooting

### FFmpeg Not Found
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian  
sudo apt install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

### Redis Connection Failed
```bash
# Check if Redis is running
docker ps | grep redis

# Start Redis if not running
docker run -d --name redis-server -p 6379:6379 redis:7-alpine
```

### Port Already in Use
```bash
# Kill existing processes
pkill -f "npm run dev"
pkill -f "tsx"
```

## License

MIT License