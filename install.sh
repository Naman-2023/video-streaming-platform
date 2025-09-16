#!/bin/bash

# Video Streaming Platform - Installation Script
# This script installs all dependencies and sets up the platform

set -e  # Exit on any error

echo "🎬 Video Streaming Platform - Installation"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js version
check_node_version() {
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)
        
        if [ "$MAJOR_VERSION" -ge 18 ]; then
            print_success "Node.js $NODE_VERSION found"
            return 0
        else
            print_error "Node.js version $NODE_VERSION is too old. Need version 18 or higher."
            return 1
        fi
    else
        print_error "Node.js not found"
        return 1
    fi
}

# Install Node.js (macOS/Linux)
install_nodejs() {
    print_status "Installing Node.js..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command_exists brew; then
            brew install node
        else
            print_error "Homebrew not found. Please install Node.js manually from https://nodejs.org/"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command_exists apt-get; then
            curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command_exists yum; then
            curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
            sudo yum install -y nodejs
        else
            print_error "Package manager not supported. Please install Node.js manually."
            exit 1
        fi
    else
        print_error "Operating system not supported. Please install Node.js manually."
        exit 1
    fi
}

# Check FFmpeg
check_ffmpeg() {
    if command_exists ffmpeg; then
        FFMPEG_VERSION=$(ffmpeg -version 2>/dev/null | head -n1 | cut -d' ' -f3)
        print_success "FFmpeg $FFMPEG_VERSION found"
        return 0
    else
        print_error "FFmpeg not found"
        return 1
    fi
}

# Install FFmpeg
install_ffmpeg() {
    print_status "Installing FFmpeg..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command_exists brew; then
            brew install ffmpeg
        else
            print_error "Homebrew not found. Please install FFmpeg manually."
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command_exists apt-get; then
            sudo apt update
            sudo apt install -y ffmpeg
        elif command_exists yum; then
            sudo yum install -y ffmpeg
        else
            print_error "Package manager not supported. Please install FFmpeg manually."
            exit 1
        fi
    else
        print_error "Operating system not supported. Please install FFmpeg manually."
        exit 1
    fi
}

# Check Docker
check_docker() {
    if command_exists docker; then
        if docker info >/dev/null 2>&1; then
            DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
            print_success "Docker $DOCKER_VERSION found and running"
            return 0
        else
            print_warning "Docker found but not running"
            return 1
        fi
    else
        print_error "Docker not found"
        return 1
    fi
}

# Install Docker
install_docker() {
    print_status "Installing Docker..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command_exists brew; then
            brew install --cask docker
            print_warning "Please start Docker Desktop manually after installation"
        else
            print_error "Homebrew not found. Please install Docker Desktop manually."
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command_exists apt-get; then
            sudo apt update
            sudo apt install -y docker.io
            sudo systemctl start docker
            sudo systemctl enable docker
            sudo usermod -aG docker $USER
            print_warning "Please log out and log back in for Docker permissions to take effect"
        elif command_exists yum; then
            sudo yum install -y docker
            sudo systemctl start docker
            sudo systemctl enable docker
            sudo usermod -aG docker $USER
            print_warning "Please log out and log back in for Docker permissions to take effect"
        else
            print_error "Package manager not supported. Please install Docker manually."
            exit 1
        fi
    else
        print_error "Operating system not supported. Please install Docker manually."
        exit 1
    fi
}

# Start infrastructure (Kafka, Zookeeper, Redis)
start_infrastructure() {
    print_status "Starting infrastructure with Docker Compose..."
    
    # Check if docker-compose.yml exists
    if [ ! -f "docker-compose.yml" ]; then
        print_error "docker-compose.yml not found"
        exit 1
    fi
    
    # Start infrastructure
    docker-compose up -d
    
    # Wait for services to be ready
    print_status "Waiting for infrastructure to be ready..."
    sleep 15
    
    # Test Redis
    if docker exec video-streaming-platform-redis-1 redis-cli ping >/dev/null 2>&1; then
        print_success "Redis is running"
    else
        print_error "Failed to start Redis"
        exit 1
    fi
    
    # Test Kafka
    if docker exec video-streaming-platform-kafka-1 kafka-topics --bootstrap-server localhost:9092 --list >/dev/null 2>&1; then
        print_success "Kafka is running"
    else
        print_error "Failed to start Kafka"
        exit 1
    fi
    
    print_success "Infrastructure is running"
}

# Install project dependencies
install_dependencies() {
    print_status "Installing project dependencies..."
    
    # Install root dependencies
    print_status "Installing root dependencies..."
    npm install
    
    # Install service dependencies
    print_status "Installing upload-service dependencies..."
    cd services/upload-service && npm install && cd ../..
    
    print_status "Installing streaming-service dependencies..."
    cd services/streaming-service && npm install && cd ../..
    
    print_status "Installing transcoding-service dependencies..."
    cd services/transcoding-service && npm install && cd ../..
    
    print_success "All dependencies installed"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    mkdir -p transcoded
    mkdir -p services/upload-service/uploads
    
    # Set permissions
    chmod 755 transcoded
    chmod 755 services/upload-service/uploads
    
    print_success "Directories created"
}

# Test installation
test_installation() {
    print_status "Testing installation..."
    
    # Test Node.js
    if ! check_node_version; then
        print_error "Node.js test failed"
        return 1
    fi
    
    # Test FFmpeg
    if ! check_ffmpeg; then
        print_error "FFmpeg test failed"
        return 1
    fi
    
    # Test Docker
    if ! check_docker; then
        print_error "Docker test failed"
        return 1
    fi
    
    # Test Redis
    if ! docker exec video-streaming-platform-redis-1 redis-cli ping >/dev/null 2>&1; then
        print_error "Redis test failed"
        return 1
    fi
    
    # Test Kafka
    if ! docker exec video-streaming-platform-kafka-1 kafka-topics --bootstrap-server localhost:9092 --list >/dev/null 2>&1; then
        print_error "Kafka test failed"
        return 1
    fi
    
    print_success "All tests passed"
    return 0
}

# Main installation process
main() {
    echo ""
    print_status "Starting installation process..."
    echo ""
    
    # Check and install Node.js
    if ! check_node_version; then
        install_nodejs
    fi
    
    # Check and install FFmpeg
    if ! check_ffmpeg; then
        install_ffmpeg
    fi
    
    # Check and install Docker
    if ! check_docker; then
        install_docker
        print_warning "Docker was just installed. You may need to restart your terminal or log out/in."
        print_status "Attempting to continue with Docker setup..."
    fi
    
    # Start infrastructure
    start_infrastructure
    
    # Create directories
    create_directories
    
    # Install dependencies
    install_dependencies
    
    # Test installation
    if test_installation; then
        echo ""
        echo "🎉 Installation completed successfully!"
        echo ""
        echo "🎉 Event-Driven Video Streaming Platform Ready!"
        echo ""
        echo "Next steps:"
        echo "1. Start the platform: node start-platform.js"
        echo "2. Upload a video: curl -X POST -F \"video=@video.mp4\" -F \"title=My Video\" http://localhost:3000/api/upload/file"
        echo "3. Transcoding starts automatically via Kafka!"
        echo "4. Stream the video in VLC using the returned job ID"
        echo ""
        echo "Infrastructure running:"
        echo "• Kafka (Event Streaming): localhost:9092"
        echo "• Redis (Status Cache): localhost:6379"
        echo "• Zookeeper (Coordination): localhost:2181"
        echo ""
        echo "For more information, see README.md"
        echo ""
    else
        print_error "Installation test failed. Please check the errors above."
        exit 1
    fi
}

# Run main function
main "$@"