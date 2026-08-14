import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { advpoApi } from "../api/client";
import ConfirmDialog from "./ConfirmDialog";
import type {
  AdvPOJobStatus,
  AdvPOModel,
  AdvPOModelScope,
  AdvPOModelConfiguration,
  AdvPODatasetItem,
} from "../types";
import PolarParallelChart, {
  type PolarAxis,
  type PolarSeries,
} from "./promptopt/PolarParallelChart";
import DatasetBuilder, { type DatasetResult } from "./promptopt/DatasetBuilder";
import DatasetList from "./promptopt/DatasetList";

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Optimization — Operate
//
// Amazon Bedrock "Advanced Prompt Optimization" (AdvPO). Tabbed UI:
//   • Jobs    — submitted optimization jobs (list / get / stop / delete)
//   • Create  — upload a JSONL dataset to S3, choose models + KMS + output, submit
//   • Results — per-template / per-model output with a spiderweb (radar) comparison
//
// Text modality only at launch. Image / Document (PDF) / Audio are placeholders.
// Docs: advanced-prompt-optimization-{how,input,jobs,evaluation,results}.html
// ─────────────────────────────────────────────────────────────────────────────

const DATASET_VERSION = "bedrock-2026-05-14";
const LIMITS = {
  templatesPerJob: 10,
  samplesPerTemplate: 100,
  modelsPerJob: 5,
  multimodalPerSample: 2,
};

// CRIS scope metadata for grouping the model picker.
const SCOPE_META: Record<AdvPOModelScope, { label: string; blurb: string }> = {
  global: { label: "Global", blurb: "global.* — routes across all commercial regions" },
  regional: { label: "Regional (CRIS)", blurb: "geography-scoped cross-region inference" },
  in_region: { label: "In-region", blurb: "on-demand model invoked in the local region" },
};
const SCOPE_ORDER: AdvPOModelScope[] = ["global", "regional", "in_region"];

// Best-effort label for a model ID (used where we don't have the catalog).
const modelLabel = (id: string) => id;

// Restrict the AdvPO model picker to Amazon (Nova) and Anthropic (Claude
// Haiku + Sonnet only) families. Frontier / premium Anthropic tiers
// (Opus, Mythos, Fable) are deliberately excluded — per-token pricing on
// AdvPO jobs multiplies fast, and prompt tuning against those tiers isn't
// meaningful for teams that will deploy to Haiku or Sonnet anyway.
//
// Matches on lowercase substrings of the model ID because that's the field
// present on every AdvPO catalog entry (provider is optional). Adjust the
// allow/deny lists here if the pricing story changes.
const ADVPO_ALLOWED_PROVIDER_TOKENS = ["anthropic", "amazon"] as const;
const ADVPO_DENIED_TIER_TOKENS = ["opus", "mythos", "fable"] as const;

function filterAdvPOModels<T extends { id: string; provider?: string }>(models: T[]): T[] {
  return models.filter((m) => {
    const hay = `${m.id} ${m.provider ?? ""}`.toLowerCase();
    if (!ADVPO_ALLOWED_PROVIDER_TOKENS.some((tok) => hay.includes(tok))) return false;
    if (ADVPO_DENIED_TIER_TOKENS.some((tok) => hay.includes(tok))) return false;
    return true;
  });
}

// Optional per-model inference settings captured in the Create form. All fields
// are strings (raw input) and only forwarded to the API when non-empty/valid.
interface ModelCfgForm {
  maxTokens: string;
  temperature: string;
  topP: string;
  stopSequences: string; // comma-separated
  additionalFields: string; // raw JSON object
}
const emptyModelCfg = (): ModelCfgForm => ({
  maxTokens: "",
  temperature: "",
  topP: "",
  stopSequences: "",
  additionalFields: "",
});

// Build the API ModelConfiguration payload for one model from its form state.
// Returns { model_id, inference_config?, additional_model_request_fields? }.
// `error` is set when additionalFields is present but not valid JSON.
function buildModelConfig(
  modelId: string,
  cfg: ModelCfgForm | undefined,
): { config: AdvPOModelConfiguration; error?: string } {
  const config: AdvPOModelConfiguration = { model_id: modelId };
  if (!cfg) return { config };

  const inference: NonNullable<AdvPOModelConfiguration["inference_config"]> = {};
  if (cfg.maxTokens.trim()) inference.max_tokens = Number(cfg.maxTokens);
  if (cfg.temperature.trim()) inference.temperature = Number(cfg.temperature);
  if (cfg.topP.trim()) inference.top_p = Number(cfg.topP);
  const stops = cfg.stopSequences
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (stops.length) inference.stop_sequences = stops;
  if (Object.keys(inference).length) config.inference_config = inference;

  if (cfg.additionalFields.trim()) {
    try {
      const parsed = JSON.parse(cfg.additionalFields);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        config.additional_model_request_fields = parsed;
      } else {
        return { config, error: "additional fields must be a JSON object" };
      }
    } catch {
      return { config, error: "additional fields is not valid JSON" };
    }
  }
  return { config };
}

// Short human summary of which optional settings a model has configured.
function cfgSummary(cfg: ModelCfgForm | undefined): string {
  if (!cfg) return "";
  const bits: string[] = [];
  if (cfg.maxTokens.trim()) bits.push(`max ${cfg.maxTokens}`);
  if (cfg.temperature.trim()) bits.push(`temp ${cfg.temperature}`);
  if (cfg.topP.trim()) bits.push(`topP ${cfg.topP}`);
  if (cfg.stopSequences.trim()) bits.push("stop");
  if (cfg.additionalFields.trim()) bits.push("extra fields");
  return bits.join(" · ");
}

const KMS_KEYS = [
  { id: "aws-managed", label: "AWS-managed key (aws/bedrock)" },
  { id: "arn:aws:kms:us-west-2:123456789012:key/ava-advpo", label: "ava-advpo (CMK)" },
  { id: "arn:aws:kms:us-west-2:123456789012:key/fsi-shared", label: "fsi-shared (CMK)" },
];

type ModalityId = "text" | "image" | "document" | "audio";
interface Modality {
  id: ModalityId;
  label: string;
  note: string;
  status: "available" | "coming_soon";
  icon: string;
}
const MODALITIES: Modality[] = [
  {
    id: "text",
    label: "Text",
    note: "inputVariables",
    status: "available",
    icon: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
  },
  {
    id: "image",
    label: "Image",
    note: "IMAGE · png/jpeg",
    status: "coming_soon",
    icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  },
  {
    id: "document",
    label: "Document",
    note: "PDF",
    status: "coming_soon",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  },
  {
    id: "audio",
    label: "Audio",
    note: "transcript",
    status: "coming_soon",
    icon: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z",
  },
];

type JobStatus = "Submitted" | "InProgress" | "Completed" | "Failed" | "Stopped";
const STATUS_STYLE: Record<JobStatus, string> = {
  Submitted: "bg-sky-50 text-sky-700 border-sky-200",
  InProgress: "bg-amber-50 text-amber-700 border-amber-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Failed: "bg-rose-50 text-rose-700 border-rose-200",
  Stopped: "bg-slate-100 text-slate-500 border-slate-200",
};

interface SampleResult {
  index: number;
  inputVariables: Record<string, string>;
  referenceResponse?: string;
  originalResponse?: string;
  optimizedResponse?: string;
  originalScore: number; // 0-1
  optimizedScore: number; // 0-1
}
interface ModelResult {
  modelId: string;
  status: "SUCCESS" | "FAILED";
  optimizedPromptTemplate: string;
  // aggregate metrics (averages across the dataset)
  scoreBefore: number; // averageScore, original (0-1)
  scoreAfter: number; // averageScore, optimized (0-1)
  ttftBefore: number; // averageTtftInSec, original
  ttftAfter: number; // averageTtftInSec, optimized
  inTokBefore: number; // averageInputTokens, original
  inTokAfter: number; // averageInputTokens, optimized
  outTokBefore: number; // averageOutputTokens, original
  outTokAfter: number; // averageOutputTokens, optimized
  samples: SampleResult[];
}
interface TemplateResult {
  promptTemplateId: string;
  promptTemplate: string; // the original (unoptimized) prompt template
  metricLabel?: string; // customEvaluationMetricLabel
  results: ModelResult[];
}
interface Job {
  arn: string;
  name: string;
  status: JobStatus;
  models: string[];
  createdAt: string;
  inputS3: string;
  outputS3: string;
  kms: string;
  originalTemplate: string;
  templateResults?: TemplateResult[];
}
const jobId = (arn: string) => arn.split("/").pop() ?? arn;

// Format an ISO timestamp as a compact relative time ("3m ago", "2d ago").
function relativeTime(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Map Bedrock AdvPO job statuses onto the UI's JobStatus set.
function mapAdvPOStatus(s: AdvPOJobStatus): JobStatus {
  switch (s) {
    case "Submitted":
      return "Submitted";
    case "Completed":
    case "PartiallyCompleted":
      return "Completed";
    case "Failed":
      return "Failed";
    case "Stopped":
    case "Stopping":
    case "Deleting":
      return "Stopped";
    case "InProgress":
    default:
      return "InProgress";
  }
}

// Polar parallel-coordinates axes — each keeps its OWN scale and units.
const SERIES_COLORS = ["#0d9488", "#6366f1", "#db2777", "#d97706", "#0891b2"];
const RADAR_COLORS = SERIES_COLORS; // alias kept for the per-model picker dots

// Metric values per model in native units. Derived from the AdvPO result-level
// metrics (averageScore, averageTtftInSec, averageInput/OutputTokens).
function metricValues(r: ModelResult): Record<string, number> {
  const scores = r.samples.map((s) => s.optimizedScore);
  const spread = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;
  return {
    quality: Math.round(r.scoreAfter * 100), // %  (avg optimized score)
    latency: r.ttftAfter, // s  (avg TTFT, lower better)
    brevity: Math.round(r.outTokAfter), // output tokens (lower better)
    consistency: Math.round(100 - spread * 100), // %  (lower per-sample spread better)
  };
}

const POLAR_AXES: PolarAxis[] = [
  {
    key: "quality",
    label: "Quality",
    min: 0,
    max: 100,
    higherBetter: true,
    format: (v) => `${v}%`,
  },
  {
    key: "latency",
    label: "Latency (TTFT)",
    min: 0.5,
    max: 3,
    higherBetter: false,
    format: (v) => `${v.toFixed(2)}s`,
  },
  {
    key: "brevity",
    label: "Output tokens",
    min: 200,
    max: 4500,
    higherBetter: false,
    format: (v) => `${Math.round(v)}`,
  },
  {
    key: "consistency",
    label: "Consistency",
    min: 0,
    max: 100,
    higherBetter: true,
    format: (v) => `${v}%`,
  },
];

type Tab = "jobs" | "create" | "datasets" | "results";

export default function PromptOptimization() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [tab, setTab] = useState<Tab>("jobs");
  const [resultArn, setResultArn] = useState<string | null>(null);
  const [uploadedResult, setUploadedResult] = useState<Job | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState("");

  const TABS: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: "jobs", label: "Jobs" },
    { id: "create", label: "Create job" },
    { id: "datasets", label: "Datasets" },
    { id: "results", label: "Results" },
  ];

  // Load jobs from the backend (Bedrock ListAdvancedPromptOptimizationJobs).
  // Locally-created jobs not yet returned by the API are preserved by ARN.
  const loadJobs = async () => {
    setJobsLoading(true);
    setJobsError("");
    try {
      const res = await advpoApi.listJobs();
      setJobs((prev) => {
        const byArn = new Map(prev.map((j) => [j.arn, j]));
        return res.jobs.map((item) => {
          const existing = byArn.get(item.job_arn);
          return {
            ...(existing ?? {}),
            arn: item.job_arn,
            name: item.job_name,
            status: mapAdvPOStatus(item.status),
            models: existing?.models ?? [],
            createdAt: relativeTime(item.creation_time) || existing?.createdAt || "—",
            inputS3: existing?.inputS3 ?? "",
            outputS3: existing?.outputS3 ?? "",
            kms: existing?.kms ?? "aws-managed",
            originalTemplate: existing?.originalTemplate ?? "",
            templateResults: existing?.templateResults,
          } as Job;
        });
      });
    } catch (e) {
      setJobsError(e instanceof Error ? e.message : "Failed to load jobs.");
    } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openResults = (arn: string) => {
    setResultArn(arn);
    setUploadedResult(null);
    setResultsError("");
    setTab("results");
    // If we don't yet have parsed results for this job, fetch the JSONL from S3.
    const existing = jobs.find((j) => j.arn === arn);
    if (existing && !existing.templateResults) {
      loadResultsFromS3(arn);
    }
  };

  // Read the results JSONL back from S3 (via the backend) and merge the parsed
  // templateResults into the job so the Results tab can render charts/tables.
  const loadResultsFromS3 = async (arn: string) => {
    setResultsLoading(true);
    setResultsError("");
    try {
      const res = await advpoApi.getResults(arn);
      const parsed = parseResultsJsonl(res.content, res.s3_uri);
      if (!parsed) {
        setResultsError("Results file was empty or in an unexpected format.");
        return;
      }
      setJobs((prev) =>
        prev.map((j) =>
          j.arn === arn
            ? { ...j, templateResults: parsed.templateResults, outputS3: res.s3_uri }
            : j,
        ),
      );
    } catch (e) {
      setResultsError(e instanceof Error ? e.message : "Failed to load results from S3.");
    } finally {
      setResultsLoading(false);
    }
  };
  const stopJob = async (arn: string) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.arn === arn && (j.status === "Submitted" || j.status === "InProgress")
          ? { ...j, status: "Stopped" }
          : j,
      ),
    );
    try {
      await advpoApi.stopJob(arn);
    } catch {
      // Refresh to reflect true state on failure
      loadJobs();
    }
  };
  const deleteJob = async (arn: string) => {
    setJobs((prev) => prev.filter((j) => j.arn !== arn));
    if (resultArn === arn) {
      setResultArn(null);
      if (tab === "results") setTab("jobs");
    }
    try {
      await advpoApi.deleteJob(arn);
    } catch {
      loadJobs();
    }
  };

  // Pending stop/delete awaiting user confirmation.
  const [pendingAction, setPendingAction] = useState<{
    kind: "stop" | "delete";
    arn: string;
  } | null>(null);
  const requestStop = (arn: string) => setPendingAction({ kind: "stop", arn });
  const requestDelete = (arn: string) => setPendingAction({ kind: "delete", arn });
  const pendingJob = pendingAction ? jobs.find((j) => j.arn === pendingAction.arn) : null;
  const confirmPending = () => {
    if (!pendingAction) return;
    if (pendingAction.kind === "stop") stopJob(pendingAction.arn);
    else deleteJob(pendingAction.arn);
    setPendingAction(null);
  };

  const resultJob = jobs.find((j) => j.arn === resultArn) || null;

  const handleCreate = (job: Job) => {
    setJobs((prev) => [job, ...prev]);
    setTab("jobs");
    pollJob(job.arn);
  };

  // Poll Bedrock GetAdvancedPromptOptimizationJob until the job reaches a
  // terminal state, updating the row's status as it progresses.
  const pollJob = (arn: string) => {
    let attempts = 0;
    const terminal: JobStatus[] = ["Completed", "Failed", "Stopped"];
    const tick = async () => {
      attempts += 1;
      try {
        const detail = await advpoApi.getJob(arn);
        const status = mapAdvPOStatus(detail.status);
        setJobs((prev) => prev.map((j) => (j.arn === arn ? { ...j, status } : j)));
        if (terminal.includes(status)) return;
      } catch {
        // transient — keep polling until the cap
      }
      if (attempts < 120) setTimeout(tick, 5000);
    };
    setTimeout(tick, 3000);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 20% 50%, rgba(204,251,241,0.6) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(207,250,254,0.55) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(219,234,254,0.45) 0%, transparent 50%)",
          animation: "gradientDrift 20s ease-in-out infinite",
        }}
      />
      <div className="relative max-w-6xl mx-auto px-6 py-10">
        <div className="mb-6 animate-fade-in">
          <Link
            to="/capabilities/prompts"
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium"
          >
            ← Back to Prompts
          </Link>
          <div className="flex items-center gap-3 mt-3">
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
              Prompt Optimization
            </h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
              Bedrock AdvPO
            </span>
          </div>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Submit Advanced Prompt Optimization jobs and review optimized prompts, scores, latency,
            and token usage across your target models.
          </p>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit animate-fade-in stagger-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => !t.disabled && setTab(t.id)}
              disabled={t.disabled}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : t.disabled
                    ? "text-slate-300 cursor-not-allowed"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "jobs" && (
          <JobsTab
            jobs={jobs}
            loading={jobsLoading}
            error={jobsError}
            onRefresh={loadJobs}
            onNew={() => setTab("create")}
            onOpen={openResults}
            onStop={requestStop}
            onDelete={requestDelete}
          />
        )}
        {tab === "create" && <CreateTab onCancel={() => setTab("jobs")} onCreate={handleCreate} />}
        {tab === "datasets" && <DatasetsTab />}
        {tab === "results" &&
          (resultJob || uploadedResult) &&
          (resultJob && !resultJob.templateResults ? (
            <ResultsLoading
              loading={resultsLoading}
              error={resultsError}
              onRetry={() => resultArn && loadResultsFromS3(resultArn)}
              onClose={() => {
                setResultArn(null);
                setTab("jobs");
              }}
            />
          ) : (
            <ResultsTab
              key={(resultJob || uploadedResult)!.arn}
              job={(resultJob || uploadedResult)!}
              uploaded={!resultJob && !!uploadedResult}
              onClear={() => {
                setUploadedResult(null);
                setResultArn(null);
              }}
            />
          ))}
        {tab === "results" && !resultJob && !uploadedResult && (
          <ResultsUpload onLoaded={setUploadedResult} onBrowseJobs={() => setTab("jobs")} />
        )}
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        variant={pendingAction?.kind === "delete" ? "danger" : "warning"}
        title={
          pendingAction?.kind === "delete" ? "Delete optimization job?" : "Stop optimization job?"
        }
        message={
          pendingAction?.kind === "delete"
            ? `This permanently deletes "${pendingJob?.name ?? jobId(pendingAction?.arn ?? "")}". This cannot be undone.`
            : `This stops "${pendingJob?.name ?? jobId(pendingAction?.arn ?? "")}". Any in-progress optimization will not complete.`
        }
        confirmText={pendingAction?.kind === "delete" ? "Delete" : "Stop job"}
        cancelText="Cancel"
        onConfirm={confirmPending}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

// ── JOBS TAB ─────────────────────────────────────────────────────────────────
function JobsTab({
  jobs,
  loading,
  error,
  onRefresh,
  onNew,
  onOpen,
  onStop,
  onDelete,
}: {
  jobs: Job[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onNew: () => void;
  onOpen: (arn: string) => void;
  onStop: (arn: string) => void;
  onDelete: (arn: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = jobs.filter((j) => !q || j.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="animate-fade-in stagger-2">
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search jobs by name…"
            className="w-full py-2.5 pl-10 pr-4 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-teal-400 transition-colors"
          />
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:border-teal-300 hover:text-teal-700 transition-all flex-shrink-0 disabled:opacity-50"
          title="Refresh jobs"
        >
          <svg
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          Refresh
        </button>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 shadow-sm transition-all flex-shrink-0"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New job
        </button>
      </div>

      {error && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {loading && jobs.length === 0 ? (
        <div className="card bg-white/80 border-slate-200 text-center py-16">
          <div className="w-10 h-10 rounded-full border-2 border-teal-200 border-t-teal-600 animate-spin mx-auto mb-4" />
          <h3 className="text-base font-semibold text-slate-600">Loading jobs…</h3>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card bg-white/80 border-slate-200 text-center py-16">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4">
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
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-700">
            {jobs.length === 0 ? "No optimization jobs yet" : "No jobs match your search"}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {jobs.length === 0
              ? "Create your first job to optimize a prompt template."
              : "Try a different name."}
          </p>
        </div>
      ) : (
        <div className="card bg-white/90 border-slate-200 p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Job
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden lg:table-cell">
                  Created
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const done = j.status === "Completed";
                const stoppable = j.status === "Submitted" || j.status === "InProgress";
                return (
                  <tr
                    key={j.arn}
                    className={`border-b border-slate-50 last:border-0 transition-colors ${done ? "hover:bg-teal-50/40 cursor-pointer" : ""}`}
                    onClick={() => done && onOpen(j.arn)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{j.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate max-w-[240px]">
                        {jobId(j.arn)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_STYLE[j.status]} ${j.status === "InProgress" ? "animate-pulse" : ""}`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{j.createdAt}</td>
                    <td
                      className="px-4 py-3 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {done && (
                        <button
                          onClick={() => onOpen(j.arn)}
                          className="text-xs font-semibold text-teal-700 hover:text-teal-800 mr-3"
                        >
                          View results
                        </button>
                      )}
                      {stoppable && (
                        <button
                          onClick={() => onStop(j.arn)}
                          className="text-xs font-medium text-amber-600 hover:text-amber-700 mr-3"
                        >
                          Stop
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(j.arn)}
                        className="text-xs font-medium text-slate-400 hover:text-rose-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── RESULTS UPLOAD (when not coming from a job) ──────────────────────────────
// Parses an advanced_prompt_optimization_results.jsonl into a Job. Each line is
// one template: { promptTemplateId, promptTemplate, customEvaluationMetricLabel,
// promptOptimizationResults: [{ modelId, status, optimizedPromptTemplate,
// originalPromptMetrics{averageScore,averageTtftInSec,averageInput/OutputTokens},
// optimizedPromptMetrics{...}, dataset: [{inputVariables, referenceResponse,
// originalPromptDetails{...,originalPromptMetrics{score,ttftInSec,...}},
// optimizedPromptDetails{...,optimizedPromptMetrics{score,...}}}] }] }
function parseResultsJsonl(text: string, fileName: string): Job | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const num = (o: unknown, k: string, d = 0): number => {
    const v = o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined;
    return typeof v === "number" ? v : d;
  };
  const str = (o: unknown, k: string, d = ""): string => {
    const v = o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined;
    return typeof v === "string" ? v : d;
  };

  const templateResults: TemplateResult[] = [];
  let firstTemplate = "";
  for (const line of lines) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const promptTemplate = str(o, "promptTemplate");
    if (!firstTemplate) firstTemplate = promptTemplate;

    const rawResults = Array.isArray(o.promptOptimizationResults)
      ? (o.promptOptimizationResults as Record<string, unknown>[])
      : [];
    const results: ModelResult[] = rawResults.map((rr) => {
      const origAgg = rr.originalPromptMetrics;
      const optAgg = rr.optimizedPromptMetrics;
      const rawDataset = Array.isArray(rr.dataset) ? (rr.dataset as Record<string, unknown>[]) : [];
      const samples: SampleResult[] = rawDataset.map((d, i) => {
        const opd = d.originalPromptDetails as Record<string, unknown> | undefined;
        const optd = d.optimizedPromptDetails as Record<string, unknown> | undefined;
        const inputVars: Record<string, string> = {};
        const iv = Array.isArray(d.inputVariables)
          ? (d.inputVariables as Record<string, string>[])
          : [];
        iv.forEach((pair) =>
          Object.entries(pair).forEach(([k, v]) => {
            inputVars[k] = String(v);
          }),
        );
        return {
          index: i + 1,
          inputVariables: inputVars,
          referenceResponse: str(d, "referenceResponse"),
          originalResponse: str(opd, "originalPromptModelResponse"),
          optimizedResponse: str(optd, "optimizedPromptModelResponse"),
          originalScore: num(opd?.originalPromptMetrics, "score"),
          optimizedScore: num(optd?.optimizedPromptMetrics, "score"),
        };
      });
      return {
        modelId: str(rr, "modelId", "unknown-model"),
        status: str(rr, "status") === "FAILED" ? "FAILED" : "SUCCESS",
        optimizedPromptTemplate: str(rr, "optimizedPromptTemplate"),
        scoreBefore: num(origAgg, "averageScore"),
        scoreAfter: num(optAgg, "averageScore"),
        ttftBefore: num(origAgg, "averageTtftInSec"),
        ttftAfter: num(optAgg, "averageTtftInSec"),
        inTokBefore: num(origAgg, "averageInputTokens"),
        inTokAfter: num(optAgg, "averageInputTokens"),
        outTokBefore: num(origAgg, "averageOutputTokens"),
        outTokAfter: num(optAgg, "averageOutputTokens"),
        samples,
      };
    });
    if (results.length === 0) continue;
    templateResults.push({
      promptTemplateId: str(o, "promptTemplateId", `template-${templateResults.length + 1}`),
      promptTemplate,
      metricLabel: str(o, "customEvaluationMetricLabel") || undefined,
      results,
    });
  }

  if (templateResults.length === 0) return null;
  const models = templateResults[0].results.map((r) => r.modelId);
  return {
    arn: `file://${fileName}`,
    name: fileName.replace(/\.jsonl$/i, ""),
    status: "Completed",
    models,
    createdAt: "uploaded",
    inputS3: fileName,
    outputS3: "",
    kms: "aws-managed",
    originalTemplate: firstTemplate || "(original prompt not found in results file)",
    templateResults,
  };
}

function ResultsLoading({
  loading,
  error,
  onRetry,
  onClose,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="animate-fade-in stagger-2 max-w-2xl">
      <div className="card bg-white/90 border-slate-200 text-center py-16">
        {loading ? (
          <>
            <div className="w-10 h-10 rounded-full border-2 border-teal-200 border-t-teal-600 animate-spin mx-auto mb-4" />
            <h3 className="text-base font-semibold text-slate-700">Loading results from S3…</h3>
            <p className="text-sm text-slate-500 mt-1">
              Reading the optimization results file from your output bucket.
            </p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-rose-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-700">Couldn&rsquo;t load results</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              {error || "Results may not be available yet for this job."}
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={onRetry}
                className="text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg px-3 py-1.5 transition-colors"
              >
                Retry
              </button>
              <button
                onClick={onClose}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
              >
                Back to jobs
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ResultsUpload({
  onLoaded,
  onBrowseJobs,
}: {
  onLoaded: (job: Job) => void;
  onBrowseJobs: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (files: FileList | null) => {
    setError("");
    const file = files?.[0];
    if (!file) return;
    if (!/\.jsonl$/i.test(file.name)) {
      setError("Results file must be a .jsonl (advanced_prompt_optimization_results.jsonl).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const job = parseResultsJsonl(String(reader.result), file.name);
      if (!job) {
        setError("Couldn't find any promptOptimizationResults in that file.");
        return;
      }
      onLoaded(job);
    };
    reader.readAsText(file);
  };

  return (
    <div className="animate-fade-in stagger-2 max-w-2xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">View results</h2>
        <p className="text-sm text-slate-500 mt-1">
          Open a completed job from the{" "}
          <button onClick={onBrowseJobs} className="text-teal-700 font-medium hover:underline">
            Jobs
          </button>{" "}
          tab, or upload a results file to visualize it here.
        </p>
      </div>

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
        className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${dragOver ? "border-teal-400 bg-teal-50/60" : "border-slate-300 bg-white/60 hover:border-teal-300 hover:bg-slate-50"}`}
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
          Drop a <span className="font-mono">results.jsonl</span> here
        </div>
        <div className="text-xs text-slate-400 mt-1">
          The <span className="font-mono">advanced_prompt_optimization_results.jsonl</span> from
          your output bucket · or click to browse
        </div>
      </div>
      {error && <div className="text-[11px] text-rose-600 mt-2">{error}</div>}
    </div>
  );
}

// ── RESULTS TAB ──────────────────────────────────────────────────────────────
function ResultsTab({
  job,
  uploaded,
  onClear,
}: {
  job: Job;
  uploaded?: boolean;
  onClear?: () => void;
}) {
  const templates = job.templateResults ?? [];
  const firstTemplate = templates[0];
  const [activeModel, setActiveModel] = useState<string>(firstTemplate?.results[0]?.modelId ?? "");
  const [view, setView] = useState<"optimized" | "samples">("optimized");

  // Optional pricing dimension: user enters price per 1M input/output tokens
  // per model; we estimate per-request cost from avg input/output tokens.
  const [pricingOn, setPricingOn] = useState(false);
  const [prices, setPrices] = useState<Record<string, { in: string; out: string }>>({});
  const setPrice = (modelId: string, field: "in" | "out", value: string) =>
    setPrices((prev) => {
      const current = prev[modelId] ?? { in: "", out: "" };
      return { ...prev, [modelId]: { ...current, [field]: value.replace(/[^0-9.]/g, "") } };
    });
  // Cost per request (USD) for a token count given per-1M pricing. Returns null
  // when the relevant price hasn't been entered.
  const costFor = (modelId: string, inTok: number, outTok: number): number | null => {
    const p = prices[modelId];
    if (!p) return null;
    const pin = parseFloat(p.in);
    const pout = parseFloat(p.out);
    if (Number.isNaN(pin) && Number.isNaN(pout)) return null;
    const inCost = Number.isNaN(pin) ? 0 : (inTok / 1_000_000) * pin;
    const outCost = Number.isNaN(pout) ? 0 : (outTok / 1_000_000) * pout;
    return inCost + outCost;
  };
  const fmtUsd = (n: number) =>
    n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(4)}` : `$${n.toExponential(2)}`;

  const result =
    firstTemplate?.results.find((r) => r.modelId === activeModel) ?? firstTemplate?.results[0];

  // One polar series per model; raw values in native units (chart normalizes per-axis).
  // When pricing is enabled, append a `cost` dimension (optimized cost/request).
  const optimizedCosts = firstTemplate
    ? firstTemplate.results.map((r) => costFor(r.modelId, r.inTokAfter, r.outTokAfter) ?? 0)
    : [];
  const maxCost = optimizedCosts.length ? Math.max(...optimizedCosts) : 0;

  const chartAxes: PolarAxis[] = useMemo(() => {
    if (!pricingOn) return POLAR_AXES;
    return [
      ...POLAR_AXES,
      {
        key: "cost",
        label: "Cost / req",
        min: 0,
        max: maxCost > 0 ? maxCost * 1.1 : 1,
        higherBetter: false,
        format: (v) => fmtUsd(v),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingOn, maxCost]);

  const polarSeries: PolarSeries[] = useMemo(() => {
    if (!firstTemplate) return [];
    return firstTemplate.results.map((r, i) => {
      const values = metricValues(r);
      if (pricingOn) {
        values.cost = costFor(r.modelId, r.inTokAfter, r.outTokAfter) ?? 0;
      }
      return {
        id: r.modelId,
        label: modelLabel(r.modelId),
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        values,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstTemplate, pricingOn, prices]);

  return (
    <div className="animate-fade-in stagger-2">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{job.name}</h2>
          <p className="text-xs text-slate-400">
            {uploaded
              ? `Loaded from file · ${job.models.length} model${job.models.length > 1 ? "s" : ""}`
              : `${job.models.length} model${job.models.length > 1 ? "s" : ""} · submitted ${job.createdAt}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onClear && (
            <button
              onClick={onClear}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-teal-700 border border-slate-200 rounded-lg px-2.5 py-1 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              {uploaded ? "Clear file" : "Close results"}
            </button>
          )}
          <span
            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_STYLE[job.status]}`}
          >
            {job.status}
          </span>
        </div>
      </div>

      {/* Source location */}
      <div className="card bg-slate-50/70 border-slate-200 mb-5 flex items-center gap-3">
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
            d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
          />
        </svg>
        <code className="text-xs text-slate-600 font-mono truncate">
          {uploaded
            ? `${job.inputS3} (uploaded results file)`
            : `${job.outputS3}${jobId(job.arn)}/advanced_prompt_optimization_results.jsonl`}
        </code>
      </div>

      {/* Model comparison — chart + selectable model rows side by side */}
      {firstTemplate && firstTemplate.results.length > 0 && (
        <div className="card bg-white/90 border-slate-200 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Model comparison</h3>
              <p className="text-[11px] text-slate-400">
                Each axis has its own scale — the outer edge is always better.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPricingOn((v) => !v)}
                className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${pricingOn ? "bg-teal-50 text-teal-700 border-teal-300" : "bg-white text-slate-600 border-slate-200 hover:border-teal-300"}`}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {pricingOn ? "Hide pricing" : "Add pricing dimension"}
              </button>
              <span className="text-[10px] font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
                {firstTemplate.results.length} model{firstTemplate.results.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-center">
            {/* Chart */}
            <div className="lg:col-span-3 flex justify-center">
              <PolarParallelChart axes={chartAxes} series={polarSeries} size={360} />
            </div>

            {/* Selectable model rows */}
            <div className="lg:col-span-2 space-y-2">
              {firstTemplate.results.map((r, i) => {
                const active = r.modelId === activeModel;
                const color = RADAR_COLORS[i % RADAR_COLORS.length];
                return (
                  <button
                    key={r.modelId}
                    onClick={() => setActiveModel(r.modelId)}
                    className={`w-full text-left rounded-xl border p-3 transition-all ${active ? "bg-white border-teal-400 ring-1 ring-teal-200 shadow-sm" : "bg-white/70 border-slate-200 hover:border-teal-300"}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: color }}
                      />
                      <span className="text-xs font-semibold text-slate-800 truncate flex-1">
                        {modelLabel(r.modelId)}
                      </span>
                      {active && (
                        <span className="text-[8px] font-bold uppercase tracking-wider text-teal-600 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5">
                          viewing
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div className="text-[8px] uppercase tracking-widest text-slate-400">
                          Score
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-bold text-teal-700 leading-none">
                            {(r.scoreAfter * 100).toFixed(0)}
                          </span>
                          <span className="text-[9px] font-semibold text-emerald-600">
                            +{((r.scoreAfter - r.scoreBefore) * 100).toFixed(0)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[8px] uppercase tracking-widest text-slate-400">
                          TTFT
                        </div>
                        <div className="text-sm font-semibold text-slate-700 leading-tight mt-0.5">
                          {r.ttftAfter.toFixed(2)}
                          <span className="text-[9px] text-slate-400">s</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[8px] uppercase tracking-widest text-slate-400">
                          Out tok
                        </div>
                        <div className="text-sm font-semibold text-slate-700 leading-tight mt-0.5">
                          {Math.round(r.outTokAfter)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pricing dimension — per-model price per 1M tokens → estimated cost */}
          {pricingOn && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-semibold text-slate-700">
                  Cost estimate
                  <span className="font-normal text-slate-400">
                    {" "}
                    · per request, from avg input/output tokens
                  </span>
                </div>
                <a
                  href="https://aws.amazon.com/bedrock/pricing/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-medium text-teal-600 hover:text-teal-700 hover:underline"
                >
                  Bedrock pricing ↗
                </a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[9px] uppercase tracking-widest text-slate-400">
                      <th className="py-1 pr-3 font-bold">Model</th>
                      <th className="py-1 px-2 font-bold">$ / 1M in</th>
                      <th className="py-1 px-2 font-bold">$ / 1M out</th>
                      <th className="py-1 px-2 font-bold text-right">Original</th>
                      <th className="py-1 px-2 font-bold text-right">Optimized</th>
                      <th className="py-1 pl-2 font-bold text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firstTemplate.results.map((r) => {
                      const before = costFor(r.modelId, r.inTokBefore, r.outTokBefore);
                      const after = costFor(r.modelId, r.inTokAfter, r.outTokAfter);
                      const delta = before !== null && after !== null ? after - before : null;
                      return (
                        <tr key={r.modelId} className="border-t border-slate-50">
                          <td className="py-1.5 pr-3 font-medium text-slate-700 truncate max-w-[160px]">
                            {modelLabel(r.modelId)}
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              value={prices[r.modelId]?.in ?? ""}
                              onChange={(e) => setPrice(r.modelId, "in", e.target.value)}
                              inputMode="decimal"
                              placeholder="0.00"
                              className="w-20 px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-800 outline-none focus:border-teal-400"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              value={prices[r.modelId]?.out ?? ""}
                              onChange={(e) => setPrice(r.modelId, "out", e.target.value)}
                              inputMode="decimal"
                              placeholder="0.00"
                              className="w-20 px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-800 outline-none focus:border-teal-400"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-400 line-through">
                            {before !== null ? fmtUsd(before) : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-right font-semibold text-slate-800">
                            {after !== null ? fmtUsd(after) : "—"}
                          </td>
                          <td
                            className={`py-1.5 pl-2 text-right font-semibold ${
                              delta === null
                                ? "text-slate-400"
                                : delta <= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600"
                            }`}
                          >
                            {delta === null ? "—" : `${delta <= 0 ? "" : "+"}${fmtUsd(delta)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                Enter on-demand prices per 1M tokens for each model (see Bedrock pricing). Cost ={" "}
                (avg input tokens ÷ 1M × $/1M in) + (avg output tokens ÷ 1M × $/1M out). Leave a
                field blank to treat it as $0.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Selected model detail */}
      {result && (
        <div className="card bg-white/90 border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-slate-800">
                {modelLabel(result.modelId)}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">{result.modelId}</div>
            </div>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setView("optimized")}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${view === "optimized" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Optimized prompt
              </button>
              <button
                onClick={() => setView("samples")}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${view === "samples" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Per-sample scores
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Metric
              label="Avg score"
              before={`${(result.scoreBefore * 100).toFixed(0)}%`}
              after={`${(result.scoreAfter * 100).toFixed(0)}%`}
              delta={`+${((result.scoreAfter - result.scoreBefore) * 100).toFixed(0)} pts`}
            />
            <Metric
              label="Avg TTFT"
              before={`${result.ttftBefore.toFixed(2)}s`}
              after={`${result.ttftAfter.toFixed(2)}s`}
              delta={
                result.ttftAfter <= result.ttftBefore
                  ? `${Math.round((1 - result.ttftAfter / result.ttftBefore) * 100)}% faster`
                  : `${Math.round((result.ttftAfter / result.ttftBefore - 1) * 100)}% slower`
              }
              goodUp={result.ttftAfter <= result.ttftBefore}
            />
            <Metric
              label="Avg input tok"
              before={`${Math.round(result.inTokBefore)}`}
              after={`${Math.round(result.inTokAfter)}`}
              delta=""
              goodUp={false}
            />
            <Metric
              label="Avg output tok"
              before={`${Math.round(result.outTokBefore)}`}
              after={`${Math.round(result.outTokAfter)}`}
              delta=""
              goodUp={false}
            />
            {pricingOn &&
              (() => {
                const before = costFor(result.modelId, result.inTokBefore, result.outTokBefore);
                const after = costFor(result.modelId, result.inTokAfter, result.outTokAfter);
                return (
                  <Metric
                    label="Est. cost / req"
                    before={before !== null ? fmtUsd(before) : "—"}
                    after={after !== null ? fmtUsd(after) : "—"}
                    delta={
                      before !== null && after !== null && before > 0
                        ? after <= before
                          ? `${Math.round((1 - after / before) * 100)}% cheaper`
                          : `${Math.round((after / before - 1) * 100)}% pricier`
                        : ""
                    }
                    goodUp={after !== null && before !== null ? after <= before : false}
                  />
                );
              })()}
          </div>

          {result.status === "FAILED" && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">
              Optimization failed for this model.
            </div>
          )}

          {view === "optimized" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div className="text-[9px] uppercase tracking-widest text-slate-400 mb-1.5">
                  Original
                </div>
                <pre className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed h-full max-h-80 overflow-y-auto">
                  {firstTemplate?.promptTemplate || job.originalTemplate}
                </pre>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest text-teal-600 mb-1.5">
                  Optimized
                </div>
                <pre className="text-[11px] text-slate-700 bg-teal-50/50 border border-teal-200 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed h-full max-h-80 overflow-y-auto">
                  {result.optimizedPromptTemplate}
                </pre>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {result.samples.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">
                  No per-sample detail in this result.
                </p>
              )}
              {result.samples.map((s) => (
                <SampleRow key={s.index} sample={s} />
              ))}
            </div>
          )}
          <p className="text-[10px] text-slate-400 leading-relaxed mt-4">
            Scores are normalized (higher is better) regardless of your original grading scale. Raw
            LLM-as-a-Judge output is available in the results JSONL and the console detailed-results
            tab.
          </p>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  before,
  after,
  delta,
  goodUp = true,
}: {
  label: string;
  before: string;
  after: string;
  delta: string;
  goodUp?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-[9px] uppercase tracking-widest text-slate-400">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-slate-400 text-xs line-through">{before}</span>
        <span className="text-lg font-bold text-teal-700">{after}</span>
      </div>
      {delta && (
        <div
          className={`text-[10px] font-semibold mt-0.5 ${goodUp ? "text-emerald-600" : "text-slate-400"}`}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

// Expandable per-sample row: input, score before/after, and the model responses.
function SampleRow({ sample }: { sample: SampleResult }) {
  const [open, setOpen] = useState(false);
  const delta = sample.optimizedScore - sample.originalScore;
  const firstVar = Object.values(sample.inputVariables)[0] ?? "";
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">#{sample.index}</span>
        <span className="text-xs text-slate-600 truncate flex-1">{firstVar || "(sample)"}</span>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-slate-400 line-through">
            {(sample.originalScore * 100).toFixed(0)}
          </span>
          <span className="text-sm font-bold text-teal-700">
            {(sample.optimizedScore * 100).toFixed(0)}
          </span>
          <span
            className={`text-[10px] font-semibold ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}
          >
            {delta >= 0 ? "+" : ""}
            {(delta * 100).toFixed(0)}
          </span>
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Input</div>
            <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap">
              {firstVar}
            </div>
          </div>
          {sample.referenceResponse && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">
                Reference
              </div>
              <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap font-mono max-h-28 overflow-y-auto">
                {sample.referenceResponse}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[9px] uppercase tracking-widest text-slate-400">
                  Original response
                </div>
                <span className="text-[10px] font-semibold text-slate-400">
                  {(sample.originalScore * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {sample.originalResponse || "—"}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[9px] uppercase tracking-widest text-teal-600">
                  Optimized response
                </div>
                <span className="text-[10px] font-semibold text-teal-700">
                  {(sample.optimizedScore * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-[11px] text-slate-700 bg-teal-50/50 border border-teal-200 rounded p-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {sample.optimizedResponse || "—"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CREATE TAB ───────────────────────────────────────────────────────────────
interface Upload {
  s3Uri: string;
  templates: number;
  samples: number;
  firstPromptTemplate: string;
  existing?: boolean;
  name?: string;
}

function CreateTab({ onCancel, onCreate }: { onCancel: () => void; onCreate: (job: Job) => void }) {
  const [modality, setModality] = useState<ModalityId>("text");
  const [jobName, setJobName] = useState("ava-adpo-sample");
  // Short hex suffix appended to the job name for uniqueness, generated once
  // and shown in the Summary so the user sees the final submitted name.
  const [jobSuffix] = useState(() => Math.random().toString(16).slice(2, 8));
  const fullJobName = `${jobName.trim()}-${jobSuffix}`;

  // models — fetched from the backend (region-filtered: global + this region's
  // CRIS geography + in-region on-demand models). Selection may mix scopes.
  const [catalog, setCatalog] = useState<AdvPOModel[]>([]);
  const [catalogRegion, setCatalogRegion] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelCfgs, setModelCfgs] = useState<Record<string, ModelCfgForm>>({});
  const [customModel, setCustomModel] = useState("");
  const [addingModel, setAddingModel] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [expandedCfg, setExpandedCfg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    advpoApi
      .listModels()
      .then((res) => {
        if (!active) return;
        setCatalog(filterAdvPOModels(res.models));
        setCatalogRegion(res.region);
        setCatalogError("");
      })
      .catch(
        (e) => active && setCatalogError(e instanceof Error ? e.message : "Failed to load models."),
      )
      .finally(() => active && setCatalogLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Group the catalog by scope for the picker.
  const grouped = useMemo(() => {
    const g: Record<AdvPOModelScope, AdvPOModel[]> = { global: [], regional: [], in_region: [] };
    for (const m of catalog) g[m.scope].push(m);
    return g;
  }, [catalog]);
  const catalogIds = useMemo(() => new Set(catalog.map((m) => m.id)), [catalog]);
  const catalogName = (id: string) => catalog.find((m) => m.id === id)?.name ?? id;

  // dataset (built or uploaded via DatasetBuilder)
  const [upload, setUpload] = useState<Upload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Results location + encryption are managed internally by the platform.
  // The backend writes job output to the dedicated `results/` prefix.
  const outputS3 = "(platform-managed · results/)";
  const kms = KMS_KEYS[0].id;

  const isTextReady = modality === "text";
  const activeModality = MODALITIES.find((m) => m.id === modality)!;

  const errors: string[] = [];
  if (!jobName.trim()) errors.push("Job name is required.");
  if (models.length === 0) errors.push("Select at least one target model.");
  if (models.length > LIMITS.modelsPerJob)
    errors.push(`Max ${LIMITS.modelsPerJob} models per job.`);
  if (!upload) errors.push("Build or upload a dataset, then confirm it.");
  // Validate per-model optional config (e.g. additional fields JSON).
  models.forEach((id) => {
    const { error } = buildModelConfig(id, modelCfgs[id]);
    if (error) errors.push(`${catalogName(id)}: ${error}`);
  });
  const canSubmit = isTextReady && errors.length === 0 && !submitting;

  const handleDataset = (result: DatasetResult) => {
    setUpload({
      s3Uri: result.s3Uri,
      templates: result.templates,
      samples: result.samples,
      firstPromptTemplate: result.firstPromptTemplate,
      existing: result.existing,
      name: result.name,
    });
  };

  const submit = async () => {
    if (!canSubmit || !upload) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const model_configurations = models.map((id) => buildModelConfig(id, modelCfgs[id]).config);
      const summary = await advpoApi.createJob({
        job_name: fullJobName,
        input_s3_uri: upload.s3Uri,
        model_configurations,
        encryption_key_arn: kms === "aws-managed" ? undefined : kms,
      });
      onCreate({
        arn: summary.job_arn,
        name: summary.job_name,
        status: mapAdvPOStatus(summary.status),
        models,
        createdAt: "just now",
        inputS3: upload.s3Uri,
        outputS3,
        kms,
        originalTemplate: upload.firstPromptTemplate,
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to create optimization job.");
    } finally {
      setSubmitting(false);
    }
  };

  const addCustomModel = () => {
    const id = customModel.trim();
    if (!id || models.includes(id) || models.length >= LIMITS.modelsPerJob) return;
    setModels([...models, id]);
    setCustomModel("");
    setAddingModel(false);
  };
  const toggleModel = (id: string) =>
    setModels((prev) => {
      if (prev.includes(id)) {
        if (expandedCfg === id) setExpandedCfg(null);
        return prev.filter((m) => m !== id);
      }
      if (prev.length >= LIMITS.modelsPerJob) return prev;
      return [...prev, id];
    });
  const updateModelCfg = (id: string, patch: Partial<ModelCfgForm>) =>
    setModelCfgs((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyModelCfg()), ...patch } }));

  return (
    <div className="animate-fade-in stagger-2">
      {/* Modality */}
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
          Input modality
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {MODALITIES.map((m) => {
            const active = m.id === modality;
            const disabled = m.status === "coming_soon";
            return (
              <button
                key={m.id}
                onClick={() => !disabled && setModality(m.id)}
                disabled={disabled}
                className={`relative text-left rounded-xl border p-3.5 transition-all ${active ? "bg-white border-teal-400 shadow-sm ring-1 ring-teal-200" : disabled ? "bg-slate-50/70 border-slate-200 cursor-not-allowed opacity-70" : "bg-white/80 border-slate-200 hover:border-teal-300 hover:shadow-sm"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${active ? "bg-teal-100" : "bg-slate-100"}`}
                  >
                    <svg
                      className={`w-5 h-5 ${active ? "text-teal-600" : "text-slate-400"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                    </svg>
                  </div>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${m.status === "coming_soon" ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
                  >
                    {m.status === "coming_soon" ? "soon" : "ready"}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-800">{m.label}</div>
                <div className="text-[11px] text-slate-500 font-mono">{m.note}</div>
              </button>
            );
          })}
        </div>
      </div>

      {!isTextReady ? (
        <div className="card bg-white/80 border-slate-200 text-center py-16">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={activeModality.icon} />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-700">
            {activeModality.label} optimization is coming soon
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            AdvPO accepts {activeModality.label.toLowerCase()} via{" "}
            <code className="font-mono text-xs bg-slate-100 px-1 rounded">
              inputVariablesMultimodal
            </code>{" "}
            (max {LIMITS.multimodalPerSample} files/sample). For now, switch to{" "}
            <button
              onClick={() => setModality("text")}
              className="text-teal-700 font-semibold hover:underline"
            >
              Text
            </button>
            .
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* Job name */}
            <section className="card bg-white/90 border-slate-200">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Job</h3>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Job name</label>
              <input
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:border-teal-400 transition-colors"
              />
            </section>

            {/* Input dataset — build manually or drag & drop to pre-populate */}
            <section className="card bg-white/90 border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-slate-800">Input dataset</h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  JSONL · version {DATASET_VERSION}
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Drag & drop a JSONL file to pre-fill the editor, or build one from scratch. On
                confirm it uploads to S3 and becomes the job&rsquo;s{" "}
                <code className="font-mono bg-slate-100 px-1 rounded">inputConfig.s3Uri</code>.
              </p>

              <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">
                Datasets are stored under the platform-managed{" "}
                <code className="font-mono bg-white px-1 rounded border border-slate-200">
                  datasets/
                </code>{" "}
                prefix with a unique suffix; results are written to{" "}
                <code className="font-mono bg-white px-1 rounded border border-slate-200">
                  results/
                </code>
                .
              </div>

              {!upload ? (
                <DatasetBuilder onConfirm={handleDataset} />
              ) : (
                <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-5 h-5 text-teal-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800">
                        {upload.existing ? "Existing dataset selected" : "Dataset uploaded"}
                      </div>
                      {upload.existing ? (
                        <div className="text-[11px] text-slate-500 font-mono truncate">
                          {upload.name}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          {upload.templates} template{upload.templates !== 1 ? "s" : ""} ·{" "}
                          {upload.samples} sample{upload.samples !== 1 ? "s" : ""}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400 font-mono mt-1 truncate">
                        {upload.s3Uri}
                      </div>
                    </div>
                    <button
                      onClick={() => setUpload(null)}
                      className="text-xs font-medium text-slate-400 hover:text-rose-600 flex-shrink-0"
                    >
                      {upload.existing ? "Change" : "Edit dataset"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Target models */}
            <section className="card bg-white/90 border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-slate-800">Target models</h3>
                <span className="text-[10px] text-slate-400">
                  {models.length}/{LIMITS.modelsPerJob}
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                The model whose prompt you&rsquo;re optimizing. Pick up to {LIMITS.modelsPerJob};
                the <span className="font-semibold text-teal-700">first becomes the baseline</span>{" "}
                for migration comparisons. You can mix global, regional (CRIS), and in-region
                models.
              </p>

              {/* Region note — backend determines which CRIS geography is shown */}
              <div className="flex items-center gap-2 mb-3 text-[10px] text-slate-400">
                <span className="font-bold uppercase tracking-widest">AWS region</span>
                <span className="font-mono text-slate-600">{catalogRegion || "…"}</span>
                <span className="text-slate-300">·</span>
                <span>global + in-region geography profiles only</span>
              </div>

              {catalogLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
                  <div className="w-4 h-4 rounded-full border-2 border-teal-200 border-t-teal-600 animate-spin" />
                  Loading available models…
                </div>
              ) : catalogError ? (
                <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {catalogError}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Selected models (on top) with optional per-model config */}
                  {models.length === 0 ? (
                    <div className="text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-4 text-center">
                      No models selected yet. Use “Browse models” below to add up to{" "}
                      {LIMITS.modelsPerJob}.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Selected ({models.length})
                      </div>
                      {models.map((id) => {
                        const isBaseline = models[0] === id;
                        const isCustom = !catalogIds.has(id);
                        const open = expandedCfg === id;
                        const cfg = modelCfgs[id];
                        const summary = cfgSummary(cfg);
                        return (
                          <div
                            key={id}
                            className="rounded-lg border border-teal-200 bg-teal-50/40 overflow-hidden"
                          >
                            <div className="flex items-center gap-2 px-2.5 py-1.5">
                              <span className="text-xs font-semibold text-slate-800 truncate flex-1">
                                {catalogName(id)}
                                {isBaseline && (
                                  <span className="ml-1.5 text-[8px] font-bold uppercase text-teal-600">
                                    baseline
                                  </span>
                                )}
                                {isCustom && (
                                  <span className="ml-1.5 text-[8px] font-bold uppercase text-slate-400">
                                    custom
                                  </span>
                                )}
                                {summary && (
                                  <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                                    · {summary}
                                  </span>
                                )}
                              </span>
                              <button
                                onClick={() => setExpandedCfg(open ? null : id)}
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${open ? "text-teal-700 bg-teal-100" : "text-slate-500 hover:text-teal-700"}`}
                              >
                                Config
                              </button>
                              <button
                                onClick={() => toggleModel(id)}
                                className="text-slate-400 hover:text-rose-600 text-sm leading-none"
                                aria-label={`Remove ${id}`}
                              >
                                ×
                              </button>
                            </div>
                            {open && (
                              <ModelConfigEditor
                                cfg={cfg ?? emptyModelCfg()}
                                onChange={(patch) => updateModelCfg(id, patch)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Collapsible catalog browser */}
                  <div className="rounded-lg border border-slate-200">
                    <button
                      onClick={() => setBrowseOpen((o) => !o)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left"
                    >
                      <span className="text-xs font-semibold text-slate-700">
                        Browse models{" "}
                        <span className="text-slate-400 font-normal">({catalog.length})</span>
                      </span>
                      <svg
                        className={`w-4 h-4 text-slate-400 transition-transform ${browseOpen ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {browseOpen && (
                      <div className="border-t border-slate-100 p-3 space-y-3 max-h-80 overflow-y-auto">
                        {SCOPE_ORDER.map((scope) => {
                          const items = grouped[scope];
                          if (items.length === 0) return null;
                          return (
                            <div key={scope}>
                              <div className="flex items-baseline gap-2 mb-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                  {SCOPE_META[scope].label}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {SCOPE_META[scope].blurb}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {items.map((m) => {
                                  const on = models.includes(m.id);
                                  return (
                                    <button
                                      key={m.id}
                                      onClick={() => toggleModel(m.id)}
                                      title={m.id}
                                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${on ? "bg-teal-50 text-teal-700 border-teal-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
                                    >
                                      {m.name}
                                      {on && <span className="ml-1 text-teal-500">✓</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        {/* Add by ID for ARNs / unlisted models */}
                        <div className="pt-1">
                          {!addingModel ? (
                            <button
                              onClick={() => setAddingModel(true)}
                              disabled={models.length >= LIMITS.modelsPerJob}
                              className="text-[11px] px-2.5 py-1 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-teal-300 hover:text-teal-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              + Add by ID
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <input
                                autoFocus
                                value={customModel}
                                onChange={(e) => setCustomModel(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addCustomModel();
                                  }
                                  if (e.key === "Escape") {
                                    setAddingModel(false);
                                    setCustomModel("");
                                  }
                                }}
                                onBlur={() => {
                                  if (!customModel.trim()) setAddingModel(false);
                                }}
                                placeholder="model ID or inference profile ARN"
                                className="w-56 px-2.5 py-1 bg-white border border-teal-300 rounded-lg text-[11px] text-slate-800 outline-none focus:border-teal-400 transition-colors font-mono"
                              />
                              <button
                                onClick={addCustomModel}
                                disabled={!customModel.trim()}
                                className="text-[11px] px-2 py-1 rounded-lg bg-teal-600 text-white font-medium disabled:bg-slate-200 disabled:text-slate-400"
                              >
                                Add
                              </button>
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Sticky summary + submit */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">
              <section className="card bg-white/90 border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Summary</h3>
                <dl className="space-y-2 text-xs">
                  <Row k="Job" v={jobName.trim() ? fullJobName : "—"} />
                  <Row
                    k="Dataset"
                    v={
                      upload
                        ? upload.existing
                          ? (upload.name ?? "existing")
                          : `${upload.samples} samples`
                        : "not built yet"
                    }
                  />
                  <Row
                    k="Templates"
                    v={upload ? (upload.existing ? "—" : `${upload.templates}`) : "—"}
                  />
                  <Row k="Models" v={`${models.length} / ${LIMITS.modelsPerJob}`} />
                </dl>

                {models.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {models.map((id, i) => {
                      const summary = cfgSummary(modelCfgs[id]);
                      return (
                        <li
                          key={id}
                          className="flex items-start gap-1.5 text-[10px] text-slate-600"
                          title={id}
                        >
                          <span className="text-slate-300 mt-px">{i === 0 ? "★" : "•"}</span>
                          <span className="flex-1 min-w-0">
                            <span className="font-mono break-all">{id}</span>
                            {i === 0 && (
                              <span className="ml-1 text-[8px] font-bold uppercase text-teal-500">
                                baseline
                              </span>
                            )}
                            {summary && <span className="block text-slate-400">{summary}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg
                      className="w-3 h-3 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                      />
                    </svg>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Managed by platform
                    </span>
                  </div>
                  <dl className="space-y-2 text-xs">
                    <Row k="Output" v={outputS3} mono />
                    <Row k="KMS" v={KMS_KEYS.find((k) => k.id === kms)?.label ?? kms} />
                  </dl>
                </div>
              </section>

              {(errors.length > 0 || submitError) && (
                <div className="space-y-2">
                  {submitError && (
                    <div className="flex items-start gap-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      <svg
                        className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                        />
                      </svg>
                      {submitError}
                    </div>
                  )}
                  {errors.map((e) => (
                    <div
                      key={e}
                      className="flex items-start gap-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
                    >
                      <svg
                        className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                        />
                      </svg>
                      {e}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 py-3 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={!canSubmit}
                  className={`flex-[2] py-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${canSubmit ? "bg-teal-600 text-white hover:bg-teal-700 shadow-sm" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                    />
                  </svg>
                  {submitting ? "Creating…" : "Create job"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DATASETS TAB ─────────────────────────────────────────────────────────────
// Manage datasets in the bucket's datasets/ prefix: upload new ones (reusing
// the DatasetBuilder) and browse/delete existing ones (reusing DatasetList).
function DatasetsTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdvPODatasetItem | null>(null);
  const [actionError, setActionError] = useState("");

  const onUploaded = (result: DatasetResult) => {
    // Existing-dataset selections are a no-op here; only fresh uploads refresh.
    if (result.existing) return;
    setUploaded(result.s3Uri);
    setRefreshKey((k) => k + 1);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setActionError("");
    try {
      await advpoApi.deleteDataset(target.key);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete dataset.");
    }
  };

  return (
    <div className="animate-fade-in stagger-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Upload / build new */}
      <section className="card bg-white/90 border-slate-200">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Add a dataset</h3>
        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          Upload or build a JSONL evaluation dataset. It&rsquo;s stored under the platform-managed{" "}
          <code className="font-mono bg-slate-100 px-1 rounded">datasets/</code> prefix.
        </p>
        {uploaded && (
          <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3 font-mono truncate">
            Uploaded {uploaded}
          </div>
        )}
        <DatasetBuilder onConfirm={onUploaded} allowSelectExisting={false} />
      </section>

      {/* Existing datasets */}
      <section className="card bg-white/90 border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Existing datasets</h3>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-[11px] font-medium text-slate-500 hover:text-teal-700 border border-slate-200 rounded-lg px-2.5 py-1 transition-colors"
          >
            Refresh
          </button>
        </div>
        {actionError && (
          <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
            {actionError}
          </div>
        )}
        <DatasetList refreshKey={refreshKey} onDelete={setPendingDelete} />
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="danger"
        title="Delete dataset?"
        message={`This permanently deletes "${pendingDelete?.name ?? ""}" from the bucket. This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-400 flex-shrink-0">{k}</dt>
      <dd
        className={`text-slate-700 font-medium truncate ${mono ? "font-mono text-[10px]" : ""}`}
        title={v}
      >
        {v}
      </dd>
    </div>
  );
}

// Optional per-model InferenceConfig + additional model request fields editor.
function ModelConfigEditor({
  cfg,
  onChange,
}: {
  cfg: ModelCfgForm;
  onChange: (patch: Partial<ModelCfgForm>) => void;
}) {
  const num = (v: string) => v.replace(/[^0-9.\-]/g, "");
  return (
    <div className="border-t border-teal-100 bg-white/70 px-2.5 py-2.5 space-y-2">
      <div className="text-[9px] uppercase tracking-widest text-slate-400">
        Inference config (optional)
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[9px] text-slate-500">maxTokens</span>
          <input
            value={cfg.maxTokens}
            onChange={(e) => onChange({ maxTokens: num(e.target.value) })}
            inputMode="numeric"
            placeholder="e.g. 2048"
            className="w-full mt-0.5 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-800 outline-none focus:border-teal-400"
          />
        </label>
        <label className="block">
          <span className="text-[9px] text-slate-500">temperature</span>
          <input
            value={cfg.temperature}
            onChange={(e) => onChange({ temperature: num(e.target.value) })}
            inputMode="decimal"
            placeholder="0–1"
            className="w-full mt-0.5 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-800 outline-none focus:border-teal-400"
          />
        </label>
        <label className="block">
          <span className="text-[9px] text-slate-500">topP</span>
          <input
            value={cfg.topP}
            onChange={(e) => onChange({ topP: num(e.target.value) })}
            inputMode="decimal"
            placeholder="0–1"
            className="w-full mt-0.5 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-800 outline-none focus:border-teal-400"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-[9px] text-slate-500">stopSequences (comma-separated)</span>
        <input
          value={cfg.stopSequences}
          onChange={(e) => onChange({ stopSequences: e.target.value })}
          placeholder="e.g. END, ###"
          className="w-full mt-0.5 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-800 outline-none focus:border-teal-400 font-mono"
        />
      </label>
      <label className="block">
        <span className="text-[9px] text-slate-500">
          additionalModelRequestFields (JSON object)
        </span>
        <textarea
          value={cfg.additionalFields}
          onChange={(e) => onChange({ additionalFields: e.target.value })}
          rows={3}
          placeholder='{ "anthropic_beta": ["..."], "top_k": 250 }'
          className="w-full mt-0.5 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-800 outline-none focus:border-teal-400 font-mono"
        />
      </label>
    </div>
  );
}
