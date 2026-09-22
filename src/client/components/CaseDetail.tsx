import type {
  FailureInfo,
  SourceFile,
  StackFrame,
  TestCase,
} from '../../shared/types';
import { STATUS_LABELS } from '../../shared/types';
import { formatDuration } from './SuiteTree';

interface Props {
  testCase: TestCase | null;
  source: SourceFile | null;
  sourceError: string | null;
  sourceLoading: boolean;
  onLocate: (file: string, line?: number) => void;
}

export function CaseDetail({
  testCase,
  source,
  sourceError,
  sourceLoading,
  onLocate,
}: Props) {
  if (!testCase) {
    return (
      <div className="panel detail detail-empty" data-testid="detail-empty">
        从左侧选择一条用例查看详情。
      </div>
    );
  }

  return (
    <div className="panel detail" data-testid="case-detail">
      <div className="detail-header">
        <span className={`status-dot status-${testCase.status}`} />
        <h2>{testCase.name}</h2>
        <span className={`detail-status status-${testCase.status}`}>
          {STATUS_LABELS[testCase.status]}
        </span>
      </div>
      <dl className="detail-meta">
        {testCase.classname && (
          <>
            <dt>测试套件</dt>
            <dd>{testCase.suitePath.join(' › ') || testCase.classname}</dd>
          </>
        )}
        {testCase.file && (
          <>
            <dt>测试文件</dt>
            <dd>
              <button
                type="button"
                className="link-btn"
                data-testid="locate-test-file"
                onClick={() => onLocate(testCase.file!, testCase.line)}
              >
                {testCase.file}
                {testCase.line ? `:${testCase.line}` : ''}
              </button>
            </dd>
          </>
        )}
        {testCase.durationMs !== undefined && (
          <>
            <dt>耗时</dt>
            <dd>{formatDuration(testCase.durationMs)}</dd>
          </>
        )}
        {testCase.status === 'skipped' && testCase.skipReason && (
          <>
            <dt>跳过原因</dt>
            <dd>{testCase.skipReason}</dd>
          </>
        )}
        {testCase.rawStatus && testCase.rawStatus !== testCase.status && (
          <>
            <dt>原始状态值</dt>
            <dd className="unknown-status-hint">{testCase.rawStatus}（已按“{STATUS_LABELS[testCase.status]}”展示）</dd>
          </>
        )}
      </dl>

      {testCase.failure && (
        <FailureSection failure={testCase.failure} onLocate={onLocate} />
      )}

      {testCase.retry && testCase.retry.retryCount > 0 && (
        <RetrySection retry={testCase.retry} onLocate={onLocate} />
      )}

      {(testCase.stdout || testCase.stderr) && (
        <OutputSection testCase={testCase} />
      )}

      {sourceLoading && <p className="source-hint">正在加载源码…</p>}
      {sourceError && (
        <p className="source-hint source-error" role="alert">
          {sourceError}
        </p>
      )}
      {source && !sourceLoading && <SourceViewer source={source} />}
    </div>
  );
}

function FailureSection({
  failure,
  onLocate,
}: {
  failure: FailureInfo;
  onLocate: (file: string, line?: number) => void;
}) {
  return (
    <section className="failure-section" data-testid="failure-section">
      <h3>失败详情</h3>
      {failure.step && (
        <div className="failure-step">
          <span className="label">失败步骤：</span>
          {failure.step}
        </div>
      )}
      {failure.exceptionType && (
        <div className="failure-type">
          <span className="label">异常类型：</span>
          <code data-testid="exception-type">{failure.exceptionType}</code>
        </div>
      )}
      {failure.message && (
        <pre className="failure-message" data-testid="failure-message">
          {failure.message}
        </pre>
      )}
      <h4>堆栈</h4>
      {failure.stack.length === 0 ? (
        <p className="source-hint" data-testid="stack-missing-hint">
          该失败信息中没有包含可解析的文件/行号堆栈，无法直接定位源码。
        </p>
      ) : (
        <ol className="stack-list" data-testid="stack-list">
          {failure.stack.map((frame, i) => (
            <StackFrameRow key={`${frame.raw}-${i}`} frame={frame} onLocate={onLocate} />
          ))}
        </ol>
      )}
    </section>
  );
}

function StackFrameRow({
  frame,
  onLocate,
}: {
  frame: StackFrame;
  onLocate: (file: string, line?: number) => void;
}) {
  return (
    <li className={`stack-frame ${frame.isExternal ? 'is-external' : ''}`}>
      <button
        type="button"
        className="frame-location link-btn"
        data-testid="frame-locate"
        title="在源码中定位"
        onClick={() => onLocate(frame.file, frame.line)}
      >
        {frame.file}:{frame.line}
        {frame.column ? `:${frame.column}` : ''}
      </button>
      {frame.functionName && <span className="frame-fn">{frame.functionName}</span>}
      {frame.isExternal && <span className="frame-tag">外部依赖</span>}
    </li>
  );
}

function RetrySection({
  retry,
  onLocate,
}: {
  retry: NonNullable<TestCase['retry']>;
  onLocate: (file: string, line?: number) => void;
}) {
  return (
    <section className="retry-section" data-testid="retry-section">
      <h3>
        重试记录（重试 {retry.retryCount} 次，展示最终结果与历次失败）
      </h3>
      {retry.attempts.map((a, i) => (
        <details key={i} className="retry-attempt" open={i === 0}>
          <summary>
            第 {i + 1} 次失败
            {a.exceptionType ? `：${a.exceptionType}` : ''}
          </summary>
          {a.message && <pre className="failure-message">{a.message}</pre>}
          {a.stack.length === 0 ? (
            <p className="source-hint">该次重试没有可解析堆栈。</p>
          ) : (
            <ol className="stack-list">
              {a.stack.map((frame, j) => (
                <StackFrameRow key={`${frame.raw}-${j}`} frame={frame} onLocate={onLocate} />
              ))}
            </ol>
          )}
        </details>
      ))}
    </section>
  );
}

function OutputSection({ testCase }: { testCase: TestCase }) {
  return (
    <section className="output-section">
      {testCase.stdout && (
        <>
          <h4>标准输出</h4>
          <pre className="test-output">{testCase.stdout}</pre>
        </>
      )}
      {testCase.stderr && (
        <>
          <h4>标准错误</h4>
          <pre className="test-output">{testCase.stderr}</pre>
        </>
      )}
    </section>
  );
}

function SourceViewer({ source }: { source: SourceFile }) {
  return (
    <div className="source-viewer" data-testid="source-viewer">
      <div className="source-title">
        {source.path}
        {source.line ? `:${source.line}` : ''}
      </div>
      {!source.lineExists && (
        <div className="source-hint source-error" data-testid="source-line-invalid">
          报告指向第 {source.line} 行，但该文件只有 {source.lines.length} 行，
          源码位置可能来自不同版本的代码。
        </div>
      )}
      <pre className="source-code">
        {source.lines.map((text, i) => (
          <div
            key={i}
            className={`source-line ${source.line === i + 1 ? 'is-highlight' : ''}`}
          >
            <span className="line-number">{i + 1}</span>
            <span className="line-text">{text === '' ? ' ' : text}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
