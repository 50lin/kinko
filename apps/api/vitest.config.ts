import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({ resolve: { alias: { '@kinko/core': path.resolve(__dirname, '../../packages/core/src/index.ts') } }, test: { env: { NODE_ENV: 'test', DATA_DIR: '/tmp/kinko-test-data' } } });
