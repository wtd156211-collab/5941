/**
 * 源码访问安全：只允许读取根目录内的文件，拒绝路径穿越。
 * 服务端和测试共用同一套判定，避免两套实现不一致。
 */
import path from 'node:path';

export interface ResolveResult {
  ok: boolean;
  absolutePath?: string;
  reason?: 'NOT_FOUND' | 'OUTSIDE_ROOT' | 'NOT_A_FILE' | 'INVALID_PATH';
}

/**
 * 把报告中的路径（可能是绝对路径、相对路径或带 file:// 前缀）
 * 解析为 root 内的真实文件路径。
 *
 * 查找顺序：
 * 1. 去掉 file:// 前缀后按绝对路径解析（必须仍在 root 内）
 * 2. 相对 root 解析
 * 3. 取 basename 在 root 下递归匹配（应对报告机器与当前机器目录不同）
 */
export async function resolveSourcePath(
  root: string,
  rawPath: string,
  basenameIndex?: (base: string) => string[] | undefined,
): Promise<ResolveResult> {
  if (!rawPath || typeof rawPath !== 'string') {
    return { ok: false, reason: 'INVALID_PATH' };
  }
  const normalizedInput = rawPath.replace(/^file:\/\//, '');

  const rootAbs = path.resolve(root);
  const candidates: string[] = [];

  if (path.isAbsolute(normalizedInput)) {
    candidates.push(path.normalize(normalizedInput));
  } else {
    candidates.push(path.resolve(rootAbs, normalizedInput));
  }
  const base = path.basename(normalizedInput);
  if (basenameIndex && base) {
    for (const hit of basenameIndex(base) ?? []) {
      candidates.push(path.resolve(rootAbs, hit));
    }
  }

  const fs = await import('node:fs/promises');
  for (const candidate of candidates) {
    const rel = path.relative(rootAbs, candidate);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      continue;
    }
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return { ok: true, absolutePath: candidate };
    } catch {
      // 尝试下一个候选
    }
  }

  // 区分“越界”和“不存在”，便于给出明确提示
  const first = candidates[0]!;
  const rel = path.relative(rootAbs, first);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: 'OUTSIDE_ROOT' };
  }
  return { ok: false, reason: 'NOT_FOUND' };
}

/** 同步版本：用于不便使用 fs/promises 的场景（测试等）。 */
export function isInsideRoot(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
    ? true
    : rel === ''
      ? true
      : false;
}
