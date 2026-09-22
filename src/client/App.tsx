import { useMemo, useState } from 'react';
import type { ParseResult, SourceFile, TestCase, TestRun, TestStatus } from '../shared/types';
import { ALL_STATUSES, STATUS_LABELS } from '../shared/types';
import { collectFiles, filterCases } from '../shared/filter';
import { fetchSource, parseReportPath, parseReportXml } from './api';
import { ReportLoader } from './components/ReportLoader';
import { FilterBar } from './components/FilterBar';
import { SuiteTree } from './components/SuiteTree';
import { CaseDetail } from './components/CaseDetail';
import { WarningsPanel } from './components/WarningsPanel';

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; run: TestRun; parseError?: ParseResult['error'] };

export function App() {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [statusFilter, setStatusFilter] = useState<ReadonlySet<TestStatus>>(
    new Set(),
  );
  const [fileFilter, setFileFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [source, setSource] = useState<SourceFile | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  const handleResult = (result: ParseResult): void => {
    if (result.run) {
      setState({ kind: 'loaded', run: result.run, parseError: result.error });
      setSelectedId(null);
      setSource(null);
      setSourceError(null);
      setStatusFilter(new Set());
      setFileFilter('');
      setKeyword('');
    } else {
      setState({
        kind: 'error',
        message: result.error?.message ?? '解析失败，且没有更多错误信息',
      });
    }
  };

  const loadPath = async (p: string): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      handleResult(await parseReportPath(p));
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const loadFile = async (file: File): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const text = await file.text();
      handleResult(await parseReportXml(text, file.name));
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const files = useMemo(
    () => (state.kind === 'loaded' ? collectFiles(state.run.cases) : []),
    [state],
  );

  const selected: TestCase | null = useMemo(() => {
    if (state.kind !== 'loaded' || !selectedId) return null;
    return state.run.cases.find((c) => c.id === selectedId) ?? null;
  }, [state, selectedId]);

  const filteredCases = useMemo(() => {
    if (state.kind !== 'loaded') return [];
    return filterCases(state.run.cases, {
      statuses: statusFilter,
      file: fileFilter || undefined,
      keyword,
    });
  }, [state, statusFilter, fileFilter, keyword]);

  const selectCase = (id: string): void => {
    setSelectedId(id);
    setSource(null);
    setSourceError(null);
  };

  const locateSource = async (file: string, line?: number): Promise<void> => {
    setSourceLoading(true);
    setSourceError(null);
    setSource(null);
    try {
      setSource(await fetchSource(file, line));
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : String(e));
    } finally {
      setSourceLoading(false);
    }
  };

  const toggleStatus = (s: TestStatus): void => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>测试失败定位工具</h1>
        <p className="subtitle">
          加载一次真实测试运行（JUnit XML），按层级查看用例并从堆栈跳到源码
        </p>
      </header>

      <ReportLoader onLoadPath={loadPath} onLoadFile={loadFile} state={state} />

      {state.kind === 'error' && (
        <div className="panel error-panel" role="alert">
          <strong>报告无法解析：</strong>
          {state.message}
          <div className="error-hint">
            请确认文件是测试工具产出的 JUnit XML（包含 <code>&lt;testsuites&gt;</code> 或{' '}
            <code>&lt;testsuite&gt;</code>），且内容未被截断。
          </div>
        </div>
      )}

      {state.kind === 'loaded' && (
        <>
          <SummaryBar run={state.run} visibleCount={filteredCases.length} />
          {state.run.warnings.length > 0 && (
            <WarningsPanel warnings={state.run.warnings} />
          )}
          <FilterBar
            statuses={ALL_STATUSES}
            labels={STATUS_LABELS}
            active={statusFilter}
            onToggle={toggleStatus}
            files={files}
            fileFilter={fileFilter}
            onFileChange={setFileFilter}
            keyword={keyword}
            onKeywordChange={setKeyword}
          />
          <div className="main-grid">
            <SuiteTree
              run={state.run}
              visibleCaseIds={new Set(filteredCases.map((c) => c.id))}
              selectedId={selectedId}
              onSelect={selectCase}
            />
            <CaseDetail
              testCase={selected}
              source={source}
              sourceError={sourceError}
              sourceLoading={sourceLoading}
              onLocate={locateSource}
            />
          </div>
        </>
      )}
    </div>
  );
}

function SummaryBar({ run, visibleCount }: { run: TestRun; visibleCount: number }) {
  const total = run.cases.length;
  return (
    <div className="panel summary-bar" data-testid="summary-bar">
      {run.reportName && <span className="report-name">报告：{run.reportName}</span>}
      {(ALL_STATUSES as readonly TestStatus[]).map((s) => (
        <span key={s} className={`summary-chip status-${s}`}>
          {STATUS_LABELS[s]} {run.counts[s]}
        </span>
      ))}
      <span className="summary-chip">共 {total} 条</span>
      <span className="summary-chip">筛选后 {visibleCount} 条</span>
      {run.totalDurationMs !== undefined && (
        <span className="summary-chip">总耗时 {(run.totalDurationMs / 1000).toFixed(3)}s</span>
      )}
    </div>
  );
}
