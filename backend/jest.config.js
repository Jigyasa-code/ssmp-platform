/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  verbose: true,
  // 30s timeout per test — generous for DB round-trips in CI
  testTimeout: 30000,
};
