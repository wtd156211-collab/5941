import type { ParseResult, SourceFile } from '../shared/types';

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T | { error: string; message: string };
  if (!res.ok) {
    const err = body as { error?: string; message?: string };
    throw new Error(err.message || `请求失败 (${res.status})`);
  }
  return body as T;
}

/** 直接上传报告文本（不经服务器落盘）。 */
export async function parseReportXml(
  xml: string,
  reportName?: string,
): Promise<ParseResult> {
  const res = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ xml, reportName }),
  });
  return parseJsonOrThrow<ParseResult>(res);
}

/** 让服务器读取 workspace 内的一个报告文件路径。 */
export async function parseReportPath(path: string): Promise<ParseResult> {
  const res = await fetch(`/api/parse?path=${encodeURIComponent(path)}`);
  return parseJsonOrThrow<ParseResult>(res);
}

export async function fetchSource(
  file: string,
  line?: number,
): Promise<SourceFile> {
  const params = new URLSearchParams({ path: file });
  if (line !== undefined) params.set('line', String(line));
  const res = await fetch(`/api/source?${params.toString()}`);
  return parseJsonOrThrow<SourceFile>(res);
}
