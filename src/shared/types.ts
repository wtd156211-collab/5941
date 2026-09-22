/** 领域模型：一次真实测试运行解析后的结果。 */

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'not-run';

export const ALL_STATUSES: readonly TestStatus[] = [
  'passed',
  'failed',
  'skipped',
  'not-run',
] as const;

export const STATUS_LABELS: Record<TestStatus, string> = {
  passed: '通过',
  failed: '失败',
  skipped: '跳过',
  'not-run': '未执行',
};

/** 从堆栈中解析出的一帧源码位置。 */
export interface StackFrame {
  /** 原始堆栈行，便于回显。 */
  raw: string;
  /** 归一化后的文件路径（相对或绝对，取决于报告内容）。 */
  file: string;
  line: number;
  column?: number;
  /** 函数名 / 方法名（若可解析）。 */
  functionName?: string;
  /**
   * 来源语言/框架：js | python | java | go | dotnet。
   * 未知时为 undefined，仍保留 raw。
   */
  kind?: 'js' | 'python' | 'java' | 'go' | 'dotnet';
  /** 是否指向 node_modules / JDK / 标准库等非业务代码。 */
  isExternal?: boolean;
}

export interface FailureInfo {
  /** 失败步骤/断言：JUnit 没有独立步骤字段，取错误首行作为失败步骤摘要。 */
  step?: string;
  message?: string;
  exceptionType?: string;
  /** 失败元素中的完整文本（message + trace 混合时保留原文）。 */
  body: string;
  stack: StackFrame[];
  /** 报告里没有可解析堆栈时置 true，界面据此提示。 */
  stackMissing?: boolean;
}

export interface RetryInfo {
  /** 失败的尝试次数（不含最终成功/失败的那次）。 */
  retryCount: number;
  /** 每次重试的失败记录（flaky 场景）。 */
  attempts: FailureInfo[];
}

export interface TestCase {
  id: string;
  name: string;
  classname?: string;
  /** 所属测试套件的完整路径（从根到直接父级）。 */
  suitePath: string[];
  /** 推断出的测试文件（来自 file 属性、堆栈或 classname）。 */
  file?: string;
  line?: number;
  durationMs?: number;
  status: TestStatus;
  failure?: FailureInfo;
  /** skipped 时报告里给出的原因。 */
  skipReason?: string;
  retry?: RetryInfo;
  stdout?: string;
  stderr?: string;
  /** 解析器无法理解的原始状态值，用于“未知状态”提示。 */
  rawStatus?: string;
}

export interface TestSuiteNode {
  id: string;
  name: string;
  /** 该聚合套件（含子套件）下的用例统计。 */
  counts: Record<TestStatus, number>;
  durationMs?: number;
  suites: TestSuiteNode[];
  cases: TestCase[];
}

export interface ParseWarning {
  code:
    | 'EMPTY_REPORT'
    | 'UNKNOWN_STATUS'
    | 'MISSING_STACK'
    | 'INVALID_TIME'
    | 'UNEXPECTED_STRUCTURE'
    | 'MALFORMED_XML';
  message: string;
  testCaseId?: string;
}

export interface TestRun {
  /** 根套件列表（JUnit 顶层 testsuites 下的 suite）。 */
  suites: TestSuiteNode[];
  cases: TestCase[];
  counts: Record<TestStatus, number>;
  totalDurationMs?: number;
  warnings: ParseWarning[];
  /** 报告文件名字，仅用于展示。 */
  reportName?: string;
}

export interface ParseResult {
  run: TestRun | null;
  error?: {
    code: 'MALFORMED_REPORT' | 'UNSUPPORTED_FORMAT' | 'EMPTY_REPORT';
    message: string;
    position?: number;
  };
  warnings: ParseWarning[];
}

export interface SourceFile {
  path: string;
  content: string;
  lines: string[];
  /** 请求的行号是否超出文件范围。 */
  lineExists: boolean;
  line?: number;
}
