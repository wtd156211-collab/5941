import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parseStackTrace } from './stack';
import {
  ReportParseError,
  type FailureDetail,
  type FailureKind,
  type StatusCounts,
  type TestCase,
  type TestRun,
  type TestStatus,
  type TestSuite,
} from './types';

const FAILURE_KINDS: FailureKind[] = [
  'failure',
  'error',
  'flakyFailure',
  'flakyError',
  'rerunFailure',
  'rerunError',
];

const TERMINAL_KINDS: FailureKind[] = ['failure', 'error'];
const RETRY_KINDS: FailureKind[] = ['flakyFailure', 'flakyError', 'rerunFailure', 'rerunError'];

interface XmlNode {
  [key: string]: unknown;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: () => false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function attr(node: XmlNode, name: string): string | undefined {
  const value = node[`@_${name}`];
  return typeof value === 'string' ? value : undefined;
}

function bodyOf(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'object') {
    const text = (node as XmlNode)['#text'];
    return typeof text === 'string' ? text : '';
  }
  return String(node);
}

function parseTime(raw: string | undefined, context: string, warnings: string[]): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    warnings.push(`${context} 的 time 属性 "${raw}" 非法，已忽略`);
    return undefined;
  }
  return value;
}

function inferExceptionType(text: string): string | undefined {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) return undefined;
  const match = firstLine.trim().match(/^([\w.$]*(?:Error|Exception|Failure|AssertionError|Timeout))\b/);
  return match ? match[1] : undefined;
}

function firstMeaningfulLine(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0);
  return line ? line.trim() : '';
}

function buildFailure(
  kind: FailureKind,
  node: unknown,
  caseLabel: string,
  warnings: string[],
): FailureDetail {
  const obj = (typeof node === 'object' && node !== null ? node : {}) as XmlNode;
  const body = bodyOf(node);
  const messageAttr = attr(obj, 'message');
  const typeAttr = attr(obj, 'type');
  const message = messageAttr && messageAttr.trim() ? messageAttr.trim() : firstMeaningfulLine(body);
  if (!message) {
    warnings.push(`${caseLabel} 的 ${kind} 既没有 message 属性也没有正文`);
  }
  if (!body.trim()) {
    warnings.push(`${caseLabel} 的 ${kind} 缺少堆栈信息`);
  }
  return {
    kind,
    message: message || '(无错误消息)',
    exceptionType: typeAttr || inferExceptionType(body),
    stack: body,
    frames: parseStackTrace(body),
  };
}

const KNOWN_STATUSES = new Set(['passed', 'failed', 'skipped', 'notrun']);

function parseTestCase(
  node: XmlNode,
  suiteFile: string | undefined,
  id: string,
  warnings: string[],
): TestCase {
  const name = attr(node, 'name') ?? '(未命名用例)';
  const classname = attr(node, 'classname') ?? '';
  const label = `用例 "${classname ? classname + ' › ' : ''}${name}"`;
  const time = parseTime(attr(node, 'time'), label, warnings);

  const failures: FailureDetail[] = [];
  for (const kind of FAILURE_KINDS) {
    for (const entry of asArray(node[kind])) {
      failures.push(buildFailure(kind, entry, label, warnings));
    }
  }

  const terminal = failures.filter((f) => TERMINAL_KINDS.includes(f.kind));
  const retries = failures.filter((f) => RETRY_KINDS.includes(f.kind));

  let status: TestStatus;
  const statusAttr = attr(node, 'status');
  if (statusAttr && !KNOWN_STATUSES.has(statusAttr)) {
    warnings.push(`${label} 带有未知 status "${statusAttr}"，按"未执行"处理`);
  }

  if (terminal.length > 0) {
    status = 'failed';
  } else if (node.skipped !== undefined || statusAttr === 'skipped') {
    status = 'skipped';
  } else if (statusAttr === 'notrun' || (statusAttr !== undefined && !KNOWN_STATUSES.has(statusAttr))) {
    status = 'notrun';
  } else {
    status = 'passed';
  }

  // vitest 重试：同一个 testcase 下出现多个 <failure>，每个对应一次尝试
  const extraAttempts = Math.max(0, terminal.length - 1);
  const retryCount = retries.length + extraAttempts;

  return {
    id,
    name,
    classname,
    file: attr(node, 'file') ?? suiteFile,
    time,
    status,
    failures,
    retryCount,
    stdout: bodyOf(node['system-out']) || undefined,
    stderr: bodyOf(node['system-err']) || undefined,
  };
}

function emptyCounts(): StatusCounts {
  return { passed: 0, failed: 0, skipped: 0, notrun: 0 };
}

function addCounts(target: StatusCounts, source: StatusCounts): void {
  target.passed += source.passed;
  target.failed += source.failed;
  target.skipped += source.skipped;
  target.notrun += source.notrun;
}

function parseSuite(node: XmlNode, id: string, warnings: string[]): TestSuite {
  const name = attr(node, 'name') ?? '(未命名套件)';
  const file = attr(node, 'file');
  const suite: TestSuite = {
    id,
    name,
    file,
    suites: asArray(node.testsuite as XmlNode | XmlNode[]).map((child, index) =>
      parseSuite(child, `${id}.${index}`, warnings),
    ),
    cases: asArray(node.testcase as XmlNode | XmlNode[]).map((child, index) =>
      parseTestCase(child, file, `${id}.${index}`, warnings),
    ),
    counts: emptyCounts(),
  };
  for (const testCase of suite.cases) {
    suite.counts[testCase.status] += 1;
  }
  for (const child of suite.suites) {
    addCounts(suite.counts, child.counts);
  }
  return suite;
}

export function parseJUnitReport(xml: string): TestRun {
  if (!xml || !xml.trim()) {
    throw new ReportParseError('报告内容为空，无法解析');
  }
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new ReportParseError(
      `报告不是合法的 XML：${validation.err.msg}（第 ${validation.err.line} 行）`,
    );
  }

  let doc: XmlNode;
  try {
    doc = parser.parse(xml) as XmlNode;
  } catch (error) {
    throw new ReportParseError(`XML 解析失败：${(error as Error).message}`);
  }

  const warnings: string[] = [];
  const root = doc.testsuites as XmlNode | undefined;
  const singleSuite = doc.testsuite as XmlNode | undefined;

  let suites: TestSuite[];
  let runName = '测试运行';
  if (root) {
    runName = attr(root, 'name') ?? runName;
    suites = asArray(root.testsuite as XmlNode | XmlNode[]).map((child, index) =>
      parseSuite(child, String(index), warnings),
    );
  } else if (singleSuite) {
    runName = attr(singleSuite, 'name') ?? runName;
    suites = [parseSuite(singleSuite, '0', warnings)];
  } else {
    throw new ReportParseError('文档不是 JUnit 报告：缺少 <testsuites> 或 <testsuite> 根元素');
  }

  const counts = emptyCounts();
  for (const suite of suites) addCounts(counts, suite.counts);
  const total = counts.passed + counts.failed + counts.skipped + counts.notrun;
  if (total === 0) {
    warnings.push('报告中不包含任何测试用例');
  }

  return { name: runName, suites, counts, warnings };
}
