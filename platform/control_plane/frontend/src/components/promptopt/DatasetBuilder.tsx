import { useMemo, useRef, useState } from "react";
import { advpoApi } from "../../api/client";
import DatasetList from "./DatasetList";
import type { AdvPODatasetItem } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// Dataset builder for Bedrock Advanced Prompt Optimization.
//
// Two ways in, one editable form:
//   • Drag & drop a .jsonl file → it's parsed and the form is PRE-POPULATED so
//     you can make last-minute edits before confirming.
//   • Build manually from scratch → starts with one template + placeholder hints.
//
// On confirm, the builder serializes to JSONL, simulates the S3 upload, and
// reports back a summary (s3Uri, counts, first prompt template, jsonl).
// ─────────────────────────────────────────────────────────────────────────────

const DATASET_VERSION = "bedrock-2026-05-14";
const LIMITS = { templatesPerJob: 10, samplesPerTemplate: 100, steeringPerTemplate: 5 };

// Custom LLM-as-a-Judge models are fixed by AdvPO — NOT region/CRIS dependent.
// Only these three bare model IDs are accepted for customLLMJModelId.
// See advanced-prompt-optimization-evaluation.html.
const JUDGE_MODELS = [
  { id: "anthropic.claude-sonnet-4-6", label: "Claude Sonnet 4.6 (default)" },
  { id: "anthropic.claude-opus-4-6-v1", label: "Claude Opus 4.6" },
  { id: "anthropic.claude-sonnet-4-5-20250929-v1:0", label: "Claude Sonnet 4.5" },
];
const JUDGE_MODEL_IDS = new Set(JUDGE_MODELS.map((m) => m.id));

export type EvalMethod = "default" | "steering" | "llmj" | "lambda";
const EVAL_METHODS: { id: EvalMethod; label: string; blurb: string }[] = [
  {
    id: "default",
    label: "System default",
    blurb: "Built-in judge scoring Accuracy, Completeness, Expression.",
  },
  {
    id: "steering",
    label: "Steering criteria",
    blurb: "Short natural-language descriptors that guide direction.",
  },
  {
    id: "llmj",
    label: "LLM-as-a-Judge",
    blurb: "Your own rubric + grading scale, merged with the system judge.",
  },
  {
    id: "lambda",
    label: "Lambda evaluator",
    blurb: "A Lambda function returns a numeric score per response.",
  },
];

interface EvalConfig {
  method: EvalMethod;
  steeringCriteria: string[];
  metricLabel: string;
  judgePrompt: string;
  judgeModel: string;
  lambdaArn: string;
}
interface Sample {
  id: string;
  vars: Record<string, string>;
  referenceResponse: string;
}
interface Template {
  id: string;
  templateId: string;
  promptTemplate: string;
  evalCfg: EvalConfig;
  samples: Sample[];
}

export interface DatasetResult {
  s3Uri: string;
  templates: number;
  samples: number;
  firstPromptTemplate: string;
  jsonl: string;
  existing?: boolean;
  name?: string;
}

const uid = () => Math.random().toString(36).slice(2, 9);
const emptyEval = (): EvalConfig => ({
  method: "default",
  steeringCriteria: [],
  metricLabel: "",
  judgePrompt: "",
  judgeModel: "",
  lambdaArn: "",
});

// Detect {{variable}} placeholders (deduped, in order).
const detectVars = (tpl: string): string[] => {
  const out: string[] = [];
  const re = /\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
};

const blankTemplate = (): Template => ({
  id: uid(),
  templateId: "",
  promptTemplate: "",
  evalCfg: emptyEval(),
  samples: [{ id: uid(), vars: {}, referenceResponse: "" }],
});

const EXAMPLE_TEMPLATE: Template = {
  id: uid(),
  templateId: "kyc-officer-system",
  promptTemplate:
    "You are a KYC compliance officer. Review the customer profile for {{customer_id}} in {{jurisdiction}} and flag any sanctions or PEP concerns. Cite the regulation behind each flag.",
  evalCfg: {
    method: "llmj",
    steeringCriteria: [],
    metricLabel: "Regulatory Citation Accuracy",
    judgePrompt:
      "Grade the {{response}} to {{prompt}} against {{referenceResponse}} on a 1-5 scale.\n5 = every flag cites a real, exact regulation and no claim exceeds the profile.\n3 = correct decision but a citation is vague or missing.\n1 = hallucinated regulation or speculation beyond the profile.",
    judgeModel: "",
    lambdaArn: "",
  },
  samples: [
    {
      id: uid(),
      vars: { customer_id: "C-10293", jurisdiction: "UK" },
      referenceResponse: "ESCALATE — matches HM Treasury list; cite UK MLR 2017 reg. 33.",
    },
    {
      id: uid(),
      vars: { customer_id: "C-55821", jurisdiction: "SG" },
      referenceResponse: "CLEAR — no sanctions/PEP match.",
    },
  ],
};

// ── JSONL (de)serialization ─────────────────────────────────────────────────
function templateToObject(t: Template) {
  const obj: Record<string, unknown> = {
    version: DATASET_VERSION,
    templateId: t.templateId || "template",
    promptTemplate: t.promptTemplate,
  };
  const c = t.evalCfg;
  if (c.method === "steering") obj.steeringCriteria = c.steeringCriteria;
  if (c.method === "llmj") {
    obj.customEvaluationMetricLabel = c.metricLabel;
    obj.customLLMJConfig = { customLLMJPrompt: c.judgePrompt, customLLMJModelId: c.judgeModel };
  }
  if (c.method === "lambda") {
    obj.customEvaluationMetricLabel = c.metricLabel;
    obj.evaluationMetricLambdaArn = c.lambdaArn;
  }
  obj.evaluationSamples = t.samples.map((s) => {
    // Only emit variables that are still placeholders in the prompt template,
    // in template order — drops stale keys left over from edited templates.
    const vars = detectVars(t.promptTemplate);
    const sample: Record<string, unknown> = {
      inputVariables: vars.filter((v) => s.vars[v] !== undefined).map((v) => ({ [v]: s.vars[v] })),
    };
    if (s.referenceResponse.trim()) sample.referenceResponse = s.referenceResponse;
    return sample;
  });
  return obj;
}

function parseJsonlToTemplates(text: string): Template[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const templates: Template[] = [];
  for (const line of lines) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const cfg = emptyEval();
    if (Array.isArray(o.steeringCriteria)) {
      cfg.method = "steering";
      cfg.steeringCriteria = o.steeringCriteria as string[];
    } else if (o.customLLMJConfig) {
      cfg.method = "llmj";
      const llmj = o.customLLMJConfig as { customLLMJPrompt?: string; customLLMJModelId?: string };
      cfg.judgePrompt = llmj.customLLMJPrompt ?? "";
      cfg.judgeModel = llmj.customLLMJModelId ?? "";
      cfg.metricLabel = (o.customEvaluationMetricLabel as string) ?? "";
    } else if (o.evaluationMetricLambdaArn) {
      cfg.method = "lambda";
      cfg.lambdaArn = o.evaluationMetricLambdaArn as string;
      cfg.metricLabel = (o.customEvaluationMetricLabel as string) ?? "";
    } else cfg.method = "default";

    const rawSamples = Array.isArray(o.evaluationSamples) ? o.evaluationSamples : [];
    const samples: Sample[] = rawSamples.map((rs) => {
      const r = rs as {
        inputVariables?: Array<Record<string, string>>;
        referenceResponse?: string;
      };
      const vars: Record<string, string> = {};
      (r.inputVariables ?? []).forEach((pair) =>
        Object.entries(pair).forEach(([k, v]) => {
          vars[k] = String(v);
        }),
      );
      return { id: uid(), vars, referenceResponse: r.referenceResponse ?? "" };
    });

    templates.push({
      id: uid(),
      templateId: (o.templateId as string) ?? "template",
      promptTemplate: (o.promptTemplate as string) ?? "",
      evalCfg: cfg,
      samples: samples.length ? samples : [{ id: uid(), vars: {}, referenceResponse: "" }],
    });
  }
  return templates;
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  onConfirm: (result: DatasetResult) => void;
  // Show the "Select existing dataset" shortcut (hidden where a dataset list
  // is already shown alongside, e.g. the Datasets tab). Defaults to true.
  allowSelectExisting?: boolean;
}

export default function DatasetBuilder({ onConfirm, allowSelectExisting = true }: Props) {
  const [mode, setMode] = useState<"choose" | "edit" | "existing">("choose");
  const [sourceName, setSourceName] = useState("dataset.jsonl");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState("");
  const [showJsonl, setShowJsonl] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Existing datasets are loaded by the reusable DatasetList component.
  const openExisting = () => setMode("existing");
  const selectExisting = (d: AdvPODatasetItem) => {
    onConfirm({
      s3Uri: d.s3_uri,
      templates: 0,
      samples: 0,
      firstPromptTemplate: "",
      jsonl: "",
      existing: true,
      name: d.name,
    });
  };

  const active = templates.find((t) => t.id === activeId) ?? templates[0];

  const startManual = () => {
    const t = blankTemplate();
    setTemplates([t]);
    setActiveId(t.id);
    setSourceName("manual-dataset.jsonl");
    setMode("edit");
  };
  const startExample = () => {
    const t: Template = {
      ...EXAMPLE_TEMPLATE,
      id: uid(),
      samples: EXAMPLE_TEMPLATE.samples.map((s) => ({ ...s, id: uid() })),
    };
    setTemplates([t]);
    setActiveId(t.id);
    setSourceName("kyc-officer.jsonl");
    setMode("edit");
  };

  const handleFile = (files: FileList | null) => {
    setParseError("");
    const file = files?.[0];
    if (!file) return;
    if (!/\.jsonl$/i.test(file.name)) {
      setParseError("Dataset must be a .jsonl file (one JSON object per line).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseJsonlToTemplates(String(reader.result));
      if (parsed.length === 0) {
        setParseError("No valid JSONL lines found in that file.");
        return;
      }
      setTemplates(parsed);
      setActiveId(parsed[0].id);
      setSourceName(file.name);
      setMode("edit");
    };
    reader.readAsText(file);
  };

  // ── template/sample mutations ──
  const updateTemplate = (id: string, patch: Partial<Template>) =>
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const updateEval = (id: string, patch: Partial<EvalConfig>) =>
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, evalCfg: { ...t.evalCfg, ...patch } } : t)),
    );
  const addTemplate = () => {
    if (templates.length >= LIMITS.templatesPerJob) return;
    const t = blankTemplate();
    setTemplates((prev) => [...prev, t]);
    setActiveId(t.id);
  };
  const removeTemplate = (id: string) =>
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeId === id && next.length) setActiveId(next[0].id);
      return next;
    });
  const addSample = (tid: string) =>
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === tid && t.samples.length < LIMITS.samplesPerTemplate
          ? { ...t, samples: [...t.samples, { id: uid(), vars: {}, referenceResponse: "" }] }
          : t,
      ),
    );
  const removeSample = (tid: string, sid: string) =>
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === tid ? { ...t, samples: t.samples.filter((s) => s.id !== sid) } : t,
      ),
    );
  const setSampleVar = (tid: string, sid: string, key: string, val: string) =>
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === tid
          ? {
              ...t,
              samples: t.samples.map((s) =>
                s.id === sid ? { ...s, vars: { ...s.vars, [key]: val } } : s,
              ),
            }
          : t,
      ),
    );
  const setSampleRef = (tid: string, sid: string, val: string) =>
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === tid
          ? {
              ...t,
              samples: t.samples.map((s) => (s.id === sid ? { ...s, referenceResponse: val } : s)),
            }
          : t,
      ),
    );

  // ── serialization + validation ──
  const jsonl = useMemo(
    () => templates.map((t) => JSON.stringify(templateToObject(t))).join("\n"),
    [templates],
  );
  const totalSamples = templates.reduce((n, t) => n + t.samples.length, 0);

  const issues: string[] = [];
  templates.forEach((t, i) => {
    const label = t.templateId || `template ${i + 1}`;
    if (!t.templateId.trim()) issues.push(`Template ${i + 1}: templateId is required.`);
    if (!t.promptTemplate.includes("{{")) issues.push(`${label}: add at least one {{variable}}.`);
    if (t.samples.length === 0) issues.push(`${label}: needs at least one sample.`);
    const vars = detectVars(t.promptTemplate);
    t.samples.forEach((s, si) =>
      vars.forEach((v) => {
        if (!s.vars[v]?.trim()) issues.push(`${label} · sample ${si + 1}: missing "${v}".`);
      }),
    );
    if (
      (t.evalCfg.method === "llmj" || t.evalCfg.method === "lambda") &&
      !t.evalCfg.metricLabel.trim()
    )
      issues.push(`${label}: metric label required.`);
    if (t.evalCfg.method === "llmj" && !t.evalCfg.judgePrompt.trim())
      issues.push(`${label}: judge prompt required.`);
    if (t.evalCfg.method === "llmj" && !t.evalCfg.judgeModel.trim())
      issues.push(`${label}: select an LLM-as-a-Judge model.`);
    if (
      t.evalCfg.method === "llmj" &&
      t.evalCfg.judgeModel.trim() &&
      !JUDGE_MODEL_IDS.has(t.evalCfg.judgeModel)
    )
      issues.push(`${label}: judge model must be a supported AdvPO judge model.`);
    if (t.evalCfg.method === "lambda" && !/^arn:aws:lambda:/.test(t.evalCfg.lambdaArn))
      issues.push(`${label}: valid Lambda ARN required.`);
    if (t.evalCfg.method === "steering" && t.evalCfg.steeringCriteria.length === 0)
      issues.push(`${label}: add a steering criterion.`);
  });
  const canConfirm = templates.length > 0 && issues.length === 0 && !uploading;

  const confirm = async () => {
    if (!canConfirm) return;
    setUploading(true);
    setUploadError("");
    setProgress(40);
    try {
      const result = await advpoApi.uploadDataset({ name: sourceName, content: jsonl });
      setProgress(100);
      onConfirm({
        s3Uri: result.s3_uri,
        templates: templates.length,
        samples: totalSamples,
        firstPromptTemplate: templates[0]?.promptTemplate ?? "",
        jsonl,
      });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Dataset upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // ── EXISTING DATASET MODE ──
  if (mode === "existing") {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Select an existing dataset</h3>
          <button
            onClick={() => setMode("choose")}
            className="text-[11px] text-slate-400 hover:text-slate-700"
          >
            ← Back
          </button>
        </div>
        <DatasetList onSelect={selectExisting} />
      </div>
    );
  }

  // ── CHOOSE MODE ──
  if (mode === "choose") {
    return (
      <div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${dragOver ? "border-teal-400 bg-teal-50/60" : "border-slate-300 bg-slate-50/40 hover:border-teal-300 hover:bg-slate-50"}`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".jsonl"
            className="hidden"
            onChange={(e) => handleFile(e.target.files)}
          />
          <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-teal-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>
          <div className="text-sm font-medium text-slate-700">
            Drop your <span className="font-mono">.jsonl</span> dataset here
          </div>
          <div className="text-xs text-slate-400 mt-1">
            It&rsquo;s parsed and pre-filled so you can review and tweak before uploading
          </div>
        </div>
        {parseError && <div className="text-[11px] text-rose-600 mt-2">{parseError}</div>}

        {allowSelectExisting && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                or
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <button
              onClick={openExisting}
              className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-teal-300 hover:shadow-sm transition-all mb-3 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-slate-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800">Select existing dataset</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Reuse a <span className="font-mono">.jsonl</span> already uploaded to the bucket.
                </div>
              </div>
              <svg
                className="w-4 h-4 text-slate-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </>
        )}

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
            or build manually
          </span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={startManual}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-teal-300 hover:shadow-sm transition-all"
          >
            <div className="text-sm font-semibold text-slate-800">Start blank</div>
            <div className="text-xs text-slate-500 mt-0.5">
              One empty template with placeholder hints.
            </div>
          </button>
          <button
            onClick={startExample}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-teal-300 hover:shadow-sm transition-all"
          >
            <div className="text-sm font-semibold text-slate-800">Start from example</div>
            <div className="text-xs text-slate-500 mt-0.5">A filled KYC template you can edit.</div>
          </button>
        </div>
      </div>
    );
  }

  // ── EDIT MODE ──
  const vars = active ? detectVars(active.promptTemplate) : [];

  return (
    <div>
      {/* Source + template tabs */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6"
            />
          </svg>
          <input
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            className="bg-transparent border-b border-dashed border-slate-300 font-mono text-slate-700 outline-none focus:border-teal-400 w-44"
          />
        </div>
        <button
          onClick={() => {
            setMode("choose");
            setTemplates([]);
          }}
          className="text-[11px] text-slate-400 hover:text-rose-600"
        >
          Start over
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {templates.map((t, i) => (
          <button
            key={t.id}
            onClick={() => setActiveId(t.id)}
            className={`group flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all ${t.id === active?.id ? "bg-teal-50 text-teal-700 border-teal-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
          >
            {t.templateId || `template ${i + 1}`}
            {templates.length > 1 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  removeTemplate(t.id);
                }}
                className="text-slate-300 group-hover:text-rose-500"
              >
                ×
              </span>
            )}
          </button>
        ))}
        {templates.length < LIMITS.templatesPerJob && (
          <button
            onClick={addTemplate}
            className="text-xs px-2.5 py-1 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-teal-300 hover:text-teal-600"
          >
            + template
          </button>
        )}
      </div>

      {active && (
        <div className="space-y-4">
          {/* template id + prompt */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">templateId</label>
            <input
              value={active.templateId}
              onChange={(e) => updateTemplate(active.id, { templateId: e.target.value })}
              placeholder="e.g. kyc-officer-system"
              className="w-full p-2.5 mb-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-teal-400 transition-colors font-mono"
            />
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-600">promptTemplate</label>
              <span className="text-[10px] text-slate-400">
                {vars.length} variable{vars.length !== 1 ? "s" : ""} detected
              </span>
            </div>
            <textarea
              value={active.promptTemplate}
              onChange={(e) => updateTemplate(active.id, { promptTemplate: e.target.value })}
              rows={4}
              placeholder="You are a … Review {{variable_one}} and {{variable_two}} and produce …"
              className="w-full p-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-teal-400 transition-colors font-mono"
            />
            {vars.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {vars.map((v) => (
                  <span
                    key={v}
                    className="text-[10px] px-2 py-0.5 bg-teal-50 text-teal-700 rounded-md border border-teal-100 font-mono"
                  >{`{{${v}}}`}</span>
                ))}
              </div>
            )}
          </div>

          {/* samples */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-600">
                Evaluation samples
              </label>
              <span className="text-[10px] text-slate-400">
                {active.samples.length}/{LIMITS.samplesPerTemplate}
              </span>
            </div>
            <div className="space-y-2">
              {active.samples.map((s, si) => (
                <div key={s.id} className="rounded-lg border border-slate-200 p-3 bg-slate-50/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Sample {si + 1}
                    </span>
                    {active.samples.length > 1 && (
                      <button
                        onClick={() => removeSample(active.id, s.id)}
                        className="text-[11px] text-slate-400 hover:text-rose-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {vars.length === 0 ? (
                    <p className="text-[11px] text-slate-400">
                      Add {`{{variables}}`} to the prompt above to define sample inputs.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                      {vars.map((v) => (
                        <div key={v}>
                          <label className="block text-[10px] font-mono text-slate-500 mb-0.5">{`{{${v}}}`}</label>
                          <input
                            value={s.vars[v] ?? ""}
                            onChange={(e) => setSampleVar(active.id, s.id, v, e.target.value)}
                            placeholder={`value for ${v}`}
                            className="w-full p-2 bg-white border border-slate-200 rounded-md text-xs text-slate-800 outline-none focus:border-teal-400 transition-colors"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="block text-[10px] text-slate-500 mb-0.5">
                    referenceResponse{" "}
                    <span className="text-slate-400">(optional, recommended)</span>
                  </label>
                  <textarea
                    value={s.referenceResponse}
                    onChange={(e) => setSampleRef(active.id, s.id, e.target.value)}
                    rows={2}
                    placeholder="Ground-truth answer for this input…"
                    className="w-full p-2 bg-white border border-slate-200 rounded-md text-xs text-slate-800 outline-none focus:border-teal-400 transition-colors"
                  />
                </div>
              ))}
            </div>
            {active.samples.length < LIMITS.samplesPerTemplate && (
              <button
                onClick={() => addSample(active.id)}
                className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-teal-300 hover:text-teal-600"
              >
                + Add sample
              </button>
            )}
          </div>

          {/* eval method */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Evaluation method
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              {EVAL_METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => updateEval(active.id, { method: m.id })}
                  className={`text-left rounded-lg border px-2.5 py-1.5 transition-all ${active.evalCfg.method === m.id ? "bg-teal-50 border-teal-300 ring-1 ring-teal-200" : "bg-white border-slate-200 hover:border-slate-300"}`}
                >
                  <div
                    className={`text-[11px] font-semibold ${active.evalCfg.method === m.id ? "text-teal-800" : "text-slate-700"}`}
                  >
                    {m.label}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              {EVAL_METHODS.find((m) => m.id === active.evalCfg.method)!.blurb}
            </p>

            {active.evalCfg.method === "steering" && (
              <SteeringEditor
                value={active.evalCfg.steeringCriteria}
                onChange={(v) => updateEval(active.id, { steeringCriteria: v })}
              />
            )}
            {active.evalCfg.method === "llmj" && (
              <div className="space-y-2">
                <input
                  value={active.evalCfg.metricLabel}
                  onChange={(e) => updateEval(active.id, { metricLabel: e.target.value })}
                  placeholder="customEvaluationMetricLabel — e.g. Citation Accuracy"
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-teal-400 transition-colors"
                />
                <select
                  value={active.evalCfg.judgeModel}
                  onChange={(e) => updateEval(active.id, { judgeModel: e.target.value })}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-teal-400 transition-colors"
                >
                  <option value="">Select a judge model…</option>
                  {JUDGE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  {/* Preserve a previously-set value that isn't a supported judge */}
                  {active.evalCfg.judgeModel && !JUDGE_MODEL_IDS.has(active.evalCfg.judgeModel) && (
                    <option value={active.evalCfg.judgeModel}>
                      {active.evalCfg.judgeModel} (unsupported judge model)
                    </option>
                  )}
                </select>
                <textarea
                  value={active.evalCfg.judgePrompt}
                  onChange={(e) => updateEval(active.id, { judgePrompt: e.target.value })}
                  rows={4}
                  placeholder="Grade the {{response}} to {{prompt}} against {{referenceResponse}} on a 1-5 scale…"
                  className="w-full p-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-teal-400 transition-colors"
                />
              </div>
            )}
            {active.evalCfg.method === "lambda" && (
              <div className="space-y-2">
                <input
                  value={active.evalCfg.metricLabel}
                  onChange={(e) => updateEval(active.id, { metricLabel: e.target.value })}
                  placeholder="customEvaluationMetricLabel"
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-teal-400 transition-colors"
                />
                <input
                  value={active.evalCfg.lambdaArn}
                  onChange={(e) => updateEval(active.id, { lambdaArn: e.target.value })}
                  placeholder="arn:aws:lambda:us-west-2:123456789012:function:advpo-exact-match"
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:border-teal-400 transition-colors font-mono"
                />
              </div>
            )}
          </div>

          {/* JSONL preview */}
          <div className="rounded-lg border border-slate-200 bg-white">
            <button
              onClick={() => setShowJsonl((s) => !s)}
              className="w-full flex items-center justify-between px-3 py-2"
            >
              <span className="text-xs font-semibold text-slate-700">
                JSONL preview ({templates.length} line{templates.length !== 1 ? "s" : ""})
              </span>
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${showJsonl ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showJsonl && (
              <pre className="text-[10px] text-slate-700 bg-slate-50 border-t border-slate-200 p-3 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
                {jsonl}
              </pre>
            )}
          </div>

          {/* issues */}
          {issues.length > 0 && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <div className="font-semibold mb-1">
                {issues.length} thing{issues.length !== 1 ? "s" : ""} to fix before upload:
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {issues.slice(0, 5).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              {issues.length > 5 && (
                <div className="mt-1 text-amber-600">+{issues.length - 5} more…</div>
              )}
            </div>
          )}

          {/* confirm */}
          {uploading ? (
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-sm text-slate-600 mb-2">Uploading dataset to S3…</div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-1.5">{progress}%</div>
            </div>
          ) : (
            <>
              {uploadError && (
                <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2">
                  {uploadError}
                </div>
              )}
              <button
                onClick={confirm}
                disabled={!canConfirm}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${canConfirm ? "bg-teal-600 text-white hover:bg-teal-700 shadow-sm" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
              >
                Confirm & upload to S3 · {templates.length} template
                {templates.length !== 1 ? "s" : ""}, {totalSamples} sample
                {totalSamples !== 1 ? "s" : ""}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SteeringEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().toUpperCase();
    if (!v || value.includes(v) || value.length >= LIMITS.steeringPerTemplate) return;
    onChange([...value, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 font-medium"
          >
            {s}
            <button
              onClick={() => onChange(value.filter((x) => x !== s))}
              className="text-teal-400 hover:text-teal-700"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. CONCISE"
          disabled={value.length >= LIMITS.steeringPerTemplate}
          className="flex-1 p-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-teal-400 transition-colors"
        />
        <button
          onClick={add}
          disabled={value.length >= LIMITS.steeringPerTemplate}
          className="px-3 rounded-lg bg-slate-800 text-white text-sm font-medium disabled:bg-slate-200 disabled:text-slate-400"
        >
          Add
        </button>
      </div>
    </div>
  );
}
