import type { SourceView } from '../shared/types';

export function SourcePanel({ view }: { view: SourceView }): JSX.Element {
  return (
    <section className="source-panel" aria-label="源码位置">
      <h2>
        {view.file}
        {view.line !== undefined && `:${view.line}`}
        {view.column !== undefined && `:${view.column}`}
      </h2>
      {view.warning && (
        <p role="alert" className="warning-text">
          {view.warning}
        </p>
      )}
      <pre className="source-code">
        {view.lines.map((line, index) => {
          const lineNumber = view.startLine + index;
          const highlighted = lineNumber === view.line;
          return (
            <div key={lineNumber} className={highlighted ? 'code-line highlight' : 'code-line'}>
              <span className="line-number">{lineNumber}</span>
              <span className="line-text">{line || ' '}</span>
            </div>
          );
        })}
      </pre>
    </section>
  );
}
