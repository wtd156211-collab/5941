import type { SourceView, TestRun } from '../shared/types';

export interface ParseResponse {
  origin: string;
  run: TestRun;
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `请求失败（HTTP ${response.status}）`);
  }
  return payload;
}

export function parseReport(path: string): Promise<ParseResponse> {
  return request<ParseResponse>('/api/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}

export function fetchSource(file: string, line?: number, column?: number): Promise<SourceView> {
  const params = new URLSearchParams({ file });
  if (line !== undefined) params.set('line', String(line));
  if (column !== undefined) params.set('column', String(column));
  return request<SourceView>(`/api/source?${params.toString()}`);
}
