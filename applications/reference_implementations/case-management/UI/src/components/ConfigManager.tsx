import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import { getConfig, reloadConfig } from '../config.js';

const ConfigManager: React.FC = () => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'success' | 'warning' | 'error'>('info');

  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = () => {
    try {
      const currentConfig = getConfig();
      if (currentConfig) {
        setConfig(currentConfig);
      } else {
        setMessage('Configuration not loaded. Check if config.json exists.');
        setMessageType('error');
      }
    } catch (error) {
      setMessage(`Error loading configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setMessageType('error');
    }
  };

  const handleConfigChange = (key: string, value: any) => {
    setConfig((prev: any) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleDevSettingsChange = (key: string, value: any) => {
    setConfig((prev: any) => ({
      ...prev,
      DEV_SETTINGS: {
        ...prev.DEV_SETTINGS,
        [key]: value
      }
    }));
  };

  const handleUISettingsChange = (key: string, value: any) => {
    setConfig((prev: any) => ({
      ...prev,
      UI_SETTINGS: {
        ...prev.UI_SETTINGS,
        [key]: value
      }
    }));
  };

  const saveConfig = async () => {
    setLoading(true);
    try {
      const configToSave = {
        API_BASE_URL: config.API_BASE_URL,
        ENABLE_API_CALLS: config.ENABLE_API_CALLS,
        DEV_SETTINGS: {
          LOG_API_CALLS: config.DEV_SETTINGS.LOG_API_CALLS,
          TIMEOUT: config.DEV_SETTINGS.TIMEOUT,
          USE_CORS_PROXY: config.DEV_SETTINGS.USE_CORS_PROXY
        },
        UI_SETTINGS: {
          THEME: config.UI_SETTINGS.THEME,
          SIDEBAR_WIDTH: config.UI_SETTINGS.SIDEBAR_WIDTH,
          HEADER_HEIGHT: config.UI_SETTINGS.HEADER_HEIGHT,
          ENABLE_REFRESH: config.UI_SETTINGS.ENABLE_REFRESH
        }
      };

      // In development mode, we can't write back to the file
      // So we'll just update the in-memory configuration
      if (process.env.NODE_ENV === 'development') {
        // Reload configuration in the app
        reloadConfig();
        setMessage('Configuration updated in memory! In development mode, changes are not persisted to file. For production, edit public/config.json directly.');
        setMessageType('warning');
      } else {
        // In production, try to save to file
        const response = await fetch('/config.json', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(configToSave, null, 2)
        });

        if (response.ok) {
          // Reload configuration in the app
          reloadConfig();
          setMessage('Configuration saved successfully! The new settings are now active.');
          setMessageType('success');
        } else {
          throw new Error('Failed to save configuration');
        }
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
      setMessage('Failed to save configuration. Please check the console for details.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const resetToDefault = () => {
    const defaultConfig = {
      API_BASE_URL: '',
      ENABLE_API_CALLS: true,
      DEV_SETTINGS: {
        LOG_API_CALLS: true,
        TIMEOUT: 30000,
        USE_CORS_PROXY: true
      },
      UI_SETTINGS: {
        THEME: 'amazon',
        SIDEBAR_WIDTH: 200,
        HEADER_HEIGHT: 80,
        ENABLE_REFRESH: true
      }
    };
    setConfig(defaultConfig);
    setMessage('Reset to default configuration. Click Save to apply.');
    setMessageType('info');
  };

  if (!config) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading configuration...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Case Management Configuration
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        This page allows you to modify the API and UI configuration at runtime. 
        {process.env.NODE_ENV === 'development' ? (
          <span style={{ color: 'orange' }}>
            In development mode, changes are applied in memory only. 
            To persist changes, edit public/config.json directly.
          </span>
        ) : (
          'Changes will be saved to public/config.json and applied immediately.'
        )}
      </Typography>

      {message && (
        <Alert severity={messageType} sx={{ mb: 3 }}>
          {message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* API Settings */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                API Settings
              </Typography>
              
              <TextField
                fullWidth
                label="API Base URL"
                value={config.API_BASE_URL || ''}
                onChange={(e) => handleConfigChange('API_BASE_URL', e.target.value)}
                helperText="The base URL for all API calls"
                sx={{ mb: 2 }}
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={config.ENABLE_API_CALLS || false}
                    onChange={(e) => handleConfigChange('ENABLE_API_CALLS', e.target.checked)}
                  />
                }
                label="Enable API Calls"
                sx={{ mb: 2 }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Development Settings */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Development Settings
              </Typography>
              
              <FormControlLabel
                control={
                  <Switch
                    checked={config.DEV_SETTINGS?.LOG_API_CALLS || false}
                    onChange={(e) => handleDevSettingsChange('LOG_API_CALLS', e.target.checked)}
                  />
                }
                label="Log API Calls"
                sx={{ mb: 2 }}
              />
              
              <TextField
                fullWidth
                type="number"
                label="API Timeout (ms)"
                value={config.DEV_SETTINGS?.TIMEOUT || 30000}
                onChange={(e) => handleDevSettingsChange('TIMEOUT', parseInt(e.target.value))}
                helperText="Timeout for API requests in milliseconds"
                sx={{ mb: 2 }}
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={config.DEV_SETTINGS?.USE_CORS_PROXY || false}
                    onChange={(e) => handleDevSettingsChange('USE_CORS_PROXY', e.target.checked)}
                  />
                }
                label="Use CORS Proxy"
                sx={{ mb: 2 }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* UI Settings */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                UI Settings
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    label="Theme"
                    value={config.UI_SETTINGS?.THEME || 'amazon'}
                    onChange={(e) => handleUISettingsChange('THEME', e.target.value)}
                    helperText="UI theme (amazon, default)"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Sidebar Width (px)"
                    value={config.UI_SETTINGS?.SIDEBAR_WIDTH || 200}
                    onChange={(e) => handleUISettingsChange('SIDEBAR_WIDTH', parseInt(e.target.value))}
                    helperText="Sidebar width in pixels"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Header Height (px)"
                    value={config.UI_SETTINGS?.HEADER_HEIGHT || 80}
                    onChange={(e) => handleUISettingsChange('HEADER_HEIGHT', parseInt(e.target.value))}
                    helperText="Header height in pixels"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.UI_SETTINGS?.ENABLE_REFRESH || false}
                        onChange={(e) => handleUISettingsChange('ENABLE_REFRESH', e.target.checked)}
                      />
                    }
                    label="Enable Refresh Button"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 3 }}>
        <Button
          variant="contained"
          onClick={saveConfig}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Configuration'}
        </Button>
        
        <Button
          variant="outlined"
          onClick={resetToDefault}
        >
          Reset to Default
        </Button>
        
        <Button
          variant="outlined"
          onClick={loadCurrentConfig}
        >
          Reload from File
        </Button>
      </Box>
    </Box>
  );
};

export default ConfigManager;
