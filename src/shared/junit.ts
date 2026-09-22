/**
 * JUnit XML 报告解析器。
 *
 * 兼容主流工具产出的 JUnit 方言：
 * - 顶层 <testsuites>（多套件）或单个 <testsuite>
 * - testcase 上的 file/line 属性（vitest、pytest-junit 等）
 * - flakyFailure/flakyError/rerunFailure/rerunError（重试信息，
 *   分别来自 maven-surefire 与 jenkins flaky-test-runner 方言）
 * - status 属性（notrun / skipped / passed / failed…）
 * 不做任何示例数据兜底：解析器只消费传入的真实 XML。
 */
import { XMLParser } from 'fast-xml-parser';
import { extractExceptionType, parseStack } from './stack';
import type {
  FailureInfo,
  ParseResult,
  ParseWarning,
  RetryInfo,
  StackFrame,
  TestCase,
  TestRun,
  TestStatus,
  TestSuiteNode,
} from './types';

interface XmlAttrs {
  [k: string]: unknown;
}

interface XmlNode {
  [k: string]: unknown;
  ':@'?: XmlAttrs;
}

type XmlElement = XmlNode | string;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? (v as T[]) : [v as T];
}

function attrs(node: XmlElement | undefined): XmlAttrs {
  if (node && typeof node === 'object' && ':@' in node) {
    return (node as XmlNode)[':@'] ?? {};
  }
  return {};
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function textOf(node: XmlElement | undefined, tag: string): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const v = (node as XmlNode)[tag];
  if (v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    // 多个同名元素时拼接其文本（少见）
    return v
      .map((item) => (typeof item === 'string' ? item : textOf(item as XmlNode, '#text')))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof v === 'object') return str((v as XmlNode)['#text']);
  return undefined;
}

function parseTime(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) : undefined;
}

function mapStatus(raw: string | undefined): TestStatus {
  switch ((raw ?? '').toLowerCase()) {
    case '':
      return 'passed';
    case 'passed':
    case 'pass':
    case 'ok':
    case 'success':
      return 'passed';
    case 'failed':
    case 'fail':
    case 'failure':
    case 'error':
      return 'failed';
    case 'skipped':
    case 'skip':
    case 'ignored':
    case 'pending':
      return 'skipped';
    case 'not-run':
    case 'notrun':
    case 'not_run':
      return 'not-run';
    default:
      return 'not-run';
  }
}

function buildFailure(el: XmlElement | undefined): FailureInfo | undefined {
  if (!el || typeof el !== 'object') return undefined;
  const a = attrs(el);
  const body = str((el as XmlNode)['#text']) ?? textOf(el as XmlNode, '#text') ?? '';
  const messageAttr = str(a.message);
  const typeAttr = str(a.type);

  const lines = body ? body.split(/\r?\n/).filter((l) => l.trim() !== '') : [];
  const firstLine = lines[0]?.trim();
  const exceptionType = typeAttr ?? extractExceptionType(firstLine);

  const stack: StackFrame[] = parseStack(body);
  const bodyHasStackHint = /(^\s*at\s)|(^\s*File ")|(^\s*at\s+\w+.*:\d+)/m.test(
    body,
  );

  return {
    step: firstLine,
    message: messageAttr ?? (exceptionType && firstLine && firstLine.includes(':')
      ? firstLine.slice(firstLine.indexOf(':') + 1).trim()
      : firstLine),
    exceptionType,
    body,
    stack,
    stackMissing: !bodyHasStackHint && stack.length === 0,
  };
}

interface BuildContext {
  warnings: ParseWarning[];
  seq: number;
}

function buildCase(
  el: XmlElement,
  suitePath: string[],
  ctx: BuildContext,
): TestCase {
  const a = attrs(el);
  const node = el as XmlNode;
  const id = `case-${++ctx.seq}`;

  const name = str(a.name) ?? '(unnamed test)';
  const classname = str(a.classname);
  const fileAttr = str(a.file) ?? str(a.filename);
  const lineAttr = a.line !== undefined ? Number(a.line) : undefined;

  let durationMs = parseTime(a.time);
  if (a.time !== undefined && durationMs === undefined) {
    ctx.warnings.push({
      code: 'INVALID_TIME',
      message: `用例 "${name}" 的 time 属性无法解析：${String(a.time)}`,
      testCaseId: id,
    });
  }

  const failureEl = node.failure as XmlElement | XmlElement[] | undefined;
  const errorEl = node.error as XmlElement | XmlElement[] | undefined;
  const skippedEl = node.skipped as XmlElement | XmlElement[] | undefined;

  const explicitStatus = str(a.status);
  let status: TestStatus;
  if (failureEl !== undefined || errorEl !== undefined) {
    status = 'failed';
  } else if (skippedEl !== undefined) {
    status = 'skipped';
  } else {
    status = mapStatus(explicitStatus);
    const alias = explicitStatus?.toLowerCase();
    const knownAliases = new Set([
      'passed', 'pass', 'ok', 'success',
      'failed', 'fail', 'failure', 'error',
      'skipped', 'skip', 'ignored', 'pending',
      'not-run', 'notrun', 'not_run',
    ]);
    if (alias && !knownAliases.has(alias)) {
      ctx.warnings.push({
        code: 'UNKNOWN_STATUS',
        message: `用例 "${name}" 带有未知状态 "${explicitStatus}"，按“未执行”展示`,
        testCaseId: id,
      });
    }
  }
  const testCase: TestCase = {
    id,
    name,
    classname,
    suitePath,
    durationMs,
    status,
    rawStatus: explicitStatus,
  };

  if (fileAttr) testCase.file = fileAttr;
  if (lineAttr !== undefined && Number.isFinite(lineAttr) && lineAttr > 0) {
    testCase.line = lineAttr;
  }

  const failureNodes = asArray<XmlElement>(failureEl);
  const errorNodes = asArray<XmlElement>(errorEl);
  // vitest 对重试用例会输出多个相同层级的 <failure>：最后一次是最终结果。
  const primary = failureNodes[failureNodes.length - 1] ?? errorNodes[errorNodes.length - 1];
  if (primary !== undefined) {
    testCase.failure = buildFailure(primary);
  }

  if (skippedEl !== undefined) {
    const sk = asArray<XmlElement>(skippedEl)[0];
    if (sk && typeof sk === 'object') {
      testCase.skipReason =
        str(attrs(sk).message) ?? (str((sk as XmlNode)['#text']) || undefined);
    }
  }

  // —— 重试信息 ——
  const retryEls: XmlElement[] = [
    ...asArray<XmlElement>(node.flakyFailure as XmlElement | XmlElement[] | undefined),
    ...asArray<XmlElement>(node.flakyError as XmlElement | XmlElement[] | undefined),
    ...asArray<XmlElement>(node.rerunFailure as XmlElement | XmlElement[] | undefined),
    ...asArray<XmlElement>(node.rerunError as XmlElement | XmlElement[] | undefined),
  ];
  const extraFailures: XmlElement[] = [
    ...failureNodes.slice(0, -1),
    ...errorNodes.slice(0, -1),
  ];
  const allRetries = [...retryEls, ...extraFailures];
  if (allRetries.length > 0) {
    const attempts = allRetries
      .map((r) => buildFailure(r))
      .filter((f): f is FailureInfo => f !== undefined);
    const retry: RetryInfo = { retryCount: attempts.length, attempts };
    testCase.retry = retry;
  }

  // 失败但没有任何失败体（极端非法报告）
  if (status === 'failed' && !testCase.failure) {
    ctx.warnings.push({
      code: 'UNEXPECTED_STRUCTURE',
      message: `用例 "${name}" 标记为失败，但 failure/error 节点缺少内容`,
      testCaseId: id,
    });
    testCase.failure = {
      body: '',
      stack: [],
      stackMissing: true,
      message: '报告声明该用例失败，但未提供错误详情',
    };
  }
  // 失败堆栈缺失提示
  if (testCase.failure?.stackMissing) {
    ctx.warnings.push({
      code: 'MISSING_STACK',
      message: `用例 "${name}" 的失败信息中没有可解析的堆栈`,
      testCaseId: id,
    });
  }

  const stdout = textOf(el, 'system-out');
  const stderr = textOf(el, 'system-err');
  if (stdout) testCase.stdout = stdout.trim();
  if (stderr) testCase.stderr = stderr.trim();

  // 文件推断优先级：file 属性 → 失败堆栈首帧业务代码 → 形如文件路径的 classname
  if (!testCase.file && testCase.failure) {
    const frame =
      testCase.failure.stack.find((f) => !f.isExternal) ?? testCase.failure.stack[0];
    if (frame) {
      testCase.file = frame.file;
      testCase.line = frame.line;
    }
  }
  if (!testCase.file && classname && /\.[\w]{1,8}$/.test(classname)) {
    testCase.file = classname;
  }

  return testCase;
}

function emptyCounts(): Record<TestStatus, number> {
  return { passed: 0, failed: 0, skipped: 0, 'not-run': 0 };
}

function buildSuite(
  el: XmlElement,
  parentPath: string[],
  ctx: BuildContext,
): TestSuiteNode {
  const a = attrs(el);
  const node = el as XmlNode;
  const name = str(a.name) ?? '(unnamed suite)';
  const path = [...parentPath, name];
  const id = `suite-${path.join('>')}`;

  const childSuites = asArray<XmlElement>(
    node.testsuite as XmlElement | XmlElement[] | undefined,
  ).map((c) => buildSuite(c, path, ctx));
  const cases = asArray<XmlElement>(
    node.testcase as XmlElement | XmlElement[] | undefined,
  ).map((c) => buildCase(c, path, ctx));

  const counts = emptyCounts();
  for (const c of cases) counts[c.status] += 1;
  for (const s of childSuites) {
    (Object.keys(s.counts) as TestStatus[]).forEach((k) => {
      counts[k] += s.counts[k];
    });
  }

  const durationMs = parseTime(a.time);

  return { id, name, counts, durationMs, suites: childSuites, cases };
}

function totals(
  allCases: TestCase[],
  rootTimeMs?: number,
  suiteSumMs?: number,
): {
  counts: Record<TestStatus, number>;
  totalDurationMs: number | undefined;
} {
  // 顶层统计来自扁平化用例列表：套件节点的 counts 是“含子套件”的聚合值，
  // 跨层相加会重复计数。
  const counts = emptyCounts();
  for (const c of allCases) counts[c.status] += 1;
  return {
    counts,
    totalDurationMs: rootTimeMs ?? suiteSumMs,
  };
}

export function parseJunitXml(
  xml: string,
  reportName?: string,
): ParseResult {
  const warnings: ParseWarning[] = [];

  if (typeof xml !== 'string' || xml.trim() === '') {
    return {
      run: null,
      error: { code: 'EMPTY_REPORT', message: '报告内容为空' },
      warnings,
    };
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    attributesGroupName: ':@',
    trimValues: false,
    parseTagValue: false,
    processEntities: true,
  });

  let doc: XmlNode;
  try {
    doc = parser.parse(xml) as XmlNode;
  } catch (e) {
    return {
      run: null,
      error: {
        code: 'MALFORMED_REPORT',
        message: `XML 解析失败：${e instanceof Error ? e.message : String(e)}`,
      },
      warnings,
    };
  }

  if (!doc || typeof doc !== 'object') {
    return {
      run: null,
      error: { code: 'MALFORMED_REPORT', message: '报告不是有效的 XML 文档' },
      warnings,
    };
  }

  const root: XmlNode = doc;
  let suiteEls: XmlElement[];
  if (root.testsuites !== undefined) {
    const ts = root.testsuites;
    if (typeof ts === 'string') {
      const run: TestRun = {
        suites: [],
        cases: [],
        counts: emptyCounts(),
        warnings: [
          { code: 'EMPTY_REPORT', message: '报告中没有任何 testsuite' },
        ],
        reportName,
      };
      return { run, warnings: run.warnings };
    }
    if (typeof ts !== 'object') {
      return {
        run: null,
        error: { code: 'MALFORMED_REPORT', message: '<testsuites> 结构非法' },
        warnings,
      };
    }
    suiteEls = asArray<XmlElement>(
      (ts as XmlNode).testsuite as XmlElement | XmlElement[] | undefined,
    );
    if (suiteEls.length === 0) {
      // <testsuites/> 空报告
      const run: TestRun = {
        suites: [],
        cases: [],
        counts: emptyCounts(),
        warnings: [
          { code: 'EMPTY_REPORT', message: '报告中没有任何 testsuite' },
        ],
        reportName,
      };
      return { run, warnings: run.warnings };
    }
  } else if (root.testsuite !== undefined) {
    suiteEls = asArray<XmlElement>(root.testsuite as XmlElement | XmlElement[] | undefined);
  } else {
    return {
      run: null,
      error: {
        code: 'UNSUPPORTED_FORMAT',
        message: '未找到 <testsuites> 或 <testsuite> 根元素，不是 JUnit XML 报告',
      },
      warnings,
    };
  }

  const ctx: BuildContext = { warnings, seq: 0 };
  const suites = suiteEls.map((el) => {
    if (typeof el !== 'object') {
      warnings.push({
        code: 'UNEXPECTED_STRUCTURE',
        message: '存在无法解析的 testsuite 条目（文本节点），已跳过',
      });
      return null;
    }
    return buildSuite(el, [], ctx);
  }).filter((s): s is TestSuiteNode => s !== null);

  const cases: TestCase[] = [];
  const collect = (s: TestSuiteNode): void => {
    cases.push(...s.cases);
    s.suites.forEach(collect);
  };
  suites.forEach(collect);

  const rootTimeMs = parseTime(
    root.testsuites && typeof root.testsuites === 'object'
      ? attrs(root.testsuites as XmlElement).time
      : undefined,
  );
  const suiteSumMs =
    suites
      .map((sv) => sv.durationMs)
      .filter((d): d is number => d !== undefined)
      .reduce((acc, d) => acc + d, 0) || undefined;
  const { counts, totalDurationMs } = totals(cases, rootTimeMs, suiteSumMs);

  if (cases.length === 0 && warnings.length === 0) {
    warnings.push({ code: 'EMPTY_REPORT', message: '报告中没有任何 testcase' });
  }

  return {
    run: { suites, cases, counts, totalDurationMs, warnings, reportName },
    warnings,
  };
}
