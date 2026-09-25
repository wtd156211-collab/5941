import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['fixtures/real-run/**/*.test.ts'],
    retry: 1,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'fixtures/real-run/report.xml',
    },
  },
});
