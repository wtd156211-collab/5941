import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isInsideRoot, resolveSourcePath } from '../src/shared/source';

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'tfl-src-'));
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src', 'math.ts'), 'export const a = 1;\n');
});

afterAll(() => root);

describe('resolveSourcePath', () => {
  it('相对路径命中', async () => {
    const r = await resolveSourcePath(root, 'src/math.ts');
    expect(r.ok).toBe(true);
    expect(r.absolutePath!.endsWith(path.join('src', 'math.ts'))).toBe(true);
  });

  it('路径穿越被拒绝', async () => {
    const r = await resolveSourcePath(root, '../etc/passwd');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('OUTSIDE_ROOT');
  });

  it('不存在返回 NOT_FOUND', async () => {
    const r = await resolveSourcePath(root, 'src/nope.ts');
    expect(r.reason).toBe('NOT_FOUND');
  });

  it('basename 索引兜底（报告机路径不同）', async () => {
    const r = await resolveSourcePath(root, '/other/machine/src/math.ts', () => [
      'src/math.ts',
    ]);
    expect(r.ok).toBe(true);
  });

  it('非法入参', async () => {
    expect((await resolveSourcePath(root, '')).reason).toBe('INVALID_PATH');
  });
});

describe('isInsideRoot', () => {
  it('内部/越界判定', () => {
    expect(isInsideRoot(root, path.join(root, 'src/math.ts'))).toBe(true);
    expect(isInsideRoot(root, path.join(root, '..', 'x.ts'))).toBe(false);
  });
});
