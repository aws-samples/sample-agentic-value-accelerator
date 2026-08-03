"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Button, List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import ScoreIcon from "@mui/icons-material/Speed";
import SearchIcon from "@mui/icons-material/TravelExplore";
import DescriptionIcon from "@mui/icons-material/Description";
import LogoutIcon from "@mui/icons-material/Logout";

import { AWS_NAV, AWS_ORANGE } from "@/theme";
import { useAuthContext } from "@/lib/auth/AuthGate";

const NAV_HEIGHT = 64;
const SIDEBAR_WIDTH = 220;

const NAV_ITEMS = [
  { href: "/simulate", label: "Simulate", icon: <ScoreIcon /> },
  { href: "/investigate", label: "Investigate", icon: <SearchIcon /> },
  { href: "/sar", label: "SAR Report", icon: <DescriptionIcon /> },
];

/** App shell: fixed AWS-dark header + left nav, matching the case-management look. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, authEnabled, signOut } = useAuthContext();

  return (
    <Box sx={{ minHeight: "100vh" }}>
      {/* Header */}
      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: NAV_HEIGHT,
          bgcolor: AWS_NAV,
          borderBottom: `3px solid ${AWS_ORANGE}`,
          display: "flex",
          alignItems: "center",
          px: 3,
          zIndex: 1200,
        }}
      >
        <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>
          Payments Fraud
        </Typography>
        <Typography sx={{ color: "#bbb", ml: 1.5, fontSize: 13 }}>
          Multi-Agent Scoring &amp; Investigation
        </Typography>

        {authEnabled && user && (
          <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1.5 }}>
            <Typography sx={{ color: "#d5dbdb", fontSize: 13 }}>
              {user.email || user.username}
            </Typography>
            <Button
              size="small"
              onClick={signOut}
              startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
              sx={{ color: "#d5dbdb", textTransform: "none", "&:hover": { color: AWS_ORANGE } }}
            >
              Sign out
            </Button>
          </Box>
        )}
      </Box>

      {/* Sidebar */}
      <Box
        component="nav"
        sx={{
          position: "fixed",
          top: NAV_HEIGHT,
          left: 0,
          bottom: 0,
          width: SIDEBAR_WIDTH,
          bgcolor: AWS_NAV,
          pt: 1,
        }}
      >
        <List disablePadding>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                selected={active}
                sx={{
                  color: active ? AWS_ORANGE : "#d5dbdb",
                  borderLeft: active ? `3px solid ${AWS_ORANGE}` : "3px solid transparent",
                  "&.Mui-selected": { bgcolor: "rgba(255,153,0,0.08)" },
                  "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                }}
              >
                <ListItemIcon sx={{ color: "inherit", minWidth: 38 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            );
          })}
        </List>
      </Box>

      {/* Main */}
      <Box
        component="main"
        sx={{
          ml: `${SIDEBAR_WIDTH}px`,
          mt: `${NAV_HEIGHT}px`,
          p: 3,
          minHeight: `calc(100vh - ${NAV_HEIGHT}px)`,
          bgcolor: "background.default",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
