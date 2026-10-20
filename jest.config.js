// Frontend tests: `npm test`. Backend tests have their own config in backend/, e2e tests use Playwright (e2e/).
export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.{js,jsx}'],
  transform: { '\\.[jt]sx?$': 'babel-jest' },
  moduleNameMapper: {
    '\\.css$': '<rootDir>/src/test/styleStub.js',
    '\\.(jpe?g|png|gif|svg|webp)$': '<rootDir>/src/test/fileStub.js',
  },
  // Polyfills that must exist before any module (e.g. react-router) loads
  setupFiles: ['<rootDir>/src/test/polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.js'],
  restoreMocks: true,
  testTimeout: 20000,
  coverageProvider: 'v8',
  collectCoverageFrom: ['src/**/*.{js,jsx}', '!src/**/*.test.{js,jsx}', '!src/test/**', '!src/main.jsx'],
};
