import { defineConfig } from 'vitest/config';

// test/*.test.mjs use node:test (run with `npm run test:node`), not vitest.
export default defineConfig({
  test: { exclude: ['**/node_modules/**', '**/dist/**', 'test/**'] },
});
