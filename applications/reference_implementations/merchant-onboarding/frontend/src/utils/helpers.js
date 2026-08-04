// Format date to readable string
export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Format date for display (date only)
export const formatDateOnly = (dateString) => {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Get status color class
export const getStatusColor = (status) => {
  const statusMap = {
    completed: 'completed',
    in_progress: 'in_progress',
    on_hold: 'on_hold',
    created: 'created',
    documents_pending: 'documents_pending',
    under_review: 'under_review',
    approved: 'completed',
    rejected: 'rejected',
  };
  return statusMap[status] || 'created';
};

// Get status display text
export const getStatusText = (status) => {
  const statusMap = {
    completed: 'Completed',
    in_progress: 'In Progress',
    on_hold: 'On Hold',
    created: 'In Progress',
    documents_pending: 'On Hold',
    under_review: 'In Progress',
    approved: 'Completed',
    rejected: 'On Hold',
  };
  return statusMap[status] || 'In Progress';
};

// Get status text for customer (uses backend data)
export const getStatusTextForCustomer = (status, customerName = '', stageStatus = null) => {
  // If we have stage_status data, determine status based on final stage
  if (stageStatus && stageStatus.final) {
    if (stageStatus.final.status === 'completed') {
      return 'Completed';
    } else if (stageStatus.final.status === 'active') {
      return 'In Progress';
    }
  }
  
  // Fallback to old logic
  return getStatusText(status);
};

// Get status color for customer (uses backend data)
export const getStatusColorForCustomer = (status, customerName = '', stageStatus = null) => {
  // If we have stage_status data, determine color based on final stage
  if (stageStatus && stageStatus.final) {
    if (stageStatus.final.status === 'completed') {
      return 'completed';
    } else if (stageStatus.final.status === 'active') {
      return 'in_progress';
    }
  }
  
  // Fallback to old logic
  return getStatusColor(status);
};

// Get current stage based on status
export const getCurrentStage = (status) => {
  // Use the same logic as OnboardingTracker component
  if (status === 'completed' || status === 'approved') {
    return 'Completed';
  } else if (status === 'in_progress' || status === 'under_review') {
    return 'Compliance Check';
  } else if (status === 'on_hold' || status === 'documents_pending' || status === 'rejected') {
    return 'Document Review';
  } else {
    return 'OCR Processing';
  }
};

// Get current stage for customer (uses backend data)
export const getCurrentStageForCustomer = (status, customerName = '', stageStatus = null) => {
  // If we have stage_status data, use it to determine current stage
  if (stageStatus) {
    const stages = [
      'ocr_processing',
      'human_approval_1', 
      'compliance_check',
      'human_approval_2',
      'account_creation',
      'human_approval_3',
      'final'
    ];
    
    // Find the active stage or the last completed stage
    let currentStageIndex = 0;
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      if (stageStatus[stage] && stageStatus[stage].status === 'active') {
        currentStageIndex = i;
        break;
      } else if (stageStatus[stage] && stageStatus[stage].status === 'completed') {
        currentStageIndex = i;
      }
    }
    
    const stageLabels = [
      'OCR Processing',
      'Human Approval',
      'Compliance Check', 
      'Human Approval',
      'Account Creation',
      'Human Approval',
      'Completed'
    ];
    
    const currentStage = stageLabels[currentStageIndex] || 'OCR Processing';
    console.log(`Stage determination for ${customerName}:`, { stageStatus, currentStage });
    return currentStage;
  }
  
  // Fallback to old logic if no stage_status data
  const fallbackStage = getCurrentStage(status);
  console.log(`Fallback stage determination for ${customerName}:`, { status, fallbackStage });
  return fallbackStage;
};

// Calculate statistics from customers data
export const calculateStats = (customers) => {
  if (!customers || !Array.isArray(customers)) {
    return {
      total: 0,
      inProgress: 0,
      completed: 0,
      onHold: 0,
    };
  }

  const stats = {
    total: customers.length,
    inProgress: 0,
    completed: 0,
    onHold: 0,
  };

  customers.forEach(customer => {
    // Use the same logic as getStatusTextForCustomer to stay consistent
    const displayStatus = getStatusTextForCustomer(customer.status, customer.name, customer.stage_status);
    
    switch (displayStatus) {
      case 'Completed':
        stats.completed++;
        break;
      case 'On Hold':
        stats.onHold++;
        break;
      case 'In Progress':
      default:
        stats.inProgress++;
    }
  });

  return stats;
};

// Generate company name from customer data
export const generateCompanyName = (customer) => {
  if (customer.company_name) {
    return customer.company_name;
  }
  
  // Generate a company name based on customer name
  const name = customer.name || 'Unknown';
  const words = name.split(' ');
  if (words.length >= 2) {
    return `${words[0]} ${words[1]} & Co.`;
  }
  return `${name} Enterprises`;
};

// Generate application ID
export const generateApplicationId = (customerId) => {
  if (!customerId) return 'N/A';
  return `APP-${customerId.substring(0, 8).toUpperCase()}`;
};

// Format progress percentage
export const formatProgress = (progress) => {
  if (typeof progress !== 'number') return 0;
  return Math.round(progress);
};

// Get document status count
export const getDocumentStatusCount = (documents, status) => {
  if (!documents || !Array.isArray(documents)) return 0;
  return documents.filter(doc => doc.status === status).length;
};

// Format file size
export const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

// Get document type display name
export const getDocumentTypeDisplayName = (documentType) => {
  const documentTypeMap = {
    // Business Legal Documents
    business_license: 'Business License',
    articles_of_incorporation: 'Articles of Incorporation',
    
    // Business Identity & Tax
    ein_certificate: 'EIN Certificate',
    federal_tax_id: 'Federal Tax ID',
    sales_tax_certificate: 'Sales Tax Certificate',
    void_business_check: 'Void Business Check',
    
    // Personal Identity Documents
    government_id: 'Government ID',
    ssn_document: 'SSN Document',
    
    // Contact & Address Proof
    utility_bill: 'Utility Bill',
    bank_statement: 'Bank Statement',
    
    // Legacy documents
    application: 'Application',
    driver_license: 'Driver License',
    pay_stub: 'Pay Stub',
    credit_statement: 'Credit Statement',
  };
  return documentTypeMap[documentType] || documentType;
};

// Get document category
export const getDocumentCategory = (documentType) => {
  const categoryMap = {
    // Business Legal Documents
    business_license: 'Business Legal Documents',
    articles_of_incorporation: 'Business Legal Documents',
    
    // Business Identity & Tax
    ein_certificate: 'Business Identity & Tax',
    federal_tax_id: 'Business Identity & Tax',
    sales_tax_certificate: 'Business Identity & Tax',
    void_business_check: 'Business Identity & Tax',
    
    // Personal Identity Documents
    government_id: 'Personal Identity Documents',
    ssn_document: 'Personal Identity Documents',
    
    // Contact & Address Proof
    utility_bill: 'Contact & Address Proof',
    bank_statement: 'Contact & Address Proof',
    
    // Legacy documents
    application: 'Application',
    driver_license: 'Personal Identity Documents',
    pay_stub: 'Financial Documents',
    credit_statement: 'Financial Documents',
  };
  return categoryMap[documentType] || 'Other';
};

// Get document icon
export const getDocumentIcon = (documentType) => {
  const iconMap = {
    // Business Legal Documents
    business_license: '🏢',
    articles_of_incorporation: '📄',
    
    // Business Identity & Tax
    ein_certificate: '🆔',
    federal_tax_id: '💰',
    sales_tax_certificate: '🧾',
    void_business_check: '🏦',
    
    // Personal Identity Documents
    government_id: '🪪',
    ssn_document: '🔐',
    
    // Contact & Address Proof
    utility_bill: '📱',
    bank_statement: '🏠',
    
    // Legacy documents
    application: '📝',
    driver_license: '🚗',
    pay_stub: '💵',
    credit_statement: '💳',
  };
  return iconMap[documentType] || '📄';
};

// Get mandatory business documents
export const getMandatoryBusinessDocuments = () => {
  return [
    // Business Legal Documents
    { type: 'business_license', name: 'Business License', category: 'Business Legal Documents', icon: '🏢' },
    { type: 'articles_of_incorporation', name: 'Articles of Incorporation', category: 'Business Legal Documents', icon: '📄' },
    
    // Business Identity & Tax
    { type: 'ein_certificate', name: 'EIN Certificate', category: 'Business Identity & Tax', icon: '🆔' },
    { type: 'federal_tax_id', name: 'Federal Tax ID', category: 'Business Identity & Tax', icon: '💰' },
    { type: 'sales_tax_certificate', name: 'Sales Tax Certificate', category: 'Business Identity & Tax', icon: '🧾' },
    { type: 'void_business_check', name: 'Void Business Check', category: 'Business Identity & Tax', icon: '🏦' },
    
    // Personal Identity Documents
    { type: 'government_id', name: 'Government ID', category: 'Personal Identity Documents', icon: '🪪' },
    { type: 'ssn_document', name: 'SSN Document', category: 'Personal Identity Documents', icon: '🔐' },
    
    // Contact & Address Proof
    { type: 'utility_bill', name: 'Utility Bill', category: 'Contact & Address Proof', icon: '📱' },
    { type: 'bank_statement', name: 'Bank Statement', category: 'Contact & Address Proof', icon: '🏠' },
  ];
};

// Check if a document is uploaded based on new Y/N format
export const isDocumentUploaded = (customer, documentType) => {
  if (!customer) return false;
  
  // Handle new format where documents are individual fields in customer record
  if (customer[documentType] === 'Y') {
    return true;
  }
  
  // Handle old format where documents are an object with Y/N values
  if (customer.documents && typeof customer.documents === 'object' && !Array.isArray(customer.documents)) {
    return customer.documents[documentType] === 'Y';
  }
  
  // Fallback to old format (array of document objects)
  if (customer.documents && Array.isArray(customer.documents)) {
    return customer.documents.some(doc => doc.document_type === documentType);
  }
  
  return false;
};

// Get document status based on new Y/N format
export const getDocumentStatusFromCustomer = (customer, documentType) => {
  if (!customer) return 'missing';
  
  // Handle new format where documents are individual fields in customer record
  if (customer[documentType] === 'Y') {
    return 'uploaded';
  }
  
  // Handle old format where documents are an object with Y/N values
  if (customer.documents && typeof customer.documents === 'object' && !Array.isArray(customer.documents)) {
    const status = customer.documents[documentType];
    if (status === 'Y') return 'uploaded';
    if (status === 'N') return 'missing';
    return 'missing';
  }
  
  // Fallback to old format (array of document objects)
  if (customer.documents && Array.isArray(customer.documents)) {
    const doc = customer.documents.find(d => d.document_type === documentType);
    return doc ? doc.status : 'missing';
  }
  
  return 'missing';
};

// Get count of uploaded documents from new format
export const getUploadedDocumentsCount = (customer) => {
  if (!customer) return 0;
  
  // Only count the 4 specific required documents
  const requiredDocuments = [
    { flagField: 'business_license', confidenceField: 'business_license_confidence_score' },
    { flagField: 'void_business_check', confidenceField: 'void_business_check_confidence_score' },
    { flagField: 'government_id', confidenceField: 'government_id_confidence_score' },
    { flagField: 'bank_statement', confidenceField: 'bank_statement_confidence_score' }
  ];
  
  let count = 0;
  requiredDocuments.forEach(doc => {
    // Check both direct property and documents object for document flag
    let documentFlag = customer[doc.flagField];
    if (!documentFlag && customer.documents && customer.documents[doc.flagField]) {
      documentFlag = customer.documents[doc.flagField];
    }
    
    // Document is uploaded if flag = 'Y'
    if (documentFlag === 'Y' || documentFlag === 'y') {
      count++;
    }
  });
  
  return count;
};

// Get count of verified documents (have confidence scores > 0)
export const getVerifiedDocumentsCount = (customer) => {
  if (!customer) return 0;
  
  const requiredDocuments = [
    { flagField: 'business_license', confidenceField: 'business_license_confidence_score' },
    { flagField: 'void_business_check', confidenceField: 'void_business_check_confidence_score' },
    { flagField: 'government_id', confidenceField: 'government_id_confidence_score' },
    { flagField: 'bank_statement', confidenceField: 'bank_statement_confidence_score' }
  ];
  
  let count = 0;
  requiredDocuments.forEach(doc => {
    // Check both direct property and documents object for document flag
    let documentFlag = customer[doc.flagField];
    if (!documentFlag && customer.documents && customer.documents[doc.flagField]) {
      documentFlag = customer.documents[doc.flagField];
    }
    
    const confidenceScore = customer[doc.confidenceField];
    
    // Document is verified if it has flag = 'Y' and confidence score > 0
    if ((documentFlag === 'Y' || documentFlag === 'y') && 
        confidenceScore !== null && 
        confidenceScore !== undefined && 
        !isNaN(Number(confidenceScore)) && 
        Number(confidenceScore) > 0) {
      count++;
    }
  });
  
  return count;
};

// Get count of processing documents (flag = 'Y' but no confidence score)
export const getProcessingDocumentsCount = (customer) => {
  if (!customer) return 0;
  
  const requiredDocuments = [
    { flagField: 'business_license', confidenceField: 'business_license_confidence_score' },
    { flagField: 'void_business_check', confidenceField: 'void_business_check_confidence_score' },
    { flagField: 'government_id', confidenceField: 'government_id_confidence_score' },
    { flagField: 'bank_statement', confidenceField: 'bank_statement_confidence_score' }
  ];
  
  let count = 0;
  requiredDocuments.forEach(doc => {
    // Check both direct property and documents object for document flag
    let documentFlag = customer[doc.flagField];
    if (!documentFlag && customer.documents && customer.documents[doc.flagField]) {
      documentFlag = customer.documents[doc.flagField];
    }
    
    const confidenceScore = customer[doc.confidenceField];
    
    // Document is processing if it has flag = 'Y' but no confidence score
    if ((documentFlag === 'Y' || documentFlag === 'y') && 
        (confidenceScore === null || 
         confidenceScore === undefined || 
         isNaN(Number(confidenceScore)) || 
         Number(confidenceScore) === 0)) {
      count++;
    }
  });
  
  return count;
};

// Get count of missing documents from new format
export const getMissingDocumentsCount = (customer) => {
  if (!customer) return getMandatoryBusinessDocuments().length;
  
  // Handle new format where documents are individual fields in customer record
  const mandatoryDocs = getMandatoryBusinessDocuments();
  let missingCount = 0;
  mandatoryDocs.forEach(doc => {
    if (customer[doc.type] !== 'Y') {
      missingCount++;
    }
  });
  
  // Handle old format where documents are an object with Y/N values
  if (customer.documents && typeof customer.documents === 'object' && !Array.isArray(customer.documents)) {
    return mandatoryDocs.filter(doc => customer.documents[doc.type] !== 'Y').length;
  }
  
  // Fallback to old format (array of document objects)
  if (customer.documents && Array.isArray(customer.documents)) {
    const uploadedTypes = customer.documents.map(doc => doc.document_type);
    return mandatoryDocs.filter(doc => !uploadedTypes.includes(doc.type)).length;
  }
  
  return missingCount;
};

// Debounce function
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}; 