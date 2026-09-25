import { useState } from 'react';
import type { TestCase, TestStatus, TestSuite } from '../shared/types';

const STATUS_ICON: Record<TestStatus, string> = {
  passed: '✓',
  failed: '✗',
  skipped: '↷',
  notrun: '○',
};

const STATUS_LABEL: Record<TestStatus, string> = {
  passed: '通过',
  failed: '失败',
  skipped: '跳过',
  notrun: '未执行',
};

interface Props {
  suite: TestSuite;
  selectedId: string | null;
  onSelect: (testCase: TestCase) => void;
  depth?: number;
}

export function SuiteTree({ suite, selectedId, onSelect, depth = 0 }: Props): JSX.Element {
  const [open, setOpen] = useState(true);
  const total =
    suite.counts.passed + suite.counts.failed + suite.counts.skipped + suite.counts.notrun;
  return (
    <div className="suite" style={{ marginLeft: depth * 14 }}>
      <button
        type="button"
        className="suite-header"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="caret">{open ? '▾' : '▸'}</span>
        <span className="suite-name">{suite.name}</span>
        {suite.file && <span className="suite-file">{suite.file}</span>}
        <span className="suite-counts">
          {(['failed', 'passed', 'skipped', 'notrun'] as TestStatus[])
            .filter((status) => suite.counts[status] > 0)
            .map((status) => (
              <span key={status} className={`badge badge-${status}`}>
                {STATUS_ICON[status]} {suite.counts[status]}
              </span>
            ))}
          <span className="total">共 {total}</span>
        </span>
      </button>
      {open && (
        <div className="suite-body">
          {suite.cases.map((testCase) => (
            <button
              type="button"
              key={testCase.id}
              className={`case-row status-${testCase.status}${
                selectedId === testCase.id ? ' selected' : ''
              }`}
              onClick={() => onSelect(testCase)}
            >
              <span className={`status-icon status-${testCase.status}`} aria-hidden>
                {STATUS_ICON[testCase.status]}
              </span>
              <span className="case-name">{testCase.name}</span>
              <span className="sr-only">{STATUS_LABEL[testCase.status]}</span>
              {testCase.retryCount > 0 && (
                <span className="retry">重试 {testCase.retryCount} 次</span>
              )}
              {testCase.time !== undefined && (
                <span className="case-time">{testCase.time.toFixed(3)}s</span>
              )}
            </button>
          ))}
          {suite.suites.map((child) => (
            <SuiteTree
              key={child.id}
              suite={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
