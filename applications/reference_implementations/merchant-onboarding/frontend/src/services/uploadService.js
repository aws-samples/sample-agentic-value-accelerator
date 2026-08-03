import { getConfig } from '../config.js';

// Standalone upload function with no dependencies on other API services
export const uploadDocument = async (file, customerId, documentType) => {
  const config = getConfig();
  if (!config) {
    throw new Error('Configuration not loaded. Check if config.json exists.');
  }
  
  // Convert file to base64 for API Gateway
  const fileBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove the data:mime/type;base64, prefix
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  try {
    const response = await fetch(`${config.API_BASE_URL}/customers/${customerId}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-filename': file.name,
        'x-document-type': documentType
      },
      body: JSON.stringify({ fileData: fileBase64 }),
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}; 