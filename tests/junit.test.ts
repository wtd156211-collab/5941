import { describe, expect, it } from 'vitest';
import { parseJUnitReport } from '../src/shared/junit';
import { ReportParseError } from '../src/shared/types';

const wrap = (inner: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><testsuites>${inner}</testsuites>`;

describe('parseJUnitReport', () => {
  it('解析通过、失败、跳过用例并统计数量', () => {
    const run = parseJUnitReport(
      wrap(`<testsuite name="suite-a" tests="3">
        <testcase classname="a" name="ok" time="0.01"/>
        <testcase classname="a" name="bad" time="0.02">
          <failure message="期望相等" type="AssertionError">AssertionError: 期望相等
    at /repo/a.test.ts:10:5</failure>
        </testcase>
        <testcase classname="a" name="later"><skipped/></testcase>
      </testsuite>`),
    );
    expect(run.counts).toEqual({ passed: 1, failed: 1, skipped: 1, notrun: 0 });
    const bad = run.suites[0].cases[1];
    expect(bad.status).toBe('failed');
    expect(bad.failures[0].message).toBe('期望相等');
    expect(bad.failures[0].exceptionType).toBe('AssertionError');
    expect(bad.failures[0].frames.some((f) => f.file === '/repo/a.test.ts' && f.line === 10)).toBe(true);
    expect(bad.time).toBeCloseTo(0.02);
  });

  it('保留嵌套套件层级并聚合计数', () => {
    const run = parseJUnitReport(
      wrap(`<testsuite name="outer">
        <testsuite name="inner">
          <testcase name="c1"/>
        </testsuite>
        <testcase name="c2"><failure message="x">x</failure></testcase>
      </testsuite>`),
    );
    expect(run.suites[0].name).toBe('outer');
    expect(run.suites[0].suites[0].name).toBe('inner');
    expect(run.suites[0].counts.failed).toBe(1);
    expect(run.suites[0].counts.passed).toBe(1);
    expect(run.counts.failed).toBe(1);
  });

  it('识别 notrun 状态', () => {
    const run = parseJUnitReport(
      wrap(`<testsuite name="s"><testcase name="pending" status="notrun"/></testsuite>`),
    );
    expect(run.suites[0].cases[0].status).toBe('notrun');
    expect(run.counts.notrun).toBe(1);
  });

  it('未知 status 给出警告并按未执行处理', () => {
    const run = parseJUnitReport(
      wrap(`<testsuite name="s"><testcase name="weird" status="mystery"/></testsuite>`),
    );
    expect(run.suites[0].cases[0].status).toBe('notrun');
    expect(run.warnings.some((w) => w.includes('mystery'))).toBe(true);
  });

  it('非法 time 属性给出警告并忽略', () => {
    const run = parseJUnitReport(
      wrap(`<testsuite name="s"><testcase name="t" time="abc"/></testsuite>`),
    );
    expect(run.suites[0].cases[0].time).toBeUndefined();
    expect(run.warnings.some((w) => w.includes('abc'))).toBe(true);
  });

  it('缺少堆栈与空失败体都产生警告', () => {
    const run = parseJUnitReport(
      wrap(`<testsuite name="s">
        <testcase name="nostack"><failure message="只有消息"/></testcase>
        <testcase name="empty"><failure/></testcase>
      </testsuite>`),
    );
    expect(run.warnings.some((w) => w.includes('缺少堆栈'))).toBe(true);
    expect(run.warnings.some((w) => w.includes('既没有 message'))).toBe(true);
  });

  it('vitest 重试：多个 failure 节点计为重试次数，最终状态为失败', () => {
    const run = parseJUnitReport(
      wrap(`<testsuite name="s">
        <testcase name="flaky">
          <failure message="第 1 次">AssertionError: 第 1 次</failure>
          <failure message="第 2 次">AssertionError: 第 2 次</failure>
        </testcase>
      </testsuite>`),
    );
    const testCase = run.suites[0].cases[0];
    expect(testCase.status).toBe('failed');
    expect(testCase.retryCount).toBe(1);
    expect(testCase.failures).toHaveLength(2);
  });

  it('surefire flakyFailure：最终通过且记录重试次数', () => {
    const run = parseJUnitReport(
      wrap(`<testsuite name="s">
        <testcase name="flaky-ok">
          <flakyFailure message="曾经失败">AssertionError: 曾经失败</flakyFailure>
        </testcase>
      </testsuite>`),
    );
    const testCase = run.suites[0].cases[0];
    expect(testCase.status).toBe('passed');
    expect(testCase.retryCount).toBe(1);
  });

  it('rerunFailure 与最终 failure 同时存在时状态为失败', () => {
    const run = parseJUnitReport(
      wrap(`<testsuite name="s">
        <testcase name="rerun">
          <rerunFailure message="重试失败">AssertionError: 重试失败</rerunFailure>
          <failure message="最终失败">AssertionError: 最终失败</failure>
        </testcase>
      </testsuite>`),
    );
    const testCase = run.suites[0].cases[0];
    expect(testCase.status).toBe('failed');
    expect(testCase.retryCount).toBe(1);
  });

  it('空内容抛出 ReportParseError', () => {
    expect(() => parseJUnitReport('   ')).toThrow(ReportParseError);
  });

  it('非法 XML 抛出 ReportParseError 并带行号', () => {
    expect(() => parseJUnitReport('<testsuites><testsuite>')).toThrow(ReportParseError);
    expect(() => parseJUnitReport('这不是 XML')).toThrow(ReportParseError);
  });

  it('非 JUnit 文档抛出 ReportParseError', () => {
    expect(() => parseJUnitReport('<html><body>hi</body></html>')).toThrow(ReportParseError);
  });

  it('没有任何用例时给出警告', () => {
    const run = parseJUnitReport(wrap('<testsuite name="empty"/>'));
    expect(run.warnings.some((w) => w.includes('不包含任何测试用例'))).toBe(true);
  });

  it('读取 system-out / system-err', () => {
    const run = parseJUnitReport(
      wrap(`<testsuite name="s">
        <testcase name="io"><system-out>hello</system-out><system-err>oops</system-err></testcase>
      </testsuite>`),
    );
    expect(run.suites[0].cases[0].stdout).toBe('hello');
    expect(run.suites[0].cases[0].stderr).toBe('oops');
  });
});
