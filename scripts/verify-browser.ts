/**
 * 浏览器级页面验证（真实 Chromium + 真实报告 + 真实源码文件）：
 * 启动生产服务器（API + dist 静态资源），加载 fixtures/real-run 的 JUnit，
 * 验证报告加载、失败筛选、详情展开、堆栈跳转源码高亮、重试徽标。
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { chromium } from 'playwright';
import { createApp } from '../server/app';
import { existsSync, mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const distDir = resolve(repoRoot, 'dist');
const reportPath = resolve(repoRoot, 'fixtures/real-run/junit.xml');

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) console.log(`✓ ${name}`);
  else {
    failures += 1;
    console.error(`✗ ${name}`);
  }
}

async function main(): Promise<void> {
  if (!existsSync(distDir)) throw new Error('请先 npm run build');
  mkdirSync(dirname(reportPath), { recursive: true });
  if (!existsSync(reportPath)) throw new Error('请先运行 vitest 生成 fixtures/real-run/junit.xml');

  const app: Server = await createApp({ workspaceRoot: repoRoot });
  await new Promise<void>((r) => app.listen(0, r));
  const addr = app.address();
  if (!addr || typeof addr === 'string') throw new Error('端口分配失败');
  const apiBase = `http://127.0.0.1:${addr.port}`;

  // 同源静态服务：dist 页面 + /api 代理到 app
  const staticServer: Server = await new Promise((resolveSrv) => {
    const srv = import('node:http').then(async ({ createServer }) => {
      const fs = await import('node:fs/promises');
      const server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname.startsWith('/api/')) {
          app.emit('request', req, res);
          return;
        }
        let rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        let file = resolve(distDir, rel);
        if (!file.startsWith(distDir)) {
          res.writeHead(403).end();
          return;
        }
        let buf = await fs.readFile(file).catch(() => null);
        if (!buf) {
          file = resolve(distDir, 'index.html');
          buf = await fs.readFile(file);
        }
        const ext = file.slice(file.lastIndexOf('.'));
        const types: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
        };
        res.writeHead(200, { 'content-type': types[ext] ?? 'application/octet-stream' });
        res.end(buf);
      });
      await new Promise<void>((r) => server.listen(0, r));
      resolveSrv(server);
    });
    void srv;
  });
  const webAddr = staticServer.address();
  if (!webAddr || typeof webAddr === 'string') throw new Error('web 端口分配失败');
  const webBase = `http://127.0.0.1:${webAddr.port}`;
  void apiBase;

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(webBase);
    await page.getByTestId('report-path-input').fill('fixtures/real-run/junit.xml');
    await page.getByTestId('load-path-btn').click();

    await page.waitForSelector('[data-testid="suite-tree"]');
    check('页面加载真实报告并渲染套件树', true);

    const summary = (await page.getByTestId('summary-bar').textContent()) ?? '';
    check('汇总展示 通过4/失败1/跳过1', /通过 4/.test(summary) && /失败 1/.test(summary) && /跳过 1/.test(summary));
    check('展示 3 个测试文件套件', (await page.getByTestId('suite-tree').locator('.suite-name').allTextContents()).length >= 3);

    // 失败筛选
    await page.getByTestId('status-filter-failed').click();
    await page.waitForFunction(() => {
      const tree = document.querySelector('[data-testid="suite-tree"]');
      return tree?.textContent?.includes('always fails') &&
        !tree.textContent.includes('divides positive numbers');
    });
    check('状态筛选后只剩失败用例', true);
    await page.getByTestId('status-filter-failed').click();

    // 文件筛选
    await page.getByTestId('file-filter').selectOption('src/strings.test.ts');
    check(
      '按测试文件筛选只显示 strings 文件',
      ((await page.getByTestId('suite-tree').textContent())?.includes('uppercases ascii') ?? false) &&
        !((await page.getByTestId('suite-tree').textContent())?.includes('always fails') ?? false),
    );
    await page.getByTestId('file-filter').selectOption('');

    // 关键字
    await page.getByTestId('keyword-filter').fill('retries');
    check(
      '关键字筛选命中 flaky 用例',
      (await page.getByTestId('suite-tree').textContent())?.includes('eventually succeeds after retries') ?? false,
    );
    await page.getByTestId('keyword-filter').fill('');

    // 详情 + 堆栈定位
    await page.getByText('always fails', { exact: false }).first().click();
    await page.waitForSelector('[data-testid="failure-section"]');
    check(
      '详情展示异常类型 AssertionError',
      (await page.getByTestId('exception-type').textContent()) === 'AssertionError',
    );
    check(
      '详情展示真实错误消息',
      ((await page.getByTestId('failure-message').textContent()) ?? '').includes('expected 1 to be 2'),
    );
    const frameText = (await page.getByTestId('frame-locate').first().textContent()) ?? '';
    check('堆栈列出真实帧 src/flaky.test.ts 与行号', /src\/flaky\.test\.ts:\d+/.test(frameText));
    check('展示重试徽标 ↻2', !!(await page.$('[title="重试 2 次"]')));

    await page.getByTestId('frame-locate').first().click();
    await page.waitForSelector('[data-testid="source-viewer"]');
    const viewer = page.getByTestId('source-viewer');
    check('源码面板打开并显示文件路径与行号', /src\/flaky\.test\.ts:\d+/.test((await viewer.textContent()) ?? ''));
    const highlight = await page.locator('.source-line.is-highlight').textContent();
    check('高亮行是真实断言所在行', (highlight ?? '').includes('toBe(payload.expected)'));

    // 非法报告提示
    await page.getByTestId('report-path-input').fill('fixtures/real-run/src/flaky.test.ts');
    await page.getByTestId('load-path-btn').click();
    await page.waitForSelector('[role="alert"]');
    check('加载非 JUnit 文件显示明确错误', ((await page.getByRole('alert').first().textContent()) ?? '').length > 0);

    check('浏览器控制台无 JS 错误', errors.length === 0);
    if (errors.length) console.error(errors.join('\n'));
  } finally {
    await browser.close();
    await new Promise<void>((r) => staticServer.close(() => r()));
    await new Promise<void>((r) => app.close(() => r()));
  }
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`\n${failures} 项浏览器验证失败`);
      process.exit(1);
    }
    console.log('\n浏览器页面验证全部通过。');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
