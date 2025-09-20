import { Kafka } from 'kafkajs';

// Simple Kafka configuration
export const kafka = new Kafka({
  clientId: 'video-platform',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

// Topic names
export const TOPICS = {
  TRANSCODING_JOBS: 'video.transcoding.jobs',
  STREAMING_READY: 'video.streaming.ready'
} as const;

// Consumer group
export const CONSUMER_GROUP = 'transcoding-workers';

// Create producer instance
export const createProducer = () => kafka.producer();