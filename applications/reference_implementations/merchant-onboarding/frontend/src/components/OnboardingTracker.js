import React, { useState } from 'react';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Typography,
  Paper,
  Chip,
  LinearProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  Schedule as ScheduleIcon,
  Error as ErrorIcon,
  Check as CheckIcon,
  Assignment as AssignmentIcon,
  Description as DescriptionIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import { customerAPI } from '../services/api';

const OnboardingTracker = ({ customerStatus, progressPercentage = 0, customerName = '', customerId, onStatusUpdate, customer, documents }) => {
  const [selectedStage, setSelectedStage] = useState(null);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [complianceResults, setComplianceResults] = useState(null);
  const [isComplianceLoading, setIsComplianceLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState(null);
  const [companyAnalysisResults, setCompanyAnalysisResults] = useState(null);

  // Define the onboarding workflow stages
  const stages = [
    {
      id: 'ocr_processing',
      label: 'OCR Processing',
      description: 'Document text extraction and verification',
      interactive: true,
      requiresApproval: false,
    },
    {
      id: 'human_approval_1',
      label: 'Human Approval',
      description: 'Initial document review and validation',
      interactive: true,
      requiresApproval: true,
      approvalMessage: 'I confirm that I have reviewed all uploaded documents and they meet our requirements.',
    },
    {
      id: 'compliance_check',
      label: 'Compliance Check',
      description: 'Regulatory and policy compliance verification',
      interactive: true,
      requiresApproval: true,
      approvalMessage: 'I confirm that I have reviewed the compliance check results and approve proceeding to the next stage.',
    },
    {
      id: 'human_approval_2',
      label: 'Human Approval',
      description: 'Compliance review approval',
      interactive: true,
      requiresApproval: true,
      approvalMessage: 'I confirm that I have reviewed the compliance check results and they meet our regulatory requirements.',
    },
    {
      id: 'account_creation',
      label: 'Account Creation',
      description: 'System account setup and configuration',
      interactive: true,
      requiresApproval: true,
      approvalMessage: 'I confirm that the account has been created successfully and communication has been sent to the customer.',
    },
    {
      id: 'human_approval_3',
      label: 'Human Approval',
      description: 'Final approval and activation',
      interactive: true,
      requiresApproval: true,
      approvalMessage: 'I confirm that I have reviewed all documentation and approve this customer for account activation.',
    },
    {
      id: 'completed',
      label: 'Completed',
      description: 'Onboarding process finished successfully',
      interactive: false,
      requiresApproval: false,
    },
  ];

  // Determine current stage based on API stage_status
  const getCurrentStageFromStatus = () => {
    if (!customer || !customer.stage_status) {
      return 0; // Default to OCR processing
    }

    const stageStatus = customer.stage_status;
    
    // Check stages in order - find the first active stage or the last completed stage
    if (stageStatus.final && stageStatus.final.status === 'active') {
      return 6; // Final stage active
    } else if (stageStatus.human_approval_3 && stageStatus.human_approval_3.status === 'active') {
      return 5; // Human Approval 3 active
    } else if (stageStatus.account_creation && stageStatus.account_creation.status === 'active') {
      return 4; // Account Creation active
    } else if (stageStatus.human_approval_2 && stageStatus.human_approval_2.status === 'active') {
      return 3; // Human Approval 2 active
    } else if (stageStatus.compliance_check && stageStatus.compliance_check.status === 'active') {
      return 2; // Compliance Check active
    } else if (stageStatus.human_approval_1 && stageStatus.human_approval_1.status === 'active') {
      return 1; // Human Approval 1 active
    } else if (stageStatus.ocr_processing && stageStatus.ocr_processing.status === 'active') {
      return 0; // OCR Processing active
    } else {
      // If no active stage, find the last completed stage to show progress
      if (stageStatus.final && stageStatus.final.status === 'completed') {
        return 6; // Final stage completed
      } else if (stageStatus.human_approval_3 && stageStatus.human_approval_3.status === 'completed') {
        return 5; // Human Approval 3 completed
      } else if (stageStatus.account_creation && stageStatus.account_creation.status === 'completed') {
        return 4; // Account Creation completed
      } else if (stageStatus.human_approval_2 && stageStatus.human_approval_2.status === 'completed') {
        return 3; // Human Approval 2 completed
      } else if (stageStatus.compliance_check && stageStatus.compliance_check.status === 'completed') {
        return 2; // Compliance Check completed
      } else if (stageStatus.human_approval_1 && stageStatus.human_approval_1.status === 'completed') {
        return 1; // Human Approval 1 completed
      } else if (stageStatus.ocr_processing && stageStatus.ocr_processing.status === 'completed') {
        return 0; // OCR Processing completed
      } else {
        return 0; // Default to OCR processing
      }
    }
  };

  const currentStageIndex = getCurrentStageFromStatus();

  // Check if a stage is accessible (previous stage must be completed)
  const isStageAccessible = (stageIndex) => {
    if (!customer || !customer.stage_status) {
      return stageIndex === 0; // Only first stage accessible if no data
    }

    const stageStatus = customer.stage_status;
    
    // First stage is always accessible
    if (stageIndex === 0) return true;
    
    // Check if previous stage is completed
    const previousStageMap = {
      1: 'ocr_processing',           // Human Approval 1 requires OCR completed
      2: 'human_approval_1',         // Compliance Check requires Human Approval 1 completed
      3: 'compliance_check',         // Human Approval 2 requires Compliance Check completed
      4: 'human_approval_2',         // Account Creation requires Human Approval 2 completed
      5: 'account_creation',         // Human Approval 3 requires Account Creation completed
      6: 'human_approval_3',         // Final requires Human Approval 3 completed
    };
    
    const previousStage = previousStageMap[stageIndex];
    if (!previousStage) return true;
    
    return stageStatus[previousStage] && stageStatus[previousStage].status === 'completed';
  };

  // Calculate overall progress percentage based on current stage
  const calculateProgressPercentage = () => {
    if (!customer || !customer.stage_status) {
      return 0;
    }

    const stageStatus = customer.stage_status;
    const totalStages = stages.length; // Use UI stages count (7 stages)
    let completedStages = 0;

    // Count completed stages
    Object.values(stageStatus).forEach(stage => {
      if (stage.status === 'completed') {
        completedStages++;
      }
    });

    // Calculate total percentage - if all stages are completed, show 100%
    const totalProgress = (completedStages / totalStages) * 100;
    return Math.round(totalProgress);
  };

  // Update stage statuses based on API stage_status
  const getStageStatus = (index) => {
    if (!customer || !customer.stage_status) {
      return index === 0 ? 'active' : 'pending';
    }

    const stageStatus = customer.stage_status;
    const stageMap = {
      0: 'ocr_processing',
      1: 'human_approval_1',
      2: 'compliance_check',
      3: 'human_approval_2',
      4: 'account_creation',
      5: 'human_approval_3',
      6: 'final'
    };

    const stageKey = stageMap[index];
    if (!stageKey || !stageStatus[stageKey]) {
      return 'pending';
    }

    const status = stageStatus[stageKey].status;
    
    switch (status) {
      case 'completed':
        return 'completed';
      case 'active':
        return 'active';
      case 'pending':
      default:
        return 'pending';
    }
  };

  // Debug logging - after getStageStatus is defined
  const calculatedProgress = calculateProgressPercentage();
  console.log('OnboardingTracker Debug:', {
    customer: customer?.id,
    stage_status: customer?.stage_status,
    currentStageIndex,
    calculatedProgress: `${calculatedProgress}%`,
    stages: stages.map((stage, index) => ({
      name: stage.name,
      index,
      status: getStageStatus(index)
    }))
  });

  // Handle stage click
  const handleStageClick = async (stage, index) => {
    console.log('Stage clicked:', stage.id, 'Customer:', customer, 'Compliance results:', complianceResults);
    
    if (stage.interactive && isStageAccessible(index)) {
      // Check for auto-approval on human approval stage
      if (stage.id === 'human_approval_1' && canAutoApproveHumanApproval()) {
        console.log('All confidence scores above 75%, auto-approving human approval');
        await autoApproveHumanApproval();
        return;
      }
      
      setSelectedStage({ ...stage, index });
      setStageDialogOpen(true);
      
      // Run company analysis if this is the OCR processing stage
      if (stage.id === 'ocr_processing' && customer) {
        console.log('Triggering company analysis for customer:', customer.name);
        await runOCRProcessing();
      }
      
      // Run compliance checks if this is the compliance check stage
      if (stage.id === 'compliance_check' && customer) {
        console.log('Triggering compliance checks for customer:', customer.name);
        await runComplianceChecks();
      }
    } else if (!isStageAccessible(index)) {
      // Show error message for inaccessible stages
      setError(`This stage is not yet accessible. Please complete the previous stage first.`);
      setTimeout(() => setError(null), 3000);
    }
  };

  // Handle approval
  const handleApproval = async () => {
    if (!isConfirmed) {
      setError('Please confirm that you have reviewed the documents.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Update stage status to completed
      const stageMap = {
        'human_approval_1': 'human_approval_1',
        'human_approval_2': 'human_approval_2', 
        'human_approval_3': 'human_approval_3'
      };

      const stageKey = stageMap[selectedStage.id];
      if (!stageKey) {
        throw new Error('Invalid stage for approval');
      }

      // Update current stage to completed
      await customerAPI.updateStageStatus(customerId, stageKey, 'completed');

      // Determine next stage and activate it
      const nextStageMap = {
        'human_approval_1': 'compliance_check',
        'human_approval_2': 'account_creation',
        'human_approval_3': 'final'
      };

      const nextStage = nextStageMap[selectedStage.id];
      if (nextStage) {
        // For final stage, mark as completed instead of active
        const nextStageStatus = nextStage === 'final' ? 'completed' : 'active';
        await customerAPI.updateStageStatus(customerId, nextStage, nextStageStatus);
      }

      // Refresh customer data
      if (onStatusUpdate) {
        await onStatusUpdate();
      }

      // Close dialogs and reset state
      setApprovalDialogOpen(false);
      setStageDialogOpen(false);
      setSelectedStage(null);
      setIsConfirmed(false);

    } catch (err) {
      console.error('Error approving stage:', err);
      setError('Failed to approve stage. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle compliance approval/rejection
  const handleComplianceApproval = async (decision) => {
    // Show confirmation dialog for rejection
    if (decision === 'rejected') {
      const confirmed = window.confirm(
        'Are you sure you want to reject this compliance check? This will mark the merchant as requiring additional review.'
      );
      if (!confirmed) return;
    }
    
    // Show confirmation dialog for approval if there are issues
    if (decision === 'approved' && (complianceResults?.ofac?.hasSanctions || (complianceResults?.compliance?.score < 70) || (complianceResults?.fraud?.score > 70))) {
      const confirmed = window.confirm(
        'This merchant has compliance issues (sanctions, low compliance score, or high fraud risk). Are you sure you want to approve?'
      );
      if (!confirmed) return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      console.log(`Compliance ${decision} for customer:`, customerId);
      
      if (decision === 'approved') {
        // Format AI insights into readable text before sending to API
        let formattedAiInsight = aiInsight;
        if (aiInsight && typeof aiInsight === 'string' && aiInsight.includes('"risk_level"')) {
          try {
            // Extract the JSON part from the text
            const jsonStart = aiInsight.indexOf('{');
            const jsonEnd = aiInsight.lastIndexOf('}') + 1;
            const jsonText = aiInsight.substring(jsonStart, jsonEnd);
            const parsed = JSON.parse(jsonText);
            
            // Create readable format
            let formattedText = `Risk Level: ${parsed.risk_level}\n\n`;
            
            if (parsed.key_findings) {
              formattedText += `Key Findings:\n`;
              const findings = Array.isArray(parsed.key_findings) ? parsed.key_findings : [parsed.key_findings];
              findings.forEach(finding => {
                formattedText += `• ${finding}\n`;
              });
              formattedText += '\n';
            }
            
            if (parsed.recommendations) {
              formattedText += `Recommendations:\n`;
              const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [parsed.recommendations];
              recommendations.forEach(rec => {
                formattedText += `• ${rec}\n`;
              });
              formattedText += '\n';
            }
            
            if (parsed.compliance_notes) {
              formattedText += `Compliance Notes:\n`;
              const notes = Array.isArray(parsed.compliance_notes) ? parsed.compliance_notes : [parsed.compliance_notes];
              notes.forEach(note => {
                formattedText += `• ${note}\n`;
              });
            }
            
            formattedAiInsight = formattedText.trim();
          } catch (error) {
            console.error('Error formatting AI insights:', error);
            // Keep original if formatting fails
            formattedAiInsight = aiInsight;
          }
        }
        
        // Update compliance check stage to completed with formatted AI insights
        await customerAPI.updateStageStatus(customerId, 'compliance_check', 'completed', {
          ai_insight: formattedAiInsight
        });
        
        // Activate next stage (human_approval_2)
        await customerAPI.updateStageStatus(customerId, 'human_approval_2', 'active');
        
        // Show success message
        setError(null);
        setTimeout(() => {
          setError('Compliance check approved successfully! Moving to next stage.');
          setTimeout(() => setError(null), 3000);
        }, 100);
        
      } else if (decision === 'rejected') {
        // Update compliance check stage to error/rejected
        await customerAPI.updateStageStatus(customerId, 'compliance_check', 'error');
        
        // Show rejection message
        setError('Compliance check rejected. Merchant requires additional review.');
        setTimeout(() => setError(null), 5000);
      }

      // Refresh customer data
      if (onStatusUpdate) {
        await onStatusUpdate();
      }

      // Close dialog
      setStageDialogOpen(false);
      setSelectedStage(null);

    } catch (err) {
      console.error('Error handling compliance approval:', err);
      setError(`Failed to ${decision} compliance check. Please try again.`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle account creation approval/rejection
  const handleAccountCreationApproval = async (decision) => {
    setIsProcessing(true);
    setError(null);

    try {
      console.log(`Account creation ${decision} for customer:`, customerId);
      
      if (decision === 'approved') {
        // Update account creation stage to completed
        await customerAPI.updateStageStatus(customerId, 'account_creation', 'completed');
        
        // Activate next stage (human_approval_3)
        await customerAPI.updateStageStatus(customerId, 'human_approval_3', 'active');
        
        // Show success message
        setError(null);
        setTimeout(() => {
          setError('Account creation approved successfully! Moving to final approval.');
          setTimeout(() => setError(null), 3000);
        }, 100);
        
      } else if (decision === 'rejected') {
        // Update account creation stage to error/rejected
        await customerAPI.updateStageStatus(customerId, 'account_creation', 'error');
        
        // Show rejection message
        setError('Account creation rejected. Requires additional review.');
        setTimeout(() => setError(null), 5000);
      }

      // Refresh customer data
      if (onStatusUpdate) {
        await onStatusUpdate();
      }

      // Close dialog
      setStageDialogOpen(false);
      setSelectedStage(null);

    } catch (err) {
      console.error('Error handling account creation approval:', err);
      setError(`Failed to ${decision} account creation. Please try again.`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Close dialogs
  const handleCloseDialogs = () => {
    setStageDialogOpen(false);
    setApprovalDialogOpen(false);
    setSelectedStage(null);
    setIsConfirmed(false);
    setError(null);
  };

  // Get mandatory business documents
  const getMandatoryBusinessDocuments = () => {
    return [
      { type: 'business_license', name: 'Business License', category: 'Business Legal Documents' },
      { type: 'articles_of_incorporation', name: 'Articles of Incorporation', category: 'Business Legal Documents' },
      { type: 'ein_certificate', name: 'EIN Certificate', category: 'Business Identity & Tax' },
      { type: 'federal_tax_id', name: 'Federal Tax ID', category: 'Business Identity & Tax' },
      { type: 'sales_tax_certificate', name: 'Sales Tax Certificate', category: 'Business Identity & Tax' },
      { type: 'void_business_check', name: 'Void Business Check', category: 'Business Identity & Tax' },
      { type: 'government_id', name: 'Government ID', category: 'Personal Identity Documents' },
      { type: 'ssn_document', name: 'SSN Document', category: 'Personal Identity Documents' },
      { type: 'utility_bill', name: 'Utility Bill', category: 'Contact & Address Proof' },
      { type: 'bank_statement', name: 'Bank Statement', category: 'Contact & Address Proof' },
    ];
  };

  // Run compliance checks
  const runComplianceChecks = async () => {
    console.log('runComplianceChecks called with customer:', customer);
    if (!customer) {
      console.log('No customer data available');
      return;
    }
    
    setIsComplianceLoading(true);
    setError(null);
    
    try {
      console.log('Starting compliance checks for:', customer.name);
      
      // Run all three compliance checks
      const [ofacResults, complianceValidation, fraudAssessment] = await Promise.all([
        customerAPI.checkOFACSanctions(customer.name),
        customerAPI.validateCompliance(customer),
        customerAPI.assessFraudRisk(customer)
      ]);
      
      console.log('Compliance check results:', { ofacResults, complianceValidation, fraudAssessment });
      
      // Extract AI insights from OFAC results
      console.log('OFAC Results AI Insight:', ofacResults.ai_insight);
      if (ofacResults.ai_insight && ofacResults.ai_insight.insight) {
        setAiInsight(ofacResults.ai_insight.insight);
        console.log('AI Insight set:', ofacResults.ai_insight.insight);
      } else if (ofacResults.ai_insight) {
        // Handle case where ai_insight is a string directly
        setAiInsight(ofacResults.ai_insight);
        console.log('AI Insight set (direct):', ofacResults.ai_insight);
      }
      
      setComplianceResults({
        ofac: ofacResults,
        compliance: complianceValidation,
        fraud: fraudAssessment
      });
      
    } catch (err) {
      console.error('Error running compliance checks:', err);
      setError('Failed to run compliance checks. Please try again.');
    } finally {
      setIsComplianceLoading(false);
    }
  };

  // Run OCR processing and company analysis
  const runOCRProcessing = async () => {
    console.log('runOCRProcessing called with customer:', customer);
    if (!customer) {
      console.log('No customer data available');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    
    try {
      console.log('Starting OCR processing for:', customer.name);
      
      // Call company analysis API
      const companyAnalysis = await customerAPI.analyzeCompany(customer.name);
      
      console.log('Company analysis results:', companyAnalysis);
      
      // Store company analysis results for display
      setCompanyAnalysisResults(companyAnalysis);
      
      // Store AI insights in OCR processing stage status
      if (companyAnalysis.success && companyAnalysis.analysis) {
        await customerAPI.updateStageStatus(customerId, 'ocr_processing', 'active', {
          ai_insight: companyAnalysis.analysis
        });
        
        // Show success message
        setError(null);
        setTimeout(() => {
          setError('Name check completed successfully! AI insights updated.');
          setTimeout(() => setError(null), 3000);
        }, 100);
      } else {
        // Handle analysis failure
        setError('Name check failed. Please try again.');
      }
      
      // Refresh customer data
      if (onStatusUpdate) {
        await onStatusUpdate();
      }
      
    } catch (err) {
      console.error('Error running OCR processing:', err);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to run OCR processing. Please try again.';
      
      if (err.message.includes('timeout') || err.code === 'ECONNABORTED') {
        errorMessage = 'Company analysis timed out. Please try again.';
      } else if (err.message.includes('Network Error')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (err.response?.status === 404) {
        errorMessage = 'Company analysis service not found. Please contact support.';
      } else if (err.response?.status >= 500) {
        errorMessage = 'Server error. Please try again later.';
      }
      
      setError(errorMessage);
      
      // Update stage status to error
      try {
        await customerAPI.updateStageStatus(customerId, 'ocr_processing', 'error', {
          error: err.message
        });
      } catch (updateErr) {
        console.error('Error updating stage status:', updateErr);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Check if document is uploaded
  const isDocumentUploaded = (documentType) => {
    if (!customer) return false;
    
    // Handle new format where documents are individual fields in customer record
    if (customer[documentType] === 'Y') {
      return true;
    }
    
    // Handle old format where documents are in customer.documents object
    if (customer.documents && typeof customer.documents === 'object' && !Array.isArray(customer.documents)) {
      return customer.documents[documentType] === 'Y';
    }
    
    // Fallback to old format (array of document objects)
    return documents && documents.some(doc => doc.document_type === documentType);
  };

  // Get uploaded documents with confidence scores for display
  const getUploadedDocumentsWithScores = () => {
    const uploadedDocs = [];
    
    // Only show specific documents when their flags are 'Y'
    const allowedDocumentTypes = ['business_license', 'government_id', 'bank_statement', 'void_business_check'];
    
    // Handle new format where documents are individual fields in customer record
    allowedDocumentTypes.forEach(docType => {
      if (customer && customer[docType] === 'Y') {
        // Get confidence score from the specific field
        const confidenceScoreField = `${docType}_confidence_score`;
        const confidenceScore = customer[confidenceScoreField];
        
        // Add document if confidence score is available (including 0)
        if (confidenceScore !== null && confidenceScore !== undefined) {
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
        if (status === 'Y' && allowedDocumentTypes.includes(docType)) {
          // Get confidence score from the specific field
          const confidenceScoreField = `${docType}_confidence_score`;
          const confidenceScore = customer[confidenceScoreField];
          
          // Add document if confidence score is available (including 0)
          if (confidenceScore !== null && confidenceScore !== undefined) {
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
    
    return uploadedDocs;
  };

  // Helper function to get document type display name
  const getDocumentTypeDisplayName = (documentType) => {
    const displayNames = {
      'business_license': 'Business License',
      'government_id': 'Government ID',
      'bank_statement': 'Bank Statement',
      'void_business_check': 'Void Business Check',
      'articles_of_incorporation': 'Articles of Incorporation',
      'ein_certificate': 'EIN Certificate',
      'federal_tax_id': 'Federal Tax ID',
      'sales_tax_certificate': 'Sales Tax Certificate',
      'insurance_certificate': 'Insurance Certificate',
      'contract_agreement': 'Contract Agreement',
      'financial_statement': 'Financial Statement',
      'credit_report': 'Credit Report'
    };
    return displayNames[documentType] || documentType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Check if all confidence scores are above threshold for auto-approval
  const canAutoApproveHumanApproval = () => {
    const uploadedDocs = getUploadedDocumentsWithScores();
    
    // If no documents with confidence scores, cannot auto-approve
    if (uploadedDocs.length === 0) {
      return false;
    }
    
    // Check if all documents have confidence scores above 75%
    return uploadedDocs.every(doc => {
      const confidenceScore = doc.confidence_score > 1 ? 
        Math.round(doc.confidence_score) : 
        Math.round(doc.confidence_score * 100);
      return confidenceScore >= 75;
    });
  };

  // Auto-approve human approval stage
  const autoApproveHumanApproval = async () => {
    console.log('Auto-approving human approval stage due to high confidence scores');
    
    setIsProcessing(true);
    setError(null);

    try {
      // Update human_approval_1 stage to completed
      await customerAPI.updateStageStatus(customerId, 'human_approval_1', 'completed');
      
      // Activate compliance_check stage
      await customerAPI.updateStageStatus(customerId, 'compliance_check', 'active');
      
      // Refresh customer data
      if (onStatusUpdate) {
        await onStatusUpdate();
      }
      
      // Close dialogs and reset state
      setStageDialogOpen(false);
      setSelectedStage(null);
      
      // Show success message
      setError('Human approval automatically approved! Proceeding to compliance check.');
      setTimeout(() => setError(null), 3000);
      
    } catch (err) {
      console.error('Error auto-approving human approval:', err);
      setError('Failed to auto-approve. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };



  // Get icon for stage status
  const getStageIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon color="success" />;
      case 'active':
        return <ScheduleIcon color="primary" />;
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return <RadioButtonUncheckedIcon color="disabled" />;
    }
  };



  return (
    <Paper elevation={2} sx={{ p: 3, borderRadius: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Merchant Onboarding Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Track your onboarding process through each stage
        </Typography>
        

      </Box>

      {/* Workflow Stages - Horizontal Layout */}
      <Box sx={{ overflowX: 'auto', mb: 3 }}>
        <Stepper 
          orientation="horizontal" 
          activeStep={currentStageIndex}
          sx={{
            minWidth: 800,
            '& .MuiStepConnector-line': {
              minWidth: 60,
            },
          }}
        >
          {stages.map((stage, index) => {
            const stageStatus = getStageStatus(index);
            const isCompleted = stageStatus === 'completed';
            const isActive = stageStatus === 'active';
            const isAccessible = isStageAccessible(index);
            
            return (
              <Step key={stage.id} completed={isCompleted} active={isActive}>
                <StepLabel
                  StepIconComponent={() => getStageIcon(stageStatus)}
                  onClick={() => handleStageClick(stage, index)}
                  sx={{
                    cursor: (stage.interactive && isAccessible) ? 'pointer' : 'default',
                    opacity: isAccessible ? 1 : 0.5,
                    '& .MuiStepLabel-label': {
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? 'primary.main' : isCompleted ? 'success.main' : isAccessible ? 'text.secondary' : 'text.disabled',
                      fontSize: '0.875rem',
                      textAlign: 'center',
                    },
                    '& .MuiStepLabel-labelContainer': {
                      maxWidth: 120,
                    },
                    '&:hover': (stage.interactive && isAccessible) ? {
                      '& .MuiStepLabel-label': {
                        color: 'primary.main',
                        textDecoration: 'underline',
                      },
                    } : {},
                  }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" fontWeight={isActive ? 600 : 500} sx={{ textAlign: 'center' }}>
                      {stage.label}
                    </Typography>
                    {isCompleted && (
                      <Chip
                        label="✓ Complete"
                        size="small"
                        color="success"
                        sx={{ fontSize: '0.65rem', height: 18 }}
                      />
                    )}
                    {isActive && (
                      <Chip
                        label="In Progress"
                        size="small"
                        color="primary"
                        sx={{ fontSize: '0.65rem', height: 18 }}
                      />
                    )}
                    {!isAccessible && !isCompleted && !isActive && (
                      <Chip
                        label="Locked"
                        size="small"
                        color="default"
                        variant="outlined"
                        sx={{ fontSize: '0.65rem', height: 18 }}
                      />
                    )}
                  </Box>
                </StepLabel>
              </Step>
            );
          })}
        </Stepper>
      </Box>

      {/* Stage Details - Show current stage description */}
      {stages[currentStageIndex] && (
        <Box sx={{ mt: 2, p: 2, bgcolor: 'primary.50', borderRadius: 2, border: '1px solid', borderColor: 'primary.200' }}>
          <Typography variant="body2" fontWeight={600} color="primary.main" gutterBottom>
            Current Stage: {stages[currentStageIndex].label}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {stages[currentStageIndex].description}
          </Typography>
          
          {/* Stage-specific details */}
          {getStageStatus(currentStageIndex) === 'active' && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="primary.main" fontWeight={500}>
                Currently processing...
              </Typography>
            </Box>
          )}
          
          {getStageStatus(currentStageIndex) === 'completed' && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="success.main" fontWeight={500}>
                ✓ Successfully completed
              </Typography>
            </Box>
          )}
        </Box>
      )}



      {/* Overall Process */}
      <Box sx={{ 
        mt: 2, 
        p: 2, 
        bgcolor: calculatedProgress === 100 ? 'success.50' : 'grey.50', 
        borderRadius: 2,
        border: calculatedProgress === 100 ? '1px solid' : 'none',
        borderColor: calculatedProgress === 100 ? 'success.200' : 'transparent'
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="body2" fontWeight={600} color={calculatedProgress === 100 ? 'success.main' : 'text.primary'}>
            Overall Process: {calculatedProgress === 100 ? 'COMPLETED' : 'IN PROGRESS'}
          </Typography>
          <Typography variant="h6" fontWeight={700} color={calculatedProgress === 100 ? 'success.main' : 'primary.main'}>
            {calculatedProgress}%
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={calculatedProgress} 
          sx={{ 
            height: 8, 
            borderRadius: 4,
            backgroundColor: calculatedProgress === 100 ? 'success.100' : 'primary.100',
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              backgroundColor: calculatedProgress === 100 ? 'success.main' : 'primary.main',
            }
          }} 
        />
        <Typography variant="caption" color={calculatedProgress === 100 ? 'success.dark' : 'text.secondary'} sx={{ mt: 1, display: 'block' }}>
          {calculatedProgress === 100 
            ? 'All stages completed successfully!'
            : `Currently at stage ${currentStageIndex + 1} of ${stages.length}`
          }
        </Typography>
      </Box>

      {/* Stage-Specific Dialog */}
      <Dialog 
        open={stageDialogOpen} 
        onClose={handleCloseDialogs}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={600}>
            {selectedStage?.label} - {selectedStage?.description}
          </Typography>
        </DialogTitle>
        
        <DialogContent>
          {selectedStage?.id === 'ocr_processing' && (
            <Box>
              <Typography variant="body1" sx={{ mb: 3 }}>
                OCR Processing Status: Document text extraction and verification is currently in progress.
              </Typography>
              
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    Processing Details
                  </Typography>
                  <List>
                    <ListItem>
                      <ListItemIcon>
                        <ScheduleIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Document Analysis" 
                        secondary="Extracting text and data from uploaded documents"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color="success" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Data Validation" 
                        secondary="Verifying extracted information accuracy"
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>

              {/* Company Analysis Section */}
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    Company Analysis
                  </Typography>
                  
                  {isProcessing ? (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <CircularProgress size={40} sx={{ mb: 2 }} />
                      <Typography variant="body2" color="text.secondary">
                        Analyzing company data and generating insights...
                      </Typography>
                    </Box>
                  ) : companyAnalysisResults ? (
                    <Box>
                      {companyAnalysisResults.success ? (
                        <Box>
                          {companyAnalysisResults.analysis && typeof companyAnalysisResults.analysis === 'object' ? (
                            <Box>
                              {companyAnalysisResults.analysis.risk_level && (
                                <Box sx={{ mb: 2 }}>
                                  <Typography variant="subtitle2" fontWeight={600} color="primary.main">
                                    Risk Level: {companyAnalysisResults.analysis.risk_level}
                                  </Typography>
                                </Box>
                              )}
                              
                              {companyAnalysisResults.analysis.key_findings && (
                                <Box sx={{ mb: 2 }}>
                                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                                    Key Findings:
                                  </Typography>
                                  {Array.isArray(companyAnalysisResults.analysis.key_findings) ? 
                                    companyAnalysisResults.analysis.key_findings.map((finding, index) => (
                                      <Typography key={index} variant="body2" color="text.secondary" sx={{ ml: 1, mb: 0.5 }}>
                                        • {finding}
                                      </Typography>
                                    )) :
                                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                                      • {companyAnalysisResults.analysis.key_findings}
                                    </Typography>
                                  }
                                </Box>
                              )}
                              
                              {companyAnalysisResults.analysis.recommendations && (
                                <Box sx={{ mb: 2 }}>
                                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                                    Recommendations:
                                  </Typography>
                                  {Array.isArray(companyAnalysisResults.analysis.recommendations) ? 
                                    companyAnalysisResults.analysis.recommendations.map((rec, index) => (
                                      <Typography key={index} variant="body2" color="text.secondary" sx={{ ml: 1, mb: 0.5 }}>
                                        • {rec}
                                      </Typography>
                                    )) :
                                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                                      • {companyAnalysisResults.analysis.recommendations}
                                    </Typography>
                                  }
                                </Box>
                              )}
                              
                              {companyAnalysisResults.analysis.compliance_notes && (
                                <Box>
                                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                                    Compliance Notes:
                                  </Typography>
                                  {Array.isArray(companyAnalysisResults.analysis.compliance_notes) ? 
                                    companyAnalysisResults.analysis.compliance_notes.map((note, index) => (
                                      <Typography key={index} variant="body2" color="text.secondary" sx={{ ml: 1, mb: 0.5 }}>
                                        • {note}
                                      </Typography>
                                    )) :
                                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                                      • {companyAnalysisResults.analysis.compliance_notes}
                                    </Typography>
                                  }
                                </Box>
                              )}
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              {companyAnalysisResults.analysis}
                            </Typography>
                          )}
                        </Box>
                      ) : (
                        <Box sx={{ textAlign: 'center', py: 2 }}>
                          <ErrorIcon color="error" sx={{ fontSize: 40, mb: 1 }} />
                          <Typography variant="body2" color="error.main">
                            Company analysis failed: {companyAnalysisResults.error || 'Unknown error'}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Company analysis will run automatically when this stage is accessed.
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Box>
          )}

          {selectedStage?.id === 'human_approval_1' && (
            <Box>
              {canAutoApproveHumanApproval() ? (
                <Box sx={{ mb: 3, p: 2, bgcolor: 'success.50', borderRadius: 2, border: '1px solid', borderColor: 'success.200' }}>
                  <Typography variant="body1" color="success.main" fontWeight={600} gutterBottom>
                    ✅ Auto-Approval Available
                  </Typography>
                  <Typography variant="body2" color="success.dark">
                    All documents have confidence scores above 75%. This stage can be automatically approved.
                  </Typography>
                </Box>
              ) : (
                <Typography variant="body1" sx={{ mb: 3 }}>
                  Please review all uploaded documents before proceeding to the next stage.
                </Typography>
              )}
              
              <Grid container spacing={2}>
                {/* Mandatory Business Documents */}
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>
                        Mandatory Business Documents
                      </Typography>
                      <List>
                        {getMandatoryBusinessDocuments().map((doc) => (
                          <ListItem key={doc.type} dense>
                            <ListItemIcon>
                              {isDocumentUploaded(doc.type) ? (
                                <CheckCircleIcon color="success" />
                              ) : (
                                <AssignmentIcon color="error" />
                              )}
                            </ListItemIcon>
                            <ListItemText 
                              primary={doc.name}
                              secondary={doc.category}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                </Grid>

                {/* All Uploaded Documents */}
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>
                        All Uploaded Documents
                      </Typography>
                      {(() => {
                        const uploadedDocs = getUploadedDocumentsWithScores();
                        return uploadedDocs.length > 0 ? (
                          <List>
                            {uploadedDocs.map((doc, index) => {
                              const confidenceScore = doc.confidence_score > 1 ? 
                                Math.round(doc.confidence_score) : 
                                Math.round(doc.confidence_score * 100);
                              const isLowConfidence = confidenceScore < 75;
                              
                              return (
                                <ListItem key={index} dense>
                                  <ListItemIcon>
                                    <DescriptionIcon color={isLowConfidence ? "error" : "primary"} />
                                  </ListItemIcon>
                                  <ListItemText 
                                    primary={
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography 
                                          variant="body2" 
                                          sx={{ 
                                            color: isLowConfidence ? 'error.main' : 'text.primary',
                                            fontWeight: isLowConfidence ? 600 : 400
                                          }}
                                        >
                                          {doc.original_filename}
                                        </Typography>
                                        <Typography 
                                          variant="body2" 
                                          sx={{ 
                                            color: isLowConfidence ? 'error.main' : 'success.main',
                                            fontWeight: 600,
                                            backgroundColor: isLowConfidence ? 'error.50' : 'success.50',
                                            px: 1,
                                            py: 0.5,
                                            borderRadius: 1,
                                            fontSize: '0.75rem'
                                          }}
                                        >
                                          {confidenceScore}%
                                        </Typography>
                                      </Box>
                                    }
                                    secondary={
                                      <Typography variant="caption" color="text.secondary">
                                        Status: {doc.status}
                                        {isLowConfidence && (
                                          <Box component="span" sx={{ color: 'error.main', ml: 1 }}>
                                            • Low confidence score
                                          </Box>
                                        )}
                                      </Typography>
                                    }
                                  />
                                </ListItem>
                              );
                            })}
                          </List>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No documents with confidence scores available yet
                          </Typography>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
                {canAutoApproveHumanApproval() ? (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckIcon />}
                    onClick={autoApproveHumanApproval}
                    size="large"
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Auto-Approving...' : 'Auto-Approve & Continue'}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    startIcon={<CheckIcon />}
                    onClick={() => {
                      setStageDialogOpen(false);
                      setApprovalDialogOpen(true);
                    }}
                    size="large"
                  >
                    Review & Approve Documents
                  </Button>
                )}
              </Box>
            </Box>
          )}

          {selectedStage?.id === 'human_approval_2' && (
            <Box>
              <Typography variant="body1" sx={{ mb: 3 }}>
                Please review the compliance check results before proceeding to account creation.
              </Typography>
              
              <Grid container spacing={2}>
                {/* Compliance Check Results */}
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>
                        Document Confidence Scores
                      </Typography>
                      {complianceResults?.compliance ? (
                        <List>
                                                     {Object.entries(complianceResults.compliance.details).map(([docType, detail]) => {
                             const getIcon = () => {
                               if (detail.status === 'passed') {
                                 return <CheckCircleIcon color="success" />;
                               } else if (detail.status === 'failed') {
                                 return <ErrorIcon color="error" />;
                               } else if (detail.status === 'processing') {
                                 return <ScheduleIcon color="warning" />;
                               } else {
                                 return <ErrorIcon color="error" />;
                               }
                             };
                             
                             const getDocumentName = (type) => {
                               const names = {
                                 'business_license': 'Business License',
                                 'void_business_check': 'Void Business Check',
                                 'government_id': 'Government ID',
                                 'bank_statement': 'Bank Statement'
                               };
                               return names[type] || type;
                             };
                             
                             const getStatusText = () => {
                               if (detail.status === 'passed') {
                                 return `${detail.score}% (25 points)`;
                               } else if (detail.status === 'failed') {
                                 return `${detail.score}% (< 75%)`;
                               } else if (detail.status === 'processing') {
                                 return 'Uploaded, waiting for confidence score';
                               } else {
                                 return 'Not uploaded';
                               }
                             };
                            
                            return (
                              <ListItem dense key={docType}>
                                <ListItemIcon>
                                  {getIcon()}
                                </ListItemIcon>
                                <ListItemText 
                                  primary={getDocumentName(docType)}
                                  secondary={getStatusText()}
                                />
                              </ListItem>
                            );
                          })}
                          <ListItem dense>
                            <ListItemIcon>
                              <AssignmentIcon color="primary" />
                            </ListItemIcon>
                            <ListItemText 
                              primary={`Total Score: ${complianceResults.compliance.score}/100`}
                              secondary={complianceResults.compliance.isCompliant ? 'Compliant' : 'Not Compliant'}
                            />
                          </ListItem>
                        </List>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Run compliance checks to see confidence score results
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                {/* Review Summary */}
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>
                        Review Summary
                      </Typography>
                      {complianceResults?.compliance ? (
                        <List>
                          <ListItem dense>
                            <ListItemIcon>
                              {complianceResults.compliance.isCompliant ? (
                                <CheckCircleIcon color="success" />
                              ) : (
                                <ErrorIcon color="error" />
                              )}
                            </ListItemIcon>
                            <ListItemText 
                              primary="Document Compliance"
                              secondary={complianceResults.compliance.isCompliant ? 
                                `Passed (${complianceResults.compliance.score}/100)` : 
                                `Failed (${complianceResults.compliance.score}/100)`
                              }
                            />
                          </ListItem>
                          <ListItem dense>
                            <ListItemIcon>
                              {complianceResults.compliance.isCompliant ? (
                                <CheckCircleIcon color="success" />
                              ) : (
                                <ScheduleIcon color="warning" />
                              )}
                            </ListItemIcon>
                            <ListItemText 
                              primary="Ready for Account Creation"
                              secondary={complianceResults.compliance.isCompliant ? 
                                "Proceed to next stage" : 
                                "Requires additional review"
                              }
                            />
                          </ListItem>
                          {complianceResults.compliance.missingDocuments.length > 0 && (
                            <ListItem dense>
                              <ListItemIcon>
                                <ErrorIcon color="error" />
                              </ListItemIcon>
                              <ListItemText 
                                primary="Issues Found"
                                secondary={`${complianceResults.compliance.missingDocuments.length} document(s) need attention`}
                              />
                            </ListItem>
                          )}
                        </List>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Run compliance checks to see review summary
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  startIcon={<CheckIcon />}
                  onClick={() => {
                    setStageDialogOpen(false);
                    setApprovalDialogOpen(true);
                  }}
                  size="large"
                >
                  Approve Compliance & Proceed
                </Button>
              </Box>
            </Box>
          )}

          {selectedStage?.id === 'human_approval_3' && (
            <Box>
              <Typography variant="body1" sx={{ mb: 3 }}>
                Please review all documentation and approve this customer for final account activation.
              </Typography>
              
              <Grid container spacing={2}>
                {/* Final Review Checklist */}
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>
                        Final Review Checklist
                      </Typography>
                      <List>
                        <ListItem dense>
                          <ListItemIcon>
                            <CheckCircleIcon color="success" />
                          </ListItemIcon>
                          <ListItemText 
                            primary="All Documents Verified"
                            secondary="Business and personal documents complete"
                          />
                        </ListItem>
                        <ListItem dense>
                          <ListItemIcon>
                            <CheckCircleIcon color="success" />
                          </ListItemIcon>
                          <ListItemText 
                            primary="Compliance Approved"
                            secondary="Regulatory requirements met"
                          />
                        </ListItem>
                        <ListItem dense>
                          <ListItemIcon>
                            <CheckCircleIcon color="success" />
                          </ListItemIcon>
                          <ListItemText 
                            primary="Account Setup Complete"
                            secondary="System configuration finished"
                          />
                        </ListItem>
                      </List>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Activation Summary */}
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>
                        Activation Summary
                      </Typography>
                      <List>
                        <ListItem dense>
                          <ListItemIcon>
                            <AssignmentIcon color="primary" />
                          </ListItemIcon>
                          <ListItemText 
                            primary={`Customer: ${customerName}`}
                            secondary="Ready for activation"
                          />
                        </ListItem>
                        <ListItem dense>
                          <ListItemIcon>
                            <CheckCircleIcon color="success" />
                          </ListItemIcon>
                          <ListItemText 
                            primary="All Stages Complete"
                            secondary="Onboarding process finished"
                          />
                        </ListItem>
                      </List>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  startIcon={<CheckIcon />}
                  onClick={() => {
                    setStageDialogOpen(false);
                    setApprovalDialogOpen(true);
                  }}
                  size="large"
                >
                  Activate Customer Account
                </Button>
              </Box>
            </Box>
          )}

          {selectedStage?.id === 'compliance_check' && (
            <Box>
              {isComplianceLoading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
                  <CircularProgress size={60} sx={{ mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Running Compliance Checks...
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Checking OFAC sanctions, compliance validation, and fraud risk assessment
                  </Typography>
                </Box>
              ) : (
                <>
                  <Typography variant="body1" sx={{ mb: 3 }}>
                    Compliance Check Results: Regulatory and policy compliance verification completed.
                  </Typography>
              
                              <Grid container spacing={2}>
                  {/* OFAC Sanctions Check */}
                  <Grid item xs={12} md={4}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" fontWeight={600} gutterBottom>
                          OFAC Sanctions Check
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          {complianceResults?.ofac?.hasSanctions ? (
                            <ErrorIcon color="error" />
                          ) : (
                            <CheckCircleIcon color="success" />
                          )}
                          <Typography variant="body2">
                            Company: {customerName}
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Checking against US OFAC SDN List, UN Security Council, and EU Financial Sanctions
                          {complianceResults?.ofac?.isFallback && (
                            <span style={{ color: 'orange', fontWeight: 'bold' }}> (Using fallback check - API unavailable)</span>
                          )}
                          {complianceResults?.ofac?.totalResults > 0 && (
                            <span style={{ color: 'blue', fontWeight: 'bold' }}> (Found {complianceResults.ofac.totalResults} total results)</span>
                          )}
                        </Typography>
                        <Chip 
                          label={complianceResults?.ofac?.hasSanctions ? "⚠ Sanctions Found" : "✓ No Sanctions Found"} 
                          color={complianceResults?.ofac?.hasSanctions ? "error" : "success"} 
                          size="small"
                          sx={{ fontSize: '0.75rem' }}
                        />
                        {complianceResults?.ofac?.sanctions?.length > 0 && (
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
                              Found {complianceResults.ofac.sanctions.length} matching sanction(s) out of {complianceResults.ofac.totalResults} total results
                            </Typography>
                            {complianceResults.ofac.sanctions.map((sanction, index) => (
                              <Box key={index} sx={{ mb: 1, p: 1, bgcolor: 'error.50', borderRadius: 1 }}>
                                <Typography variant="caption" fontWeight={600} color="error.dark">
                                  Source: {sanction.source?.toUpperCase()} | Type: {sanction.target_type}
                                </Typography>
                                <Typography variant="caption" color="error.dark" sx={{ display: 'block' }}>
                                  Matched Names: {sanction.matchedNames?.join(', ')}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        )}
                        
                        {/* AI Insights Section */}
                        {aiInsight && (
                          <Box sx={{ 
                            mt: 2, 
                            p: 1.5, 
                            bgcolor: 'info.50', 
                            borderRadius: 1.5, 
                            border: '1px solid', 
                            borderColor: 'info.200' 
                          }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                              <Box sx={{ 
                                width: 16, 
                                height: 16, 
                                borderRadius: '50%', 
                                bgcolor: 'info.main', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                mr: 0.5
                              }}>
                                <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold', fontSize: '0.6rem' }}>
                                  AI
                                </Typography>
                              </Box>
                              <Typography variant="caption" fontWeight={600} color="info.main">
                                AI Analysis
                              </Typography>
                            </Box>
                                <Typography variant="caption" color="info.dark" sx={{ whiteSpace: 'pre-line', fontSize: '0.7rem', lineHeight: 1.3 }}>
      {aiInsight && typeof aiInsight === 'string' && aiInsight.includes('"risk_level"') ? (
        // Format JSON-like AI insights into readable text
        (() => {
          try {
            // Extract the JSON part from the text
            const jsonStart = aiInsight.indexOf('{');
            const jsonEnd = aiInsight.lastIndexOf('}') + 1;
            const jsonText = aiInsight.substring(jsonStart, jsonEnd);
            const parsed = JSON.parse(jsonText);
            
            return (
              <>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" fontWeight={600} color="info.dark">
                    Risk Level: {parsed.risk_level}
                  </Typography>
                </Box>
                
                {parsed.key_findings && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" fontWeight={600} color="info.dark" sx={{ display: 'block', mb: 0.5 }}>
                      Key Findings:
                    </Typography>
                    {Array.isArray(parsed.key_findings) ? 
                      parsed.key_findings.map((finding, index) => (
                        <Typography key={index} variant="caption" color="info.dark" sx={{ display: 'block', ml: 1, mb: 0.5 }}>
                          • {finding}
                        </Typography>
                      )) :
                      <Typography variant="caption" color="info.dark" sx={{ display: 'block', ml: 1 }}>
                        • {parsed.key_findings}
                      </Typography>
                    }
                  </Box>
                )}
                
                {parsed.recommendations && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" fontWeight={600} color="info.dark" sx={{ display: 'block', mb: 0.5 }}>
                      Recommendations:
                    </Typography>
                    {Array.isArray(parsed.recommendations) ? 
                      parsed.recommendations.map((rec, index) => (
                        <Typography key={index} variant="caption" color="info.dark" sx={{ display: 'block', ml: 1, mb: 0.5 }}>
                          • {rec}
                        </Typography>
                      )) :
                      <Typography variant="caption" color="info.dark" sx={{ display: 'block', ml: 1 }}>
                        • {parsed.recommendations}
                      </Typography>
                    }
                  </Box>
                )}
                
                {parsed.compliance_notes && (
                  <Box>
                    <Typography variant="caption" fontWeight={600} color="info.dark" sx={{ display: 'block', mb: 0.5 }}>
                      Compliance Notes:
                    </Typography>
                    {Array.isArray(parsed.compliance_notes) ? 
                      parsed.compliance_notes.map((note, index) => (
                        <Typography key={index} variant="caption" color="info.dark" sx={{ display: 'block', ml: 1, mb: 0.5 }}>
                          • {note}
                        </Typography>
                      )) :
                      <Typography variant="caption" color="info.dark" sx={{ display: 'block', ml: 1 }}>
                        • {parsed.compliance_notes}
                      </Typography>
                    }
                  </Box>
                )}
              </>
            );
          } catch (error) {
            // Fallback to original text if JSON parsing fails
            return aiInsight;
          }
        })()
      ) : (
        typeof aiInsight === 'object' ? (
          // Handle object format
          <>
            {aiInsight.risk_level && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" fontWeight={600} color="info.dark">
                  Risk Level: {aiInsight.risk_level}
                </Typography>
              </Box>
            )}
            
            {aiInsight.key_findings && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" fontWeight={600} color="info.dark" sx={{ display: 'block', mb: 0.5 }}>
                  Key Findings:
                </Typography>
                {Array.isArray(aiInsight.key_findings) ? 
                  aiInsight.key_findings.map((finding, index) => (
                    <Typography key={index} variant="caption" color="info.dark" sx={{ display: 'block', ml: 1, mb: 0.5 }}>
                      • {finding}
                    </Typography>
                  )) :
                  <Typography variant="caption" color="info.dark" sx={{ display: 'block', ml: 1 }}>
                    • {aiInsight.key_findings}
                  </Typography>
                }
              </Box>
            )}
            
            {aiInsight.recommendations && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" fontWeight={600} color="info.dark" sx={{ display: 'block', mb: 0.5 }}>
                  Recommendations:
                </Typography>
                {Array.isArray(aiInsight.recommendations) ? 
                  aiInsight.recommendations.map((rec, index) => (
                    <Typography key={index} variant="caption" color="info.dark" sx={{ display: 'block', ml: 1, mb: 0.5 }}>
                      • {rec}
                    </Typography>
                  )) :
                  <Typography variant="caption" color="info.dark" sx={{ display: 'block', ml: 1 }}>
                    • {aiInsight.recommendations}
                  </Typography>
                }
              </Box>
            )}
            
            {aiInsight.compliance_notes && (
              <Box>
                <Typography variant="caption" fontWeight={600} color="info.dark" sx={{ display: 'block', mb: 0.5 }}>
                  Compliance Notes:
                </Typography>
                {Array.isArray(aiInsight.compliance_notes) ? 
                  aiInsight.compliance_notes.map((note, index) => (
                    <Typography key={index} variant="caption" color="info.dark" sx={{ display: 'block', ml: 1, mb: 0.5 }}>
                      • {note}
                    </Typography>
                  )) :
                  <Typography variant="caption" color="info.dark" sx={{ display: 'block', ml: 1 }}>
                    • {aiInsight.compliance_notes}
                  </Typography>
                }
              </Box>
            )}
            
            {aiInsight.error && (
              <Box>
                <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                  Error: {aiInsight.error}
                </Typography>
              </Box>
            )}
          </>
        ) : (
          // Handle string format
          aiInsight
        )
      )}
    </Typography>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>

                                  {/* Compliance Validation */}
                  <Grid item xs={12} md={4}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" fontWeight={600} gutterBottom>
                          Document Confidence Scores
                        </Typography>
                        {/* Debug information */}
                        <Box sx={{ mb: 2, p: 1, bgcolor: 'grey.50', borderRadius: 1, fontSize: '0.75rem' }}>
                          <Typography variant="caption" fontWeight={600} color="text.secondary">
                            Document Status Check:
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Business License: {customer?.business_license || customer?.documents?.business_license || 'N'} | 
                            Void Business Check: {customer?.void_business_check || customer?.documents?.void_business_check || 'N'} | 
                            Government ID: {customer?.government_id || customer?.documents?.government_id || 'N'} | 
                            Bank Statement: {customer?.bank_statement || customer?.documents?.bank_statement || 'N'}
                          </Typography>
                        </Box>
                        {complianceResults?.compliance?.details ? (
                          <List dense>
                            {Object.entries(complianceResults.compliance.details).map(([docType, detail]) => {
                              const getIcon = () => {
                                if (detail.status === 'passed') {
                                  return <CheckCircleIcon color="success" fontSize="small" />;
                                } else if (detail.status === 'failed') {
                                  return <ErrorIcon color="error" fontSize="small" />;
                                } else if (detail.status === 'processing') {
                                  return <ScheduleIcon color="warning" fontSize="small" />;
                                } else {
                                  return <ErrorIcon color="error" fontSize="small" />;
                                }
                              };
                              
                              const getDocumentName = (type) => {
                                const names = {
                                  'business_license': 'Business License',
                                  'void_business_check': 'Void Business Check',
                                  'government_id': 'Government ID',
                                  'bank_statement': 'Bank Statement'
                                };
                                return names[type] || type;
                              };
                              
                              const getStatusText = () => {
                                if (detail.status === 'passed') {
                                  return `${detail.score}% (25 points)`;
                                } else if (detail.status === 'failed') {
                                  return `${detail.score}% (< 75%)`;
                                } else if (detail.status === 'processing') {
                                  return 'Uploaded, waiting for confidence score';
                                } else {
                                  return 'Not uploaded';
                                }
                              };
                              
                              return (
                                <ListItem key={docType}>
                                  <ListItemIcon>
                                    {getIcon()}
                                  </ListItemIcon>
                                  <ListItemText 
                                    primary={getDocumentName(docType)} 
                                    secondary={getStatusText()}
                                  />
                                </ListItem>
                              );
                            })}
                          </List>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Run compliance checks to see confidence scores
                          </Typography>
                        )}
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="body2" fontWeight={600} gutterBottom>
                            Compliance Score: {complianceResults?.compliance?.score || 0}/100
                          </Typography>
                          <LinearProgress 
                            variant="determinate" 
                            value={complianceResults?.compliance?.score || 0} 
                            color={complianceResults?.compliance?.score >= 75 ? "success" : complianceResults?.compliance?.score >= 50 ? "warning" : "error"}
                            sx={{ height: 8, borderRadius: 4 }}
                          />
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>

                                  {/* Fraud Risk Assessment */}
                  <Grid item xs={12} md={4}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" fontWeight={600} gutterBottom>
                          Fraud Risk Assessment
                        </Typography>
                        <List dense>
                          <ListItem>
                            <ListItemIcon>
                              <CheckCircleIcon color="success" fontSize="small" />
                            </ListItemIcon>
                            <ListItemText 
                              primary="Business Age" 
                              secondary={complianceResults?.fraud?.details?.businessAge || "Checking..."}
                            />
                          </ListItem>
                          <ListItem>
                            <ListItemIcon>
                              <CheckCircleIcon color="success" fontSize="small" />
                            </ListItemIcon>
                            <ListItemText 
                              primary="IP Reputation" 
                              secondary={complianceResults?.fraud?.details?.ipReputation || "Checking..."}
                            />
                          </ListItem>
                          <ListItem>
                            <ListItemIcon>
                              <CheckCircleIcon color="success" fontSize="small" />
                            </ListItemIcon>
                            <ListItemText 
                              primary="Velocity Risk" 
                              secondary={complianceResults?.fraud?.details?.velocityRisk || "Checking..."}
                            />
                          </ListItem>
                          <ListItem>
                            <ListItemIcon>
                              <CheckCircleIcon color="success" fontSize="small" />
                            </ListItemIcon>
                            <ListItemText 
                              primary="Email Domain" 
                              secondary={complianceResults?.fraud?.details?.emailDomain || "Checking..."}
                            />
                          </ListItem>
                        </List>
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="body2" fontWeight={600} gutterBottom>
                            Risk Score: {complianceResults?.fraud?.score || 0}/100 ({complianceResults?.fraud?.riskLevel || "Checking..."} Risk)
                          </Typography>
                          <LinearProgress 
                            variant="determinate" 
                            value={complianceResults?.fraud?.score || 0} 
                            color={complianceResults?.fraud?.score <= 40 ? "success" : complianceResults?.fraud?.score <= 70 ? "warning" : "error"}
                            sx={{ height: 8, borderRadius: 4 }}
                          />
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
              </Grid>

              <Box sx={{ 
                mt: 3, 
                p: 2, 
                bgcolor: complianceResults?.ofac?.hasSanctions || (complianceResults?.compliance?.score < 70) || (complianceResults?.fraud?.score > 70) ? 'error.50' : 'success.50', 
                borderRadius: 2, 
                border: '1px solid', 
                borderColor: complianceResults?.ofac?.hasSanctions || (complianceResults?.compliance?.score < 70) || (complianceResults?.fraud?.score > 70) ? 'error.200' : 'success.200' 
              }}>
                <Typography variant="h6" fontWeight={600} color={complianceResults?.ofac?.hasSanctions || (complianceResults?.compliance?.score < 70) || (complianceResults?.fraud?.score > 70) ? "error.main" : "success.main"} gutterBottom>
                  {complianceResults?.ofac?.hasSanctions || (complianceResults?.compliance?.score < 70) || (complianceResults?.fraud?.score > 70) ? "⚠ Compliance Issues Found" : "✓ Compliance Check Complete"}
                </Typography>
                <Typography variant="body2" color={complianceResults?.ofac?.hasSanctions || (complianceResults?.compliance?.score < 70) || (complianceResults?.fraud?.score > 70) ? "error.dark" : "success.dark"} sx={{ mb: 2 }}>
                  {complianceResults?.ofac?.hasSanctions 
                    ? `Sanctions found for this company (${complianceResults.ofac.sanctions.length} matching sanctions). Manual review required.`
                    : (complianceResults?.compliance?.score < 70)
                    ? "Compliance score below threshold. Missing critical documents."
                    : (complianceResults?.fraud?.score > 70)
                    ? "High fraud risk detected. Additional verification required."
                    : `All compliance checks passed successfully. No sanctions found for "${complianceResults?.ofac?.companyName}". The merchant meets all regulatory requirements and has a low fraud risk profile.`
                  }
                </Typography>
                
                {/* Compliance Approval/Rejection Buttons */}
                <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={() => handleComplianceApproval('approved')}
                    disabled={isProcessing}
                    startIcon={isProcessing ? <CircularProgress size={16} /> : <CheckIcon />}
                    sx={{ minWidth: 120 }}
                  >
                    {isProcessing ? 'Processing...' : 'Approve'}
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    onClick={() => handleComplianceApproval('rejected')}
                    disabled={isProcessing}
                    startIcon={isProcessing ? <CircularProgress size={16} /> : <ErrorIcon />}
                    sx={{ minWidth: 120 }}
                  >
                    {isProcessing ? 'Processing...' : 'Reject'}
                  </Button>
                </Box>
                
                {/* Warning for high-risk cases */}
                {(complianceResults?.ofac?.hasSanctions || (complianceResults?.compliance?.score < 70) || (complianceResults?.fraud?.score > 70)) && (
                  <Box sx={{ mt: 2, p: 1, bgcolor: 'warning.50', borderRadius: 1, border: '1px solid', borderColor: 'warning.200' }}>
                    <Typography variant="caption" color="warning.dark">
                      <strong>Warning:</strong> This merchant has compliance issues. Please review carefully before approving.
                    </Typography>
                  </Box>
                )}
              </Box>
                </>
              )}
            </Box>
          )}

          {selectedStage?.id === 'account_creation' && (
            <Box>
              <Typography variant="body1" sx={{ mb: 3 }}>
                Account Creation Status: System account has been successfully created and communication has been sent to the email address on file.
              </Typography>
              
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    Account Creation Summary
                  </Typography>
                  <List>
                    <ListItem>
                      <ListItemIcon>
                        <CheckCircleIcon color="success" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Account Created Successfully"
                        secondary="System account setup completed"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <EmailIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Communication Sent"
                        secondary={`Email sent to ${customer?.email || 'customer email'} with provisioning instructions`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <AssignmentIcon color="info" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Provisioning Instructions"
                        secondary="Customer has received detailed instructions on how to provision their account"
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>

              {/* Account Creation Approval/Rejection Buttons */}
              <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => handleAccountCreationApproval('approved')}
                  disabled={isProcessing}
                  startIcon={isProcessing ? <CircularProgress size={16} /> : <CheckIcon />}
                  sx={{ minWidth: 120 }}
                >
                  {isProcessing ? 'Processing...' : 'Approve'}
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => handleAccountCreationApproval('rejected')}
                  disabled={isProcessing}
                  startIcon={isProcessing ? <CircularProgress size={16} /> : <ErrorIcon />}
                  sx={{ minWidth: 120 }}
                >
                  {isProcessing ? 'Processing...' : 'Reject'}
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleCloseDialogs}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog 
        open={approvalDialogOpen} 
        onClose={handleCloseDialogs}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={600}>
            {selectedStage?.label} - Review & Approval
          </Typography>
        </DialogTitle>
        
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          
          <Typography variant="body1" sx={{ mb: 2 }}>
            {selectedStage?.approvalMessage}
          </Typography>
          
          <FormControlLabel
            control={
              <Checkbox
                checked={isConfirmed}
                onChange={(e) => setIsConfirmed(e.target.checked)}
                color="primary"
              />
            }
            label="I confirm that I have reviewed and approve proceeding to the next stage"
          />
          
          <Box sx={{ mt: 2, p: 2, bgcolor: 'warning.50', borderRadius: 1, border: '1px solid', borderColor: 'warning.200' }}>
            <Typography variant="caption" color="warning.dark">
              <strong>Note:</strong> This action will advance the customer to the next stage in the onboarding process. 
              Please ensure all required reviews have been completed before proceeding.
            </Typography>
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleCloseDialogs} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleApproval}
            variant="contained"
            disabled={!isConfirmed || isProcessing}
            startIcon={isProcessing ? <CircularProgress size={16} /> : <CheckIcon />}
          >
            {isProcessing ? 'Processing...' : 'Confirm & Proceed'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default OnboardingTracker; 