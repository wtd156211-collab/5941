/**
 * 最小 HTTP API：
 *   POST /api/parse        body: { xml: string, reportName?: string }
 *   GET  /api/parse?path=  读取服务器端报告文件（限制在 workspace 内）
 *   GET  /api/source?path=&line=  读取源码文件并返回行内容
 *
 * 设计为与 Vite dev 代理或独立启动（server.ts）共用，不引入第三方 web 框架。
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJunitXml } from '../src/shared/junit';
import { resolveSourcePath } from '../src/shared/source';
import type { SourceFile } from '../src/shared/types';

export interface AppDeps {
  /** 允许访问的源码/报告根目录，默认为进程 cwd。 */
  workspaceRoot: string;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
  });
  res.end(json);
}

async function readBody(req: IncomingMessage, limitBytes = 20 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** basename -> 相对路径 索引，报告机路径与当前工作树不一致时兜底定位。 */
const fileIndex = new Map<string, string[]>();
let indexRoot: string | null = null;

async function ensureIndex(root: string): Promise<void> {
  if (indexRoot === root) return;
  indexRoot = root;
  fileIndex.clear();
  const fs = await import('node:fs/promises');
  const walk = async (dir: string, relPrefix: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile()) {
        const list = fileIndex.get(entry.name) ?? [];
        list.push(rel);
        fileIndex.set(entry.name, list);
      }
    }
  };
  await walk(root, '');
}

export async function createApp(deps?: Partial<AppDeps>) {
  const root = path.resolve(deps?.workspaceRoot ?? process.cwd());
  await ensureIndex(root);

  const handleSource = async (url: URL, res: ServerResponse): Promise<void> => {
    const raw = url.searchParams.get('path');
    const lineParam = Number(url.searchParams.get('line') ?? 'NaN');
    if (!raw) {
      send(res, 400, { error: 'INVALID_PATH', message: '缺少 path 参数' });
      return;
    }
    const resolved = await resolveSourcePath(
      root,
      raw,
      (base) => fileIndex.get(base),
    );
    if (!resolved.ok || !resolved.absolutePath) {
      const messages: Record<string, string> = {
        NOT_FOUND: `源码文件不存在：${raw}`,
        OUTSIDE_ROOT: `路径 ${raw} 不在允许访问的工作目录内`,
        NOT_A_FILE: `${raw} 不是普通文件`,
        INVALID_PATH: `非法路径：${raw}`,
      };
      send(res, 404, {
        error: resolved.reason ?? 'NOT_FOUND',
        message: messages[resolved.reason ?? 'NOT_FOUND'] ?? '无法定位源码文件',
      });
      return;
    }

    const content = await readFile(resolved.absolutePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const line = Number.isFinite(lineParam) ? lineParam : undefined;
    const lineExists =
      line === undefined ? true : line >= 1 && line <= lines.length;
    const source: SourceFile = {
      path: path.relative(root, resolved.absolutePath) || resolved.absolutePath,
      content,
      lines,
      line,
      lineExists,
    };
    send(res, 200, source);
  };

  const handleParseFile = async (url: URL, res: ServerResponse): Promise<void> => {
    const rel = url.searchParams.get('path');
    if (!rel) {
      send(res, 400, { error: 'INVALID_PATH', message: '缺少 path 参数' });
      return;
    }
    const resolved = await resolveSourcePath(root, rel, (b) => fileIndex.get(b));
    if (!resolved.ok || !resolved.absolutePath) {
      send(res, 404, {
        error: resolved.reason ?? 'NOT_FOUND',
        message: `报告文件无法访问：${rel}`,
      });
      return;
    }
    const xml = await readFile(resolved.absolutePath, 'utf8');
    send(res, 200, parseJunitXml(xml, path.basename(resolved.absolutePath)));
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        send(res, 404, { error: 'NOT_FOUND', message: '未知接口' });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/parse') {
        const rawBody = await readBody(req);
        let payload: { xml?: unknown; reportName?: unknown };
        try {
          payload = JSON.parse(rawBody) as typeof payload;
        } catch {
          send(res, 400, {
            error: 'MALFORMED_REPORT',
            message: '请求体不是合法 JSON',
          });
          return;
        }
        if (typeof payload.xml !== 'string') {
          send(res, 400, {
            error: 'MALFORMED_REPORT',
            message: '缺少 xml 字段（字符串）',
          });
          return;
        }
        send(
          res,
          200,
          parseJunitXml(
            payload.xml,
            typeof payload.reportName === 'string' ? payload.reportName : undefined,
          ),
        );
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/parse') {
        await handleParseFile(url, res);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/source') {
        await handleSource(url, res);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/health') {
        send(res, 200, { ok: true, root });
        return;
      }

      send(res, 404, { error: 'NOT_FOUND', message: '未知接口' });
    } catch (e) {
      send(res, 500, {
        error: 'INTERNAL',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return server;
}

/** 生产模式：在 API 之外托管 dist 静态文件。 */
export async function startServer(port: number): Promise<void> {
  const app = await createApp();
  // 优先 cwd/dist（tsx 直跑场景），其次编译产物相对路径。
  const distDirCandidates = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist'),
  ];
  const fs = await import('node:fs/promises');
  const distDir =
    (await Promise.all(
      distDirCandidates.map(async (d) =>
        (await fs.access(path.join(d, 'index.html')).then(() => true).catch(() => false))
          ? d
          : null,
      ),
    ).then((rs) => rs.find(Boolean))) ?? distDirCandidates[0]!;
  const staticServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      app.emit('request', req, res);
      return;
    }
    try {
      const fs = await import('node:fs/promises');
      let rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      let file = path.join(distDir, rel);
      if (path.relative(distDir, file).startsWith('..')) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const buf = await fs.readFile(file).catch(() => null);
      if (!buf) {
        file = path.join(distDir, 'index.html');
      }
      const fallback = await fs.readFile(file).catch(() => null);
      if (!fallback) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('前端尚未构建，请先运行 npm run build');
        return;
      }
      const ext = path.extname(file);
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
      };
      res.writeHead(200, { 'content-type': types[ext] ?? 'application/octet-stream' });
      res.end(fallback);
    } catch {
      res.writeHead(500).end('error');
    }
  });
  await new Promise<void>((resolve) => staticServer.listen(port, resolve));
  console.log(`测试失败定位工具已启动: http://localhost:${port}`);
}
