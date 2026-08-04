"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

interface SubjectInformation {
  subject_id: string;
  full_name?: string;
  relationship_to_institution?: string;
  account_numbers_masked?: string[];
  address?: string;
}
interface SuspiciousActivity {
  activity_start_date?: string;
  activity_end_date?: string;
  total_amount?: number;
  currency?: string;
  patterns?: string[];
  instruments_involved?: string[];
}
interface SARReport {
  sar_id: string;
  case_id: string;
  filer_information?: { institution_name?: string; contact_name?: string };
  subjects?: SubjectInformation[];
  suspicious_activity?: SuspiciousActivity;
  narrative: string;
  filing_recommendation?: string;
}

const FILING_COLOR: Record<string, "success" | "warning" | "error"> = {
  file: "error",
  do_not_file: "success",
  needs_human_review: "warning",
};

export default function SarPage() {
  const [caseId, setCaseId] = React.useState("CASE-A801-001");
  const [accountId, setAccountId] = React.useState("A801");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<SARReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sar",
          case_id: caseId,
          subject_account_id: accountId,
          prompt: `Draft a SAR for the suspicious activity on account ${accountId}.`,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "SAR generation failed");
      if (json.result?.error) throw new Error(json.result.detail || "agent validation failed");
      setResult(json.result?.result ?? json.result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const sa = result?.suspicious_activity;

  return (
    <Box sx={{ maxWidth: 1000 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        SAR Report
      </Typography>
      <Typography color="text.secondary">
        Draft a FinCEN-structured Suspicious Activity Report from a case&apos;s findings.
      </Typography>
      <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 600, display: "block", mb: 3 }}>
        ⚡ Powered by the SAR Report agent
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField label="Case ID" value={caseId} onChange={(e) => setCaseId(e.target.value)} size="small" />
          <TextField label="Subject Account" value={accountId} onChange={(e) => setAccountId(e.target.value)} size="small" sx={{ width: 160 }} />
          <Button variant="contained" onClick={generate} disabled={loading} size="large">
            {loading ? <CircularProgress size={22} /> : "Generate SAR draft"}
          </Button>
          {loading && (
            <Typography variant="body2" color="text.secondary">
              Drafting the SAR from the case findings... this usually takes ~30s.
            </Typography>
          )}
        </Stack>
      </Paper>

      {error && (
        <Paper sx={{ p: 3, borderLeft: "4px solid", borderColor: "error.main", mb: 3 }}>
          <Typography color="error" fontWeight={600}>Error</Typography>
          <Typography variant="body2">{error}</Typography>
        </Paper>
      )}

      {result && (
        <Card>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
              <Typography variant="h6">{result.sar_id}</Typography>
              {result.filing_recommendation && (
                <Chip
                  label={result.filing_recommendation.replace(/_/g, " ")}
                  color={FILING_COLOR[result.filing_recommendation] ?? "default"}
                  size="small"
                  sx={{ fontWeight: 700 }}
                />
              )}
            </Stack>

            <Alert severity="info" sx={{ mb: 2 }}>
              Draft for analyst review - this report is not filed automatically.
            </Alert>

            <Grid container spacing={2} sx={{ mb: 1 }}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2">Filer</Typography>
                <Typography variant="body2">
                  {result.filer_information?.institution_name ?? "—"}
                </Typography>
              </Grid>
              {sa && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2">Suspicious activity</Typography>
                  <Typography variant="body2">
                    {sa.total_amount != null ? `${sa.currency ?? "USD"} ${sa.total_amount.toLocaleString()}` : "—"}
                    {sa.activity_start_date ? ` · ${sa.activity_start_date}` : ""}
                    {sa.activity_end_date && sa.activity_end_date !== sa.activity_start_date ? ` → ${sa.activity_end_date}` : ""}
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {(sa.patterns ?? []).map((p) => (
                      <Chip key={p} label={p} size="small" variant="outlined" />
                    ))}
                    {(sa.instruments_involved ?? []).map((n) => (
                      <Chip key={n} label={n} size="small" />
                    ))}
                  </Stack>
                </Grid>
              )}
            </Grid>

            {result.subjects && result.subjects.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Subjects</Typography>
                <Stack spacing={0.5}>
                  {result.subjects.map((s, i) => (
                    <Typography key={i} variant="body2">
                      <strong>{s.subject_id}</strong>
                      {s.full_name ? ` - ${s.full_name}` : ""}
                      {s.relationship_to_institution ? ` (${s.relationship_to_institution})` : ""}
                      {s.account_numbers_masked?.length ? ` · ${s.account_numbers_masked.join(", ")}` : ""}
                    </Typography>
                  ))}
                </Stack>
              </>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Narrative</Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {result.narrative}
            </Typography>
          </CardContent>
        </Card>
      )}

      {!result && !error && !loading && (
        <Paper sx={{ p: 3, color: "text.secondary" }}>
          <Typography variant="body2">
            Generate a draft SAR for a case. The agent produces the FinCEN 5 W&apos;s + how
            narrative, subjects, and suspicious-activity summary - always for human review,
            never auto-filed.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
