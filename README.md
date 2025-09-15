# Video Streaming Platform

A simple microservices-based video streaming platform with automatic transcoding and HLS streaming.

## Features

- 🎬 **Video Upload**: Upload MP4 videos via REST API
- 🔄 **Auto Transcoding**: Automatic conversion to multiple qualities (360p, 720p, 1080p)
- 📺 **HLS Streaming**: HTTP Live Streaming with adaptive bitrate
- ⚡ **Real-time Status**: Track upload and transcoding progress
- 🎯 **Simple Architecture**: Three focused microservices

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
```

### 3. Start Platform

```bash
node start-platform.js
```

The platform will start on:
- Upload Service: http://localhost:3001
- Streaming Service: http://localhost:3004  
- Transcoding Service: http://localhost:3005

## Usage

### Upload a Video

```bash
curl -X POST -F "video=@your-video.mp4" -F "title=My Video" \
     http://localhost:3001/api/v1/upload/file
```

Response:
```json
{
  "success": true,
  "data": {
    "jobId": "job_1234567890_abcdef",
    "status": "QUEUED",
    "message": "File uploaded successfully and queued for processing"
  }
}
```

### Check Status

```bash
curl http://localhost:3001/api/v1/upload/status/job_1234567890_abcdef
```

### Stream Video

Once transcoding is complete, stream using:

**Master Playlist (Adaptive):**
```
http://localhost:3004/api/v1/stream/job_1234567890_abcdef/master.m3u8
```

**Individual Qualities:**
```
http://localhost:3004/api/v1/stream/job_1234567890_abcdef/360p/playlist.m3u8
http://localhost:3004/api/v1/stream/job_1234567890_abcdef/720p/playlist.m3u8
http://localhost:3004/api/v1/stream/job_1234567890_abcdef/1080p/playlist.m3u8
```

### Play in VLC

1. Open VLC Media Player
2. Go to Media → Open Network Stream
3. Paste the master playlist URL
4. Click Play

## Architecture

```
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

- **Upload Service**: Handles file uploads and triggers transcoding
- **Transcoding Service**: Converts videos to multiple qualities using FFmpeg
- **Streaming Service**: Serves HLS playlists and video segments

## File Structure

```
video-streaming-platform/
├── services/
│   ├── upload-service/          # File upload and management
│   ├── streaming-service/       # HLS streaming
│   └── transcoding-service/     # Video processing
├── transcoded/                  # Processed video files
├── start-platform.js           # Platform launcher
└── README.md                   # This file
```

## Development

### Stop Platform

Press `Ctrl+C` in the terminal running `start-platform.js`

### Clean Transcoded Files

```bash
rm -rf transcoded/*
```

### Reset Redis

```bash
docker exec redis-server redis-cli flushall
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