// The in-memory Qdrant lives in rag/store/memoryQdrant.js (also used by the offline eval); tests use it under this name.
export { createMemoryQdrant as createFakeQdrant } from '../../rag/store/memoryQdrant.js';
