/**
 * 跨语言堆栈解析：不依赖完整测试框架，只识别“文件:行号”这一层通用线索。
 * 支持 JavaScript/Node (V8)、Python、Java、Go、.NET 五种常见格式。
 */
import type { StackFrame } from './types';

// 带括号的 V8 帧：at fn (file.js:10:5)
const JS_PAREN =
  /^\s*at\s+(?<fn>.*?)\s+\((?<file>.+?):(?<line>\d+):(?<col>\d+)\)\s*$/;
// 无括号：at file.js:10:5
const JS_BARE = /^\s*at\s+(?<file>[^\s()]+):(?<line>\d+):(?<col>\d+)\s*$/;
// vitest 的 JUnit reporter 输出帧形如： ❯ src/flaky.test.ts:14:59
const JS_VITEST =
  /^\s*[❯>x×✓·]*\s*(?<file>[\w.@~/-]+\.[cm]?[jt]sx?):(?<line>\d+)(?::(?<col>\d+))?\s*$/;

const PY_FRAME =
  /^\s*File\s+"(?<file>[^"]+)",\s*line\s+(?<line>\d+)(?:,\s*in\s+(?<fn>.+))?\s*$/;

const JAVA_FRAME = /^\s*at\s+[\w$.<>]+\s*(\([^)]*\))?\s*$/;
const JAVA_SOURCE = /\((?<file>[\w$]+\.[\w]+):(?<line>\d+)\)/;

const GO_FRAME = /^(?<file>[\w./\\-]+\.go):(?<line>\d+)\s*(?:\+0x[\da-f]+)?\s*$/;

const DOTNET_FRAME =
  /^\s*at\s+(?<fn>[\w.$<>]+)\s*\(.*?\)\s*in\s+(?<file>\S.+?):line\s+(?<line>\d+)\s*$/;

const EXTERNAL_HINTS: RegExp[] = [
  /node_modules/,
  /(^|[/\\])(?:external|vendor|third_party|site-packages|dist-packages)[/\\]/,
  /(?:^|[/\\])lib[/\\](?:python|node|ruby|perl|jvm|jdk|jre)\b/,
  /^internal[\\/]/,
  /node:/,
  /\(node:/,
];

function isExternalFile(file: string): boolean {
  return EXTERNAL_HINTS.some((re) => re.test(file));
}

export function parseJsFrame(raw: string): StackFrame | null {
  const v = JS_VITEST.exec(raw);
  if (v?.groups) {
    const g = v.groups;
    return {
      raw,
      kind: 'js',
      file: g.file,
      line: Number(g.line),
      column: g.col ? Number(g.col) : undefined,
      isExternal: isExternalFile(g.file),
    };
  }
  const m = JS_PAREN.exec(raw) ?? JS_BARE.exec(raw);
  if (!m?.groups) return null;
  const g = m.groups;
  let fn: string | undefined = g.fn;
  if (fn !== undefined) {
    fn = fn.replace(/^async\s+/, '').trim();
    if (!fn || fn === 'async') fn = undefined;
  }
  return {
    raw,
    kind: 'js',
    functionName: fn,
    file: g.file,
    line: Number(g.line),
    column: g.col ? Number(g.col) : undefined,
    isExternal: isExternalFile(g.file),
  };
}

export function parsePythonFrame(raw: string): StackFrame | null {
  const m = PY_FRAME.exec(raw);
  if (!m?.groups) return null;
  return {
    raw,
    kind: 'python',
    file: m.groups.file,
    line: Number(m.groups.line),
    functionName: m.groups.fn?.trim() || undefined,
    isExternal:
      /[/\\](site-packages|dist-packages|lib[/\\]python\d|python\d+\.\d+)[/\\]/.test(
        m.groups.file,
      ),
  };
}

export function parseJavaFrame(raw: string): StackFrame | null {
  if (!JAVA_FRAME.test(raw)) return null;
  const m = JAVA_SOURCE.exec(raw);
  if (!m?.groups) return null;
  const fnMatch = /^\s*at\s+([\w$.<>]+)/.exec(raw);
  return {
    raw,
    kind: 'java',
    file: m.groups.file,
    line: Number(m.groups.line),
    functionName: fnMatch?.[1],
    isExternal: /(^|\.)(java|javax|jdk|sun)\./.test(fnMatch?.[1] ?? ''),
  };
}

export function parseGoFrame(raw: string, fnHint?: string): StackFrame | null {
  const m = GO_FRAME.exec(raw);
  if (!m?.groups) return null;
  return {
    raw,
    kind: 'go',
    file: m.groups.file,
    line: Number(m.groups.line),
    functionName: fnHint,
    isExternal:
      /^runtime\//.test(fnHint ?? '') || m.groups.file.startsWith('runtime/'),
  };
}

export function parseDotnetFrame(raw: string): StackFrame | null {
  const m = DOTNET_FRAME.exec(raw);
  if (!m?.groups) return null;
  return {
    raw,
    kind: 'dotnet',
    file: m.groups.file,
    line: Number(m.groups.line),
    functionName: m.groups.fn,
    isExternal: /^(System|Microsoft)\./.test(m.groups.fn),
  };
}

/**
 * 解析完整堆栈文本，按行识别各语言帧。
 * Go 堆栈的函数名位于文件行上一行，这里做简单的上下文关联。
 */
export function parseStack(text: string): StackFrame[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const frames: StackFrame[] = [];
  let lastGoFn: string | undefined;

  for (const raw of lines) {
    const js = parseJsFrame(raw);
    if (js) {
      frames.push(js);
      continue;
    }
    const py = parsePythonFrame(raw);
    if (py) {
      frames.push(py);
      continue;
    }
    const java = parseJavaFrame(raw);
    if (java) {
      frames.push(java);
      continue;
    }
    const dotnet = parseDotnetFrame(raw);
    if (dotnet) {
      frames.push(dotnet);
      continue;
    }
    const go = parseGoFrame(raw, lastGoFn);
    if (go) {
      frames.push(go);
      lastGoFn = undefined;
      continue;
    }
    // Go 风格：函数名行形如 "main.failingFunc(...)"，下一行是 "file.go:42 +0x..."
    const trimmed = raw.trim();
    if (/^[\w/*().\[\]-]+$/.test(trimmed) && trimmed.includes('(') && trimmed.includes('.')) {
      lastGoFn = trimmed;
    } else {
      lastGoFn = undefined;
    }
  }

  return frames;
}

/** 从异常正文首行提取类型，例如 "AssertionError: expected 1 to be 2"。 */
export function extractExceptionType(firstLine: string | undefined): string | undefined {
  if (!firstLine) return undefined;
  const colon = firstLine.indexOf(':');
  const head = (colon >= 0 ? firstLine.slice(0, colon) : firstLine).trim();
  if (/^[A-Za-z_$][\w.$<>]*$/.test(head)) return head;
  return undefined;
}
