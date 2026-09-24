// Custom React Flow node for a catalog entity. One component parametrized by
// entity type (color/icon/label from ENTITY_STYLE). Memoized and with stable
// left/right handles for the left→right layered layout.

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  ENTITY_STYLE, NODE_CARD_ATTRS, NODE_WIDTH, formatAttr, type GraphNodeData,
} from '../graphTypes';
import { humanize } from '../../types';

function EntityNodeBase({ data, selected }: NodeProps) {
  const d = data as GraphNodeData;
  const style = ENTITY_STYLE[d.entityType];
  const attrKeys = (NODE_CARD_ATTRS[d.entityType] ?? []).filter(
    (k) => d.attrs[k] !== null && d.attrs[k] !== undefined && d.attrs[k] !== '',
  );

  return (
    <div
      className={`relative rounded-xl border bg-white overflow-hidden transition-shadow ${
        selected ? 'border-indigo-400 shadow-lg ring-2 ring-indigo-200' : 'border-slate-200 shadow-sm hover:shadow-md'
      }`}
      style={{ width: NODE_WIDTH }}
    >
      {/* Accent bar */}
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: style.hex }} />

      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-2 !border-white" style={{ background: style.hex }} />

      <div className="pl-4 pr-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${style.chipClass}`}>
            <span aria-hidden>{style.icon}</span> {style.label}
          </span>
        </div>
        <div className="text-[13px] font-semibold text-slate-800 leading-tight line-clamp-2" title={d.name}>
          {d.name}
        </div>
        {attrKeys.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {attrKeys.map((k) => (
              <span key={k} className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                <span className="text-slate-400">{humanize(k)}:</span> {formatAttr(d.attrs[k])}
              </span>
            ))}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-2 !border-white" style={{ background: style.hex }} />
    </div>
  );
}

export default memo(EntityNodeBase);
