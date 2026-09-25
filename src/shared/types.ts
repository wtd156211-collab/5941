export type TestStatus = 'passed' | 'failed' | 'skipped' | 'notrun';

export const ALL_STATUSES: TestStatus[] = ['passed', 'failed', 'skipped', 'notrun'];

export interface StackFrame {
  raw: string;
  functionName?: string;
  file?: string;
  line?: number;
  column?: number;
}

export type FailureKind =
  | 'failure'
  | 'error'
  | 'flakyFailure'
  | 'flakyError'
  | 'rerunFailure'
  | 'rerunError';

export interface FailureDetail {
  kind: FailureKind;
  message: string;
  exceptionType?: string;
  stack: string;
  frames: StackFrame[];
}

export interface TestCase {
  id: string;
  name: string;
  classname: string;
  file?: string;
  time?: number;
  status: TestStatus;
  failures: FailureDetail[];
  retryCount: number;
  stdout?: string;
  stderr?: string;
}

export interface StatusCounts {
  passed: number;
  failed: number;
  skipped: number;
  notrun: number;
}

export interface TestSuite {
  id: string;
  name: string;
  file?: string;
  suites: TestSuite[];
  cases: TestCase[];
  counts: StatusCounts;
}

export interface TestRun {
  name: string;
  suites: TestSuite[];
  counts: StatusCounts;
  totalTime?: number;
  warnings: string[];
}

export class ReportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportParseError';
  }
}

export interface SourceLocation {
  file: string;
  line?: number;
  column?: number;
}

export interface SourceView {
  file: string;
  line?: number;
  column?: number;
  startLine: number;
  lines: string[];
  warning?: string;
}

export class SourceLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceLocationError';
  }
}
