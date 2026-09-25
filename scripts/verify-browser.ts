/**
 * 浏览器验证：构建产物 + 生产服务器 + Playwright 真实浏览器，
 * 验证报告加载、失败筛选、详情展开、源码定位。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer, repoRoot } from '../server/app';

async function main(): Promise<void> {
  const reportPath = path.join(repoRoot, 'fixtures/real-run/report.xml');
  if (!fs.existsSync(reportPath)) {
    console.log('生成真实测试报告…');
    try {
      execFileSync('npx', ['vitest', 'run', '--config', 'fixtures/real-run/vitest.real.config.ts'], {
        cwd: repoRoot,
        stdio: 'inherit',
      });
    } catch {
      /* fixture 含预期失败用例 */
    }
  }
  if (!fs.existsSync(path.join(repoRoot, 'dist/index.html'))) {
    console.log('构建前端…');
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
  }

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(base);

    await page.getByRole('button', { name: '加载报告' }).click();
    await page.locator('.suite-header').first().waitFor();
    await page.getByRole('button', { name: /加法返回两数之和/ }).waitFor();
    console.log('  ✓ 报告加载并展示套件层级');

    const failedCase = page.getByRole('button', { name: /除法在除数为零时抛出异常/ });
    await failedCase.waitFor();
    await page.getByLabel('失败').check();
    await page
      .getByRole('button', { name: /加法返回两数之和/ })
      .waitFor({ state: 'detached' });
    console.log('  ✓ 失败状态筛选生效');

    await failedCase.click();
    await page.getByText('异常类型').first().waitFor();
    console.log('  ✓ 失败详情展开（异常类型 / 错误消息 / 堆栈）');

    await page.getByRole('button', { name: /calc\.test\.ts:\d+/ }).first().click();
    await page.getByLabel('源码位置').waitFor();
    console.log('  ✓ 堆栈帧定位到源码位置');

    const highlight = await page.locator('.code-line.highlight').count();
    if (highlight !== 1) throw new Error('源码高亮行数量异常');
    console.log('  ✓ 目标源码行已高亮');

    console.log('\n浏览器验证全部通过');
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error('浏览器验证失败：', error.message ?? error);
  process.exit(1);
});
