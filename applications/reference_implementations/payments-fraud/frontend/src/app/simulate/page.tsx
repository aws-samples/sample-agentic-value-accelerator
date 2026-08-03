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
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

type Decision = "approve" | "step_up_review" | "hold_and_case";

interface ScoreResult {
  transaction_id: string;
  fraud_score: number;
  risk_level: string;
  decision: Decision;
  reason_tags: string[];
  risk_factors: string[];
  recommended_action: string;
}

const NETWORKS = ["ach", "wire", "swift", "card", "rtp", "internal"];

// Pre-filled with the A801 mule fan-in scenario so the page demos immediately.
const DEFAULTS = {
  transaction_id: "TXN_MULE_1",
  account_id: "A801",
  amount: "1890.00",
  network: "ach",
  counterparty_id: "A101",
  device_id: "web-7777",
};

const DECISION_COLOR: Record<Decision, "success" | "warning" | "error"> = {
  approve: "success",
  step_up_review: "warning",
  hold_and_case: "error",
};

export default function SimulatePage() {
  const [form, setForm] = React.useState(DEFAULTS);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<ScoreResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const set = (k: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function score() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const transaction = {
        transaction_id: form.transaction_id,
        account_id: form.account_id,
        timestamp: new Date().toISOString(),
        amount: parseFloat(form.amount),
        currency: "USD",
        network: form.network,
        counterparty: { counterparty_id: form.counterparty_id },
        channel: "web",
        device_id: form.device_id,
      };
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "score", account_id: form.account_id, transaction }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "scoring failed");
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
        Simulate a Payment
      </Typography>
      <Typography color="text.secondary">
        Score a single incoming payment in real time.
      </Typography>
      <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 600, display: "block", mb: 2 }}>
        ⚡ Powered by the Transaction Scorer agent
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        The score reflects the <strong>account&apos;s full history and risk profile</strong>,
        not just this single payment - so a known-risk account (e.g. the mule account
        A801) stays high-risk regardless of amount. Try a clean account like{" "}
        <strong>A150</strong> or <strong>A160</strong> to see the amount drive the
        decision (small → approve, very large → step-up / hold).
      </Alert>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <TextField label="Transaction ID" value={form.transaction_id} onChange={set("transaction_id")} fullWidth size="small" />
              <TextField label="Account ID" value={form.account_id} onChange={set("account_id")} fullWidth size="small" />
              <TextField label="Amount (USD)" value={form.amount} onChange={set("amount")} fullWidth size="small" type="number" />
              <TextField label="Network" value={form.network} onChange={set("network")} select fullWidth size="small">
                {NETWORKS.map((n) => (
                  <MenuItem key={n} value={n}>{n}</MenuItem>
                ))}
              </TextField>
              <TextField label="Counterparty ID" value={form.counterparty_id} onChange={set("counterparty_id")} fullWidth size="small" />
              <TextField label="Device ID" value={form.device_id} onChange={set("device_id")} fullWidth size="small" />
              <Button variant="contained" onClick={score} disabled={loading} size="large">
                {loading ? <CircularProgress size={22} /> : "Score transaction"}
              </Button>
              {loading && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  Scoring against the account&apos;s history... (~10s)
                </Typography>
              )}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          {error && (
            <Paper sx={{ p: 3, borderLeft: "4px solid", borderColor: "error.main" }}>
              <Typography color="error" fontWeight={600}>Error</Typography>
              <Typography variant="body2">{error}</Typography>
            </Paper>
          )}

          {result && (
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                  <Chip
                    label={result.decision?.replace(/_/g, " ").toUpperCase()}
                    color={DECISION_COLOR[result.decision] ?? "default"}
                    sx={{ fontWeight: 700 }}
                  />
                  <Typography variant="h6">
                    Score {(result.fraud_score * 100).toFixed(0)}%
                  </Typography>
                  <Typography color="text.secondary">· {result.risk_level}</Typography>
                </Stack>

                {result.reason_tags?.length > 0 && (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                    {result.reason_tags.map((t) => (
                      <Chip key={t} label={t} size="small" variant="outlined" />
                    ))}
                  </Stack>
                )}

                {result.risk_factors?.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2">Risk factors</Typography>
                    <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                      {result.risk_factors.map((f, i) => (
                        <li key={i}><Typography variant="body2">{f}</Typography></li>
                      ))}
                    </ul>
                  </Box>
                )}

                <Typography variant="subtitle2">Recommended action</Typography>
                <Typography variant="body2">{result.recommended_action}</Typography>
              </CardContent>
            </Card>
          )}

          {!result && !error && !loading && (
            <Paper sx={{ p: 3, color: "text.secondary" }}>
              <Typography variant="body2">
                Submit a payment to see its fraud score, decision, and reasoning.
                The form is pre-filled with the A801 mule fan-in scenario.
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
