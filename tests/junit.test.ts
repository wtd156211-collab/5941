import { describe, expect, it } from 'vitest';
import { parseJunitXml } from '../src/shared/junit';

const FULL_REPORT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="root" time="1.234">
  <testsuite name="math" tests="4" failures="1" skipped="1" time="0.9">
    <testcase classname="math" name="adds numbers" file="src/math.test.ts" line="3" time="0.012">
      <system-out>hello stdout</system-out>
    </testcase>
    <testcase classname="math" name="fails assertion" file="src/math.test.ts" line="8" time="0.045">
      <failure message="expected 2 to be 3" type="AssertionError"><![CDATA[AssertionError: expected 2 to be 3
    at /repo/src/math.test.ts:9:24
    at /repo/node_modules/vitest/dist/index.js:100:5]]></failure>
    </testcase>
    <testcase classname="math" name="is skipped" file="src/math.test.ts" time="0">
      <skipped message="not implemented yet" />
    </testcase>
    <testcase classname="math" name="queued case" status="notrun" time="0" />
  </testsuite>
  <testsuite name="nested">
    <testsuite name="inner">
      <testcase classname="nested.inner" name="deep case" time="0.001" />
    </testsuite>
  </testsuite>
</testsuites>`;

describe('parseJunitXml 基础层级与状态', () => {
  it('解析套件层级（含嵌套套件）', () => {
    const { run, error } = parseJunitXml(FULL_REPORT, 'junit.xml');
    expect(error).toBeUndefined();
    expect(run).not.toBeNull();
    expect(run!.suites).toHaveLength(2);
    expect(run!.suites[1].suites[0].name).toBe('inner');
    expect(run!.suites[1].suites[0].cases[0].suitePath).toEqual([
      'nested',
      'inner',
    ]);
  });

  it('区分通过/失败/跳过/未执行四种状态', () => {
    const { run } = parseJunitXml(FULL_REPORT);
    expect(run!.counts).toEqual({
      passed: 2,
      failed: 1,
      skipped: 1,
      'not-run': 1,
    });
    const statuses = Object.fromEntries(
      run!.cases.map((c) => [c.name, c.status]),
    );
    expect(statuses['adds numbers']).toBe('passed');
    expect(statuses['fails assertion']).toBe('failed');
    expect(statuses['is skipped']).toBe('skipped');
    expect(statuses['queued case']).toBe('not-run');
  });

  it('聚合计数包含子套件', () => {
    const { run } = parseJunitXml(FULL_REPORT);
    expect(run!.suites[1].counts.passed).toBe(1);
    expect(run!.totalDurationMs).toBe(1234);
  });

  it('失败用例提供消息、异常类型、堆栈与耗时', () => {
    const { run } = parseJunitXml(FULL_REPORT);
    const failed = run!.cases.find((c) => c.name === 'fails assertion')!;
    expect(failed.failure?.exceptionType).toBe('AssertionError');
    expect(failed.failure?.message).toContain('expected 2 to be 3');
    expect(failed.failure?.stack[0]).toMatchObject({
      file: '/repo/src/math.test.ts',
      line: 9,
      column: 24,
      kind: 'js',
      isExternal: false,
    });
    expect(failed.failure?.stack[1]?.isExternal).toBe(true);
    expect(failed.durationMs).toBe(45);
    const passed = run!.cases.find((c) => c.name === 'adds numbers')!;
    expect(passed.stdout).toBe('hello stdout');
  });

  it('跳过原因被保留', () => {
    const { run } = parseJunitXml(FULL_REPORT);
    const skipped = run!.cases.find((c) => c.name === 'is skipped')!;
    expect(skipped.skipReason).toBe('not implemented yet');
  });

  it('支持顶层单个 testsuite', () => {
    const xml = `<testsuite name="only" tests="1">
      <testcase classname="only" name="one" time="0.1"/>
    </testsuite>`;
    const { run } = parseJunitXml(FULL_REPORT);
    void run;
    const single = parseJunitXml(xml);
    expect(single.run!.suites).toHaveLength(1);
    expect(single.run!.cases[0].status).toBe('passed');
  });
});

describe('parseJunitXml 重试结果', () => {
  it('解析 flakyFailure（最终通过 + 重试次数）', () => {
    const xml = `<testsuites>
      <testsuite name="s">
        <testcase classname="s" name="flaky" file="src/flaky.test.ts" line="5" time="0.2">
          <flakyFailure message="boom" type="Error"><![CDATA[Error: boom
    at /repo/src/flaky.test.ts:6:10]]></flakyFailure>
        </testcase>
      </testsuite>
    </testsuites>`;
    const { run } = parseJunitXml(xml);
    const tc = run!.cases[0];
    expect(tc.status).toBe('passed');
    expect(tc.retry?.retryCount).toBe(1);
    expect(tc.retry?.attempts[0].exceptionType).toBe('Error');
    expect(tc.retry?.attempts[0].stack[0].line).toBe(6);
  });

  it('解析重复 failure/error 节点（多次重试，最终失败）', () => {
    const xml = `<testsuites>
      <testsuite name="s">
        <testcase classname="s" name="retry-twice" time="0.3">
          <failure type="AssertionError" message="attempt 3"><![CDATA[AssertionError: attempt 3
    at /repo/src/x.test.ts:30:1]]></failure>
          <rerunFailure type="AssertionError" message="attempt 1"><![CDATA[AssertionError: attempt 1
    at /repo/src/x.test.ts:30:1]]></rerunFailure>
          <rerunFailure type="AssertionError" message="attempt 2"><![CDATA[AssertionError: attempt 2
    at /repo/src/x.test.ts:30:1]]></rerunFailure>
        </testcase>
      </testsuite>
    </testsuites>`;
    const { run } = parseJunitXml(xml);
    const tc = run!.cases[0];
    expect(tc.status).toBe('failed');
    expect(tc.failure?.message).toBe('attempt 3');
    expect(tc.retry?.retryCount).toBe(2);
    expect(tc.retry?.attempts.map((a) => a.message)).toEqual([
      'attempt 1',
      'attempt 2',
    ]);
  });
});

describe('parseJunitXml 异常数据', () => {
  it('空字符串报告', () => {
    const r = parseJunitXml('   ');
    expect(r.run).toBeNull();
    expect(r.error?.code).toBe('EMPTY_REPORT');
  });

  it('非法 XML', () => {
    const r = parseJunitXml('<testsuites><testsuite><testcase');
    expect(r.run).toBeNull();
    expect(r.error?.code).toBe('MALFORMED_REPORT');
  });

  it('非 JUnit 格式给出明确错误', () => {
    const r = parseJunitXml('<html><body>nope</body></html>');
    expect(r.run).toBeNull();
    expect(r.error?.code).toBe('UNSUPPORTED_FORMAT');
  });

  it('空 testsuites 不崩溃并给出提示', () => {
    const r = parseJunitXml('<testsuites></testsuites>');
    expect(r.run).not.toBeNull();
    expect(r.run!.cases).toHaveLength(0);
    expect(r.warnings[0].code).toBe('EMPTY_REPORT');
  });

  it('缺少堆栈时产生 MISSING_STACK 提示', () => {
    const xml = `<testsuites><testsuite name="s">
      <testcase classname="s" name="no-stack">
        <failure message="just a message" type="Error"></failure>
      </testcase>
    </testsuite></testsuites>`;
    const r = parseJunitXml(xml);
    expect(r.run!.cases[0].failure?.stackMissing).toBe(true);
    expect(r.warnings.some((w) => w.code === 'MISSING_STACK')).toBe(true);
  });

  it('未知状态按未执行展示并给出 UNKNOWN_STATUS 警告', () => {
    const xml = `<testsuites><testsuite name="s">
      <testcase classname="s" name="weird" status="quarantined" />
    </testsuite></testsuites>`;
    const r = parseJunitXml(xml);
    const tc = r.run!.cases[0];
    expect(tc.status).toBe('not-run');
    expect(tc.rawStatus).toBe('quarantined');
    expect(r.warnings.some((w) => w.code === 'UNKNOWN_STATUS')).toBe(true);
  });

  it('非法 time 值产生 INVALID_TIME 警告且不崩溃', () => {
    const xml = `<testsuites><testsuite name="s">
      <testcase classname="s" name="bad-time" time="not-a-number" />
    </testsuite></testsuites>`;
    const r = parseJunitXml(xml);
    expect(r.run!.cases[0].durationMs).toBeUndefined();
    expect(r.warnings.some((w) => w.code === 'INVALID_TIME')).toBe(true);
  });

  it('失败声明但缺少失败体时给出结构异常提示', () => {
    const xml = `<testsuites><testsuite name="s">
      <testcase classname="s" name="broken"><failure/></testcase>
    </testsuite></testsuites>`;
    const r = parseJunitXml(xml);
    const tc = r.run!.cases[0];
    expect(tc.status).toBe('failed');
    expect(tc.failure?.stackMissing).toBe(true);
  });

  it('从堆栈推断文件：没有 file 属性时用首帧业务代码', () => {
    const xml = `<testsuites><testsuite name="s">
      <testcase classname="s" name="infer">
        <failure type="Error" message="x"><![CDATA[Error: x
    at wrapper (/external/lib.js:1:1)
    at real (/repo/src/real.ts:42:7)]]></failure>
      </testcase>
    </testsuite></testsuites>`;
    const r = parseJunitXml(xml);
    expect(r.run!.cases[0].file).toBe('/repo/src/real.ts');
    expect(r.run!.cases[0].line).toBe(42);
  });
});
