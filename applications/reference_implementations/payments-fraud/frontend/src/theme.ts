"use client";

import { createTheme } from "@mui/material/styles";

/**
 * MUI theme matching the case-management reference app's AWS-dark aesthetic
 * (#131921 nav, #FF9900 accent), so the two fraud apps read as siblings.
 */
export const AWS_NAV = "#131921";
export const AWS_ORANGE = "#FF9900";

const theme = createTheme({
  palette: {
    primary: { main: AWS_ORANGE, contrastText: "#131921" },
    secondary: { main: "#146EB4" },
    success: { main: "#1D8102" },
    warning: { main: "#B7791F" },
    error: { main: "#D13212" },
    background: { default: "#f3f3f3", paper: "#ffffff" },
  },
  typography: {
    fontFamily:
      '"Amazon Ember", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  shape: { borderRadius: 8 },
});

export default theme;
