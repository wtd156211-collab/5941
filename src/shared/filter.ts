import type { TestCase, TestRun, TestStatus, TestSuite } from './types';

export interface CaseFilter {
  statuses: TestStatus[];
  file?: string;
  keyword?: string;
}

export function caseMatches(testCase: TestCase, filter: CaseFilter): boolean {
  if (filter.statuses.length > 0 && !filter.statuses.includes(testCase.status)) {
    return false;
  }
  if (filter.file) {
    const file = (testCase.file ?? '').toLowerCase();
    if (!file.includes(filter.file.toLowerCase())) return false;
  }
  const keyword = filter.keyword?.trim().toLowerCase();
  if (keyword) {
    const haystack = [
      testCase.name,
      testCase.classname,
      testCase.file ?? '',
      ...testCase.failures.flatMap((f) => [f.message, f.exceptionType ?? '']),
    ]
      .join('\n')
      .toLowerCase();
    if (!haystack.includes(keyword)) return false;
  }
  return true;
}

export function filterSuite(suite: TestSuite, filter: CaseFilter): TestSuite | null {
  const cases = suite.cases.filter((c) => caseMatches(c, filter));
  const suites = suite.suites
    .map((child) => filterSuite(child, filter))
    .filter((child): child is TestSuite => child !== null);
  if (cases.length === 0 && suites.length === 0) return null;
  const counts = { passed: 0, failed: 0, skipped: 0, notrun: 0 };
  for (const c of cases) counts[c.status] += 1;
  for (const child of suites) {
    counts.passed += child.counts.passed;
    counts.failed += child.counts.failed;
    counts.skipped += child.counts.skipped;
    counts.notrun += child.counts.notrun;
  }
  return { ...suite, cases, suites, counts };
}

export function filterRun(run: TestRun, filter: CaseFilter): TestRun {
  const suites = run.suites
    .map((suite) => filterSuite(suite, filter))
    .filter((suite): suite is TestSuite => suite !== null);
  const counts = { passed: 0, failed: 0, skipped: 0, notrun: 0 };
  for (const suite of suites) {
    counts.passed += suite.counts.passed;
    counts.failed += suite.counts.failed;
    counts.skipped += suite.counts.skipped;
    counts.notrun += suite.counts.notrun;
  }
  return { ...run, suites, counts };
}

export function collectFiles(run: TestRun): string[] {
  const files = new Set<string>();
  const visit = (suite: TestSuite): void => {
    for (const c of suite.cases) if (c.file) files.add(c.file);
    suite.suites.forEach(visit);
  };
  run.suites.forEach(visit);
  return [...files].sort();
}
