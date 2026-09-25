import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../server/app';

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('API', () => {
  it('GET /api/health 返回 ok', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('POST /api/parse 解析提交的报告内容', async () => {
    const res = await post('/api/parse', {
      content: '<testsuites><testsuite name="s"><testcase name="c"/></testsuite></testsuites>',
    });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.run.counts.passed).toBe(1);
  });

  it('POST /api/parse 对非法报告返回 400 与错误消息', async () => {
    const res = await post('/api/parse', { content: 'not xml at all' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('XML');
  });

  it('POST /api/parse 对不存在的报告路径返回 404', async () => {
    const res = await post('/api/parse', { path: 'fixtures/no-such-report.xml' });
    expect(res.status).toBe(404);
  });

  it('POST /api/parse 拒绝工作目录外的报告路径', async () => {
    const res = await post('/api/parse', { path: '../../etc/passwd' });
    expect(res.status).toBe(400);
  });

  it('GET /api/source 返回源码窗口', async () => {
    const res = await fetch(`${base}/api/source?file=fixtures/real-run/src/calc.ts&line=6`);
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.line).toBe(6);
    expect(view.lines.some((l: string) => l.includes('除数不能为零'))).toBe(true);
  });

  it('GET /api/source 对越界路径返回 400', async () => {
    const res = await fetch(`${base}/api/source?file=/etc/passwd&line=1`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('不在工作目录内');
  });

  it('GET /api/source 对缺失文件返回 400', async () => {
    const res = await fetch(`${base}/api/source?file=src/nope.ts&line=1`);
    expect(res.status).toBe(400);
  });
});
