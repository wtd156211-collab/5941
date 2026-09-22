import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 稳定的 flaky 用例：把尝试次数持久化到临时文件，
// 保证在任意机器上都恰好“前两次失败、第三次成功”，
// 也避免同一进程内重复执行整套测试时内存计数累积造成漂移。
const stateFile = join(tmpdir(), 'tfl-real-run-attempts.txt');

function attempt(): number {
  let n = 0;
  try {
    n = Number(readFileSync(stateFile, 'utf8')) || 0;
  } catch {
    n = 0;
  }
  n += 1;
  mkdirSync(tmpdir(), { recursive: true });
  writeFileSync(stateFile, String(n));
  return n;
}

describe('flaky behavior', () => {
  it('eventually succeeds after retries', () => {
    const n = attempt();
    expect(n).toBeGreaterThanOrEqual(3);
  });

  it('always fails', () => {
    const payload = { actual: 1, expected: 2 };
    expect(payload.actual, 'should match expected value').toBe(payload.expected);
  });
});
