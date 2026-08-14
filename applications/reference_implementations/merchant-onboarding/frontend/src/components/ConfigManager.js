import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Switch,
  FormControlLabel,
  Alert,
  Divider,
  Card,
  CardContent,
  Grid
} from '@mui/material';
import { getConfig, reloadConfig } from '../config.js';
import { reloadApiConfig } from '../services/api.js';

const ConfigManager = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');

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
      setMessage(`Error loading configuration: ${error.message}`);
      setMessageType('error');
    }
  };

  const handleConfigChange = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleDevSettingsChange = (key, value) => {
    setConfig(prev => ({
      ...prev,
      DEV_SETTINGS: {
        ...prev.DEV_SETTINGS,
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
          TIMEOUT: config.DEV_SETTINGS.TIMEOUT
        }
      };

      // In development mode, we can't write back to the file
      // So we'll just update the in-memory configuration
      if (process.env.NODE_ENV === 'development') {
        // Reload configuration in the app
        reloadConfig();
        reloadApiConfig();
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
          reloadApiConfig();
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
      API_BASE_URL: 'https://<api-id>.execute-api.<region>.amazonaws.com/<stage>',
      ENABLE_API_CALLS: true,
      DEV_SETTINGS: {
        LOG_API_CALLS: true,
        TIMEOUT: 30000,
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
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        API Configuration Manager
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        This page allows you to modify the API configuration at runtime. 
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

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            API Settings
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="API Base URL"
                value={config.API_BASE_URL || ''}
                onChange={(e) => handleConfigChange('API_BASE_URL', e.target.value)}
                helperText="The base URL for all API calls"
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.ENABLE_API_CALLS || false}
                    onChange={(e) => handleConfigChange('ENABLE_API_CALLS', e.target.checked)}
                  />
                }
                label="Enable API Calls"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Development Settings
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.DEV_SETTINGS?.LOG_API_CALLS || false}
                    onChange={(e) => handleDevSettingsChange('LOG_API_CALLS', e.target.checked)}
                  />
                }
                label="Log API Calls"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="number"
                label="API Timeout (ms)"
                value={config.DEV_SETTINGS?.TIMEOUT || 30000}
                onChange={(e) => handleDevSettingsChange('TIMEOUT', parseInt(e.target.value))}
                helperText="Timeout for API requests in milliseconds"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
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