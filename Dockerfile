# Video Streaming Platform - Complete Docker Setup
FROM node:18-alpine

# Install FFmpeg and other dependencies
RUN apk add --no-cache \
    ffmpeg \
    redis \
    bash \
    curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy service package files
COPY services/upload-service/package*.json ./services/upload-service/
COPY services/streaming-service/package*.json ./services/streaming-service/
COPY services/transcoding-service/package*.json ./services/transcoding-service/

# Install dependencies
RUN npm install
RUN cd services/upload-service && npm install
RUN cd services/streaming-service && npm install
RUN cd services/transcoding-service && npm install

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p transcoded services/upload-service/uploads

# Set permissions
RUN chmod +x start-platform.js install.sh test-platform.sh

# Expose ports
EXPOSE 3001 3004 3005 6379

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start script
COPY docker-start.sh /app/docker-start.sh
RUN chmod +x /app/docker-start.sh

CMD ["/app/docker-start.sh"]