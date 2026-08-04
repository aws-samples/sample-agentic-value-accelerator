import axios from 'axios';
import { getConfig } from '../config.js';

// Create API instance with configuration from config.json
const createApiInstance = () => {
  const config = getConfig();
  if (!config) {
    throw new Error('Configuration not loaded. Check if config.json exists.');
  }
  
  return axios.create({
    baseURL: config.API_BASE_URL,
    timeout: config.DEV_SETTINGS?.TIMEOUT || 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

let apiInstance = createApiInstance();

// Update API instance with new config
export const updateApiInstance = () => {
  apiInstance = createApiInstance();
};

// Reload config and update API instance
export const reloadApiConfig = () => {
  const { reloadConfig } = require('../config.js');
  reloadConfig();
  updateApiInstance();
};

// Request interceptor for logging
apiInstance.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging
apiInstance.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);



export const customerAPI = {
  // Get all customers
  getAllCustomers: async () => {
    console.log('=== API: getAllCustomers called ===');
    const response = await apiInstance.get('/admin/customers');
    console.log('=== API: getAllCustomers response ===', response.data);
    return response.data;
  },

  // Get customer by ID (basic info only)
  getCustomerById: async (id) => {
    // Use the specific customer endpoint instead of getting all customers
    const response = await apiInstance.get(`/customers/${id}/status`);
    return response.data;
  },

  // Create new customer
  createCustomer: async (customerData) => {
    const response = await apiInstance.post('/customers', customerData);
    return response.data;
  },

  // Get customer documents
  getCustomerDocuments: async (id) => {
    const response = await apiInstance.get(`/customers/${id}/documents`);
    return response.data;
  },

  // Get customer notifications
  getCustomerNotifications: async (id) => {
    const response = await apiInstance.get(`/customers/${id}/notifications`);
    return response.data;
  },

  // Upload document - use the separate service
  uploadDocument: async (file, customerId, documentType) => {
    const { uploadDocument } = await import('./uploadService.js');
    return uploadDocument(file, customerId, documentType);
  },

  // Resubmit document
  resubmitDocument: async (customerId, documentData) => {
    const response = await apiInstance.post(`/customers/${customerId}/resubmit`, documentData);
    return response.data;
  },

  // Trigger compliance check
  triggerComplianceCheck: async (customerId) => {
    const response = await apiInstance.post(`/admin/customers/${customerId}/trigger-compliance-check`);
    return response.data;
  },

  // Trigger account creation
  triggerAccountCreation: async (customerId) => {
    const response = await apiInstance.post(`/admin/customers/${customerId}/trigger-account-creation`);
    return response.data;
  },

  // Approve stage
  approveStage: async (customerId, approvalData) => {
    const response = await apiInstance.post(`/admin/customers/${customerId}/approve-stage`, approvalData);
    return response.data;
  },

  // Get stage status
  getStageStatus: async (customerId) => {
    const response = await apiInstance.get(`/customers/${customerId}/stage-status`);
    return response.data;
  },

  // Update stage status
  updateStageStatus: async (customerId, stage, status, additionalData = {}) => {
    const response = await apiInstance.post(`/customers/${customerId}/stage-status`, {
      stage: stage,
      status: status,
      ...additionalData
    });
    return response.data;
  },

  // OFAC Sanctions Check
  checkOFACSanctions: async (companyName) => {
    try {
      console.log('Calling OFAC API with name:', companyName);
      
      // Use our backend API as a proxy to avoid CORS issues
      const response = await apiInstance.get(`/sanctions/check?name=${encodeURIComponent(companyName)}`);
      const data = response.data;
      
      console.log('Raw sanctions data:', data);
      
      // Check if the company name exists in any of the sanctions' names arrays
      let hasSanctions = false;
      let matchingSanctions = [];
      let sanctionsData = data.sanctions_data || [];
      
      if (sanctionsData && Array.isArray(sanctionsData)) {
        sanctionsData.forEach(sanction => {
          if (sanction.names && Array.isArray(sanction.names)) {
            // Check if company name appears in any of the sanction names
            const nameMatch = sanction.names.some(name => 
              name.toLowerCase().includes(companyName.toLowerCase()) ||
              companyName.toLowerCase().includes(name.toLowerCase())
            );
            
            if (nameMatch) {
              hasSanctions = true;
              matchingSanctions.push({
                ...sanction,
                matchedNames: sanction.names.filter(name => 
                  name.toLowerCase().includes(companyName.toLowerCase()) ||
                  companyName.toLowerCase().includes(name.toLowerCase())
                )
              });
            }
          }
        });
      }
      
      console.log('Processed sanctions results:', {
        hasSanctions,
        matchingSanctions: matchingSanctions.length,
        totalResults: sanctionsData ? sanctionsData.length : 0,
        ai_insight: data.ai_insight
      });
      
      return {
        hasSanctions: hasSanctions,
        sanctions: matchingSanctions,
        allResults: sanctionsData || [],
        companyName: companyName,
        totalResults: sanctionsData ? sanctionsData.length : 0,
        ai_insight: data.ai_insight || null
      };
    } catch (error) {
      console.error('Error checking OFAC sanctions:', error);
      
      // Fallback: Check if the company name contains any known problematic terms
      const problematicTerms = ['blocked', 'sanctioned', 'banned', 'restricted', 'suspicious'];
      const hasProblematicTerms = problematicTerms.some(term => 
        companyName.toLowerCase().includes(term.toLowerCase())
      );
      
      if (hasProblematicTerms) {
        return {
          hasSanctions: true,
          sanctions: [{
            id: 'fallback-1',
            target_type: 'entity',
            source: 'fallback',
            source_id: 'FALLBACK',
            names: [companyName],
            matchedNames: [companyName],
            positions: [],
            remarks: 'Fallback check - contains problematic terms',
            listed_on: null,
            created_at: new Date().toISOString()
          }],
          allResults: [],
          companyName: companyName,
          totalResults: 1,
          isFallback: true
        };
      }
      
      return {
        hasSanctions: false,
        sanctions: [],
        allResults: [],
        companyName: companyName,
        error: error.message,
        isFallback: true
      };
    }
  },

  // Compliance Validation Check
  validateCompliance: async (customerData) => {
    console.log('=== VALIDATING COMPLIANCE ===', { customerData });
    
    let score = 0;
    let missingDocs = [];
    let details = {};
    
    // Check document flags and confidence scores for the 4 specific documents (25 points each)
    const requiredDocuments = [
      { 
        type: 'business_license', 
        name: 'Business License', 
        flagField: 'business_license',
        confidenceField: 'business_license_confidence_score' 
      },
      { 
        type: 'void_business_check', 
        name: 'Void Business Check', 
        flagField: 'void_business_check',
        confidenceField: 'void_business_check_confidence_score' 
      },
      { 
        type: 'government_id', 
        name: 'Government ID', 
        flagField: 'government_id',
        confidenceField: 'government_id_confidence_score' 
      },
      { 
        type: 'bank_statement', 
        name: 'Bank Statement', 
        flagField: 'bank_statement',
        confidenceField: 'bank_statement_confidence_score' 
      }
    ];
    
    requiredDocuments.forEach(doc => {
      // Check both direct property and documents object for document flag
      let documentFlag = customerData[doc.flagField];
      if (!documentFlag && customerData.documents && customerData.documents[doc.flagField]) {
        documentFlag = customerData.documents[doc.flagField];
      }
      
      const confidenceScore = customerData[doc.confidenceField];
      
      console.log(`Checking ${doc.name}:`, { 
        documentFlag, 
        confidenceScore, 
        flagField: doc.flagField,
        confidenceField: doc.confidenceField,
        directFlag: customerData[doc.flagField],
        documentsFlag: customerData.documents ? customerData.documents[doc.flagField] : 'no documents object',
        isUploaded: documentFlag === 'Y' || documentFlag === 'y',
        hasConfidenceScore: confidenceScore !== null && confidenceScore !== undefined && !isNaN(Number(confidenceScore)) && Number(confidenceScore) > 0
      });
      
      // First check if document is uploaded (flag = 'Y')
      if (documentFlag === 'Y' || documentFlag === 'y') {
        // Document is uploaded, now check confidence score
        if (confidenceScore !== null && confidenceScore !== undefined && !isNaN(Number(confidenceScore)) && Number(confidenceScore) > 0) {
          const scoreValue = Number(confidenceScore);
          const percentage = scoreValue > 1 ? scoreValue : scoreValue * 100;
          
          console.log(`${doc.name} confidence calculation:`, {
            originalScore: confidenceScore,
            scoreValue: scoreValue,
            percentage: percentage,
            isGreaterThan1: scoreValue > 1
          });
          
          if (percentage >= 75) {
            score += 25;
            details[doc.type] = {
              status: 'passed',
              uploaded: true,
              score: percentage,
              points: 25
            };
            console.log(`${doc.name} PASSED: ${percentage}% (25 points)`);
          } else {
            details[doc.type] = {
              status: 'failed',
              uploaded: true,
              score: percentage,
              points: 0
            };
            missingDocs.push(`${doc.name} (${percentage}% < 75%)`);
            console.log(`${doc.name} FAILED: ${percentage}% < 75% (0 points)`);
          }
        } else {
          // Document uploaded but no confidence score yet
          details[doc.type] = {
            status: 'processing',
            uploaded: true,
            score: 0,
            points: 0
          };
          missingDocs.push(`${doc.name} (Uploaded, waiting for confidence score)`);
          console.log(`${doc.name} PROCESSING: Uploaded but no confidence score yet (0 points)`);
        }
      } else {
        // Document not uploaded (flag = 'N', 'n', or missing)
        details[doc.type] = {
          status: 'missing',
          uploaded: false,
          score: 0,
          points: 0
        };
        missingDocs.push(`${doc.name} (Not uploaded)`);
        console.log(`${doc.name} MISSING: Document not uploaded (0 points)`);
      }
    });
    
    const result = {
      score: score,
      missingDocuments: missingDocs,
      isCompliant: score >= 75, // Require at least 75 points (3 out of 4 documents with >75% confidence)
      details: details,
      totalPossible: 100
    };
    
    console.log('=== COMPLIANCE VALIDATION RESULT ===', result);
    return result;
  },

  // Fraud Risk Assessment
  assessFraudRisk: async (customerData) => {
    // Simulate fraud risk assessment
    let score = 0;
    const details = {};
    
    // Business age (simulated)
    const businessAge = 5; // years
    if (businessAge >= 5) {
      score += 20;
      details.businessAge = 'Established business (5+ years)';
    } else if (businessAge >= 2) {
      score += 15;
      details.businessAge = 'Established business (2-4 years)';
    } else {
      score += 5;
      details.businessAge = 'New business (<2 years)';
    }
    
    // IP reputation (simulated)
    details.ipReputation = 'Clean IP address';
    score += 25;
    
    // Velocity risk (simulated)
    details.velocityRisk = 'Normal transaction patterns';
    score += 25;
    
    // Email domain (simulated)
    const email = customerData.email || '';
    if (email.includes('@gmail.com') || email.includes('@yahoo.com')) {
      score += 10;
      details.emailDomain = 'Free email domain';
    } else {
      score += 30;
      details.emailDomain = 'Verified business domain';
    }
    
    // Determine risk level
    let riskLevel = 'Low';
    if (score >= 71) riskLevel = 'High';
    else if (score >= 41) riskLevel = 'Medium';
    else riskLevel = 'Low';
    
    return {
      score: score,
      riskLevel: riskLevel,
      details: details,
      isLowRisk: score <= 40
    };
  },

  // Company Analysis
  analyzeCompany: async (companyName) => {
    try {
      console.log('Calling company analysis API with name:', companyName);
      
      const response = await apiInstance.get(`/company/analyze?name=${encodeURIComponent(companyName)}`);
      const data = response.data;
      
      console.log('Company analysis results:', data);
      
      // Handle the actual API response structure
      if (data.ai_insights && data.ai_insights.insights) {
        try {
          // Clean the insights string - remove markdown code blocks
          let insightsString = data.ai_insights.insights;
          if (insightsString.includes('```json')) {
            insightsString = insightsString.replace(/```json\n/, '').replace(/\n```/, '');
          }
          
          // Parse the insights JSON string
          const insights = JSON.parse(insightsString);
          
          // Extract key information in concise format
          const businessModel = insights.business_model || 'Not specified';
          const whatTheySell = insights.what_they_sell || insights.products_and_services || 'Not specified';
          
          // Format risk assessment - handle both string and object
          let riskLevel = 'Medium';
          let riskRecommendations = [];
          if (typeof insights.risk_assessment === 'object' && insights.risk_assessment) {
            riskLevel = insights.risk_assessment.overall_risk || insights.risk_assessment.overall_risk_level || 'Medium';
            // Extract each risk factor as a readable line
            const ra = insights.risk_assessment;
            Object.entries(ra).forEach(([key, value]) => {
              if (key === 'overall_risk' || key === 'overall_risk_level') return;
              if (typeof value === 'string') {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                riskRecommendations.push(`${label}: ${value}`);
              } else if (Array.isArray(value)) {
                value.forEach(item => {
                  if (typeof item === 'string') riskRecommendations.push(item);
                  else if (item.factor) riskRecommendations.push(`${item.factor} (${item.level}): ${item.details}`);
                });
              } else if (typeof value === 'object' && value) {
                Object.entries(value).forEach(([k, v]) => {
                  if (typeof v === 'string') {
                    const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    riskRecommendations.push(`${label}: ${v}`);
                  }
                });
              }
            });
          } else if (typeof insights.risk_assessment === 'string') {
            riskRecommendations.push(insights.risk_assessment);
          }
          if (riskRecommendations.length === 0) riskRecommendations.push('Standard risk assessment recommended');
          
          // Create concise summaries
          const whatTheySellSummary = whatTheySell.length > 200 
            ? whatTheySell.substring(0, 200) + '...' 
            : whatTheySell;
          
          // Handle industry_insights as string or object
          let industryNotes = [];
          if (typeof insights.industry_insights === 'string') {
            industryNotes.push(insights.industry_insights);
          } else if (typeof insights.industry_insights === 'object' && insights.industry_insights) {
            Object.entries(insights.industry_insights).forEach(([key, value]) => {
              const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              if (typeof value === 'string') {
                industryNotes.push(`${label}: ${value}`);
              } else if (Array.isArray(value)) {
                industryNotes.push(`${label}: ${value.join(', ')}`);
              }
            });
          }
          if (industryNotes.length === 0) industryNotes.push('Industry analysis completed');
          
          return {
            success: true,
            analysis: {
              risk_level: riskLevel,
              key_findings: [
                insights.company_type ? `Company Type: ${insights.company_type}` : null,
                `Business Model: ${businessModel}`,
                `What They Sell: ${whatTheySellSummary}`
              ].filter(Boolean),
              recommendations: riskRecommendations,
              compliance_notes: industryNotes
            },
            companyName: companyName
          };
        } catch (parseError) {
          console.error('Error parsing insights:', parseError);
          return {
            success: true,
            analysis: {
              risk_level: 'Medium',
              key_findings: ['Company analysis completed'],
              recommendations: ['Proceed with standard review'],
              compliance_notes: ['Analysis data available']
            },
            companyName: companyName
          };
        }
      }
      
      return {
        success: true,
        analysis: data.analysis || data,
        companyName: companyName
      };
    } catch (error) {
      console.error('Error analyzing company:', error);
      
      // Check if it's a timeout or cancellation error
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error('Company analysis timed out');
        return {
          success: false,
          analysis: {
            risk_level: 'Medium',
            key_findings: [`Analysis for ${companyName} - Request timed out`],
            recommendations: ['Manual review recommended due to timeout'],
            compliance_notes: ['Company analysis service timed out']
          },
          companyName: companyName,
          error: 'Request timed out'
        };
      }
      
      // Fallback analysis if API fails
      return {
        success: false,
        analysis: {
          risk_level: 'Medium',
          key_findings: [`Analysis for ${companyName} - API unavailable`],
          recommendations: ['Manual review recommended'],
          compliance_notes: ['Company analysis service temporarily unavailable']
        },
        companyName: companyName,
        error: error.message
      };
    }
  },
};

export const systemAPI = {
  // Get system health
  getHealth: async () => {
    const response = await apiInstance.get('/health');
    return response.data;
  },

  // Get queue status
  getQueueStatus: async () => {
    const response = await apiInstance.get('/admin/queue-status');
    return response.data;
  },

  // Get all notifications
  getAllNotifications: async () => {
    const response = await apiInstance.get('/admin/notifications');
    return response.data;
  },
};

export default apiInstance; 