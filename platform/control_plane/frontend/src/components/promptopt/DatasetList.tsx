import { useEffect, useState } from "react";
import { advpoApi } from "../../api/client";
import type { AdvPODatasetItem } from "../../types";

// Reusable list of existing datasets from the bucket's datasets/ prefix.
// Used both in the Create-job flow (select a dataset) and the Datasets tab
// (manage/delete datasets). Pass onSelect to render a "Use" action per row,
// and onDelete to render a delete (×) action.
interface Props {
  onSelect?: (d: AdvPODatasetItem) => void;
  onDelete?: (d: AdvPODatasetItem) => void;
  refreshKey?: number;
}

const fmtSize = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function DatasetList({ onSelect, onDelete, refreshKey = 0 }: Props) {
  const [datasets, setDatasets] = useState<AdvPODatasetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    advpoApi
      .listDatasets()
      .then((res) => active && setDatasets(res.datasets))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load datasets."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-8 justify-center">
        <div className="w-4 h-4 rounded-full border-2 border-teal-200 border-t-teal-600 animate-spin" />
        Loading datasets…
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
        {error}
      </div>
    );
  }
  if (datasets.length === 0) {
    return (
      <div className="text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-8 text-center">
        No datasets found under the <span className="font-mono">datasets/</span> prefix.
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-96 overflow-y-auto">
      {datasets.map((d) => (
        <div
          key={d.key}
          className="w-full flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 hover:border-teal-300 transition-all"
        >
          <svg
            className="w-4 h-4 text-slate-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-800 truncate font-mono">{d.name}</div>
            <div className="text-[10px] text-slate-400">
              {fmtSize(d.size)}
              {d.last_modified ? ` · ${new Date(d.last_modified).toLocaleString()}` : ""}
            </div>
          </div>
          {onSelect && (
            <button
              onClick={() => onSelect(d)}
              className="text-[11px] font-medium text-teal-600 hover:text-teal-700 flex-shrink-0"
            >
              Use
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(d)}
              className="text-slate-400 hover:text-rose-600 text-sm leading-none flex-shrink-0"
              aria-label={`Delete ${d.name}`}
              title="Delete dataset"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
