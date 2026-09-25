import { describe, expect, it } from 'vitest';
import { firstLocation, parseStackTrace } from '../src/shared/stack';

describe('parseStackTrace', () => {
  it('解析 V8 带函数名的堆栈帧', () => {
    const frames = parseStackTrace(
      'AssertionError: boom\n    at Object.<anonymous> (/repo/a.test.ts:10:5)\n    at processTicksAndRejections (node:internal/process:95:5)',
    );
    expect(frames[1]).toMatchObject({ file: '/repo/a.test.ts', line: 10, column: 5 });
    expect(frames[2].file).toBe('node:internal/process');
  });

  it('解析无函数名的 V8 帧', () => {
    const frames = parseStackTrace('Error\n    at /repo/src/b.ts:3:7');
    expect(frames[1]).toMatchObject({ file: '/repo/src/b.ts', line: 3, column: 7 });
  });

  it('解析 Python 堆栈', () => {
    const frames = parseStackTrace('Traceback...\n  File "/repo/app/main.py", line 42, in run');
    expect(frames[1]).toMatchObject({ file: '/repo/app/main.py', line: 42, functionName: 'run' });
  });

  it('解析 Java 堆栈', () => {
    const frames = parseStackTrace('java.lang.AssertionError\n\tat com.example.AppTest.testAdd(AppTest.java:17)');
    expect(frames[1]).toMatchObject({ file: 'AppTest.java', line: 17 });
  });

  it('解析 vitest JUnit 方言（❯ 前缀）', () => {
    const frames = parseStackTrace('AssertionError\n ❯ fixtures/real-run/calc.test.ts:9:20');
    expect(frames[1]).toMatchObject({ file: 'fixtures/real-run/calc.test.ts', line: 9, column: 20 });
  });

  it('解析带函数名的 vitest JUnit 方言', () => {
    const frames = parseStackTrace(
      'AssertionError\n ❯ Module.divide fixtures/real-run/src/calc.ts:7:11',
    );
    expect(frames[1]).toMatchObject({
      functionName: 'Module.divide',
      file: 'fixtures/real-run/src/calc.ts',
      line: 7,
      column: 11,
    });
  });

  it('无法识别的行保留原文但不带位置', () => {
    const frames = parseStackTrace('AssertionError: 只有消息没有位置');
    expect(frames[0].file).toBeUndefined();
    expect(frames[0].raw).toContain('AssertionError');
  });

  it('firstLocation 返回第一个带位置的帧', () => {
    const frames = parseStackTrace('Error: x\n    at /repo/a.ts:1:1');
    expect(firstLocation(frames)).toMatchObject({ file: '/repo/a.ts', line: 1 });
  });

  it('空堆栈返回空数组', () => {
    expect(parseStackTrace('')).toEqual([]);
  });
});
