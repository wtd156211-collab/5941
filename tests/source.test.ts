import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readSourceView, resolveSourcePath } from '../src/shared/source';
import { SourceLocationError } from '../src/shared/types';

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-test-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), lines.join('\n'));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('readSourceView', () => {
  it('返回目标行附近的代码窗口', () => {
    const view = readSourceView(root, 'src/app.ts', 15);
    expect(view.line).toBe(15);
    expect(view.lines).toContain('line 15');
    expect(view.startLine).toBe(7);
  });

  it('行号超出范围时给出警告并定位到文件末尾', () => {
    const view = readSourceView(root, 'src/app.ts', 999);
    expect(view.warning).toContain('超出文件范围');
    expect(view.line).toBe(30);
  });

  it('行号无效时给出警告并展示文件开头', () => {
    const view = readSourceView(root, 'src/app.ts', 0);
    expect(view.warning).toContain('无效');
    expect(view.line).toBeUndefined();
  });

  it('不传行号时展示文件开头', () => {
    const view = readSourceView(root, 'src/app.ts');
    expect(view.startLine).toBe(1);
  });

  it('文件不存在时抛出 SourceLocationError', () => {
    expect(() => readSourceView(root, 'src/missing.ts', 1)).toThrow(SourceLocationError);
  });

  it('路径越界时拒绝访问', () => {
    expect(() => readSourceView(root, '../outside.ts', 1)).toThrow(SourceLocationError);
    expect(() => readSourceView(root, '/etc/passwd', 1)).toThrow(SourceLocationError);
  });

  it('目标是目录时拒绝访问', () => {
    expect(() => readSourceView(root, 'src', 1)).toThrow(SourceLocationError);
  });

  it('空路径抛出 SourceLocationError', () => {
    expect(() => resolveSourcePath(root, '  ')).toThrow(SourceLocationError);
  });
});
