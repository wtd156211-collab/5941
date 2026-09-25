import { useMemo, useState } from 'react';
import { fetchSource, parseReport } from './api';
import { CaseDetail } from './CaseDetail';
import { SourcePanel } from './SourcePanel';
import { SuiteTree } from './SuiteTree';
import { collectFiles, filterRun } from '../shared/filter';
import { ALL_STATUSES, type SourceView, type TestCase, type TestRun, type TestStatus } from '../shared/types';

const STATUS_LABEL: Record<TestStatus, string> = {
  passed: '通过',
  failed: '失败',
  skipped: '跳过',
  notrun: '未执行',
};

export function App(): JSX.Element {
  const [reportPath, setReportPath] = useState('fixtures/real-run/report.xml');
  const [run, setRun] = useState<TestRun | null>(null);
  const [origin, setOrigin] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [statuses, setStatuses] = useState<TestStatus[]>([]);
  const [fileFilter, setFileFilter] = useState('');
  const [keyword, setKeyword] = useState('');

  const [selectedCase, setSelectedCase] = useState<TestCase | null>(null);
  const [source, setSource] = useState<SourceView | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const filtered = useMemo(
    () => (run ? filterRun(run, { statuses, file: fileFilter || undefined, keyword }) : null),
    [run, statuses, fileFilter, keyword],
  );
  const files = useMemo(() => (run ? collectFiles(run) : []), [run]);

  const load = async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    setSelectedCase(null);
    setSource(null);
    setSourceError(null);
    try {
      const result = await parseReport(reportPath.trim());
      setRun(result.run);
      setOrigin(result.origin);
    } catch (error) {
      setRun(null);
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = (status: TestStatus): void => {
    setStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const locate = async (file: string, line?: number, column?: number): Promise<void> => {
    setSourceError(null);
    setSource(null);
    try {
      setSource(await fetchSource(file, line, column));
    } catch (error) {
      setSourceError((error as Error).message);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>测试失败定位工具</h1>
        <form
          className="load-bar"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <input
            aria-label="报告路径"
            value={reportPath}
            onChange={(event) => setReportPath(event.target.value)}
            placeholder="JUnit 报告路径，例如 fixtures/real-run/report.xml"
          />
          <button type="submit" disabled={loading}>
            {loading ? '加载中…' : '加载报告'}
          </button>
        </form>
        {loadError && (
          <div role="alert" className="error-banner">
            报告加载失败：{loadError}
          </div>
        )}
      </header>

      {run && filtered && (
        <>
          <section className="summary" aria-label="结果汇总">
            <span className="run-name">{run.name}</span>
            <span className="origin">来源：{origin}</span>
            {ALL_STATUSES.map((status) => (
              <span key={status} className={`badge badge-${status}`}>
                {STATUS_LABEL[status]} {filtered.counts[status]}
              </span>
            ))}
          </section>

          {run.warnings.length > 0 && (
            <section className="warnings" aria-label="解析提示">
              <h2>解析提示</h2>
              <ul>
                {run.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="filters" aria-label="筛选">
            <fieldset>
              <legend>状态</legend>
              {ALL_STATUSES.map((status) => (
                <label key={status}>
                  <input
                    type="checkbox"
                    checked={statuses.includes(status)}
                    onChange={() => toggleStatus(status)}
                  />
                  {STATUS_LABEL[status]}
                </label>
              ))}
            </fieldset>
            <label>
              测试文件
              <select
                aria-label="按测试文件筛选"
                value={fileFilter}
                onChange={(event) => setFileFilter(event.target.value)}
              >
                <option value="">全部文件</option>
                {files.map((file) => (
                  <option key={file} value={file}>
                    {file}
                  </option>
                ))}
              </select>
            </label>
            <label>
              关键字
              <input
                aria-label="按关键字筛选"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="用例名 / 异常类型 / 错误消息"
              />
            </label>
          </section>

          <main>
            <div className="tree-pane">
              {filtered.suites.length === 0 ? (
                <p className="empty">没有符合筛选条件的测试用例</p>
              ) : (
                filtered.suites.map((suite) => (
                  <SuiteTree
                    key={suite.id}
                    suite={suite}
                    selectedId={selectedCase?.id ?? null}
                    onSelect={(testCase) => setSelectedCase(testCase)}
                  />
                ))
              )}
            </div>
            <div className="detail-pane">
              {selectedCase ? (
                <CaseDetail testCase={selectedCase} onLocate={locate} />
              ) : (
                <p className="empty">在左侧选择一个测试用例查看详情</p>
              )}
              {sourceError && (
                <div role="alert" className="error-banner">
                  源码定位失败：{sourceError}
                </div>
              )}
              {source && <SourcePanel view={source} />}
            </div>
          </main>
        </>
      )}
    </div>
  );
}
