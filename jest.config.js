/**
 * Jest runs the tests as native ES modules (the app is "type": "module"), so no
 * Babel transform is needed: package.json starts it with --experimental-vm-modules.
 * Test files import their helpers from '@jest/globals'.
 *
 * Tests live in src/tests, in the same folders as the code they test:
 * src/lib/text.js is tested by src/tests/lib/lib.test.js.
 */
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['<rootDir>/src/tests/**/*.test.js'],
  // V8 coverage suits native ES modules (no Babel instrumentation). Every source
  // file is listed, so files no test loads (hooks, browser-only helpers) show as 0%.
  coverageProvider: 'v8',
  collectCoverageFrom: ['src/**/*.js', '!src/tests/**'],
  coverageReporters: ['text', 'html'],
};
