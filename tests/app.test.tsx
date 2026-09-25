import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/client/App';
import type { TestRun } from '../src/shared/types';

const run: TestRun = {
  name: '真实运行',
  warnings: ['示例警告：缺少堆栈'],
  counts: { passed: 1, failed: 1, skipped: 1, notrun: 0 },
  suites: [
    {
      id: '0',
      name: 'calc 模块',
      file: 'fixtures/real-run/calc.test.ts',
      counts: { passed: 1, failed: 1, skipped: 1, notrun: 0 },
      suites: [],
      cases: [
        {
          id: '0.0',
          name: '加法返回两数之和',
          classname: 'calc',
          file: 'fixtures/real-run/calc.test.ts',
          time: 0.004,
          status: 'passed',
          failures: [],
          retryCount: 0,
        },
        {
          id: '0.1',
          name: '除法在除数为零时抛出异常',
          classname: 'calc',
          file: 'fixtures/real-run/calc.test.ts',
          time: 0.012,
          status: 'failed',
          retryCount: 1,
          failures: [
            {
              kind: 'failure',
              message: 'expected 5 to be 0.5',
              exceptionType: 'AssertionError',
              stack: 'AssertionError: expected 5 to be 0.5\n ❯ fixtures/real-run/calc.test.ts:10:20',
              frames: [
                { raw: 'AssertionError: expected 5 to be 0.5' },
                { raw: ' ❯ fixtures/real-run/calc.test.ts:10:20', file: 'fixtures/real-run/calc.test.ts', line: 10, column: 20 },
              ],
            },
          ],
        },
        {
          id: '0.2',
          name: '阶乘大数性能',
          classname: 'calc',
          file: 'fixtures/real-run/calc.test.ts',
          status: 'skipped',
          failures: [],
          retryCount: 0,
        },
      ],
    },
  ],
};

const sourceView = {
  file: 'fixtures/real-run/calc.test.ts',
  line: 10,
  column: 20,
  startLine: 2,
  lines: ['line2', 'expect(divide(1, 0)).toBe(0.5);', 'line11'],
};

function mockFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/parse')) {
        return new Response(JSON.stringify({ origin: 'report.xml', run }), { status: 200 });
      }
      if (url.startsWith('/api/source')) {
        return new Response(JSON.stringify(sourceView), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    }),
  );
}

async function loadReport(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: '加载报告' }));
  await waitFor(() => expect(screen.getByText('calc 模块')).toBeInTheDocument());
}

describe('App', () => {
  beforeEach(mockFetch);
  afterEach(() => vi.unstubAllGlobals());

  it('加载报告后展示套件层级与状态统计', async () => {
    render(<App />);
    await loadReport();
    expect(screen.getByText('加法返回两数之和')).toBeInTheDocument();
    expect(screen.getByText('除法在除数为零时抛出异常')).toBeInTheDocument();
    expect(screen.getByText('阶乘大数性能')).toBeInTheDocument();
    expect(screen.getByText('示例警告：缺少堆栈')).toBeInTheDocument();
    expect(screen.getByText('重试 1 次')).toBeInTheDocument();
  });

  it('按失败状态筛选后只显示失败用例', async () => {
    render(<App />);
    await loadReport();
    fireEvent.click(screen.getByLabelText('失败'));
    expect(screen.getByText('除法在除数为零时抛出异常')).toBeInTheDocument();
    expect(screen.queryByText('加法返回两数之和')).not.toBeInTheDocument();
    expect(screen.queryByText('阶乘大数性能')).not.toBeInTheDocument();
  });

  it('按关键字筛选', async () => {
    render(<App />);
    await loadReport();
    fireEvent.change(screen.getByLabelText('按关键字筛选'), { target: { value: '阶乘' } });
    expect(screen.getByText('阶乘大数性能')).toBeInTheDocument();
    expect(screen.queryByText('加法返回两数之和')).not.toBeInTheDocument();
  });

  it('展开失败详情并点击堆栈帧定位源码', async () => {
    render(<App />);
    await loadReport();
    fireEvent.click(screen.getByText('除法在除数为零时抛出异常'));
    expect(screen.getByText('expected 5 to be 0.5')).toBeInTheDocument();
    expect(screen.getByText('AssertionError')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /calc\.test\.ts:10:20/ }));
    await waitFor(() =>
      expect(screen.getByLabelText('源码位置')).toBeInTheDocument(),
    );
    expect(screen.getByText('expect(divide(1, 0)).toBe(0.5);')).toBeInTheDocument();
  });

  it('报告加载失败时展示错误提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: '报告不是合法的 XML' }), { status: 400 })),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '加载报告' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('报告不是合法的 XML'));
  });
});
