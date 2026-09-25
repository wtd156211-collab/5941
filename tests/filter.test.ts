import { describe, expect, it } from 'vitest';
import { collectFiles, filterRun } from '../src/shared/filter';
import { parseJUnitReport } from '../src/shared/junit';

const xml = `<?xml version="1.0"?><testsuites>
  <testsuite name="s1" file="src/a.test.ts">
    <testcase classname="a" name="alpha 通过"/>
    <testcase classname="a" name="beta 失败" file="src/a.test.ts">
      <failure message="唯一错误标识" type="AssertionError">AssertionError: 唯一错误标识</failure>
    </testcase>
  </testsuite>
  <testsuite name="s2" file="src/b.test.ts">
    <testcase classname="b" name="gamma 跳过"><skipped/></testcase>
  </testsuite>
</testsuites>`;

describe('filterRun', () => {
  const run = parseJUnitReport(xml);

  it('按状态筛选并保留套件层级', () => {
    const filtered = filterRun(run, { statuses: ['failed'] });
    expect(filtered.suites).toHaveLength(1);
    expect(filtered.suites[0].name).toBe('s1');
    expect(filtered.suites[0].cases[0].name).toBe('beta 失败');
    expect(filtered.counts.failed).toBe(1);
  });

  it('按测试文件筛选', () => {
    const filtered = filterRun(run, { statuses: [], file: 'b.test.ts' });
    expect(filtered.suites).toHaveLength(1);
    expect(filtered.counts.skipped).toBe(1);
  });

  it('按关键字匹配错误消息与异常类型', () => {
    const byMessage = filterRun(run, { statuses: [], keyword: '唯一错误标识' });
    expect(byMessage.counts.failed).toBe(1);
    const byType = filterRun(run, { statuses: [], keyword: 'assertionerror' });
    expect(byType.counts.failed).toBe(1);
  });

  it('组合筛选：状态 + 关键字', () => {
    const filtered = filterRun(run, { statuses: ['passed'], keyword: 'alpha' });
    expect(filtered.counts.passed).toBe(1);
    expect(filtered.counts.failed).toBe(0);
  });

  it('无匹配时返回空套件列表', () => {
    const filtered = filterRun(run, { statuses: [], keyword: '不存在的关键字' });
    expect(filtered.suites).toHaveLength(0);
  });

  it('collectFiles 汇总所有测试文件', () => {
    expect(collectFiles(run)).toEqual(['src/a.test.ts', 'src/b.test.ts']);
  });
});
