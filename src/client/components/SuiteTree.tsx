import { useState } from 'react';
import type {
  TestCase,
  TestRun,
  TestStatus,
  TestSuiteNode,
} from '../../shared/types';
import { STATUS_LABELS } from '../../shared/types';

interface Props {
  run: TestRun;
  visibleCaseIds: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function suiteHasVisible(
  suite: TestSuiteNode,
  ids: ReadonlySet<string>,
): boolean {
  if (suite.cases.some((c) => ids.has(c.id))) return true;
  return suite.suites.some((s) => suiteHasVisible(s, ids));
}

export function SuiteTree({ run, visibleCaseIds, selectedId, onSelect }: Props) {
  if (visibleCaseIds.size === 0) {
    return (
      <div className="panel tree-empty" data-testid="tree-empty">
        没有符合筛选条件的用例。
      </div>
    );
  }
  return (
    <div className="panel tree" data-testid="suite-tree">
      {run.suites.map((s) => (
        <SuiteRow
          key={s.id}
          suite={s}
          depth={0}
          visibleCaseIds={visibleCaseIds}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function SuiteRow({
  suite,
  depth,
  visibleCaseIds,
  selectedId,
  onSelect,
}: {
  suite: TestSuiteNode;
  depth: number;
  visibleCaseIds: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!suiteHasVisible(suite, visibleCaseIds)) return null;
  const visibleCases = suite.cases.filter((c) => visibleCaseIds.has(c.id));

  return (
    <div className="suite-block">
      <div
        className="suite-row"
        style={{ paddingLeft: 8 + depth * 16 }}
        data-testid={`suite-${suite.name}`}
      >
        <button
          type="button"
          className="twisty"
          aria-label={open ? '折叠' : '展开'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '▾' : '▸'}
        </button>
        <span className="suite-name">{suite.name}</span>
        <SuiteCounts suite={suite} />
      </div>
      {open && (
        <>
          {suite.suites.map((child) => (
            <SuiteRow
              key={child.id}
              suite={child}
              depth={depth + 1}
              visibleCaseIds={visibleCaseIds}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
          {visibleCases.map((c) => (
            <CaseRow
              key={c.id}
              testCase={c}
              depth={depth + 1}
              selected={c.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </div>
  );
}

function SuiteCounts({ suite }: { suite: TestSuiteNode }) {
  const entries = (Object.keys(suite.counts) as TestStatus[]).filter(
    (s) => suite.counts[s] > 0,
  );
  return (
    <span className="suite-counts">
      {entries.map((s) => (
        <span key={s} className={`count-chip status-${s}`} title={STATUS_LABELS[s]}>
          {STATUS_LABELS[s]} {suite.counts[s]}
        </span>
      ))}
    </span>
  );
}

function CaseRow({
  testCase,
  depth,
  selected,
  onSelect,
}: {
  testCase: TestCase;
  depth: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`case-row status-${testCase.status} ${selected ? 'is-selected' : ''}`}
      style={{ paddingLeft: 26 + depth * 16 }}
      data-testid={`case-${testCase.id}`}
      data-status={testCase.status}
      onClick={() => onSelect(testCase.id)}
    >
      <span className={`status-dot status-${testCase.status}`} aria-hidden />
      <span className="case-name">{testCase.name}</span>
      {testCase.retry && testCase.retry.retryCount > 0 && (
        <span className="retry-badge" title={`重试 ${testCase.retry.retryCount} 次`}>
          ↻{testCase.retry.retryCount}
        </span>
      )}
      {testCase.durationMs !== undefined && (
        <span className="case-duration">{formatDuration(testCase.durationMs)}</span>
      )}
    </button>
  );
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(3)}s`;
}
