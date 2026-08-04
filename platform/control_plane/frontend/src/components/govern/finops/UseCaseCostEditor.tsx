/**
 * UseCaseCostEditor — capture expected-cost inputs for real use cases, inside FinOps.
 *
 * Reads the real use-case list (passed in from the governance aggregator) and lets
 * the user attach a model + monthly volume + token sizes to each one. Inputs are
 * persisted client-side via costInputStore; the dashboard roll-up and table read
 * the same store. Kept entirely within the Govern/FinOps module.
 */
import { useState } from 'react';
import type { UseCase } from '../../../api/client';
import {
  MODEL_PRICING, PRICED_MODEL_IDS, PRICED_MODEL_LABELS, DEFAULT_TOKENS_PER_TASK,
  computeExpectedCost, costInputStore, type PricedModelId,
} from './expectedCost';

const fmtUSD = (n: number, dp = 0) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition';

interface RowState {
  enabled: boolean;
  modelId: PricedModelId;
  tasksPerMonth: number;
  tokensIn: number;
  tokensOut: number;
}

function initialRow(useCaseId: string): RowState {
  const cm = costInputStore.get(useCaseId);
  if (cm) {
    return {
      enabled: true,
      modelId: cm.model_id,
      tasksPerMonth: cm.expected_tasks_per_month,
      tokensIn: cm.tokens_in_per_task,
      tokensOut: cm.tokens_out_per_task,
    };
  }
  return {
    enabled: false,
    modelId: 'sonnet-4-5',
    tasksPerMonth: 10000,
    tokensIn: DEFAULT_TOKENS_PER_TASK.input,
    tokensOut: DEFAULT_TOKENS_PER_TASK.output,
  };
}

export default function UseCaseCostEditor({ useCases, onChange }: { useCases: UseCase[]; onChange?: () => void }) {
  // Local working copy keyed by use_case_id; persisted to costInputStore on edit.
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const uc of useCases) init[uc.use_case_id] = initialRow(uc.use_case_id);
    return init;
  });

  const update = (id: string, patch: Partial<RowState>) => {
    const next = { ...rows[id], ...patch };
    setRows(prev => ({ ...prev, [id]: next }));
    // Persist immediately so the dashboard roll-up reflects the change (side
    // effects kept out of the state updater so it stays pure).
    costInputStore.set(id, next.enabled
      ? { model_id: next.modelId, expected_tasks_per_month: next.tasksPerMonth, tokens_in_per_task: next.tokensIn, tokens_out_per_task: next.tokensOut }
      : null);
    onChange?.();
  };

  if (useCases.length === 0) {
    return <p className="text-[11px] text-slate-500">No use cases available to estimate. Create use cases in Plan first.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
            <th scope="col" className="py-2 px-3 text-left font-medium">Use Case</th>
            <th scope="col" className="py-2 px-2 text-center font-medium">Estimate</th>
            <th scope="col" className="py-2 px-2 text-left font-medium">Model</th>
            <th scope="col" className="py-2 px-2 text-right font-medium">Tasks/mo</th>
            <th scope="col" className="py-2 px-2 text-right font-medium">Tok in</th>
            <th scope="col" className="py-2 px-2 text-right font-medium">Tok out</th>
            <th scope="col" className="py-2 px-3 text-right font-medium">Exp. $/mo</th>
          </tr>
        </thead>
        <tbody>
          {useCases.map(uc => {
            const r = rows[uc.use_case_id] ?? initialRow(uc.use_case_id);
            const monthly = r.enabled ? computeExpectedCost({
              model_id: r.modelId, expected_tasks_per_month: r.tasksPerMonth,
              tokens_in_per_task: r.tokensIn, tokens_out_per_task: r.tokensOut,
            }).monthlyCost : null;
            const fieldId = `cost-${uc.use_case_id}`;
            return (
              <tr key={uc.use_case_id} className="border-t border-slate-100">
                <td className="py-2 px-3">
                  <div className="font-medium text-slate-800 truncate max-w-[200px]">{uc.name}</div>
                  <div className="text-[10px] text-slate-400">{uc.business_domain || uc.ai_type}</div>
                </td>
                <td className="py-2 px-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Estimate cost for ${uc.name}`}
                    checked={r.enabled}
                    onChange={e => update(uc.use_case_id, { enabled: e.target.checked })}
                    className="accent-blue-600 w-4 h-4"
                  />
                </td>
                <td className="py-2 px-2">
                  <select
                    aria-label={`Model for ${uc.name}`}
                    id={`${fieldId}-model`}
                    className={inputCls}
                    value={r.modelId}
                    disabled={!r.enabled}
                    onChange={e => update(uc.use_case_id, { modelId: e.target.value as PricedModelId })}
                  >
                    {PRICED_MODEL_IDS.map(id => <option key={id} value={id}>{PRICED_MODEL_LABELS[id]}</option>)}
                  </select>
                </td>
                <td className="py-2 px-2">
                  <input type="number" min={0} step={1000} aria-label={`Tasks per month for ${uc.name}`}
                    className={`${inputCls} text-right w-24`} value={r.tasksPerMonth} disabled={!r.enabled}
                    onChange={e => update(uc.use_case_id, { tasksPerMonth: Math.max(0, parseInt(e.target.value || '0', 10)) })} />
                </td>
                <td className="py-2 px-2">
                  <input type="number" min={0} step={100} aria-label={`Input tokens per task for ${uc.name}`}
                    className={`${inputCls} text-right w-20`} value={r.tokensIn} disabled={!r.enabled}
                    onChange={e => update(uc.use_case_id, { tokensIn: Math.max(0, parseInt(e.target.value || '0', 10)) })} />
                </td>
                <td className="py-2 px-2">
                  <input type="number" min={0} step={50} aria-label={`Output tokens per task for ${uc.name}`}
                    className={`${inputCls} text-right w-20`} value={r.tokensOut} disabled={!r.enabled}
                    onChange={e => update(uc.use_case_id, { tokensOut: Math.max(0, parseInt(e.target.value || '0', 10)) })} />
                </td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {monthly == null
                    ? <span className="text-slate-300">—</span>
                    : <span className="font-semibold text-emerald-700">{fmtUSD(monthly)}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 mt-2">
        Bedrock list pricing per 1K tokens (in/out): {PRICED_MODEL_IDS.map(id => `${PRICED_MODEL_LABELS[id]} $${MODEL_PRICING[id].input}/$${MODEL_PRICING[id].output}`).join(' · ')}.
      </p>
    </div>
  );
}
