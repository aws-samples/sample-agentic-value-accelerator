import * as React from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";

import theme from "@/theme";
import AppShell from "@/components/AppShell";
import AuthGate from "@/lib/auth/AuthGate";

export const metadata = {
  title: "Payments Fraud - Multi-Agent Scoring & Investigation",
  description:
    "AVA reference app: real-time fraud scoring, investigation, and SAR drafting, powered by a multi-agent system (supervisor + specialist agents) on Bedrock AgentCore.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <AppRouterCacheProvider options={{ key: "mui" }}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <AuthGate>
              <AppShell>{children}</AppShell>
            </AuthGate>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
