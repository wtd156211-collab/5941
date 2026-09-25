import fs from 'node:fs';
import path from 'node:path';
import { SourceLocationError, type SourceView } from './types';

export const SOURCE_CONTEXT_LINES = 8;

export function resolveSourcePath(root: string, file: string): string {
  if (!file || !file.trim()) {
    throw new SourceLocationError('源码位置无效：文件路径为空');
  }
  const cleaned = file.trim().replace(/^file:\/\//, '');
  const resolved = path.resolve(root, cleaned);
  const normalizedRoot = path.resolve(root);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new SourceLocationError(`源码位置无效：${file} 不在工作目录内`);
  }
  if (!fs.existsSync(resolved)) {
    throw new SourceLocationError(`源码文件不存在：${file}`);
  }
  if (!fs.statSync(resolved).isFile()) {
    throw new SourceLocationError(`源码位置无效：${file} 不是文件`);
  }
  return resolved;
}

export function readSourceView(
  root: string,
  file: string,
  line?: number,
  column?: number,
): SourceView {
  const resolved = resolveSourcePath(root, file);
  const lines = fs.readFileSync(resolved, 'utf8').split(/\r?\n/);

  let warning: string | undefined;
  let targetLine = line;
  if (targetLine !== undefined) {
    if (!Number.isInteger(targetLine) || targetLine < 1) {
      warning = `行号 ${line} 无效，已展示文件开头`;
      targetLine = undefined;
    } else if (targetLine > lines.length) {
      warning = `行号 ${targetLine} 超出文件范围（共 ${lines.length} 行），已定位到文件末尾`;
      targetLine = lines.length;
    }
  }

  const center = targetLine ?? 1;
  const startLine = Math.max(1, center - SOURCE_CONTEXT_LINES);
  const endLine = Math.min(lines.length, center + SOURCE_CONTEXT_LINES);
  return {
    file: path.relative(root, resolved) || resolved,
    line: targetLine,
    column,
    startLine,
    lines: lines.slice(startLine - 1, endLine),
    warning,
  };
}
