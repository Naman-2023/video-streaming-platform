#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🎬 Starting Video Streaming Platform...\n');

// Kill existing processes
console.log('🛑 Stopping existing services...');
try {
  require('child_process').execSync('pkill -f "npm run dev" 2>/dev/null || true', { stdio: 'ignore' });
  require('child_process').execSync('pkill -f "tsx watch" 2>/dev/null || true', { stdio: 'ignore' });
  require('child_process').execSync('pkill -f "tsx src/worker.ts" 2>/dev/null || true', { stdio: 'ignore' });
  require('child_process').execSync('pkill -f "npm run worker" 2>/dev/null || true', { stdio: 'ignore' });
  console.log('✅ Cleaned up existing processes');
} catch (e) {
  // Ignore errors
}

// Wait for processes to stop
setTimeout(() => {
  startServices();
}, 3000);

function startServices() {
  console.log('🚀 Starting services...\n');

  const services = [
    {
      name: 'API Gateway',
      port: 3000,
      path: 'api-gateway',
      color: '\x1b[33m' // Yellow
    },
    {
      name: 'Upload Service',
      port: 3001,
      path: 'services/upload-service',
      color: '\x1b[32m' // Green
    },
    {
      name: 'Streaming Service',
      port: 3004,
      path: 'services/streaming-service', 
      color: '\x1b[35m' // Magenta
    },
    {
      name: 'Transcoding Service',
      port: 3005,
      path: 'services/transcoding-service',
      color: '\x1b[36m' // Cyan
    }
  ];

  const processes = [];

  services.forEach((service, index) => {
    setTimeout(() => {
      console.log(`${service.color}📦 Starting ${service.name} on port ${service.port}...\x1b[0m`);
      
      const child = spawn('npm', ['run', 'dev'], {
        cwd: service.path,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: service.port }
      });

      child.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`${service.color}[${service.name}]\x1b[0m ${output}`);
        }
      });

      child.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('ExperimentalWarning')) {
          console.log(`${service.color}[${service.name} ERROR]\x1b[0m ${output}`);
        }
      });

      child.on('close', (code) => {
        console.log(`${service.color}[${service.name}]\x1b[0m Process exited with code ${code}`);
      });

      processes.push({ name: service.name, process: child, port: service.port });
    }, index * 2000); // Stagger startup by 2 seconds
  });

  // Start transcoding worker after services
  setTimeout(() => {
    console.log('\x1b[37m🔧 Starting Transcoding Worker...\x1b[0m');
    
    const worker = spawn('npm', ['run', 'worker'], {
      cwd: 'services/transcoding-service',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    worker.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log('\x1b[37m[Transcoding Worker]\x1b[0m', output);
      }
    });

    worker.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output && !output.includes('ExperimentalWarning')) {
        console.log('\x1b[37m[Transcoding Worker ERROR]\x1b[0m', output);
      }
    });

    processes.push({ name: 'Transcoding Worker', process: worker });
  }, services.length * 2000 + 3000);

  // Show status after all services start
  setTimeout(() => {
    showStatus(processes);
    testConnectivity();
  }, services.length * 2000 + 8000);

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down all services...');
    processes.forEach(({ name, process }) => {
      console.log(`Stopping ${name}...`);
      process.kill('SIGTERM');
    });
    setTimeout(() => process.exit(0), 2000);
  });
}

function showStatus(processes) {
  console.log('\n' + '='.repeat(60));
  console.log('🎉 VIDEO STREAMING PLATFORM STARTED');
  console.log('='.repeat(60));
  console.log('\n📡 Service URLs:');
  console.log('  • API Gateway:        http://localhost:3000 (Main Entry Point)');
  console.log('  • Upload Service:     http://localhost:3001');
  console.log('  • Streaming Service:  http://localhost:3004');
  console.log('  • Transcoding Service: http://localhost:3005');
  
  console.log('\n🧪 Test Interface:');
  console.log('  • Open: test-platform.html in your browser');
  
  console.log('\n📤 Upload Video (via API Gateway):');
  console.log('  curl -X POST -F "video=@/path/to/video.mp4;type=video/mp4" \\');
  console.log('       -F "title=My Video" http://localhost:3000/api/upload/file');
  
  console.log('\n🎬 Stream Video (via API Gateway):');
  console.log('  http://localhost:3000/api/stream/{jobId}/master.m3u8');
  
  console.log('\n🛑 To stop: Press Ctrl+C');
  console.log('='.repeat(60) + '\n');
}

async function testConnectivity() {
  console.log('🔍 Testing service connectivity...\n');
  
  const services = [
    { name: 'API Gateway', url: 'http://localhost:3000/health' },
    { name: 'Upload Service', url: 'http://localhost:3001/health' },
    { name: 'Streaming Service', url: 'http://localhost:3004/health' },
    { name: 'Transcoding Service', url: 'http://localhost:3005/health' }
  ];

  for (const service of services) {
    try {
      const response = await fetch(service.url, { 
        signal: AbortSignal.timeout(5000) 
      });
      
      if (response.ok) {
        console.log(`✅ ${service.name}: Ready`);
      } else {
        console.log(`⚠️  ${service.name}: Responding but unhealthy (${response.status})`);
      }
    } catch (error) {
      console.log(`❌ ${service.name}: Not responding`);
    }
  }
  
  // Test Redis connection
  try {
    const { execSync } = require('child_process');
    execSync('docker exec redis-server redis-cli ping', { stdio: 'ignore' });
    console.log('✅ Redis: Connected');
  } catch (error) {
    console.log('❌ Redis: Not connected');
    console.log('   Run: docker run -d --name redis-server -p 6379:6379 redis:7-alpine');
  }
  
  console.log('\n🎯 Platform is ready for video uploads and streaming!\n');
}

// Add fetch polyfill for Node.js < 18
if (!global.fetch) {
  global.fetch = require('node-fetch');
}