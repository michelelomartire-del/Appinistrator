import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@client': path.resolve(__dirname, 'src/client'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 120000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    env: {
      NODE_ENV: 'test',
      DATA_DIR: '.data/test',
      APP_ENCRYPTION_KEY: 'test-key-solo-per-i-test-automatici',
      DEMO_MODE: 'false',
      // attiva il ramo della demo statica nei test dell'interfaccia
      VITE_DEMO: '1',
    },
  },
});
