import { useState } from 'react';
import type { ParseWarning } from '../../shared/types';

const CODE_LABELS: Record<ParseWarning['code'], string> = {
  EMPTY_REPORT: '报告为空',
  UNKNOWN_STATUS: '未知状态',
  MISSING_STACK: '缺少堆栈',
  INVALID_TIME: '耗时异常',
  UNEXPECTED_STRUCTURE: '结构异常',
  MALFORMED_XML: 'XML 格式错误',
};

export function WarningsPanel({ warnings }: { warnings: ParseWarning[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="panel warnings" data-testid="warnings-panel">
      <button
        type="button"
        className="warnings-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▾' : '▸'} 解析提示（{warnings.length}）
      </button>
      {open && (
        <ul className="warnings-list">
          {warnings.map((w, i) => (
            <li key={`${w.code}-${i}`} className={`warning code-${w.code}`}>
              <span className="warning-code">{CODE_LABELS[w.code]}</span>
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
