import type { FailureDetail, TestCase } from '../shared/types';

const KIND_LABEL: Record<FailureDetail['kind'], string> = {
  failure: '失败',
  error: '错误',
  flakyFailure: '重试后通过（曾失败）',
  flakyError: '重试后通过（曾出错）',
  rerunFailure: '重试失败',
  rerunError: '重试出错',
};

interface Props {
  testCase: TestCase;
  onLocate: (file: string, line?: number, column?: number) => void;
}

export function CaseDetail({ testCase, onLocate }: Props): JSX.Element {
  return (
    <section className="case-detail" aria-label="用例详情">
      <h2>{testCase.name}</h2>
      <dl className="meta">
        {testCase.classname && (
          <>
            <dt>类 / 套件</dt>
            <dd>{testCase.classname}</dd>
          </>
        )}
        {testCase.file && (
          <>
            <dt>测试文件</dt>
            <dd>
              <button type="button" className="link" onClick={() => onLocate(testCase.file!)}>
                {testCase.file}
              </button>
            </dd>
          </>
        )}
        {testCase.time !== undefined && (
          <>
            <dt>耗时</dt>
            <dd>{testCase.time.toFixed(3)} 秒</dd>
          </>
        )}
        <dt>重试次数</dt>
        <dd>{testCase.retryCount}</dd>
      </dl>

      {testCase.failures.length === 0 && testCase.status !== 'failed' && (
        <p className="empty">该用例没有失败记录</p>
      )}
      {testCase.failures.map((failure, index) => (
        <article key={index} className="failure">
          <h3>
            {KIND_LABEL[failure.kind]}
            {testCase.failures.length > 1 ? `（第 ${index + 1} 次）` : ''}
          </h3>
          {failure.exceptionType && (
            <p className="exception-type">
              异常类型：<code>{failure.exceptionType}</code>
            </p>
          )}
          <p className="failure-message">{failure.message}</p>
          {failure.stack ? (
            <ol className="stack">
              {failure.frames.map((frame, frameIndex) => (
                <li key={frameIndex}>
                  {frame.file ? (
                    <button
                      type="button"
                      className="link frame"
                      title={frame.raw}
                      onClick={() => onLocate(frame.file!, frame.line, frame.column)}
                    >
                      {frame.functionName ? `${frame.functionName} — ` : ''}
                      {frame.file}
                      {frame.line !== undefined ? `:${frame.line}` : ''}
                      {frame.column !== undefined ? `:${frame.column}` : ''}
                    </button>
                  ) : (
                    <span className="frame-raw">{frame.raw}</span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="warning-text">该失败没有堆栈信息</p>
          )}
        </article>
      ))}

      {testCase.stdout && (
        <details>
          <summary>标准输出</summary>
          <pre>{testCase.stdout}</pre>
        </details>
      )}
      {testCase.stderr && (
        <details>
          <summary>标准错误</summary>
          <pre>{testCase.stderr}</pre>
        </details>
      )}
    </section>
  );
}
