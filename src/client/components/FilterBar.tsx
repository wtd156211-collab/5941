import type { TestStatus } from '../../shared/types';

interface Props {
  statuses: readonly TestStatus[];
  labels: Record<TestStatus, string>;
  active: ReadonlySet<TestStatus>;
  onToggle: (s: TestStatus) => void;
  files: string[];
  fileFilter: string;
  onFileChange: (v: string) => void;
  keyword: string;
  onKeywordChange: (v: string) => void;
}

export function FilterBar({
  statuses,
  labels,
  active,
  onToggle,
  files,
  fileFilter,
  onFileChange,
  keyword,
  onKeywordChange,
}: Props) {
  return (
    <div className="panel filter-bar" data-testid="filter-bar">
      <div className="filter-group" role="group" aria-label="按状态筛选">
        <span className="filter-title">状态：</span>
        {statuses.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={active.has(s)}
            className={`filter-chip status-${s} ${active.has(s) ? 'is-active' : ''}`}
            data-testid={`status-filter-${s}`}
            onClick={() => onToggle(s)}
          >
            {labels[s]}
          </button>
        ))}
      </div>
      <div className="filter-group">
        <label htmlFor="file-filter" className="filter-title">
          测试文件：
        </label>
        <select
          id="file-filter"
          data-testid="file-filter"
          value={fileFilter}
          onChange={(e) => onFileChange(e.target.value)}
        >
          <option value="">全部文件（{files.length}）</option>
          {files.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-group filter-grow">
        <label htmlFor="keyword-filter" className="filter-title">
          关键字：
        </label>
        <input
          id="keyword-filter"
          data-testid="keyword-filter"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder="用例名 / 异常类型 / 错误消息"
        />
      </div>
    </div>
  );
}
