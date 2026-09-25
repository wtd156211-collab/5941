import type { StackFrame } from './types';

const V8_PAREN = /^\s*at\s+(.*?)\s+\((.+):(\d+):(\d+)\)\s*$/;
const V8_BARE = /^\s*at\s+(.+):(\d+):(\d+)\s*$/;
const PYTHON = /^\s*File\s+"(.+)",\s+line\s+(\d+)(?:,\s+in\s+(.*))?$/;
const JAVA = /^\s*at\s+([\w.$]+)\(([\w.$]+\.(?:java|kt|scala)):(\d+)\)\s*$/;
const VITEST_JUNIT = /^\s*❯\s+(.+)$/;
const TRAILING_LOCATION = /(\S+):(\d+):(\d+)$/;
const GENERIC = /^(.+?):(\d+)(?::(\d+))?\s*$/;

const looksLikePath = (value: string): boolean =>
  value.includes('/') || value.includes('\\') || /\.[A-Za-z0-9]{1,8}$/.test(value);

export function parseStackTrace(stack: string): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const rawLine of stack.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) continue;

    let match = line.match(V8_PAREN);
    if (match) {
      frames.push({
        raw: line,
        functionName: match[1] || undefined,
        file: match[2],
        line: Number(match[3]),
        column: Number(match[4]),
      });
      continue;
    }

    match = line.match(V8_BARE);
    if (match && looksLikePath(match[1])) {
      frames.push({
        raw: line,
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
      });
      continue;
    }

    match = line.match(PYTHON);
    if (match) {
      frames.push({
        raw: line,
        file: match[1],
        line: Number(match[2]),
        functionName: match[3] || undefined,
      });
      continue;
    }

    match = line.match(JAVA);
    if (match) {
      frames.push({
        raw: line,
        functionName: match[1],
        file: match[2],
        line: Number(match[3]),
      });
      continue;
    }

    match = line.match(VITEST_JUNIT);
    if (match) {
      // vitest JUnit 方言：`❯ [函数名 ]文件:行:列`，函数名与文件之间以空格分隔
      const rest = match[1];
      const location = rest.match(TRAILING_LOCATION);
      if (location && looksLikePath(location[1])) {
        const functionName = rest.slice(0, location.index).trim();
        frames.push({
          raw: line,
          functionName: functionName || undefined,
          file: location[1],
          line: Number(location[2]),
          column: Number(location[3]),
        });
        continue;
      }
      frames.push({ raw: line });
      continue;
    }

    match = line.match(GENERIC);
    if (match && looksLikePath(match[1]) && !/^\s*at\s/.test(line)) {
      frames.push({
        raw: line,
        file: match[1],
        line: Number(match[2]),
        column: match[3] ? Number(match[3]) : undefined,
      });
      continue;
    }

    frames.push({ raw: line });
  }
  return frames;
}

export function firstLocation(frames: StackFrame[]): StackFrame | undefined {
  return frames.find((frame) => frame.file && frame.line !== undefined);
}
