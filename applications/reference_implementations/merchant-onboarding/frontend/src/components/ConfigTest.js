import React from 'react';
import { Box, Typography } from '@mui/material';

const ConfigTest = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Configuration Test Page
      </Typography>
      
      <Typography variant="body1">
        If you can see this, the route is working!
      </Typography>
      
      <Typography variant="body2" sx={{ mt: 2 }}>
        Check the browser console for any JavaScript errors.
      </Typography>
    </Box>
  );
};

export default ConfigTest; 