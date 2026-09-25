/**
 * 端到端验证：真实运行 fixture 测试产出 JUnit 报告 → 启动 API → 解析报告 → 源码定位。
 * 全程使用真实测试输出，不注入任何静态示例数据。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createServer, repoRoot } from '../server/app';
import type { TestRun } from '../src/shared/types';

const reportPath = path.join(repoRoot, 'fixtures/real-run/report.xml');
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main(): Promise<void> {
  console.log('1. 真实运行 fixture 测试（允许失败用例存在）…');
  try {
    execFileSync('npx', ['vitest', 'run', '--config', 'fixtures/real-run/vitest.real.config.ts'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch {
    console.log('   （fixture 中存在预期失败的用例，非零退出码属于正常情况）');
  }
  check('JUnit 报告已由真实运行生成', fs.existsSync(reportPath));

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    console.log('2. 通过 API 解析真实报告…');
    const parseRes = await fetch(`${base}/api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'fixtures/real-run/report.xml' }),
    });
    check('解析接口返回 200', parseRes.status === 200, `HTTP ${parseRes.status}`);
    const { run } = (await parseRes.json()) as { run: TestRun };
    check('存在失败用例', run.counts.failed >= 1, JSON.stringify(run.counts));
    check('存在通过用例', run.counts.passed >= 1);
    check('存在跳过用例', run.counts.skipped >= 1);

    const allCases = run.suites.flatMap(function collect(s): typeof run.suites[0]['cases'] {
      return [...s.cases, ...s.suites.flatMap(collect)];
    });
    const failed = allCases.find((c) => c.status === 'failed');
    check('失败用例带有错误消息', !!failed?.failures[0]?.message);
    check('失败用例带有异常类型', !!failed?.failures[0]?.exceptionType);
    check('失败用例带有时长', failed?.time !== undefined);
    check('重试用例记录了重试次数', allCases.some((c) => c.retryCount > 0));

    const frame = failed?.failures
      .flatMap((f) => f.frames)
      .find((f) => f.file && f.line !== undefined && f.file.includes('fixtures/real-run'));
    check('堆栈中存在指向 fixture 源码的帧', !!frame);

    if (frame?.file && frame.line !== undefined) {
      console.log(`3. 源码定位：${frame.file}:${frame.line}…`);
      const sourceRes = await fetch(
        `${base}/api/source?file=${encodeURIComponent(frame.file)}&line=${frame.line}`,
      );
      check('源码接口返回 200', sourceRes.status === 200, `HTTP ${sourceRes.status}`);
      const view = await sourceRes.json();
      const diskLines = fs
        .readFileSync(path.join(repoRoot, frame.file), 'utf8')
        .split(/\r?\n/);
      check(
        '定位行与磁盘上的真实源码一致',
        view.lines[view.line - view.startLine] === diskLines[frame.line - 1],
      );
    }

    console.log('4. 异常路径…');
    const badReport = await fetch(`${base}/api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '<broken' }),
    });
    check('非法报告返回 400', badReport.status === 400);
    const badSource = await fetch(`${base}/api/source?file=../../etc/passwd&line=1`);
    check('越界源码路径返回 400', badSource.status === 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (failures.length > 0) {
    console.error(`\n验证失败：${failures.length} 项未通过`);
    process.exit(1);
  }
  console.log('\n真实运行端到端验证全部通过');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
