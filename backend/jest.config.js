// Backend tests: `npm test` (runs Jest with native ES modules — see the "test" script).
export default {
  testEnvironment: 'node',
  // The backend is plain ES modules, so no Babel transform is needed
  transform: {},
  testMatch: ['<rootDir>/test/**/*.test.js'],
  // Runs before each test file loads: a clean, offline environment
  setupFiles: ['<rootDir>/test/support/env.js'],
  // Swaps Firestore for the in-memory fake and resets it between tests
  setupFilesAfterEnv: ['<rootDir>/test/support/setup.js'],
  testTimeout: 15000,
  restoreMocks: true,
  coverageProvider: 'v8',
  collectCoverageFrom: ['**/*.js', '!test/**', '!coverage/**', '!node_modules/**', '!jest.config.js', '!scripts/**', '!app while running locally.js', '!app.js', '!firebase.js'],
};
