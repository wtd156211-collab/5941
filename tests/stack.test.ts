import { describe, expect, it } from 'vitest';
import {
  extractExceptionType,
  parseDotnetFrame,
  parseGoFrame,
  parseJavaFrame,
  parseJsFrame,
  parsePythonFrame,
  parseStack,
} from '../src/shared/stack';

describe('V8 / JavaScript 堆栈', () => {
  it('带函数名与括号', () => {
    const f = parseJsFrame('    at failingTest (/repo/src/math.test.ts:9:24)');
    expect(f).toMatchObject({
      kind: 'js',
      file: '/repo/src/math.test.ts',
      line: 9,
      column: 24,
      functionName: 'failingTest',
    });
  });

  it('async 前缀与裸帧', () => {
    expect(parseJsFrame('    at async /repo/src/a.test.ts:3:5')?.functionName).toBeUndefined();
    expect(parseJsFrame('    at /repo/src/b.test.ts:10:1')).toMatchObject({
      file: '/repo/src/b.test.ts',
      line: 10,
    });
  });

  it('node 内部帧标记为外部', () => {
    const f = parseJsFrame('    at node:internal/process/task_queues:96:5');
    expect(f?.isExternal).toBe(true);
  });

  it('非堆栈行返回 null', () => {
    expect(parseJsFrame('AssertionError: boom')).toBeNull();
  });
});

describe('Python 堆栈', () => {
  it('解析 File/line/in 形式', () => {
    const f = parsePythonFrame('  File "/repo/tests/test_math.py", line 12, in test_fail');
    expect(f).toMatchObject({
      kind: 'python',
      file: '/repo/tests/test_math.py',
      line: 12,
      functionName: 'test_fail',
    });
  });

  it('site-packages 标记外部', () => {
    const f = parsePythonFrame(
      '  File "/usr/lib/python3.11/site-packages/pytest/runner.py", line 100, in runtest',
    );
    expect(f?.isExternal).toBe(true);
  });
});

describe('Java 堆栈', () => {
  it('解析 (File.java:line)', () => {
    const f = parseJavaFrame('\tat com.example.MathTest.testAdd(MathTest.java:17)');
    expect(f).toMatchObject({
      kind: 'java',
      file: 'MathTest.java',
      line: 17,
      functionName: 'com.example.MathTest.testAdd',
    });
  });

  it('JDK 帧标记外部', () => {
    const f = parseJavaFrame('\tat java.util.ArrayList.add(ArrayList.java:455)');
    expect(f?.isExternal).toBe(true);
  });
});

describe('Go / .NET', () => {
  it('Go 文件行 + 函数名上下文', () => {
    expect(parseGoFrame('/repo/main_test.go:42 +0x5c', 'pkg.FailingTest')).toMatchObject({
      kind: 'go',
      file: '/repo/main_test.go',
      line: 42,
      functionName: 'pkg.FailingTest',
    });
  });

  it('.NET 帧', () => {
    const f = parseDotnetFrame(
      '   at MyProject.Tests.MathTests.TestAdd() in /repo/MathTests.cs:line 21',
    );
    expect(f).toMatchObject({
      kind: 'dotnet',
      file: '/repo/MathTests.cs',
      line: 21,
    });
  });
});

describe('parseStack 混合文本', () => {
  it('按顺序抽出所有帧', () => {
    const text = `AssertionError: nope
    at a (/repo/a.test.ts:1:2)
    at b (/repo/node_modules/x/index.js:2:3)
  File "/repo/test_x.py", line 4, in test_y
\tat com.x.T(T.java:5)`;
    const frames = parseStack(text);
    expect(frames.map((f) => f.kind)).toEqual(['js', 'js', 'python', 'java']);
    expect(frames[1].isExternal).toBe(true);
  });

  it('空文本返回空数组', () => {
    expect(parseStack('')).toEqual([]);
  });
});

describe('extractExceptionType', () => {
  it('冒号前的类型名', () => {
    expect(extractExceptionType('AssertionError: 1 != 2')).toBe('AssertionError');
    expect(extractExceptionType('java.lang.IllegalStateException: bad')).toBe(
      'java.lang.IllegalStateException',
    );
  });
  it('无冒号或非法时返回 undefined', () => {
    expect(extractExceptionType('some free text with spaces')).toBeUndefined();
    expect(extractExceptionType(undefined)).toBeUndefined();
  });
});

describe('vitest JUnit 方言帧', () => {
  it('解析 ❯ file.ts:line:col', () => {
    const f = parseStack(' ❯ src/flaky.test.ts:14:59')[0];
    expect(f).toMatchObject({
      kind: 'js',
      file: 'src/flaky.test.ts',
      line: 14,
      column: 59,
    });
  });

  it('纯行号帧（无列）', () => {
    const f = parseStack(' ❯ src/a.test.ts:42')[0];
    expect(f.line).toBe(42);
    expect(f.column).toBeUndefined();
  });
});
