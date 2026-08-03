"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { authService } from "@/lib/auth/authService";
import { initializeAmplify, isAmplifyConfigured } from "@/lib/auth/amplifyConfig";
import { AWS_NAV, AWS_ORANGE } from "@/theme";

/** AWS-dark login screen matching the app shell. */
export default function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!isAmplifyConfigured()) await initializeAmplify();
      const result = await authService.signIn(username, password);
      if (result.success) {
        onSignedIn();
      } else {
        setError(result.error || "Failed to sign in. Check your credentials.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: AWS_NAV,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
      }}
    >
      <Paper sx={{ p: 4, width: "100%", maxWidth: 400 }}>
        <Stack spacing={0.5} sx={{ mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Payments Fraud
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Multi-Agent Scoring &amp; Investigation
          </Typography>
          <Box sx={{ height: 3, width: 48, bgcolor: AWS_ORANGE, mt: 1, borderRadius: 1 }} />
        </Stack>

        <form onSubmit={handleLogin}>
          <Stack spacing={2}>
            <TextField
              label="Username or email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              fullWidth
              size="small"
              autoFocus
              autoComplete="username"
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              size="small"
              autoComplete="current-password"
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={loading || !username || !password}>
              {loading ? <CircularProgress size={22} /> : "Sign in"}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
