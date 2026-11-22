import { QdrantClient } from '@qdrant/js-client-rest';
import { requireEnv } from '../env.js';

export function createQdrantClient() {
  return new QdrantClient({
    url: requireEnv('QDRANT_URL'),
    apiKey: requireEnv('QDRANT_API_KEY'),
    // Skip the client's startup version handshake (one less round trip on every cold start)
    checkCompatibility: false,
  });
}
