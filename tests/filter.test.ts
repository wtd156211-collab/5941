import { describe, expect, it } from 'vitest';
import { collectFiles, filterCases } from '../src/shared/filter';
import type { TestCase } from '../src/shared/types';

function tc(partial: Partial<TestCase>): TestCase {
  return {
    id: partial.id ?? Math.random().toString(36),
    name: partial.name ?? 'case',
    suitePath: [],
    status: partial.status ?? 'passed',
    ...partial,
  };
}

const cases: TestCase[] = [
  tc({ id: '1', name: 'adds two', file: 'src/a.test.ts', status: 'passed' }),
  tc({
    id: '2',
    name: 'throws TypeError',
    file: 'src/b.test.ts',
    status: 'failed',
    failure: {
      body: '',
      stack: [],
      exceptionType: 'TypeError',
      message: 'cannot read properties of undefined',
    },
  }),
  tc({ id: '3', name: 'skipped work', file: 'src/a.test.ts', status: 'skipped' }),
  tc({ id: '4', name: 'queued', file: 'src/c.test.ts', status: 'not-run' }),
];

describe('filterCases', () => {
  it('按状态集合筛选', () => {
    expect(
      filterCases(cases, { statuses: new Set(['failed']) }).map((c) => c.id),
    ).toEqual(['2']);
    expect(
      filterCases(cases, { statuses: new Set(['passed', 'skipped']) }),
    ).toHaveLength(2);
    expect(filterCases(cases, { statuses: new Set() })).toHaveLength(4);
  });

  it('按测试文件筛选', () => {
    expect(
      filterCases(cases, { file: 'src/a.test.ts' }).map((c) => c.id),
    ).toEqual(['1', '3']);
  });

  it('按关键字匹配名称/异常/消息（大小写不敏感）', () => {
    expect(filterCases(cases, { keyword: 'typeerror' })).toHaveLength(1);
    expect(filterCases(cases, { keyword: 'undefined' })).toHaveLength(1);
    expect(filterCases(cases, { keyword: 'ADDS' })).toHaveLength(1);
    expect(filterCases(cases, { keyword: '  ' })).toHaveLength(4);
    expect(filterCases(cases, { keyword: 'nonexistent' })).toHaveLength(0);
  });

  it('条件组合（交集）', () => {
    expect(
      filterCases(cases, {
        statuses: new Set(['failed']),
        file: 'src/a.test.ts',
      }),
    ).toHaveLength(0);
  });
});

describe('collectFiles', () => {
  it('去重排序且忽略缺失文件', () => {
    expect(collectFiles(cases)).toEqual([
      'src/a.test.ts',
      'src/b.test.ts',
      'src/c.test.ts',
    ]);
  });
});
