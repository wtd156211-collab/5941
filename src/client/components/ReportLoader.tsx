import { useState, type ChangeEvent, type FormEvent } from 'react';

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded' };

interface Props {
  onLoadPath: (path: string) => Promise<void>;
  onLoadFile: (file: File) => Promise<void>;
  state: LoadState;
}

export function ReportLoader({ onLoadPath, onLoadFile, state }: Props) {
  const [path, setPath] = useState('');
  const loading = state.kind === 'loading';

  const submitPath = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = path.trim();
    if (trimmed) void onLoadPath(trimmed);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) void onLoadFile(file);
  };

  return (
    <div className="panel loader">
      <form onSubmit={submitPath} className="loader-form">
        <label htmlFor="report-path">服务器报告路径（工作目录内）</label>
        <div className="loader-row">
          <input
            id="report-path"
            data-testid="report-path-input"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="例如 test-results/junit.xml"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !path.trim()} data-testid="load-path-btn">
            {loading ? '加载中…' : '加载报告'}
          </button>
        </div>
      </form>
      <div className="loader-divider">或</div>
      <div className="loader-upload">
        <label htmlFor="report-file" className="upload-label">
          选择本地 JUnit XML 文件
        </label>
        <input
          id="report-file"
          data-testid="report-file-input"
          type="file"
          accept=".xml,application/xml,text/xml"
          onChange={onFile}
          disabled={loading}
        />
      </div>
    </div>
  );
}
