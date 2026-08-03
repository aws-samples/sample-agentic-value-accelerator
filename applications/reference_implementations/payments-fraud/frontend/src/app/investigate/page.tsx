"use client";

import * as React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

interface DetectedPattern {
  pattern: string;
  confidence: number;
  description: string;
  supporting_transaction_ids?: string[];
}
interface EvidenceItem {
  source: string;
  reference_id?: string;
  description: string;
}
interface RiskAssessment {
  score: number;
  level: string;
  factors?: string[];
}
interface InvestigationResult {
  case_id: string;
  account_id?: string;
  narrative: string;
  detected_patterns?: DetectedPattern[];
  entities_of_interest?: string[];
  risk_assessment?: RiskAssessment;
  evidence?: EvidenceItem[];
  recommended_next_steps?: string[];
  escalation?: string;
}

const SUGGESTIONS = [
  { account: "A705", q: "What suspicious activity do you see on this account?" },
  { account: "A305", q: "Analyze this account; is there any unusual behavior?" },
  { account: "A801", q: "What's happening here? Show me incoming transactions." },
];

const ESCALATION_COLOR: Record<string, "default" | "warning" | "error"> = {
  no_action: "default",
  monitor: "warning",
  escalate_to_sar: "error",
};

export default function InvestigatePage() {
  const [accountId, setAccountId] = React.useState("A705");
  const [query, setQuery] = React.useState(SUGGESTIONS[0].q);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<InvestigationResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function investigate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "investigate", account_id: accountId, prompt: query }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "investigation failed");
      if (json.result?.error) throw new Error(json.result.detail || "agent validation failed");
      setResult(json.result?.result ?? json.result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ maxWidth: 1000 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Investigate
      </Typography>
      <Typography color="text.secondary">
        Ask about an account in natural language.
      </Typography>
      <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 600, display: "block", mb: 3 }}>
        ⚡ Powered by the Investigation agent
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Account ID"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              size="small"
              sx={{ width: 160 }}
            />
            <TextField
              label="Question"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              size="small"
              fullWidth
              multiline
            />
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
            <Typography variant="caption" color="text.secondary">Try:</Typography>
            {SUGGESTIONS.map((s) => (
              <Chip
                key={s.account}
                label={s.account}
                size="small"
                variant="outlined"
                onClick={() => { setAccountId(s.account); setQuery(s.q); }}
              />
            ))}
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button variant="contained" onClick={investigate} disabled={loading} size="large">
              {loading ? <CircularProgress size={22} /> : "Investigate"}
            </Button>
            {loading && (
              <Typography variant="body2" color="text.secondary">
                Investigating... pulling the account profile, transactions and counterparty
                links, then reasoning over them. This usually takes ~30s.
              </Typography>
            )}
          </Stack>
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
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              <Typography variant="h6">{result.case_id}</Typography>
              {result.risk_assessment && (
                <Typography color="text.secondary">
                  risk {(result.risk_assessment.score * 100).toFixed(0)}% · {result.risk_assessment.level}
                </Typography>
              )}
              {result.escalation && (
                <Chip
                  label={result.escalation.replace(/_/g, " ")}
                  color={ESCALATION_COLOR[result.escalation] ?? "default"}
                  size="small"
                  sx={{ fontWeight: 700 }}
                />
              )}
            </Stack>

            <Typography variant="subtitle2">Narrative</Typography>
            <Typography variant="body2" sx={{ mb: 2, whiteSpace: "pre-wrap" }}>
              {result.narrative}
            </Typography>

            {result.detected_patterns && result.detected_patterns.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Detected patterns</Typography>
                <Stack spacing={1}>
                  {result.detected_patterns.map((p, i) => (
                    <Box key={i}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={p.pattern} size="small" color="error" variant="outlined" />
                        <Typography variant="caption" color="text.secondary">
                          {(p.confidence * 100).toFixed(0)}% confidence
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{p.description}</Typography>
                    </Box>
                  ))}
                </Stack>
              </>
            )}

            {result.evidence && result.evidence.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Evidence</Typography>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {result.evidence.map((ev, i) => (
                    <li key={i}>
                      <Typography variant="body2">
                        <strong>{ev.source}</strong>
                        {ev.reference_id ? ` (${ev.reference_id})` : ""}: {ev.description}
                      </Typography>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {result.recommended_next_steps && result.recommended_next_steps.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Recommended next steps</Typography>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {result.recommended_next_steps.map((s, i) => (
                    <li key={i}><Typography variant="body2">{s}</Typography></li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!result && !error && !loading && (
        <Paper sx={{ p: 3, color: "text.secondary" }}>
          <Typography variant="body2">
            Pick an account and ask a question. The agent pulls transactions and
            counterparty links, detects fraud typologies, and compiles cited evidence.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
