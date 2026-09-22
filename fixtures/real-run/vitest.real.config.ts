import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
rmSync(join(tmpdir(), 'tfl-real-run-attempts.txt'), { force: true });

export default defineConfig({
  test: {
    root: here,
    include: ['src/**/*.test.ts'],
    reporters: ['junit'],
    outputFile: resolve(here, 'junit.xml'),
    retry: 2,
    pool: 'forks',
  },
});
