import { jest, beforeEach, afterEach } from '@jest/globals';
import db from './fakeFirestore.js';
import { restoreStubs } from './stubs.js';

// Every test file talks to the in-memory Firestore instead of the real project
jest.unstable_mockModule('../../firebase.js', () => import('./fakeFirestore.js'));

// The server logs a lot (every request, expected errors). Run with TEST_LOGS=1 to see it.
if (!process.env.TEST_LOGS) {
  for (const method of ['log', 'info', 'warn', 'error']) console[method] = () => {};
}

beforeEach(() => {
  db.reset();
});

afterEach(() => {
  restoreStubs();
  jest.useRealTimers();
});
