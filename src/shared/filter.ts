import type { TestCase, TestStatus } from './types';

export interface CaseFilter {
  statuses?: ReadonlySet<TestStatus>;
  file?: string;
  keyword?: string;
}

/** 关键字匹配用例名、classname、文件、异常类型与消息。 */
export function matchesKeyword(c: TestCase, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  const haystacks = [
    c.name,
    c.classname,
    c.file,
    c.failure?.exceptionType,
    c.failure?.message,
  ];
  return haystacks.some((h) => h?.toLowerCase().includes(kw));
}

export function filterCases(cases: readonly TestCase[], f: CaseFilter): TestCase[] {
  return cases.filter((c) => {
    if (f.statuses && f.statuses.size > 0 && !f.statuses.has(c.status)) {
      return false;
    }
    if (f.file && c.file !== f.file) return false;
    if (f.keyword && !matchesKeyword(c, f.keyword)) return false;
    return true;
  });
}

/** 收集所有用例涉及的测试文件，去重并排序。 */
export function collectFiles(cases: readonly TestCase[]): string[] {
  return [...new Set(cases.map((c) => c.file).filter((f): f is string => !!f))].sort();
}
