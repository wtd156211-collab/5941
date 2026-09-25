import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJUnitReport } from '../src/shared/junit';
import { readSourceView } from '../src/shared/source';
import { ReportParseError, SourceLocationError } from '../src/shared/types';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function resolveInsideRoot(candidate: string): string {
  const resolved = path.resolve(repoRoot, candidate);
  if (resolved !== repoRoot && !resolved.startsWith(repoRoot + path.sep)) {
    throw new SourceLocationError(`路径 ${candidate} 不在工作目录内`);
  }
  return resolved;
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === '/api/parse' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req)) as { path?: string; content?: string };
      let xml: string;
      let origin: string;
      if (typeof body.content === 'string') {
        xml = body.content;
        origin = '(直接提交的报告内容)';
      } else if (typeof body.path === 'string' && body.path.trim()) {
        const reportPath = resolveInsideRoot(body.path.trim());
        if (!fs.existsSync(reportPath)) {
          sendJson(res, 404, { error: `报告文件不存在：${body.path}` });
          return true;
        }
        xml = fs.readFileSync(reportPath, 'utf8');
        origin = body.path;
      } else {
        sendJson(res, 400, { error: '请求需要提供 path 或 content 字段' });
        return true;
      }
      const run = parseJUnitReport(xml);
      sendJson(res, 200, { origin, run });
    } catch (error) {
      if (error instanceof ReportParseError || error instanceof SourceLocationError) {
        sendJson(res, 400, { error: error.message });
      } else {
        sendJson(res, 500, { error: `解析报告时发生内部错误：${(error as Error).message}` });
      }
    }
    return true;
  }

  if (url.pathname === '/api/source' && req.method === 'GET') {
    const file = url.searchParams.get('file') ?? '';
    const lineParam = url.searchParams.get('line');
    const columnParam = url.searchParams.get('column');
    const line = lineParam ? Number(lineParam) : undefined;
    const column = columnParam ? Number(columnParam) : undefined;
    try {
      const view = readSourceView(repoRoot, file, line, column);
      sendJson(res, 200, view);
    } catch (error) {
      if (error instanceof SourceLocationError) {
        sendJson(res, 400, { error: error.message });
      } else {
        sendJson(res, 500, { error: `读取源码失败：${(error as Error).message}` });
      }
    }
    return true;
  }

  if (url.pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: `未知接口：${url.pathname}` });
    return true;
  }
  return false;
}

function serveStatic(res: http.ServerResponse, url: URL): boolean {
  const distDir = path.join(repoRoot, 'dist');
  if (!fs.existsSync(distDir)) return false;
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const resolved = path.resolve(distDir, `.${pathname}`);
  if (!resolved.startsWith(distDir + path.sep) && resolved !== distDir) return false;
  const target = fs.existsSync(resolved) && fs.statSync(resolved).isFile()
    ? resolved
    : path.join(distDir, 'index.html');
  if (!fs.existsSync(target)) return false;
  const ext = path.extname(target);
  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
  return true;
}

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (await handleApi(req, res, url)) return;
      if (req.method === 'GET' && serveStatic(res, url)) return;
      sendJson(res, 404, { error: 'Not Found' });
    } catch (error) {
      sendJson(res, 500, { error: (error as Error).message });
    }
  });
}

export { repoRoot };
