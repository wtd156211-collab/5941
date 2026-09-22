import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';

const REPORT = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="s">
    <testcase classname="s" name="ok" file="src/a.test.ts" line="2" time="0.01"/>
    <testcase classname="s" name="bad" file="src/a.test.ts" line="6" time="0.02">
      <failure type="AssertionError" message="1 != 2"><![CDATA[AssertionError: 1 != 2
    at src/a.test.ts:7:10]]></failure>
    </testcase>
  </testsuite>
</testsuites>`;

let server: Server;
let base: string;
let root: string;

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'tfl-api-'));
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src', 'a.test.ts'), 'line1\nline2\nline3\nline4\nline5\nline6\nline7\n');
  mkdirSync(path.join(root, 'reports'));
  writeFileSync(path.join(root, 'reports', 'junit.xml'), REPORT);
  server = await createApp({ workspaceRoot: root });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('bad address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
});

describe('HTTP API', () => {
  it('POST /api/parse 解析上传的 XML', async () => {
    const res = await fetch(`${base}/api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ xml: REPORT, reportName: 'r.xml' }),
    });
    const json = await res.json();
    expect(res.ok).toBe(true);
    expect(json.run.cases).toHaveLength(2);
    expect(json.run.counts.failed).toBe(1);
  });

  it('POST 非 JSON / 缺字段返回 400', async () => {
    const r1 = await fetch(`${base}/api/parse`, { method: 'POST', body: 'not-json' });
    expect(r1.status).toBe(400);
    const r2 = await fetch(`${base}/api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r2.status).toBe(400);
  });

  it('GET /api/parse?path= 读取 workspace 内真实报告', async () => {
    const res = await fetch(`${base}/api/parse?path=${encodeURIComponent('reports/junit.xml')}`);
    const json = await res.json();
    expect(res.ok).toBe(true);
    expect(json.run.reportName).toBe('junit.xml');
  });

  it('GET /api/parse 拒绝路径穿越', async () => {
    const res = await fetch(`${base}/api/parse?path=${encodeURIComponent('../../etc/passwd')}`);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('OUTSIDE_ROOT');
  });

  it('GET /api/source 返回行内容', async () => {
    const res = await fetch(
      `${base}/api/source?path=${encodeURIComponent('src/a.test.ts')}&line=7`,
    );
    const json = await res.json();
    expect(res.ok).toBe(true);
    expect(json.lineExists).toBe(true);
    expect(json.lines[6]).toBe('line7');
  });

  it('行号越界时 lineExists=false', async () => {
    const res = await fetch(
      `${base}/api/source?path=${encodeURIComponent('src/a.test.ts')}&line=999`,
    );
    const json = await res.json();
    expect(json.lineExists).toBe(false);
  });

  it('不存在文件返回 404 与明确信息', async () => {
    const res = await fetch(
      `${base}/api/source?path=${encodeURIComponent('src/missing.ts')}&line=1`,
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain('不存在');
  });

  it('健康检查', async () => {
    const res = await fetch(`${base}/api/health`);
    expect((await res.json()).ok).toBe(true);
  });
});
