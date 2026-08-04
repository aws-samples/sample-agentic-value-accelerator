import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Alert,

  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  Avatar,
  IconButton,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  CalendarToday as CalendarIcon,
  Assignment as AssignmentIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  Refresh as RefreshIcon,
  Upload as UploadIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { customerAPI } from '../services/api';
import { 
  formatDateOnly, 
  generateCompanyName,
  generateApplicationId,
  getMandatoryBusinessDocuments,
  getDocumentTypeDisplayName,
  getDocumentCategory,
  getDocumentStatusFromCustomer,
  getUploadedDocumentsCount,
  getVerifiedDocumentsCount,
  getProcessingDocumentsCount,
} from '../utils/helpers';
import OnboardingTracker from './OnboardingTracker';

const MerchantDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState({});
  const [selectedFiles, setSelectedFiles] = useState({});
  const [successMessage, setSuccessMessage] = useState(null);
  const [forceCompletionWarning, setForceCompletionWarning] = useState(null);
  const apiCallMade = useRef(false);

  // Documents that can be uploaded
  const uploadableDocuments = [
    'business_license',
    'void_business_check', 
    'government_id',
    'bank_statement'
  ];

  // Function to check and update OCR status when all confidence scores are present
  const checkAndUpdateOCRStatus = useCallback(async () => {
    if (!customer) return;

    console.log('=== CHECKING AND UPDATING OCR STATUS ===');
    
    // Check if all 4 confidence scores are present
    const confidenceScores = {
      business_license: customer.business_license_confidence_score,
      government_id: customer.government_id_confidence_score,
      void_business_check: customer.void_business_check_confidence_score,
      bank_statement: customer.bank_statement_confidence_score
    };

    console.log('Current confidence scores:', confidenceScores);

    // Check if all scores are present and > 0
    const allScoresPresent = Object.values(confidenceScores).every(score => 
      score !== null && score !== undefined && !isNaN(Number(score)) && Number(score) > 0
    );

    console.log('All scores present:', allScoresPresent);

    // Check current OCR status
    const currentOCRStatus = customer.stage_status?.ocr_processing?.status;
    console.log('Current OCR status:', currentOCRStatus);

    // If all scores are present and OCR is not completed, update it
    if (allScoresPresent && currentOCRStatus !== 'completed') {
      console.log('All confidence scores present - updating OCR status to completed');
      
      try {
        // Make API call to update OCR status (preserve existing ai_insight)
        const existingAiInsight = customer?.stage_status?.ocr_processing?.ai_insight;
        const additionalData = existingAiInsight ? { ai_insight: existingAiInsight } : {};
        
        const response = await customerAPI.updateStageStatus(id, 'ocr_processing', 'completed', additionalData);
        
        console.log('OCR status updated successfully:', response);
        
        // Update local state (preserve existing ai_insight)
        setCustomer(prevCustomer => ({
          ...prevCustomer,
          stage_status: {
            ...prevCustomer.stage_status,
            ocr_processing: {
              ...prevCustomer.stage_status?.ocr_processing,
              status: 'completed'
            }
          }
        }));
        
        console.log('Local state updated - OCR marked as completed');
        
      } catch (error) {
        console.error('Failed to update OCR status:', error);
      }
    } else {
      console.log('OCR status update not needed:', {
        allScoresPresent,
        currentOCRStatus
      });
    }
  }, [customer, id]);

  // Check and update OCR status whenever customer data changes
  useEffect(() => {
    if (customer) {
      checkAndUpdateOCRStatus();
      // Clear force completion warning when customer data changes
      setForceCompletionWarning(null);
    }
  }, [customer, checkAndUpdateOCRStatus]);

  // Fetch customer data
  const fetchCustomerData = async () => {
    // Prevent duplicate calls using ref
    if (apiCallMade.current) {
      console.log('API call already made, skipping duplicate call');
      return;
    }
    
    apiCallMade.current = true;
    
    try {
      setError(null);
      setLoading(true);
      
      console.log('Making API calls for customer:', id);
      
      const [customerData, stageStatusData] = await Promise.all([
        customerAPI.getCustomerById(id),
        customerAPI.getStageStatus(id),
      ]);

      // Merge stage status with customer data (but don't use customer.status)
      const customerWithStageStatus = {
        ...customerData,
        stage_status: stageStatusData.stage_status
      };

      setCustomer(customerWithStageStatus);

      console.log('Customer detail loaded successfully:', {
        customer: customerWithStageStatus,
        stage_status: stageStatusData.stage_status,
      });
    } catch (err) {
      console.error('Error fetching customer data:', err);
      setError('Failed to load customer data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset the ref when customer ID changes
    apiCallMade.current = false;
    fetchCustomerData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleBack = () => {
    navigate('/');
  };

  const handleRefresh = async () => {
    console.log('=== REFRESH BUTTON CLICKED ===');
    setLoading(true);
    setError(null);
    
    try {
      // Force refresh by bypassing duplicate call prevention
      apiCallMade.current = false;
      
      console.log('Refreshing customer data for:', id);
      
      const [customerData, stageStatusData] = await Promise.all([
        customerAPI.getCustomerById(id),
        customerAPI.getStageStatus(id),
      ]);

      console.log('=== REFRESH API RESPONSE ===', {
        customerData,
        stageStatusData
      });

      // Merge stage status with customer data
      const customerWithStageStatus = {
        ...customerData,
        stage_status: stageStatusData.stage_status
      };

      setCustomer(customerWithStageStatus);

      // Check and update OCR status if all confidence scores are present
      await checkAndUpdateOCRStatus();

      // Calculate if all confidence scores are present for logging
      const allConfidenceScoresPresent = [
        customerData.business_license_confidence_score,
        customerData.government_id_confidence_score,
        customerData.void_business_check_confidence_score,
        customerData.bank_statement_confidence_score
      ].every(score => score !== null && score !== undefined && !isNaN(Number(score)) && Number(score) > 0);

      console.log('=== REFRESH COMPLETED ===', {
        customer: customerWithStageStatus,
        confidenceScores: {
          business_license: customerData.business_license_confidence_score,
          government_id: customerData.government_id_confidence_score,
          void_business_check: customerData.void_business_check_confidence_score,
          bank_statement: customerData.bank_statement_confidence_score
        },
        allConfidenceScoresPresent
      });
      
      setSuccessMessage('Customer data refreshed successfully!');
      setTimeout(() => setSuccessMessage(null), 2000);
      
    } catch (err) {
      console.error('Error refreshing customer data:', err);
      setError('Failed to refresh customer data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Separate function for refreshing data without duplicate call prevention
  const refreshCustomerData = async () => {
    try {
      console.log('Refreshing customer data for:', id);
      
      const [customerData, stageStatusData] = await Promise.all([
        customerAPI.getCustomerById(id),
        customerAPI.getStageStatus(id),
      ]);

      // Merge stage status with customer data
      const customerWithStageStatus = {
        ...customerData,
        stage_status: stageStatusData.stage_status
      };

      setCustomer(customerWithStageStatus);

      // Check if all confidence scores are present and update OCR status if needed
      const allConfidenceScoresPresent = [
        customerData.business_license_confidence_score,
        customerData.government_id_confidence_score,
        customerData.void_business_check_confidence_score,
        customerData.bank_statement_confidence_score
      ].every(score => score !== null && score !== undefined && !isNaN(Number(score)) && Number(score) > 0);

      if (allConfidenceScoresPresent && customerWithStageStatus.stage_status?.ocr_processing?.status !== 'completed') {
        console.log('All confidence scores present - updating OCR status to completed');
        
        try {
          // Call API to update OCR stage status to completed (preserve existing ai_insight)
          const existingAiInsight = customerWithStageStatus?.stage_status?.ocr_processing?.ai_insight;
          const additionalData = existingAiInsight ? { ai_insight: existingAiInsight } : {};
          
          await customerAPI.updateStageStatus(id, 'ocr_processing', 'completed', additionalData);
          
          console.log('OCR stage status updated to completed via API');
          
          // Update the local state to reflect the change (preserve existing ai_insight)
          setCustomer(prevCustomer => ({
            ...prevCustomer,
            stage_status: {
              ...prevCustomer.stage_status,
              ocr_processing: {
                ...prevCustomer.stage_status?.ocr_processing,
                status: 'completed'
              }
            }
          }));
        } catch (error) {
          console.error('Failed to update OCR stage status:', error);
          // Even if API call fails, update local state for better UX
          setCustomer(prevCustomer => ({
            ...prevCustomer,
            stage_status: {
              ...prevCustomer.stage_status,
              ocr_processing: {
                ...prevCustomer.stage_status?.ocr_processing,
                status: 'completed'
              }
            }
          }));
        }
      }

      console.log('Customer data refreshed successfully:', {
        customer: customerWithStageStatus,
        stage_status: stageStatusData.stage_status,
        allConfidenceScoresPresent
      });
    } catch (err) {
      console.error('Error refreshing customer data:', err);
      setError('Failed to refresh customer data. Please try again.');
    }
  };

  // Handle file selection
  const handleFileSelect = (documentType) => (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFiles(prev => ({
        ...prev,
        [documentType]: file
      }));
    }
  };

  // Handle file upload
  const handleFileUpload = async (documentType) => {
    if (!selectedFiles[documentType]) return;

    setUploadingFiles(prev => ({ ...prev, [documentType]: true }));
    
    try {
      const originalFile = selectedFiles[documentType];

      console.log('=== UPLOADING DOCUMENT ===', { documentType, filename: originalFile.name });
      
      // Upload file to backend
      const uploadResponse = await customerAPI.uploadDocument(originalFile, id, documentType);
      console.log('=== UPLOAD RESPONSE ===', uploadResponse);
      
      // Update local customer state to reflect the upload
      setCustomer(prevCustomer => ({
        ...prevCustomer,
        [documentType]: 'Y',
        last_updated: new Date().toISOString()
      }));
      
      // Clear selected file
      setSelectedFiles(prev => {
        const newFiles = { ...prev };
        delete newFiles[documentType];
        return newFiles;
      });

      // Show success message with OCR processing info
      setSuccessMessage(`${getDocumentTypeDisplayName(documentType)} uploaded successfully! OCR processing started. Please refresh after a few seconds to see confidence scores.`);
      setTimeout(() => setSuccessMessage(null), 5000);

    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Failed to upload file. Please try again.');
    } finally {
      setUploadingFiles(prev => ({ ...prev, [documentType]: false }));
    }
  };

  // Remove selected file
  const handleRemoveFile = (documentType) => {
    setSelectedFiles(prev => {
      const newFiles = { ...prev };
      delete newFiles[documentType];
      return newFiles;
    });
  };

  // Check if document can be uploaded
  const canUploadDocument = (documentType) => {
    return uploadableDocuments.includes(documentType) && !isDocumentGreyedOut(documentType);
  };



  // Check if a mandatory document is uploaded and its status
  const getDocumentStatus = (documentType) => {
    const status = getDocumentStatusFromCustomer(customer, documentType);
    const confidenceScoreField = `${documentType}_confidence_score`;
    const confidenceScore = customer?.[confidenceScoreField];
    const hasConfidenceScore = confidenceScore !== null && confidenceScore !== undefined && Number(confidenceScore) > 0;
    const isUploading = uploadingFiles[documentType];
    
    console.log(`=== DOCUMENT STATUS CHECK ===`, { 
      documentType, 
      status, 
      customerValue: customer?.[documentType],
      confidenceScore,
      hasConfidenceScore,
      isUploading,
      customerDocuments: customer?.documents,
      hasDocuments: !!customer?.documents,
      customerKeys: customer ? Object.keys(customer) : []
    });
    
    // Show processing state if currently uploading
    if (isUploading) {
      return { 
        status: 'processing', 
        document: null 
      };
    }
    
    // Show as uploaded if it has 'Y' status (for immediate feedback after upload)
    if (status === 'uploaded' || status === 'verified' || customer?.[documentType] === 'Y') {
      return { 
        status: 'uploaded', 
        document: { 
          document_type: documentType, 
          status: 'uploaded',
          original_filename: `${getDocumentTypeDisplayName(documentType)}.pdf`,
          upload_date: customer.last_updated || customer.created_date,
          confidence_score: confidenceScore
        } 
      };
    } else {
      return { status: 'missing', document: null };
    }
  };

  // Group mandatory documents by category
  const getMandatoryDocumentsByCategory = () => {
    const mandatoryDocs = getMandatoryBusinessDocuments();
    const grouped = {};
    
    mandatoryDocs.forEach(doc => {
      const category = getDocumentCategory(doc.type);
      if (!grouped[category]) {
        grouped[category] = [];
      }
      const status = getDocumentStatus(doc.type);
      grouped[category].push({
        ...doc,
        ...status
      });
    });
    
    return grouped;
  };

  // Get all uploaded documents for display
  // Check if any documents are uploaded (regardless of confidence scores)
  const hasAnyUploadedDocuments = () => {
    const allowedDocumentTypes = ['business_license', 'government_id', 'bank_statement', 'void_business_check'];
    
    // Check new format where documents are individual fields
    for (const docType of allowedDocumentTypes) {
      if (customer && customer[docType] === 'Y') {
        return true;
      }
    }
    
    // Check old format where documents are in customer.documents object
    if (customer?.documents && typeof customer.documents === 'object' && !Array.isArray(customer.documents)) {
      for (const [docType, status] of Object.entries(customer.documents)) {
        if (status === 'Y' && allowedDocumentTypes.includes(docType)) {
          return true;
        }
      }
    }
    
    return false;
  };

  const getAllUploadedDocuments = () => {
    console.log('=== GETTING UPLOADED DOCUMENTS ===', { 
      customer: customer,
      customerDocuments: customer?.documents,
      hasDocuments: !!customer?.documents,
      isObject: customer?.documents && typeof customer.documents === 'object' && !Array.isArray(customer.documents)
    });
    
    const uploadedDocs = [];
    
    // Only show specific documents when their flags are 'Y'
    const allowedDocumentTypes = ['business_license', 'government_id', 'bank_statement', 'void_business_check'];
    
    // Handle new format where documents are individual fields in customer record
    allowedDocumentTypes.forEach(docType => {
      console.log(`=== DOCUMENT DEBUG ===`, {
        docType,
        value: customer?.[docType],
        confidenceScoreField: `${docType}_confidence_score`,
        confidenceScore: customer?.[`${docType}_confidence_score`],
        customerKeys: customer ? Object.keys(customer) : []
      });
      
      if (customer && customer[docType] === 'Y') {
        // Get confidence score from the specific field
        const confidenceScoreField = `${docType}_confidence_score`;
        const confidenceScore = customer[confidenceScoreField];
        
        console.log(`=== ADDING DOCUMENT ===`, {
          docType,
          confidenceScore,
          willAdd: confidenceScore !== null && confidenceScore !== undefined && Number(confidenceScore) > 0
        });
        
        // Only add document if it has 'Y' status AND confidence score > 0
        if (confidenceScore !== null && confidenceScore !== undefined && Number(confidenceScore) > 0) {
          uploadedDocs.push({
            id: docType,
            document_type: docType,
            status: 'verified',
            original_filename: `${getDocumentTypeDisplayName(docType)}.pdf`,
            upload_date: customer.last_updated || customer.created_date,
            confidence_score: confidenceScore
          });
        }
      }
    });
    
    // Handle old format where documents are in customer.documents object
    if (customer.documents && typeof customer.documents === 'object' && !Array.isArray(customer.documents)) {
      Object.entries(customer.documents).forEach(([docType, status]) => {
        console.log(`Checking document object: ${docType} = ${status}`);
        if (status === 'Y' && allowedDocumentTypes.includes(docType)) {
          // Get confidence score from the specific field
          const confidenceScoreField = `${docType}_confidence_score`;
          const confidenceScore = customer[confidenceScoreField];
          
          // Only add document if it has 'Y' status AND confidence score > 0
          if (confidenceScore !== null && confidenceScore !== undefined && Number(confidenceScore) > 0) {
            uploadedDocs.push({
              id: docType,
              document_type: docType,
              status: 'verified',
              original_filename: `${getDocumentTypeDisplayName(docType)}.pdf`,
              upload_date: customer.last_updated || customer.created_date,
              confidence_score: confidenceScore
            });
          }
        }
      });
    }
    
    console.log('=== UPLOADED DOCS RESULT ===', uploadedDocs);
    console.log('=== CUSTOMER DATA FOR DEBUG ===', {
      customerId: customer?.id,
      business_license: customer?.business_license,
      void_business_check: customer?.void_business_check,
      government_id: customer?.government_id,
      bank_statement: customer?.bank_statement,
      business_license_confidence_score: customer?.business_license_confidence_score,
      void_business_check_confidence_score: customer?.void_business_check_confidence_score,
      government_id_confidence_score: customer?.government_id_confidence_score,
      bank_statement_confidence_score: customer?.bank_statement_confidence_score,
      allKeys: customer ? Object.keys(customer) : []
    });
    return uploadedDocs;
  };

  const getDocumentIcon = (status) => {
    switch (status) {
      case 'uploaded':
        return <CheckCircleIcon color="success" />;
      case 'verified':
        return <CheckCircleIcon color="success" />;
      case 'rejected':
        return <ErrorIcon color="error" />;
      case 'processing':
        return <ScheduleIcon color="warning" />;
      default:
        return <AssignmentIcon color="action" />;
    }
  };

  const getDocumentStatusColor = (status) => {
    switch (status) {
      case 'uploaded':
        return 'success';
      case 'verified':
        return 'success';
      case 'rejected':
        return 'error';
      case 'processing':
        return 'warning';
      default:
        return 'default';
    }
  };

  // Get confidence score color based on percentage
  const getConfidenceScoreColor = (confidenceScore) => {
    if (!confidenceScore) return 'default';
    
    const score = Number(confidenceScore);
    const percentage = score > 1 ? score : score * 100;
    
    if (percentage >= 75) {
      return 'success';
    } else if (percentage > 0) {
      return 'warning';
    } else {
      return 'default';
    }
  };

  // Check if a document should be greyed out
  const isDocumentGreyedOut = (documentType) => {
    const greyedOutDocuments = [
      'articles_of_incorporation',
      'ein_certificate',
      'federal_tax_id',
      'sales_tax_certificate',
      'ssn_document',
      'utility_bill'
    ];
    return greyedOutDocuments.includes(documentType);
  };

  const getOCRAiInsight = () => {
    if (!customer || !customer.stage_status) {
      return null;
    }
    
    const ocrStage = customer.stage_status.ocr_processing;
    if (!ocrStage) return null;
    
    // Check ai_insight first (non-empty), then ocr_processing_insight
    const insight = (ocrStage.ai_insight && typeof ocrStage.ai_insight === 'string' && ocrStage.ai_insight.trim().length > 0) 
      ? ocrStage.ai_insight 
      : (ocrStage.ai_insight && typeof ocrStage.ai_insight === 'object')
        ? ocrStage.ai_insight
        : ocrStage.ocr_processing_insight || null;
    return insight;
  };

  const getComplianceAiInsight = () => {
    if (!customer || !customer.stage_status || !customer.stage_status.compliance_check) {
      return null;
    }
    
    const complianceStage = customer.stage_status.compliance_check;
    // Return ai_insight only if it's a non-empty string or object
    const insight = complianceStage.ai_insight;
    if (insight && (typeof insight === 'object' || (typeof insight === 'string' && insight.trim().length > 0))) {
      return insight;
    }
    return null;
  };

  const getAllAiInsights = () => {
    const ocrInsight = getOCRAiInsight();
    const complianceInsight = getComplianceAiInsight();
    
    const insights = [];
    
    if (ocrInsight) {
      insights.push({
        type: 'OCR Processing',
        insight: ocrInsight,
        icon: '🔍'
      });
    }
    
    if (complianceInsight) {
      insights.push({
        type: 'Compliance Check',
        insight: complianceInsight,
        icon: '✅'
      });
    }
    
    return insights;
  };

  // Check if OCR processing is complete and confidence scores are available
  const isOCRProcessingComplete = () => {
    console.log('=== CHECKING OCR COMPLETION ===', {
      customer: customer,
      stageStatus: customer?.stage_status,
      ocrStage: customer?.stage_status?.ocr_processing,
      confidenceScores: {
        business_license: customer?.business_license_confidence_score,
        government_id: customer?.government_id_confidence_score,
        void_business_check: customer?.void_business_check_confidence_score,
        bank_statement: customer?.bank_statement_confidence_score
      }
    });
    
    // Check if all required confidence scores have numeric values
    const requiredConfidenceScores = [
      'business_license_confidence_score',
      'government_id_confidence_score', 
      'void_business_check_confidence_score',
      'bank_statement_confidence_score'
    ];
    
    // Check if ALL required confidence scores are greater than 0 (indicating OCR processing worked)
    const allScoresValid = requiredConfidenceScores.every(scoreField => {
      const score = customer?.[scoreField];
      const isValid = score !== null && score !== undefined && !isNaN(Number(score)) && Number(score) > 0;
      console.log(`Score ${scoreField}:`, score, 'Valid (>0):', isValid);
      return isValid;
    });
    
    console.log('All required scores valid (>0):', allScoresValid);
    
    return allScoresValid;
  };

  if (loading) {
    return (
      <Box className="dashboard-container">
        <Box className="loading-spinner">
          <CircularProgress size={60} />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box className="dashboard-container">
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
        <Button onClick={handleBack} startIcon={<ArrowBackIcon />}>
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  if (!customer) {
    return (
      <Box className="dashboard-container">
        <Alert severity="warning" sx={{ mb: 3 }}>
          Customer not found
        </Alert>
        <Button onClick={handleBack} startIcon={<ArrowBackIcon />}>
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  return (
    <Box className="dashboard-container">
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Button
          onClick={handleBack}
          startIcon={<ArrowBackIcon />}
          sx={{ mr: 2 }}
        >
          Back to Dashboard
        </Button>
        <Typography variant="h4" fontWeight={700}>
          Customer Details
        </Typography>
      </Box>

      {/* Success Message */}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {successMessage}
        </Alert>
      )}

      {/* Customer Information */}
      <Grid container spacing={3}>
        {/* Main Customer Info */}
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Avatar
                  sx={{
                    width: 64,
                    height: 64,
                    bgcolor: 'primary.main',
                    mr: 2,
                  }}
                >
                  <PersonIcon sx={{ fontSize: 32 }} />
                </Avatar>
                <Box>
                  <Typography variant="h5" fontWeight={600}>
                    {customer.name}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {generateCompanyName(customer)}
                  </Typography>
                </Box>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <PersonIcon sx={{ mr: 1, color: 'text.secondary' }} />
                    <Typography variant="body2">
                      {customer.email}
                    </Typography>
                  </Box>
                </Grid>
                {customer.phone && (
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <PhoneIcon sx={{ mr: 1, color: 'text.secondary' }} />
                      <Typography variant="body2">
                        {customer.phone}
                      </Typography>
                    </Box>
                  </Grid>
                )}
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <CalendarIcon sx={{ mr: 1, color: 'text.secondary' }} />
                    <Typography variant="body2">
                      Created: {formatDateOnly(customer.created_date)}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <AssignmentIcon sx={{ mr: 1, color: 'text.secondary' }} />
                    <Typography variant="body2" fontFamily="monospace">
                      {generateApplicationId(customer.id)}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>

              {/* GenAI Recommendations */}
              {console.log('=== RENDERING GENAI RECOMMENDATIONS SECTION ===', { customer: customer?.id })}
              <Box sx={{ mt: 3, p: 2, bgcolor: 'info.50', borderRadius: 2, border: '1px solid', borderColor: 'info.200' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Box sx={{ 
                    width: 24, 
                    height: 24, 
                    borderRadius: '50%', 
                    bgcolor: 'info.main', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    mr: 1
                  }}>
                    <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold' }}>
                      AI
                    </Typography>
                  </Box>
                  <Typography variant="subtitle2" fontWeight={600} color="info.main">
                    GenAI Recommendations
                  </Typography>
                </Box>
                
                                {getAllAiInsights().length > 0 ? (
                  <Box>
                    {getAllAiInsights().map((insight, index) => (
                      <Box key={index} sx={{ mb: index > 0 ? 3 : 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Typography variant="caption" sx={{ mr: 1, fontSize: '1.2rem' }}>
                            {insight.icon}
                          </Typography>
                          <Typography variant="subtitle2" fontWeight={600} color="info.dark">
                            {insight.type} - Web Insights
                          </Typography>
                        </Box>
                        
                        {typeof insight.insight === 'object' ? (
                          <Box sx={{ pl: 2 }}>
                            {insight.insight.risk_level && (
                              <Typography variant="body2" color="info.dark" sx={{ mb: 1 }}>
                                <strong>Risk Level:</strong> {insight.insight.risk_level}
                              </Typography>
                            )}
                            
                            {insight.insight.key_findings && (
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="body2" color="info.dark" sx={{ fontWeight: 600, mb: 0.5 }}>
                                  Key Findings:
                                </Typography>
                                {Array.isArray(insight.insight.key_findings) ? 
                                  insight.insight.key_findings.map((finding, idx) => (
                                    <Typography key={idx} variant="body2" color="info.dark" sx={{ ml: 1, mb: 0.5 }}>
                                      • {finding}
                                    </Typography>
                                  )) :
                                  <Typography variant="body2" color="info.dark" sx={{ ml: 1 }}>
                                    • {insight.insight.key_findings}
                                  </Typography>
                                }
                              </Box>
                            )}
                            
                            {insight.insight.recommendations && (
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="body2" color="info.dark" sx={{ fontWeight: 600, mb: 0.5 }}>
                                  Recommendations:
                                </Typography>
                                {Array.isArray(insight.insight.recommendations) ? 
                                  insight.insight.recommendations.map((rec, idx) => (
                                    <Typography key={idx} variant="body2" color="info.dark" sx={{ ml: 1, mb: 0.5 }}>
                                      • {rec}
                                    </Typography>
                                  )) :
                                  <Typography variant="body2" color="info.dark" sx={{ ml: 1 }}>
                                    • {insight.insight.recommendations}
                                  </Typography>
                                }
                              </Box>
                            )}
                            
                            {insight.insight.compliance_notes && (
                              <Box>
                                <Typography variant="body2" color="info.dark" sx={{ fontWeight: 600, mb: 0.5 }}>
                                  Compliance Notes:
                                </Typography>
                                {Array.isArray(insight.insight.compliance_notes) ? 
                                  insight.insight.compliance_notes.map((note, idx) => (
                                    <Typography key={idx} variant="body2" color="info.dark" sx={{ ml: 1, mb: 0.5 }}>
                                      • {note}
                                    </Typography>
                                  )) :
                                  <Typography variant="body2" color="info.dark" sx={{ ml: 1 }}>
                                    • {insight.insight.compliance_notes}
                                  </Typography>
                                }
                              </Box>
                            )}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="info.dark" sx={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                            {insight.insight}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <>
                    <Typography variant="body2" color="info.dark" sx={{ mb: 2 }}>
                      AI-powered insights and recommendations will appear here once OCR processing and compliance checks are completed...
                    </Typography>
                    <Box sx={{ 
                      minHeight: 80, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      bgcolor: 'info.25',
                      borderRadius: 1,
                      border: '1px dashed',
                      borderColor: 'info.300'
                    }}>
                      <Typography variant="body2" color="info.main" sx={{ fontStyle: 'italic' }}>
                        Complete OCR processing and compliance check to see AI recommendations
                      </Typography>
                    </Box>
                  </>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Stats */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600} sx={{ mb: 3 }}>
                Document Status
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <AssignmentIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Total Documents"
                    secondary={getUploadedDocumentsCount(customer)}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <CheckCircleIcon color="success" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Verified"
                    secondary={getVerifiedDocumentsCount(customer)}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <ScheduleIcon color="warning" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Processing"
                    secondary={getProcessingDocumentsCount(customer)}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <ErrorIcon color="error" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Rejected"
                    secondary="0"
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Onboarding Tracker */}
      <Box sx={{ mt: 3 }}>
        <OnboardingTracker 
          customerStatus={customer.stage_status?.final?.status === 'completed' ? 'completed' : 'in_progress'}
          progressPercentage={customer.progress_percentage || 0}
          customerName={customer.name}
          customerId={customer.id}
          onStatusUpdate={refreshCustomerData}
          customer={customer}
        />
      </Box>

      {/* Mandatory Business Documents Section */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h5" fontWeight={600} sx={{ mb: 3 }}>
            Mandatory Business Documents
          </Typography>
          
          {Object.entries(getMandatoryDocumentsByCategory()).map(([category, docs]) => (
            <Box key={category} sx={{ mb: 4 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2, color: 'primary.main' }}>
                {category}
              </Typography>
              <Grid container spacing={2}>
                {docs.map((doc) => (
                  <Grid item xs={12} sm={6} md={4} key={doc.type}>
                    <Paper
                      sx={{
                        p: 2,
                        border: '1px solid',
                        borderColor: 
                          doc.status === 'processing' ? 'warning.main' :
                          doc.status === 'missing' ? 'error.light' : 'divider',
                        borderRadius: 2,
                        backgroundColor: 
                          doc.status === 'processing' ? 'warning.light' :
                          doc.status === 'missing' ? 'error.light' : 'background.paper',
                        opacity: doc.status === 'missing' ? 0.8 : isDocumentGreyedOut(doc.type) ? 0.5 : 1,
                        filter: isDocumentGreyedOut(doc.type) ? 'grayscale(1)' : 'none',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        {doc.status === 'processing' ? (
                          <CircularProgress size={20} sx={{ mr: 1 }} />
                        ) : (
                          <Typography variant="body1" sx={{ mr: 1, color: isDocumentGreyedOut(doc.type) ? 'text.disabled' : 'inherit' }}>
                            {doc.icon}
                          </Typography>
                        )}
                        <Typography 
                          variant="body2" 
                          fontWeight={600} 
                          sx={{ 
                            flexGrow: 1,
                            color: isDocumentGreyedOut(doc.type) ? 'text.disabled' : 'inherit'
                          }}
                        >
                          {doc.name}
                        </Typography>
                      </Box>
                      
                      {doc.status === 'missing' || doc.status === 'processing' ? (
                        <Box>
                          <Chip
                            label={
                              doc.status === 'processing' ? "Processing..." :
                              isDocumentGreyedOut(doc.type) ? "Not Required" : "Missing"
                            }
                            color={
                              doc.status === 'processing' ? "warning" :
                              isDocumentGreyedOut(doc.type) ? "default" : "error"
                            }
                            size="small"
                            sx={{ mb: 1 }}
                          />
                          <Typography 
                            variant="caption" 
                            color={isDocumentGreyedOut(doc.type) ? "text.disabled" : "text.secondary"} 
                            display="block"
                          >
                            {doc.status === 'processing' ? "Document is being processed by backend..." :
                             isDocumentGreyedOut(doc.type) ? "Document not required" : "Required for onboarding"}
                          </Typography>
                          
                          {/* Upload functionality for uploadable documents */}
                          {canUploadDocument(doc.type) && doc.status !== 'processing' && (
                            <Box sx={{ mt: 2 }}>
                              {selectedFiles[doc.type] ? (
                                <Box>
                                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                    Selected: {selectedFiles[doc.type].name}
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button
                                      variant="contained"
                                      size="small"
                                      onClick={() => handleFileUpload(doc.type)}
                                      disabled={uploadingFiles[doc.type]}
                                      startIcon={uploadingFiles[doc.type] ? <CircularProgress size={16} /> : <UploadIcon />}
                                      sx={{
                                        backgroundColor: 'success.main',
                                        color: 'white',
                                        '&:hover': {
                                          backgroundColor: 'success.dark',
                                        },
                                        '&:disabled': {
                                          backgroundColor: 'grey.400',
                                          color: 'grey.600',
                                        },
                                        fontWeight: 600,
                                        textTransform: 'none',
                                        boxShadow: 1,
                                      }}
                                    >
                                      {uploadingFiles[doc.type] ? 'Uploading...' : 'Upload'}
                                    </Button>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleRemoveFile(doc.type)}
                                      disabled={uploadingFiles[doc.type]}
                                    >
                                      <DeleteIcon />
                                    </IconButton>
                                  </Box>
                                </Box>
                              ) : (
                                <Button
                                  variant="contained"
                                  component="label"
                                  size="small"
                                  startIcon={<UploadIcon />}
                                  disabled={uploadingFiles[doc.type]}
                                  fullWidth
                                  sx={{
                                    backgroundColor: 'primary.main',
                                    color: 'white',
                                    '&:hover': {
                                      backgroundColor: 'primary.dark',
                                    },
                                    '&:disabled': {
                                      backgroundColor: 'grey.400',
                                      color: 'grey.600',
                                    },
                                    fontWeight: 600,
                                    textTransform: 'none',
                                    boxShadow: 2,
                                  }}
                                >
                                  Upload {doc.name}
                                  <input
                                    type="file"
                                    hidden
                                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                    onChange={handleFileSelect(doc.type)}
                                  />
                                </Button>
                              )}
                            </Box>
                          )}
                        </Box>
                      ) : (
                        <Box>
                          <Typography 
                            variant="caption" 
                            color={isDocumentGreyedOut(doc.type) ? "text.disabled" : "text.secondary"} 
                            display="block"
                          >
                            {doc.document?.original_filename}
                          </Typography>
                          <Typography 
                            variant="caption" 
                            color={isDocumentGreyedOut(doc.type) ? "text.disabled" : "text.secondary"} 
                            display="block"
                          >
                            Uploaded: {formatDateOnly(doc.document?.upload_date)}
                          </Typography>
                          <Chip
                            label={doc.status}
                            color={getDocumentStatusColor(doc.status)}
                            size="small"
                            sx={{ mt: 1 }}
                          />
                          
                          {/* Replace upload functionality for uploadable documents */}
                          {canUploadDocument(doc.type) && (
                            <Box sx={{ mt: 2 }}>
                              {selectedFiles[doc.type] ? (
                                <Box>
                                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                    New file: {selectedFiles[doc.type].name}
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button
                                      variant="contained"
                                      size="small"
                                      onClick={() => handleFileUpload(doc.type)}
                                      disabled={uploadingFiles[doc.type]}
                                      startIcon={uploadingFiles[doc.type] ? <CircularProgress size={16} /> : <UploadIcon />}
                                      sx={{
                                        backgroundColor: 'warning.main',
                                        color: 'white',
                                        '&:hover': {
                                          backgroundColor: 'warning.dark',
                                        },
                                        '&:disabled': {
                                          backgroundColor: 'grey.400',
                                          color: 'grey.600',
                                        },
                                        fontWeight: 600,
                                        textTransform: 'none',
                                        boxShadow: 1,
                                      }}
                                    >
                                      {uploadingFiles[doc.type] ? 'Uploading...' : 'Replace'}
                                    </Button>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleRemoveFile(doc.type)}
                                      disabled={uploadingFiles[doc.type]}
                                    >
                                      <DeleteIcon />
                                    </IconButton>
                                  </Box>
                                </Box>
                              ) : (
                                <Button
                                  variant="contained"
                                  component="label"
                                  size="small"
                                  startIcon={<UploadIcon />}
                                  disabled={uploadingFiles[doc.type]}
                                  fullWidth
                                  sx={{
                                    backgroundColor: 'secondary.main',
                                    color: 'white',
                                    '&:hover': {
                                      backgroundColor: 'secondary.dark',
                                    },
                                    '&:disabled': {
                                      backgroundColor: 'grey.400',
                                      color: 'grey.600',
                                    },
                                    fontWeight: 600,
                                    textTransform: 'none',
                                    boxShadow: 2,
                                  }}
                                >
                                  Replace {doc.name}
                                  <input
                                    type="file"
                                    hidden
                                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                    onChange={handleFileSelect(doc.type)}
                                  />
                                </Button>
                              )}
                            </Box>
                          )}
                        </Box>
                      )}
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* Documents Section - Always show with appropriate messages */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" fontWeight={600}>
              Documents with Confidence Scores
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={handleRefresh}
                size="small"
              >
                Refresh
              </Button>
              <Button
                variant="outlined"
                onClick={async () => {
                  // Check if all required documents have been scanned
                  if (!isOCRProcessingComplete()) {
                    // Show warning message in bold red
                    setForceCompletionWarning("⚠️ WARNING: User force completed OCR without scanning all required documents!");
                    
                    // Clear the warning after 5 seconds
                    setTimeout(() => {
                      setForceCompletionWarning(null);
                    }, 5000);
                  }
                  
                  try {
                    console.log('Manually updating OCR status to completed');
                    
                    // Preserve existing ai_insight data when force completing OCR
                    const existingAiInsight = customer?.stage_status?.ocr_processing?.ai_insight;
                    const additionalData = existingAiInsight ? { ai_insight: existingAiInsight } : {};
                    
                    await customerAPI.updateStageStatus(id, 'ocr_processing', 'completed', additionalData);
                    console.log('OCR status manually updated with preserved ai_insight:', existingAiInsight);
                    await handleRefresh(); // Refresh to get updated data
                  } catch (error) {
                    console.error('Failed to manually update OCR status:', error);
                  }
                }}
                size="small"
              >
                Force Complete OCR
              </Button>
            </Box>
          </Box>

          {/* Force Completion Warning */}
          {forceCompletionWarning && (
            <Alert 
              severity="error" 
              sx={{ 
                mb: 2,
                fontWeight: 'bold',
                fontSize: '1.1rem',
                '& .MuiAlert-message': {
                  fontWeight: 'bold',
                  color: 'error.dark',
                  fontSize: '1.1rem'
                }
              }}
            >
              {forceCompletionWarning}
            </Alert>
          )}

          {getAllUploadedDocuments().length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <AssignmentIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              {hasAnyUploadedDocuments() ? (
                <>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
                    OCR processing started
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Please refresh after a few seconds to see confidence scores
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
                    OCR processing did not start
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Will start after a document is uploaded
                  </Typography>
                </>
              )}
            </Box>
          ) : (
              <Grid container spacing={2}>
                {getAllUploadedDocuments().map((doc) => (
                  <Grid item xs={12} sm={6} md={4} key={doc.id}>
                    <Paper
                      sx={{
                        p: 2,
                        border: '1px solid',
                        borderColor: doc.confidence_score ? 
                          (getConfidenceScoreColor(doc.confidence_score) === 'success' ? 'success.main' : 'warning.main') : 
                          'divider',
                        borderRadius: 2,
                        backgroundColor: doc.confidence_score ? 
                          (getConfidenceScoreColor(doc.confidence_score) === 'success' ? 'success.light' : 'warning.light') : 
                          'background.paper',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Typography variant="body1" sx={{ mr: 1 }}>
                          {getDocumentIcon(doc.document_type)}
                        </Typography>
                        <Typography variant="body2" fontWeight={600} sx={{ flexGrow: 1 }}>
                          {getDocumentTypeDisplayName(doc.document_type)}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        {getDocumentCategory(doc.document_type)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {doc.original_filename}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Uploaded: {formatDateOnly(doc.upload_date)}
                      </Typography>
                      <Chip
                        label={doc.status}
                        color={getDocumentStatusColor(doc.status)}
                        size="small"
                        sx={{ mt: 1 }}
                      />
                      {doc.confidence_score && (
                        <Chip
                          label={`Confidence: ${doc.confidence_score > 1 ? Math.round(doc.confidence_score) : Math.round(doc.confidence_score * 100)}%`}
                          color={getConfidenceScoreColor(doc.confidence_score)}
                          size="small"
                          sx={{ mt: 1 }}
                        />
                      )}
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
          </CardContent>
        </Card>

    </Box>
  );
};

export default MerchantDetail; 