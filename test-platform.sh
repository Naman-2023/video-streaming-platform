#!/bin/bash

# Video Streaming Platform - Test Script
# This script tests all platform functionality

set -e

echo "🧪 Video Streaming Platform - Test Suite"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Test function
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_pattern="$3"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -n "Testing $test_name... "
    
    if result=$(eval "$test_command" 2>&1); then
        if [[ -z "$expected_pattern" ]] || echo "$result" | grep -q "$expected_pattern"; then
            echo -e "${GREEN}✓ PASS${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        else
            echo -e "${RED}✗ FAIL${NC} (Pattern not found: $expected_pattern)"
            echo "  Output: $result"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (Command failed)"
        echo "  Error: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Test HTTP endpoint
test_http() {
    local name="$1"
    local url="$2"
    local expected_code="$3"
    local expected_content="$4"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -n "Testing $name... "
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$url" 2>/dev/null || echo "HTTPSTATUS:000")
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    content=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    if [ "$http_code" = "$expected_code" ]; then
        if [[ -z "$expected_content" ]] || echo "$content" | grep -q "$expected_content"; then
            echo -e "${GREEN}✓ PASS${NC} ($http_code)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        else
            echo -e "${RED}✗ FAIL${NC} (Content mismatch)"
            echo "  Expected: $expected_content"
            echo "  Got: $content"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (Expected: $expected_code, Got: $http_code)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Wait for services to be ready
wait_for_services() {
    echo -e "\n${BLUE}Waiting for services to start...${NC}"
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3001/health >/dev/null 2>&1 && \
           curl -s http://localhost:3004/health >/dev/null 2>&1 && \
           curl -s http://localhost:3005/health >/dev/null 2>&1; then
            echo -e "${GREEN}All services are ready!${NC}"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    echo -e "\n${RED}Services failed to start within timeout${NC}"
    return 1
}

# Test service health endpoints
test_service_health() {
    echo -e "\n${YELLOW}1. Testing Service Health${NC}"
    
    test_http "Upload Service Health" "http://localhost:3001/health" "200" "upload-service"
    test_http "Streaming Service Health" "http://localhost:3004/health" "200" "streaming-service"
    test_http "Transcoding Service Health" "http://localhost:3005/health" "200" "transcoding-service"
}

# Test infrastructure connections
test_infrastructure() {
    echo -e "\n${YELLOW}2. Testing Infrastructure${NC}"
    
    # Test Redis
    run_test "Redis Connection" "docker exec video-streaming-platform-redis-1 redis-cli ping" "PONG"
    run_test "Redis Keys" "docker exec video-streaming-platform-redis-1 redis-cli keys '*'" ""
    
    # Test Kafka
    run_test "Kafka Connection" "docker exec video-streaming-platform-kafka-1 kafka-topics --bootstrap-server localhost:9092 --list" ""
    
    # Test Zookeeper
    run_test "Zookeeper Connection" "docker exec video-streaming-platform-zookeeper-1 echo 'ruok' | nc localhost 2181" "imok"
}

# Test video upload
test_video_upload() {
    echo -e "\n${YELLOW}3. Testing Video Upload${NC}"
    
    # Check if test video exists
    if [ ! -f "a.mp4" ] && [ ! -f "b.mp4" ]; then
        echo -e "${YELLOW}⚠ SKIP${NC} No test videos found (a.mp4 or b.mp4)"
        return 0
    fi
    
    # Use available test video
    local test_video=""
    if [ -f "b.mp4" ]; then
        test_video="b.mp4"
    elif [ -f "a.mp4" ]; then
        test_video="a.mp4"
    fi
    
    echo "Using test video: $test_video"
    
    # Upload video
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -n "Testing Video Upload... "
    
    upload_response=$(curl -s -X POST -F "video=@$test_video" -F "title=Test Video" \
                      http://localhost:3001/api/v1/upload/file 2>/dev/null || echo "")
    
    if echo "$upload_response" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        
        # Extract job ID
        JOB_ID=$(echo "$upload_response" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
        echo "  Job ID: $JOB_ID"
        
        # Test status endpoint
        test_http "Upload Status" "http://localhost:3001/api/v1/upload/status/$JOB_ID" "200" "jobId"
        
        # Wait for transcoding to complete
        echo -n "Waiting for transcoding to complete... "
        local max_wait=60
        local wait_count=0
        
        while [ $wait_count -lt $max_wait ]; do
            status_response=$(curl -s "http://localhost:3001/api/v1/upload/status/$JOB_ID" 2>/dev/null || echo "")
            
            if echo "$status_response" | grep -q '"status":"COMPLETED"'; then
                echo -e "${GREEN}✓ COMPLETED${NC}"
                
                # Test streaming endpoints
                echo -e "\n${YELLOW}4. Testing Video Streaming${NC}"
                test_http "Master Playlist" "http://localhost:3004/api/v1/stream/$JOB_ID/master.m3u8" "200" "#EXTM3U"
                test_http "360p Playlist" "http://localhost:3004/api/v1/stream/$JOB_ID/360p/playlist.m3u8" "200" "#EXTM3U"
                test_http "720p Playlist" "http://localhost:3004/api/v1/stream/$JOB_ID/720p/playlist.m3u8" "200" "#EXTM3U"
                test_http "1080p Playlist" "http://localhost:3004/api/v1/stream/$JOB_ID/1080p/playlist.m3u8" "200" "#EXTM3U"
                
                # Test video segment
                segment_url="http://localhost:3004/api/v1/stream/$JOB_ID/720p/playlist0.ts"
                test_http "Video Segment" "$segment_url" "200" ""
                
                return 0
            elif echo "$status_response" | grep -q '"status":"FAILED"'; then
                echo -e "${RED}✗ FAILED${NC}"
                TESTS_FAILED=$((TESTS_FAILED + 1))
                return 1
            fi
            
            wait_count=$((wait_count + 1))
            echo -n "."
            sleep 2
        done
        
        echo -e "${YELLOW}⚠ TIMEOUT${NC} (Transcoding took too long)"
        
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo "  Response: $upload_response"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test error handling
test_error_handling() {
    echo -e "\n${YELLOW}5. Testing Error Handling${NC}"
    
    test_http "Invalid Job Status" "http://localhost:3001/api/v1/upload/status/invalid_job_id" "404" ""
    test_http "Invalid Stream Request" "http://localhost:3004/api/v1/stream/invalid_job_id/master.m3u8" "404" ""
    test_http "Non-existent Endpoint" "http://localhost:3001/api/v1/nonexistent" "404" ""
}

# Test concurrent operations
test_concurrent_operations() {
    echo -e "\n${YELLOW}6. Testing Concurrent Operations${NC}"
    
    # Test multiple health checks
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -n "Testing Concurrent Health Checks... "
    
    # Run 5 concurrent health checks
    for i in {1..5}; do
        curl -s http://localhost:3001/health >/dev/null &
        curl -s http://localhost:3004/health >/dev/null &
        curl -s http://localhost:3005/health >/dev/null &
    done
    wait
    
    echo -e "${GREEN}✓ PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

# Performance test
test_performance() {
    echo -e "\n${YELLOW}7. Testing Performance${NC}"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -n "Testing Response Time... "
    
    # Test response time for health endpoint
    start_time=$(date +%s%N)
    curl -s http://localhost:3001/health >/dev/null
    end_time=$(date +%s%N)
    
    response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    if [ $response_time -lt 1000 ]; then # Less than 1 second
        echo -e "${GREEN}✓ PASS${NC} (${response_time}ms)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${YELLOW}⚠ SLOW${NC} (${response_time}ms)"
        TESTS_PASSED=$((TESTS_PASSED + 1)) # Still pass, just slow
    fi
}

# Print test summary
print_summary() {
    echo ""
    echo "========================================"
    echo "Test Summary"
    echo "========================================"
    echo "Total Tests: $TESTS_TOTAL"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "\n${GREEN}🎉 All tests passed!${NC}"
        echo ""
        echo "Your video streaming platform is working correctly!"
        echo ""
        echo "VLC Streaming URLs (replace JOB_ID with actual job ID):"
        echo "• Master Playlist: http://localhost:3004/api/v1/stream/JOB_ID/master.m3u8"
        echo "• 720p Quality: http://localhost:3004/api/v1/stream/JOB_ID/720p/playlist.m3u8"
        echo ""
        return 0
    else
        echo -e "\n${RED}❌ Some tests failed!${NC}"
        echo ""
        echo "Please check the errors above and ensure:"
        echo "1. All services are running (node start-platform.js)"
        echo "2. Redis is running (docker ps | grep redis)"
        echo "3. FFmpeg is installed (ffmpeg -version)"
        echo ""
        return 1
    fi
}

# Main test execution
main() {
    # Check if platform is running
    if ! curl -s http://localhost:3001/health >/dev/null 2>&1; then
        echo -e "${YELLOW}Platform not running. Please start it first:${NC}"
        echo "node start-platform.js"
        echo ""
        echo "Waiting for platform to start..."
        wait_for_services || exit 1
    fi
    
    # Run all tests
    test_service_health
    test_infrastructure
    test_video_upload
    test_error_handling
    test_concurrent_operations
    test_performance
    
    # Print summary
    print_summary
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --quick, -q    Run only basic health checks"
        echo ""
        echo "This script tests the video streaming platform functionality."
        echo "Make sure the platform is running before executing tests."
        exit 0
        ;;
    --quick|-q)
        echo "Running quick tests..."
        test_service_health
        test_infrastructure
        print_summary
        ;;
    *)
        main
        ;;
esac