/**
 * 真实运行验证（不使用静态示例）：
 * 1. 由 vitest 实际执行 fixtures/real-run 生成 junit.xml（见 npm run test:real 的前半段）
 * 2. 启动 API 服务，加载该真实报告并断言层级/状态/失败详情/重试/源码定位
 * 3. 通过 /api/source 校验堆栈中的文件:行号在真实工作树中存在
 *
 * 任何断言失败都以非零码退出，供 CI 使用。
 */
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import type { ParseResult, SourceFile } from '../src/shared/types';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const reportRel = 'fixtures/real-run/junit.xml';
const reportAbs = resolve(repoRoot, reportRel);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`✓ ${msg}`);
}

async function getJson<T>(url: string): Promise<{ status: number; body: T }> {
  const res = await fetch(url);
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

async function main(): Promise<void> {
  mkdirSync(dirname(reportAbs), { recursive: true });
  assert(existsSync(reportAbs), `真实报告已存在：${reportRel}（由 vitest 实际运行生成）`);

  // 让 API 以 fixtures/real-run 为源码根，堆栈里的相对路径能直接命中
  const server: Server = await createApp({
    workspaceRoot: resolve(repoRoot, 'fixtures/real-run'),
  });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('端口分配失败');
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    const parsed = await getJson<ParseResult>(
      `${base}/api/parse?path=${encodeURIComponent(reportAbs)}`,
    );
    assert(parsed.status === 200, 'GET /api/parse 加载真实 vitest JUnit 报告成功');
    const run = parsed.body.run;
    assert(run !== null, '解析结果包含 TestRun');
    assert(run!.suites.length === 3, '存在 3 个按测试文件划分的套件');
    assert(run!.counts.failed === 1, '真实运行：1 条失败');
    assert(run!.counts.passed === 4, '真实运行：4 条通过');
    assert(run!.counts.skipped === 1, '真实运行：1 条跳过');
    assert(run!.counts['not-run'] === 0, '真实运行：0 条未执行');
    assert(run!.totalDurationMs !== undefined && run!.totalDurationMs > 0, '总耗时已解析');

    const failed = run!.cases.find((c) => c.name.includes('always fails'));
    assert(failed !== undefined, '找到真实失败用例 "always fails"');
    assert(failed!.status === 'failed', '该用例状态为 failed');
    assert(failed!.failure?.exceptionType === 'AssertionError', '异常类型 AssertionError');
    assert(
      failed!.failure?.message?.includes('expected 1 to be 2'),
      '错误消息来自真实断言输出',
    );
    assert(failed!.retry?.retryCount === 2, '该用例报告了 2 次失败重试（vitest 重复 failure 节点）');
    const frame = failed!.failure!.stack[0]!;
    assert(
      frame.file === 'src/flaky.test.ts' && frame.line > 0,
      `首帧定位到真实堆栈位置 ${frame.file}:${frame.line}`,
    );
    assert(failed!.durationMs !== undefined, '失败用例带耗时');

    const src = await getJson<SourceFile>(
      `${base}/api/source?path=${encodeURIComponent(frame.file)}&line=${frame.line}`,
    );
    assert(src.status === 200, '源码接口返回 200');
    assert(src.body.lineExists, `第 ${frame.line} 行在真实源码文件中存在`);
    assert(
      src.body.lines[frame.line - 1]?.includes('toBe(payload.expected)'),
      '定位行内容与真实断言一致',
    );

    // 越界行号
    const oob = await getJson<SourceFile>(
      `${base}/api/source?path=${encodeURIComponent(frame.file)}&line=9999`,
    );
    assert(oob.body.lineExists === false, '无效行号明确标记 lineExists=false');

    // 路径穿越
    const escape = await fetch(
      `${base}/api/source?path=${encodeURIComponent('../../../../etc/passwd')}`,
    );
    assert(escape.status === 404, '路径穿越被拒绝');

    // 不存在文件
    const missing = await fetch(
      `${base}/api/source?path=${encodeURIComponent('src/nope.ts')}&line=1`,
    );
    assert(missing.status === 404, '不存在文件返回 404');

    // 非法报告（POST）
    const bad = await fetch(`${base}/api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ xml: '<html>nope</html>' }),
    });
    const badJson = (await bad.json()) as ParseResult;
    assert(badJson.run === null && badJson.error?.code === 'UNSUPPORTED_FORMAT', '非 JUnit 报告被明确拒绝');

    const skipped = run!.cases.find((c) => c.status === 'skipped');
    assert(skipped !== undefined && skipped.file === 'src/strings.test.ts', '跳过用例从 classname 推断出测试文件');

    if (process.exitCode === 1) throw new Error('存在失败断言');
    console.log('\n全部真实运行链路断言通过。');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
