# Deployment Guide

## Quick Deployment Options

### Option 1: Local Development (Recommended for testing)

```bash
# 1. Install dependencies
./install.sh

# 2. Start platform
node start-platform.js

# 3. Test with video
curl -X POST -F "video=@your-video.mp4" -F "title=My Video" \
     http://localhost:3001/api/v1/upload/file
```

### Option 2: Docker (Single Container)

```bash
# 1. Build Docker image
docker build -t video-streaming-platform .

# 2. Run container
docker run -d \
  --name video-platform \
  -p 3001:3001 \
  -p 3004:3004 \
  -p 3005:3005 \
  -v $(pwd)/transcoded:/app/transcoded \
  video-streaming-platform

# 3. Test deployment
curl http://localhost:3001/health
```

### Option 3: Docker Compose

```bash
# 1. Start with Docker Compose
docker-compose up -d

# 2. Check status
docker-compose ps

# 3. View logs
docker-compose logs -f
```

## Production Deployment

### Prerequisites

- **Server**: Linux server with Docker support
- **Resources**: Minimum 2GB RAM, 2 CPU cores
- **Storage**: SSD recommended for video processing
- **Network**: Stable internet connection
- **Domain**: Optional, for custom domain setup

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Logout and login to apply Docker permissions
```

### Step 2: Deploy Application

```bash
# 1. Clone repository
git clone <your-repo-url>
cd video-streaming-platform

# 2. Create production environment file
cat > .env.production << EOF
NODE_ENV=production
REDIS_URL=redis://localhost:6379
UPLOAD_MAX_SIZE=100MB
TRANSCODING_TIMEOUT=300
LOG_LEVEL=info
EOF

# 3. Build and start
docker-compose up -d

# 4. Verify deployment
curl http://localhost:3001/health
```

### Step 3: Configure Reverse Proxy (Optional)

#### Using Nginx

```bash
# Install Nginx
sudo apt install nginx

# Create Nginx configuration
sudo tee /etc/nginx/sites-available/video-platform << EOF
server {
    listen 80;
    server_name your-domain.com;

    # Upload Service
    location /api/v1/upload/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        client_max_body_size 100M;
    }

    # Streaming Service
    location /api/v1/stream/ {
        proxy_pass http://localhost:3004;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # Health checks
    location /health {
        proxy_pass http://localhost:3001;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/video-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4: SSL Setup (Optional)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment mode |
| `REDIS_URL` | redis://localhost:6379 | Redis connection URL |
| `UPLOAD_MAX_SIZE` | 50MB | Maximum upload file size |
| `TRANSCODING_TIMEOUT` | 300 | Transcoding timeout in seconds |
| `LOG_LEVEL` | info | Logging level |
| `PORT_UPLOAD` | 3001 | Upload service port |
| `PORT_STREAMING` | 3004 | Streaming service port |
| `PORT_TRANSCODING` | 3005 | Transcoding service port |

## Monitoring and Maintenance

### Health Checks

```bash
# Check all services
curl http://localhost:3001/health
curl http://localhost:3004/health
curl http://localhost:3005/health

# Check Redis
docker exec video-platform redis-cli ping
```

### Log Management

```bash
# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f video-platform

# Rotate logs (add to crontab)
0 0 * * * docker-compose logs --no-color > /var/log/video-platform.log 2>&1 && docker-compose restart
```

### Backup Strategy

```bash
# Backup transcoded videos
tar -czf backup-$(date +%Y%m%d).tar.gz transcoded/

# Backup Redis data (if using external Redis)
docker exec redis redis-cli BGSAVE
```

### Performance Tuning

#### System Limits

```bash
# Increase file descriptor limits
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# Increase max file size for uploads
echo "client_max_body_size 100M;" >> /etc/nginx/nginx.conf
```

#### Docker Resources

```yaml
# docker-compose.yml
services:
  video-platform:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
```

## Scaling

### Horizontal Scaling

```yaml
# docker-compose.yml
services:
  upload-service:
    build: ./services/upload-service
    ports:
      - "3001-3003:3001"
    deploy:
      replicas: 3

  streaming-service:
    build: ./services/streaming-service
    ports:
      - "3004-3006:3004"
    deploy:
      replicas: 3
```

### Load Balancer Setup

```nginx
upstream upload_backend {
    server localhost:3001;
    server localhost:3002;
    server localhost:3003;
}

upstream streaming_backend {
    server localhost:3004;
    server localhost:3005;
    server localhost:3006;
}

server {
    location /api/v1/upload/ {
        proxy_pass http://upload_backend;
    }
    
    location /api/v1/stream/ {
        proxy_pass http://streaming_backend;
    }
}
```

## Troubleshooting

### Common Issues

**1. Out of disk space**
```bash
# Clean old transcoded files
find transcoded/ -type f -mtime +7 -delete

# Clean Docker images
docker system prune -a
```

**2. High memory usage**
```bash
# Restart services
docker-compose restart

# Check memory usage
docker stats
```

**3. Transcoding failures**
```bash
# Check FFmpeg installation
docker exec video-platform ffmpeg -version

# Check Redis connection
docker exec video-platform redis-cli ping
```

**4. Port conflicts**
```bash
# Check what's using ports
sudo netstat -tulpn | grep :3001

# Kill conflicting processes
sudo fuser -k 3001/tcp
```

### Performance Issues

**1. Slow transcoding**
- Increase CPU allocation
- Use SSD storage
- Optimize FFmpeg settings

**2. High latency streaming**
- Use CDN for video delivery
- Optimize HLS segment size
- Enable gzip compression

## Security Considerations

### Basic Security

```bash
# Firewall setup
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable

# Hide server information
echo "server_tokens off;" >> /etc/nginx/nginx.conf
```

### File Upload Security

```javascript
// Add to upload service
const allowedTypes = ['video/mp4', 'video/avi', 'video/mov'];
const maxFileSize = 100 * 1024 * 1024; // 100MB

// Validate file type and size
if (!allowedTypes.includes(file.mimetype)) {
    throw new Error('Invalid file type');
}
```

### Rate Limiting

```nginx
# Add to Nginx config
http {
    limit_req_zone $binary_remote_addr zone=upload:10m rate=1r/s;
    limit_req_zone $binary_remote_addr zone=stream:10m rate=10r/s;
}

server {
    location /api/v1/upload/ {
        limit_req zone=upload burst=5;
    }
    
    location /api/v1/stream/ {
        limit_req zone=stream burst=20;
    }
}
```

## Support

For issues and questions:
1. Check the logs: `docker-compose logs -f`
2. Run health checks: `./test-platform.sh`
3. Review this deployment guide
4. Check system resources: `htop`, `df -h`