# Testing Guide

## Quick Test

### 1. Start Platform
```bash
node start-platform.js
```

### 2. Upload Test Video
```bash
# Using a.mp4 (if available)
curl -X POST -F "video=@a.mp4" -F "title=Test Video A" \
     http://localhost:3001/api/v1/upload/file

# Using b.mp4 (if available)  
curl -X POST -F "video=@b.mp4" -F "title=Test Video B" \
     http://localhost:3001/api/v1/upload/file
```

### 3. Check Status
```bash
# Replace JOB_ID with the jobId from upload response
curl http://localhost:3001/api/v1/upload/status/JOB_ID
```

### 4. Stream Video
```bash
# Master playlist (adaptive streaming)
curl http://localhost:3004/api/v1/stream/JOB_ID/master.m3u8

# Individual quality
curl http://localhost:3004/api/v1/stream/JOB_ID/720p/playlist.m3u8
```

## Complete Test Workflow

### Test 1: Basic Upload and Streaming

```bash
# 1. Upload video
RESPONSE=$(curl -s -X POST -F "video=@a.mp4" -F "title=Test Video" \
           http://localhost:3001/api/v1/upload/file)
echo "Upload Response: $RESPONSE"

# 2. Extract job ID (manual step - copy from response)
JOB_ID="job_1234567890_abcdef"  # Replace with actual job ID

# 3. Monitor status
echo "Checking status..."
curl http://localhost:3001/api/v1/upload/status/$JOB_ID

# 4. Wait for completion (repeat until status is COMPLETED)
sleep 30
curl http://localhost:3001/api/v1/upload/status/$JOB_ID

# 5. Test streaming
echo "Testing master playlist..."
curl http://localhost:3004/api/v1/stream/$JOB_ID/master.m3u8

echo "Testing 720p playlist..."
curl http://localhost:3004/api/v1/stream/$JOB_ID/720p/playlist.m3u8
```

### Test 2: VLC Streaming

1. Upload a video and wait for completion
2. Copy the master playlist URL: `http://localhost:3004/api/v1/stream/JOB_ID/master.m3u8`
3. Open VLC Media Player
4. Go to Media → Open Network Stream
5. Paste the URL and click Play

### Test 3: Multiple Quality Streaming

```bash
# After video is transcoded, test all qualities
JOB_ID="your_job_id_here"

echo "=== Testing All Qualities ==="
echo "Master Playlist:"
curl -I http://localhost:3004/api/v1/stream/$JOB_ID/master.m3u8

echo -e "\n360p Playlist:"
curl -I http://localhost:3004/api/v1/stream/$JOB_ID/360p/playlist.m3u8

echo -e "\n720p Playlist:"
curl -I http://localhost:3004/api/v1/stream/$JOB_ID/720p/playlist.m3u8

echo -e "\n1080p Playlist:"
curl -I http://localhost:3004/api/v1/stream/$JOB_ID/1080p/playlist.m3u8
```

### Test 4: Error Handling

```bash
# Test invalid file upload
curl -X POST -F "video=@nonexistent.mp4" -F "title=Invalid" \
     http://localhost:3001/api/v1/upload/file

# Test invalid job ID
curl http://localhost:3001/api/v1/upload/status/invalid_job_id

# Test invalid stream request
curl http://localhost:3004/api/v1/stream/invalid_job_id/master.m3u8
```

## Automated Test Script

Create `test-platform.sh`:

```bash
#!/bin/bash

echo "🧪 Testing Video Streaming Platform"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_code="$3"
    
    echo -n "Testing $name... "
    
    response_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [ "$response_code" = "$expected_code" ]; then
        echo -e "${GREEN}✓ PASS${NC} ($response_code)"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Expected: $expected_code, Got: $response_code)"
        return 1
    fi
}

# Test service health endpoints
echo -e "\n${YELLOW}1. Testing Service Health${NC}"
test_endpoint "Upload Service" "http://localhost:3001/health" "200"
test_endpoint "Streaming Service" "http://localhost:3004/health" "200"
test_endpoint "Transcoding Service" "http://localhost:3005/health" "200"

# Test Redis connection
echo -e "\n${YELLOW}2. Testing Redis Connection${NC}"
if docker exec redis-server redis-cli ping > /dev/null 2>&1; then
    echo -e "Redis Connection... ${GREEN}✓ PASS${NC}"
else
    echo -e "Redis Connection... ${RED}✗ FAIL${NC}"
fi

# Test file upload (if test video exists)
echo -e "\n${YELLOW}3. Testing Video Upload${NC}"
if [ -f "a.mp4" ]; then
    echo "Uploading a.mp4..."
    UPLOAD_RESPONSE=$(curl -s -X POST -F "video=@a.mp4" -F "title=Test Video" \
                      http://localhost:3001/api/v1/upload/file)
    
    if echo "$UPLOAD_RESPONSE" | grep -q "success.*true"; then
        echo -e "Video Upload... ${GREEN}✓ PASS${NC}"
        
        # Extract job ID (basic extraction)
        JOB_ID=$(echo "$UPLOAD_RESPONSE" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
        echo "Job ID: $JOB_ID"
        
        # Test status endpoint
        echo "Testing status endpoint..."
        test_endpoint "Upload Status" "http://localhost:3001/api/v1/upload/status/$JOB_ID" "200"
        
    else
        echo -e "Video Upload... ${RED}✗ FAIL${NC}"
    fi
else
    echo -e "Video Upload... ${YELLOW}⚠ SKIP${NC} (a.mp4 not found)"
fi

echo -e "\n${YELLOW}Test Summary${NC}"
echo "=================================="
echo "Platform is ready for video streaming!"
echo ""
echo "Next steps:"
echo "1. Upload a video using the curl command"
echo "2. Wait for transcoding to complete"
echo "3. Stream using VLC or web browser"
```

Make it executable and run:

```bash
chmod +x test-platform.sh
./test-platform.sh
```

## Performance Testing

### Load Test Upload

```bash
# Test multiple concurrent uploads
for i in {1..5}; do
    curl -X POST -F "video=@a.mp4" -F "title=Load Test $i" \
         http://localhost:3001/api/v1/upload/file &
done
wait
```

### Streaming Performance

```bash
# Test concurrent streaming requests
JOB_ID="your_job_id_here"
for i in {1..10}; do
    curl -s http://localhost:3004/api/v1/stream/$JOB_ID/master.m3u8 > /dev/null &
done
wait
```

## Troubleshooting Tests

### Check Service Logs

```bash
# View logs in real-time
tail -f services/upload-service/logs/combined.log
tail -f services/streaming-service/logs/combined.log
```

### Check File System

```bash
# Check uploaded files
ls -la services/upload-service/uploads/

# Check transcoded files
ls -la transcoded/

# Check specific job files
ls -la transcoded/JOB_ID/
```

### Check Redis Status

```bash
# Check Redis keys
docker exec redis-server redis-cli keys "*"

# Check specific job status
docker exec redis-server redis-cli get "transcoding:status:JOB_ID"
```

## Expected Results

### Successful Upload Response
```json
{
  "success": true,
  "data": {
    "jobId": "job_1234567890_abcdef",
    "status": "QUEUED",
    "message": "File uploaded successfully and queued for processing"
  },
  "timestamp": "2025-01-09T..."
}
```

### Completed Status Response
```json
{
  "success": true,
  "data": {
    "jobId": "job_1234567890_abcdef",
    "status": "COMPLETED",
    "progress": 100,
    "currentStep": "Transcoding completed successfully",
    "estimatedTimeRemaining": 0
  },
  "timestamp": "2025-01-09T..."
}
```

### Master Playlist Response
```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1920x1080
1080p/playlist.m3u8
```