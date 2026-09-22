import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/client/App';

const REPORT = `<?xml version="1.0"?>
<testsuites name="root">
  <testsuite name="unit" time="0.5">
    <testcase classname="unit" name="passing case" file="src/math.test.ts" line="2" time="0.01"/>
    <testcase classname="unit" name="failing case" file="src/math.test.ts" line="6" time="0.02">
      <failure type="AssertionError" message="expected 1 to be 2"><![CDATA[AssertionError: expected 1 to be 2
    at /work/src/math.test.ts:7:10
    at /work/node_modules/vitest/index.js:1:1]]></failure>
    </testcase>
    <testcase classname="unit" name="skipped case" file="src/math.test.ts" time="0">
      <skipped message="wip"/>
    </testcase>
    <testcase classname="unit" name="queued case" status="notrun" time="0"/>
    <testcase classname="unit" name="flaky case" file="src/flaky.test.ts" line="3" time="0.1">
      <flakyFailure type="Error" message="transient"><![CDATA[Error: transient
    at /work/src/flaky.test.ts:4:8]]></flakyFailure>
    </testcase>
  </testsuite>
</testsuites>`;

const MATH_SOURCE = [
  'describe("math", () => {',
  '  it("passing case", () => {});',
  '',
  '',
  '',
  '',
  '  it("failing case", () => { throw new Error("x"); });',
  '});',
].join('\n');

function mockFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/parse')) {
        // 通过 parseReportXml 走真实解析器（在测试环境直接内联其结果更真实：
        // 改为调用实际后端会偏离单测边界，这里调用共享解析器保证数据来自真实解析）
        const { parseJunitXml } = await import('../src/shared/junit');
        const body = mockFetchBody ? JSON.parse(mockFetchBody) : {};
        const xml = body.xml ?? REPORT;
        return new Response(
          JSON.stringify(parseJunitXml(xml, body.reportName ?? 'junit.xml')),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/api/source')) {
        const pathPart = url.startsWith('/api') ? url : url.slice(url.indexOf('/api'));
        const u = new URL(`http://x${pathPart}`);
        const line = Number(u.searchParams.get('line'));
        const file = u.searchParams.get('path') ?? '';
        if (file.includes('missing')) {
          return new Response(
            JSON.stringify({ error: 'NOT_FOUND', message: `源码文件不存在：${file}` }),
            { status: 404, headers: { 'content-type': 'application/json' } },
          );
        }
        const lines = MATH_SOURCE.split('\n');
        return new Response(
          JSON.stringify({
            path: file,
            content: MATH_SOURCE,
            lines,
            line: Number.isFinite(line) ? line : undefined,
            lineExists: Number.isFinite(line) ? line >= 1 && line <= lines.length : true,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

let mockFetchBody: string | null = null;

describe('App 页面集成', () => {
  beforeEach(() => {
    mockFetchBody = JSON.stringify({ xml: REPORT, reportName: 'junit.xml' });
    mockFetch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    mockFetchBody = null;
  });

  it('加载报告后展示层级、四种状态统计', async () => {
    render(<App />);
    const input = screen.getByTestId('report-path-input') as HTMLInputElement;
    await userEvent.type(input, 'reports/junit.xml');
    await userEvent.click(screen.getByTestId('load-path-btn'));

    expect(await screen.findByTestId('suite-tree')).toBeInTheDocument();
    expect(screen.getByText('unit')).toBeInTheDocument();
    const summary = screen.getByTestId('summary-bar').textContent!;
    expect(summary).toContain('失败 1');
    expect(summary).toContain('通过 2');
    expect(summary).toContain('跳过 1');
    expect(summary).toContain('未执行 1');
  });

  it('失败筛选只显示失败用例', async () => {
    render(<App />);
    await userEvent.type(screen.getByTestId('report-path-input'), 'reports/junit.xml');
    await userEvent.click(screen.getByTestId('load-path-btn'));
    await screen.findByTestId('suite-tree');

    await userEvent.click(screen.getByTestId('status-filter-failed'));
    const tree = screen.getByTestId('suite-tree');
    expect(within(tree).queryByText('passing case')).not.toBeInTheDocument();
    expect(within(tree).getByText('failing case')).toBeInTheDocument();
    expect(screen.getByText('筛选后 1 条')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('file-filter'));
  });

  it('按文件与关键字筛选', async () => {
    render(<App />);
    await userEvent.type(screen.getByTestId('report-path-input'), 'r.xml');
    await userEvent.click(screen.getByTestId('load-path-btn'));
    await screen.findByTestId('suite-tree');

    const fileSelect = screen.getByTestId('file-filter') as HTMLSelectElement;
    await userEvent.selectOptions(fileSelect, 'src/flaky.test.ts');
    expect(screen.queryByText('failing case')).not.toBeInTheDocument();
    expect(screen.getByText('flaky case')).toBeInTheDocument();

    await userEvent.selectOptions(fileSelect, '');
    await userEvent.type(screen.getByTestId('keyword-filter'), 'queued');
    expect(screen.getByText('queued case')).toBeInTheDocument();
    expect(screen.queryByText('passing case')).not.toBeInTheDocument();
  });

  it('展开失败详情并从堆栈定位到源码（含高亮行）', async () => {
    render(<App />);
    await userEvent.type(screen.getByTestId('report-path-input'), 'r.xml');
    await userEvent.click(screen.getByTestId('load-path-btn'));
    await screen.findByTestId('suite-tree');

    await userEvent.click(screen.getByText('failing case'));
    const detail = await screen.findByTestId('case-detail');
    expect(within(detail).getByTestId('exception-type')).toHaveTextContent('AssertionError');
    expect(within(detail).getByTestId('failure-message')).toHaveTextContent('expected 1 to be 2');
    expect(within(detail).getByText('20ms')).toBeInTheDocument();

    const frames = within(detail).getAllByTestId('frame-locate');
    await userEvent.click(frames[0]);

    const viewer = await screen.findByTestId('source-viewer');
    expect(viewer.textContent).toContain('/work/src/math.test.ts:7');
    const highlighted = document.querySelector('.source-line.is-highlight');
    expect(highlighted?.textContent).toContain('failing case');
  });

  it('重试用例展示最终结果与重试次数', async () => {
    render(<App />);
    await userEvent.type(screen.getByTestId('report-path-input'), 'r.xml');
    await userEvent.click(screen.getByTestId('load-path-btn'));
    await screen.findByTestId('suite-tree');

    const retryBadge = screen.getByTitle('重试 1 次');
    expect(retryBadge).toHaveTextContent('↻1');
    await userEvent.click(screen.getByText('flaky case'));
    const detail = await screen.findByTestId('retry-section');
    expect(detail.textContent).toContain('第 1 次失败');
  });

  it('非法报告显示明确错误提示', async () => {
    mockFetchBody = JSON.stringify({ xml: '<html>not junit</html>' });
    render(<App />);
    await userEvent.type(screen.getByTestId('report-path-input'), 'bad.xml');
    await userEvent.click(screen.getByTestId('load-path-btn'));
    const alertEl = await screen.findByRole('alert');
    expect(alertEl.textContent).toContain('JUnit XML');
  });

  it('源码文件无效时提示而不是崩溃', async () => {
    render(<App />);
    mockFetchBody = JSON.stringify({
      xml: REPORT.replace(/\/work\/src\/math\.test\.ts:7:10/, '/work/src/missing.ts:7:10'),
      reportName: 'r.xml',
    });
    await userEvent.type(screen.getByTestId('report-path-input'), 'r.xml');
    await userEvent.click(screen.getByTestId('load-path-btn'));
    await screen.findByTestId('suite-tree');

    await userEvent.click(screen.getByText('failing case'));
    const detail = await screen.findByTestId('case-detail');
    await userEvent.click(within(detail).getAllByTestId('frame-locate')[0]);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('不存在'),
    );
  });
});
