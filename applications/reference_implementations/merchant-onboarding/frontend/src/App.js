import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, CircularProgress, Typography, Button, AppBar, Toolbar } from '@mui/material';
import Dashboard from './components/Dashboard';
import MerchantDetail from './components/CustomerDetail';
import { getUser, login, logout, authEnabled } from './auth';
import './App.css';

const theme = createTheme({
  palette: {
    primary: {
      main: '#667eea',
      light: '#8fa4f1',
      dark: '#4c63d2',
    },
    secondary: {
      main: '#764ba2',
      light: '#9a6bb8',
      dark: '#5a3a7a',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          border: '1px solid rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
        },
      },
    },
  },
});

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUser()
      .then((u) => setUser(u))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" flexDirection="column" gap={2}>
          <CircularProgress />
          <Typography>Authenticating...</Typography>
        </Box>
      </ThemeProvider>
    );
  }

  if (!user) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" flexDirection="column" gap={2}>
          <Typography variant="h5">Please sign in to continue</Typography>
          <Button variant="contained" onClick={login}>Sign In with Midway</Button>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static" sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Merchant Onboarding</Typography>
          {authEnabled && (
            <>
              <Typography variant="body2" sx={{ mr: 2 }}>{user.username}</Typography>
              <Button color="inherit" onClick={logout} size="small">Sign Out</Button>
            </>
          )}
        </Toolbar>
      </AppBar>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customer/:id" element={<MerchantDetail />} />
          </Routes>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
