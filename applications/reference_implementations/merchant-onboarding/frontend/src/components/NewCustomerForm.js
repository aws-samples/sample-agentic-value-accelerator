import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Grid,
  Typography,
  Box,
  Alert,
  CircularProgress,
  IconButton,
} from '@mui/material';
import {
  Close as CloseIcon,
} from '@mui/icons-material';
import { customerAPI } from '../services/api';
import { generateApplicationId, getMandatoryBusinessDocuments } from '../utils/helpers';

const NewMerchantForm = ({ open, onClose, onCustomerCreated, initialDocuments = {} }) => {
  const [formData, setFormData] = useState({
    companyName: '',
    email: '',
    phone: '',
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const mandatoryDocuments = getMandatoryBusinessDocuments();

  const handleInputChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const validateForm = () => {
    if (!formData.companyName.trim()) {
      setError('Company name is required');
      return false;
    }
    if (!formData.email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!formData.phone.trim()) {
      setError('Phone number is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      // Generate application ID
      const applicationId = generateApplicationId();
      
      // Prepare documents object with all documents marked as "N" (Not Provided)
      const documentsStatus = {};
      mandatoryDocuments.forEach(doc => {
        documentsStatus[doc.type] = 'N';
      });

      // Create merchant data
      const customerData = {
        id: applicationId,
        name: formData.companyName,
        email: formData.email,
        phone: formData.phone,
        status: 'created',
        created_date: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        documents: documentsStatus,
        progress_percentage: 0
      };

      // Send to backend
      const response = await customerAPI.createCustomer(customerData);
      
      setSuccess(true);
      console.log('=== NEW CUSTOMER FORM SUCCESS ===');
      console.log('Response from API:', response);
      console.log('Calling onCustomerCreated callback...');
      setTimeout(() => {
        console.log('=== CALLING CALLBACK AFTER TIMEOUT ===');
        onCustomerCreated(response);
        handleClose();
      }, 2000);

    } catch (err) {
      console.error('Error creating merchant:', err);
      setError(err.message || 'Failed to create merchant. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({
        companyName: '',
        email: '',
        phone: '',
      });
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        style: {
          maxHeight: '90vh',
          overflow: 'auto'
        }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h5">Create New Customer</Typography>
          <IconButton onClick={handleClose} disabled={loading}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Customer created successfully! Redirecting...
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Basic Information */}
          <Grid item xs={12}>
            <Typography variant="h5" gutterBottom>
              Basic Information
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter the basic information for the new customer. All mandatory documents will be marked as "Not Provided" and can be uploaded later.
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Company Name"
              value={formData.companyName}
              onChange={handleInputChange('companyName')}
              required
              disabled={loading}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={formData.email}
              onChange={handleInputChange('email')}
              required
              disabled={loading}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Phone Number"
              value={formData.phone}
              onChange={handleInputChange('phone')}
              required
              disabled={loading}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Application ID"
              value={generateApplicationId()}
              disabled
              helperText="Auto-generated"
            />
          </Grid>

          {/* Note about documents */}
          <Grid item xs={12}>
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Note:</strong> All mandatory documents will be marked as "Not Provided" (N) and can be uploaded later through the customer detail page.
              </Typography>
            </Alert>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? 'Creating...' : 'Create Customer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewMerchantForm; 