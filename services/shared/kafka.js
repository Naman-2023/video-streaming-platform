"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConsumer = exports.createProducer = exports.CONSUMER_GROUP = exports.TOPICS = exports.kafka = void 0;
const kafkajs_1 = require("kafkajs");
// Simple Kafka configuration
exports.kafka = (0, kafkajs_1.Kafka)({
    clientId: 'video-platform',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
    retry: {
        initialRetryTime: 100,
        retries: 8
    }
});
// Topic names
exports.TOPICS = {
    TRANSCODING_JOBS: 'video.transcoding.jobs',
    STREAMING_READY: 'video.streaming.ready'
};
// Consumer group
exports.CONSUMER_GROUP = 'transcoding-workers';
// Create producer instance
const createProducer = () => exports.kafka.producer();
exports.createProducer = createProducer;
// Create consumer instance
const createConsumer = () => exports.kafka.consumer({
    groupId: exports.CONSUMER_GROUP,
    sessionTimeout: 30000,
    heartbeatInterval: 3000
});
exports.createConsumer = createConsumer;
//# sourceMappingURL=kafka.js.map