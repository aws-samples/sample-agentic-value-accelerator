"use client";

import * as React from "react";
import { Box, CircularProgress, Typography } from "@mui/material";

import { initializeAmplify, isAmplifyConfigured } from "./amplifyConfig";
import { authService, type AuthUser } from "./authService";
import LoginPage from "@/components/LoginPage";

interface AuthContextValue {
  user: AuthUser | null;
  authEnabled: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue>({
  user: null,
  authEnabled: false,
  signOut: async () => {},
});

export const useAuthContext = () => React.useContext(AuthContext);

type Phase = "init" | "login" | "ready";

/**
 * Gates the app behind Cognito login WHEN Cognito is configured (NEXT_PUBLIC_COGNITO_*
 * present). If it isn't configured (e.g. local dev with no Cognito), the gate is
 * bypassed and the app renders open - preserving the current behavior.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = React.useState<Phase>("init");
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [authEnabled, setAuthEnabled] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const current = await authService.getCurrentUser();
    setUser(current);
    setPhase(current ? "ready" : "login");
  }, []);

  React.useEffect(() => {
    (async () => {
      await initializeAmplify();
      if (!isAmplifyConfigured()) {
        // No Cognito configured - run open (current behavior).
        setAuthEnabled(false);
        setPhase("ready");
        return;
      }
      setAuthEnabled(true);
      await refresh();
    })();
  }, [refresh]);

  const signOut = React.useCallback(async () => {
    await authService.signOut();
    setUser(null);
    setPhase("login");
  }, []);

  if (phase === "init") {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
        <CircularProgress />
        <Typography color="text.secondary" variant="body2">Initializing...</Typography>
      </Box>
    );
  }

  if (phase === "login") {
    return <LoginPage onSignedIn={refresh} />;
  }

  return (
    <AuthContext.Provider value={{ user, authEnabled, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
