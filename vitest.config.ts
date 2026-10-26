import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/game/src/**', 'packages/rules/src/**', 'packages/bots/src/**'],
      reporter: ['text-summary', 'text'],
    },
  },
});
